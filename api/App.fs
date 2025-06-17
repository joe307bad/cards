open System
open System.Collections.Concurrent
open System.Threading
open Microsoft.AspNetCore.Builder
open Microsoft.Extensions.DependencyInjection
open Giraffe
open Saturn
open LightningDB
open System.Text.Json
open System.Net.WebSockets
open Newtonsoft.Json

open Newtonsoft.Json
open System

type OptionConverter() =
    inherit JsonConverter()

    override _.CanConvert(objectType: Type) =
        objectType.IsGenericType
        && objectType.GetGenericTypeDefinition() = typedefof<option<_>>

    override _.WriteJson(writer: JsonWriter, value: obj, serializer: JsonSerializer) =
        match value with
        | null -> writer.WriteNull()
        | _ ->
            let optionType = value.GetType()
            let someValue = optionType.GetProperty("Value").GetValue(value)

            if someValue = null then
                writer.WriteNull()
            else
                serializer.Serialize(writer, someValue)

    override _.ReadJson(reader: JsonReader, objectType: Type, existingValue: obj, serializer: JsonSerializer) =
        if reader.TokenType = JsonToken.Null then
            null
        else
            let innerType = objectType.GetGenericArguments().[0]
            let value = serializer.Deserialize(reader, innerType)
            let someMethod = objectType.GetMethod("Some")
            someMethod.Invoke(null, [| value |])

open HighSpeedCardDealer
open System.IO
open BlackjackUserDb

type BlackjackResult =
    | Push
    | Win
    | Loss

type PlayerCards =
    { UserId: string
      Cards: string list
      Total: int
      Result: BlackjackResult option }

type Round =
    { Environment: LightningEnvironment
      Database: LightningDatabase }

    interface IDisposable with
        member this.Dispose() =
            try
                this.Environment.Dispose()
            with ex ->
                printfn "Error disposing environment: %s" ex.Message

type GameState =
    { RoundActive: bool
      DealerCards: string list
      DealerTotal: int
      RoundStartTime: int64 option
      RoundEndTime: int64 option
      Dealer: HighSpeedCardDealer.DealerState
      BlackjackRound: Round
      Results: PlayerCards list option }

let getDbPath () =
    if Directory.Exists("/app/data/") then
        "/app/data/blackjack.db"
    else
        "./blackjack.db"

let webSocketUsers = new ConcurrentDictionary<WebSocket, string>()

// Initialize the BlackJack round ONCE and reuse it
let initializeBlackJackRound () =
    let getDbPath () =
        if Directory.Exists("/app/data/") then
            "/app/data/blackjack_db"
        else
            "./blackjack_db"

    let env = new LightningEnvironment(getDbPath ())
    env.MaxDatabases <- 1
    env.MapSize <- 1073741824L
    env.Open(EnvironmentOpenFlags.WriteMap ||| EnvironmentOpenFlags.MapAsync)

    let db =
        use txn = env.BeginTransaction()

        let database =
            txn.OpenDatabase(configuration = DatabaseConfiguration(Flags = DatabaseOpenFlags.Create))

        txn.Commit() |> ignore
        database

    { Environment = env; Database = db }

let getDealerDbPath () =
    if Directory.Exists("/app/data/") then
        "/app/data/blackjack_dealer_db"
    else
        "./blackjack_dealer_db"

// Create a single instance of the BlackJack round that will be reused
let globalBlackjackRound = initializeBlackJackRound ()

let mutable gameState =
    { RoundActive = true
      RoundStartTime = Some 0
      RoundEndTime = Some 0
      DealerCards = []
      Dealer = initializeDealer (getDealerDbPath ())
      BlackjackRound = globalBlackjackRound // Use the global instance
      DealerTotal = 0
      Results = None }

let webSockets = new ConcurrentBag<WebSocket>()

let totalStartingCards = totalCards

let roundCountdown = 10
let nextRoundWaitTime = 5
let mutable _roundCountdown = roundCountdown
let mutable newRoundCountdown = 0

let userCardsKey userId = sprintf "user_cards_%s" userId

// Clear the database instead of creating a new one
let clearBlackjackDatabase () =
    use txn = gameState.BlackjackRound.Environment.BeginTransaction()
    txn.TruncateDatabase(gameState.BlackjackRound.Database) |> ignore
    txn.Commit() |> ignore

let savePlayerCards userId cards =
    use txn = gameState.BlackjackRound.Environment.BeginTransaction()
    use db = txn.OpenDatabase()

    let playerData =
        { UserId = userId
          Cards = cards
          Total = calculateCardValue cards
          Result = None }

    let json = JsonConvert.SerializeObject playerData
    let keyBytes = System.Text.Encoding.UTF8.GetBytes(userCardsKey userId)
    let valueBytes = System.Text.Encoding.UTF8.GetBytes json
    txn.Put(db, keyBytes, valueBytes) |> ignore
    txn.Commit() |> ignore

let loadAllPlayerCards () =
    use txn = gameState.BlackjackRound.Environment.BeginTransaction()
    use cursor = txn.CreateCursor gameState.BlackjackRound.Database
    let mutable playerCardsList: PlayerCards list = []

    let struct (firstResult, firstKey, firstValue) = cursor.First()

    if firstResult = MDBResultCode.Success then
        let valueBytes = firstValue.CopyToNewArray()

        if valueBytes.Length > 0 then
            let json = System.Text.Encoding.UTF8.GetString(valueBytes)
            let playerData = JsonConvert.DeserializeObject<PlayerCards> json
            playerCardsList <- playerData :: playerCardsList

        let mutable continue' = true

        while continue' do
            let struct (nextResult, nextKey, nextValue) = cursor.Next()

            if nextResult = MDBResultCode.Success then
                let valueBytes = nextValue.CopyToNewArray()

                if valueBytes.Length > 0 then
                    let json = System.Text.Encoding.UTF8.GetString(valueBytes)
                    let playerData = JsonConvert.DeserializeObject<PlayerCards> json
                    playerCardsList <- playerData :: playerCardsList
            else
                continue' <- false

    playerCardsList

let loadPlayerCards userId =
    try
        use txn =
            gameState.BlackjackRound.Environment.BeginTransaction(TransactionBeginFlags.ReadOnly)

        use db = txn.OpenDatabase()

        let keyBytes = System.Text.Encoding.UTF8.GetBytes(userCardsKey userId)
        let success, value = txn.TryGet(db, keyBytes)

        if success then
            let json = System.Text.Encoding.UTF8.GetString(value.AsSpan())
            JsonConvert.DeserializeObject<PlayerCards>(json) |> Some
        else
            None
    with _ ->
        None

let createPlayerResponse (userId: string option) (cards: Card list option) =
    {| UserId = userId
       Cards = cards
       Total = cards |> Option.map calculateCardValue
       RemainingCards = getRemainingCards gameState.Dealer
       TotalStartingCards = totalStartingCards |}

let broadcastMessage message =
    let data = System.Text.Encoding.UTF8.GetBytes(JsonConvert.SerializeObject(message))

    webSockets
    |> Seq.filter (fun ws -> ws.State = WebSocketState.Open)
    |> Seq.iter (fun ws ->
        try
            ws.SendAsync(ArraySegment data, WebSocketMessageType.Text, true, CancellationToken.None)
            |> ignore
        with _ ->
            ())

let dealAndUpdate userId =
    let card1 = dealCard gameState.Dealer
    let card2 = dealCard gameState.Dealer
    let cards: Card list = [ card1; card2 ]
    savePlayerCards userId cards

    let playerCards =
        { UserId = userId
          Cards = cards
          Total = calculateCardValue cards
          Result = None }

    printfn "🆕 Player %s joined - Initial cards: %A (Total: %d)" userId cards (calculateCardValue cards)
    Some playerCards

let dealInitialCards userId secretKey =
    match getUserKey userId with
    | Some storedKey when storedKey = secretKey -> dealAndUpdate userId
    | Some _ -> None
    | None ->
        saveUserKey userId secretKey |> ignore
        dealAndUpdate userId

let hitAndUpdate userId =
    match loadPlayerCards userId with
    | Some(player: PlayerCards) ->
        let playerTotal = calculateCardValue player.Cards

        let blackjackResult: BlackjackResult option =
            if playerTotal > 21 then Some Loss
            elif playerTotal = 21 then Some Win
            else None

        match blackjackResult with
        | Some _ -> None
        | None ->
            let stopwatch = System.Diagnostics.Stopwatch.StartNew()
            let newCard = dealCard gameState.Dealer
            stopwatch.Stop()
            let updatedCards = newCard :: player.Cards
            savePlayerCards userId updatedCards
            let updatedPlayer = { player with Cards = updatedCards }

            printfn
                "🃏 Player %s hit - got card %s in %dms - Hand: %A (Total: %d)"
                userId
                newCard
                stopwatch.ElapsedMilliseconds
                updatedCards
                (calculateCardValue updatedCards)

            Some updatedPlayer
    | _ -> None

let hitPlayer userId secretKey =
    // First check if user exists and validate secret key
    match getUserKey userId with
    | Some storedKey when storedKey = secretKey ->
        // User exists and key matches, proceed with hit logic
        hitAndUpdate userId
    | _ -> None

let playDealerHand providedCards =
    let rec dealerPlay cards =
        let total = calculateCardValue cards

        if total < 17 then
            let newCard = dealCard gameState.Dealer
            dealerPlay (newCard :: cards)
        else
            cards

    dealerPlay providedCards

let startNewRound () =
    printfn "🎲 NEW ROUND STARTING!"

    // Clear the database instead of creating a new environment
    clearBlackjackDatabase ()

    let card1 = dealCard gameState.Dealer
    let card2 = dealCard gameState.Dealer
    let cards = [ card1; card2 ]
    let dealerTotal = calculateCardValue cards
    printfn "🎰 DEALER STARTING HAND: %A (Total: %d)" cards dealerTotal

    let roundEndTime =
        DateTimeOffset.UtcNow.AddSeconds(roundCountdown).ToUnixTimeSeconds()

    gameState <-
        { RoundActive = true
          DealerCards = cards
          DealerTotal = calculateCardValue [ card1; card2 ]
          RoundStartTime = None
          RoundEndTime = Some roundEndTime
          BlackjackRound = gameState.BlackjackRound // Reuse the existing round
          Dealer = gameState.Dealer
          Results = None }

    _roundCountdown <- roundCountdown
    newRoundCountdown <- 0

    broadcastMessage
        {| Type = "new_round"
           RoundEndTime = roundEndTime
           DealerCards = [ card2 ]
           DealerTotal = calculateCardValue [ card2 ] |}

let convertPlayerCards
    (playerCardsOpt: option<list<PlayerCards>>)
    : array<
          {| Cards: string list
             Total: int
             UserId: string
             Result: string |}
       >
    =
    match playerCardsOpt with
    | None -> [||]
    | Some playerCardsList ->
        playerCardsList
        |> List.map (fun pc ->
            {| Cards = pc.Cards
               Total = pc.Total
               UserId = pc.UserId
               Result =
                match pc.Result with
                | Some result -> result.ToString()
                | None -> null |})
        |> List.toArray

let endRound () =
    printfn "⏰ Round ending! Dealer playing..."

    let dealerFinalCards = playDealerHand gameState.DealerCards
    let dealerTotal = calculateCardValue dealerFinalCards

    printfn "🎰 DEALER FINAL HAND: %A (Total: %d)" dealerFinalCards dealerTotal

    let players = loadAllPlayerCards ()

    let results =
        players
        |> List.map (fun (player: PlayerCards) ->
            let playerTotal = calculateCardValue player.Cards

            let blackjackResult =
                if playerTotal > 21 then Loss
                elif dealerTotal > 21 then Win
                elif playerTotal > dealerTotal then Win
                elif playerTotal = dealerTotal then Push
                else Loss

            let resultText =
                match blackjackResult with
                | Win -> "WIN"
                | Loss -> "LOSS"
                | Push -> "PUSH"

            let result: PlayerCards =
                { UserId = player.UserId
                  Cards = player.Cards
                  Total = playerTotal
                  Result = Some blackjackResult }

            match blackjackResult with
            | Win -> incrementWin player.UserId |> ignore
            | _ -> ()

            printfn "👤 Player %s: %A (Total: %d) - %s" player.UserId player.Cards playerTotal resultText

            result)

    let roundStartTime =
        DateTimeOffset.UtcNow.AddSeconds(nextRoundWaitTime).ToUnixTimeSeconds()

    gameState <-
        { gameState with
            RoundStartTime = Some roundStartTime
            RoundActive = false
            DealerCards = dealerFinalCards
            Results = Some results }

    broadcastMessage
        {| Type = "round_results"
           DealerCards = dealerFinalCards
           DealerTotal = dealerTotal
           RoundStartTime = roundStartTime
           Results = convertPlayerCards (Some results) |}

    newRoundCountdown <- nextRoundWaitTime

let gameTimer =
    new Timer(
        fun _ ->
            try
                if gameState.RoundActive then
                    printfn "⌛ Round active - %d seconds remaining..." _roundCountdown
                    _roundCountdown <- _roundCountdown - 1

                    if _roundCountdown <= 0 then
                        endRound ()
                elif newRoundCountdown > 0 then
                    printfn "🕐 Next round starts in %d seconds..." newRoundCountdown
                    newRoundCountdown <- newRoundCountdown - 1

                    if newRoundCountdown = 0 then
                        startNewRound ()
            with ex ->
                printfn "Timer error: %s" ex.Message
        , null
        , 1000
        , 1000
    )

let hitHandler: HttpHandler =
    fun next ctx ->
        task {
            let! body = ctx.ReadBodyFromRequestAsync()

            let data =
                JsonConvert.DeserializeObject<{| UserId: string; SecretKey: string |}> body

            if not gameState.RoundActive then
                return! json {| Error = "Round not active" |} next ctx
            else
                let result =
                    match loadPlayerCards data.UserId with
                    | Some existing -> hitPlayer data.UserId data.SecretKey
                    | None -> dealInitialCards data.UserId data.SecretKey

                match result with
                | Some cards ->
                    let response = createPlayerResponse (Some data.UserId) (Some cards.Cards)

                    broadcastMessage
                        {| response with
                            Type = "player_cards" |}

                    return! json response next ctx
                | None -> return! json {| Error = "Cannot deal card" |} next ctx
        }

type LoadRoundData =
    { UserId: string
      Cards: string array
      Total: int
      RemainingCards: int
      TotalStartingCards: int
      CurrentlyConnectedPlayers:
          array<
              {| Cards: string list
                 Total: int
                 UserId: string |}
           >
      FirstDealerCard: string
      RoundEndTime: int64
      DealerTotal: int
      Wins: int }

type LoadResultsData =
    { UserId: string
      Cards: string array
      Total: int
      RemainingCards: int
      TotalStartingCards: int
      CurrentlyConnectedPlayers:
          array<
              {| Cards: string list
                 Total: int
                 UserId: string |}
           >
      AllDealerCards: string array
      DealerTotal: int
      PlayerResults:
          array<
              {| Cards: string list
                 Total: int
                 UserId: string
                 Result: string |}
           >
      RoundStartTime: int64
      Wins: int }

type GameResponse =
    | LOAD_ROUND of LoadRoundData
    | LOAD_RESULTS of LoadResultsData

let getUserCardsHandler userId : HttpHandler =
    fun next ctx ->
        task {
            let playerCards = loadPlayerCards userId

            let response =
                createPlayerResponse (Some userId) (playerCards |> Option.map (fun pc -> pc.Cards))

            let wins = 
                    response.UserId
                    |> Option.bind getUserData
                    |> Option.map (fun x -> x.Wins)
                    |> Option.defaultValue 0

            let players =
                loadAllPlayerCards ()
                |> List.map (fun (player: PlayerCards) ->
                    {| Cards = player.Cards
                       UserId = player.UserId
                       Total = calculateCardValue player.Cards |})
                |> List.toArray

            let commonFields =
                {| UserId = response.UserId |> Option.defaultValue null
                   Cards = response.Cards |> Option.map Array.ofList |> Option.defaultValue null
                   Total = response.Total |> Option.defaultValue 0
                   RemainingCards = response.RemainingCards
                   TotalStartingCards = response.TotalStartingCards
                   DealerTotal = gameState.DealerTotal |}

            let gameResponse =
                if gameState.RoundActive then
                    LOAD_ROUND
                        { UserId = commonFields.UserId
                          Cards = commonFields.Cards
                          Total = commonFields.Total
                          RemainingCards = commonFields.RemainingCards
                          TotalStartingCards = commonFields.TotalStartingCards
                          CurrentlyConnectedPlayers = players
                          Wins = wins

                          DealerTotal =
                            if gameState.DealerCards.IsEmpty then
                                0
                            else
                                calculateCardValue [ (List.last gameState.DealerCards) ]
                          FirstDealerCard =
                            if gameState.DealerCards.IsEmpty then
                                null
                            else
                                (List.last gameState.DealerCards)
                          RoundEndTime = gameState.RoundEndTime |> Option.defaultValue 0L }
                else
                    LOAD_RESULTS
                        { UserId = commonFields.UserId
                          Cards = commonFields.Cards
                          Total = commonFields.Total
                          RemainingCards = commonFields.RemainingCards
                          TotalStartingCards = commonFields.TotalStartingCards
                          CurrentlyConnectedPlayers = players
                          DealerTotal = commonFields.DealerTotal
                          Wins = wins

                          AllDealerCards = gameState.DealerCards |> List.toArray
                          PlayerResults = convertPlayerCards gameState.Results
                          RoundStartTime = gameState.RoundStartTime |> Option.defaultValue 0L }

            return! json gameResponse next ctx
        }

let websocketHandler: HttpHandler =
    fun next ctx ->
        task {
            if ctx.WebSockets.IsWebSocketRequest then
                let! webSocket = ctx.WebSockets.AcceptWebSocketAsync()
                webSockets.Add webSocket

                let buffer = Array.zeroCreate 4096

                try
                    while webSocket.State = WebSocketState.Open do
                        let! result = webSocket.ReceiveAsync(ArraySegment buffer, CancellationToken.None)

                        if result.MessageType = WebSocketMessageType.Text then
                            let message = System.Text.Encoding.UTF8.GetString(buffer, 0, result.Count)

                            try
                                let data = JsonConvert.DeserializeObject<{| UserId: string |}> message
                                webSocketUsers.TryAdd(webSocket, data.UserId) |> ignore
                            with _ ->
                                ()
                        elif result.MessageType = WebSocketMessageType.Close then
                            do! webSocket.CloseAsync(WebSocketCloseStatus.NormalClosure, "", CancellationToken.None)
                with _ ->
                    ()

                webSocketUsers.TryRemove(webSocket) |> ignore

                return Some ctx
            else
                return! next ctx
        }

let webApp =
    router {
        post "/hit" hitHandler
        getf "/cards/%s" getUserCardsHandler
        get "/ws" websocketHandler

        get "/health" (fun _ ctx ->
            ctx.WriteJsonAsync
                {| status = "healthy"
                   timestamp = DateTime.UtcNow |})
    }

JsonConvert.DefaultSettings <-
    fun () ->
        let settings = JsonSerializerSettings()
        settings.Converters.Add(OptionConverter())
        settings

let configureServices (services: IServiceCollection) =
    services.AddCors(fun options ->
        options.AddPolicy(
            "AllowAll",
            fun builder -> builder.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader() |> ignore
        ))
    |> ignore

    services

let app =
    application {
        use_router webApp
        use_static "wwwroot"
        service_config (fun services -> configureServices (services))

        app_config (fun app ->
            app.UseCors(fun builder -> builder.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader() |> ignore)
            |> ignore

            app.UseWebSockets())
    }

[<EntryPoint>]
let main args =
    printfn "🎲 Blackjack server starting..."
    startNewRound ()

    // Register cleanup handler
    System.AppDomain.CurrentDomain.ProcessExit.Add(fun _ ->
        printfn "🛑 Server shutting down, cleaning up resources..."

        try
            gameTimer.Dispose()
            (globalBlackjackRound :> IDisposable).Dispose()
        with ex ->
            printfn "Error during cleanup: %s" ex.Message)

    run app
    0
