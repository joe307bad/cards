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

// Open the Dealer module
open HighSpeedCardDealer

// Game state
type PlayerCards =
    { UserId: string
      Cards: int list
      Finished: bool }

type Round =
    { Environment: LightningEnvironment
      Database: LightningDatabase }

type GameState =
    { RoundActive: bool
      DealerCards: int list
      DealerTotal: int
      RoundStartTime: int64 option
      RoundEndTime: int64 option
      Dealer: HighSpeedCardDealer.DealerState
      BlackjackRound: Round 
      Results: list<{| Cards: list<string>; Total: int; UserId: string; Won: bool |}> option }

// Add this with your other mutable state variables (near totalStartingCards)
let webSocketUsers = new ConcurrentDictionary<WebSocket, string>()

let initializeBlackJackRound () =
    let env = new LightningEnvironment "./blackjack_db"
    env.MaxDatabases <- 1
    env.MapSize <- 1073741824L // 1GB
    env.Open(EnvironmentOpenFlags.WriteMap ||| EnvironmentOpenFlags.MapAsync)

    let db =
        use txn = env.BeginTransaction()

        let database =
            txn.OpenDatabase(configuration = DatabaseConfiguration(Flags = DatabaseOpenFlags.Create))

        // Drop all data from the database
        txn.TruncateDatabase(database) |> ignore

        txn.Commit() |> ignore
        database

    { Environment = env; Database = db }


let mutable gameState =
    { RoundActive = true
      RoundStartTime = Some 0
      RoundEndTime = Some 0
      DealerCards = []
      Dealer = initializeDealer "./blackjack_dealer_db"
      BlackjackRound = initializeBlackJackRound ()
      DealerTotal = 0
      Results = None }

// Initialize total starting cards count

let webSockets = new ConcurrentBag<WebSocket>()

// Track total starting cards for the dealer
let totalStartingCards = totalCards

// Timer state
let roundCountdown = 10
let nextRoundWaitTime = 5
let mutable _roundCountdown = roundCountdown
let mutable newRoundCountdown = 0

// Database operations
let userCardsKey userId = sprintf "user_cards_%s" userId

let savePlayerCards userId cards finished =
    use txn = gameState.BlackjackRound.Environment.BeginTransaction()
    use db = txn.OpenDatabase()

    let playerData =
        { UserId = userId
          Cards = cards
          Finished = finished }

    let json = JsonSerializer.Serialize playerData
    let keyBytes = System.Text.Encoding.UTF8.GetBytes(userCardsKey userId)
    let valueBytes = System.Text.Encoding.UTF8.GetBytes json
    txn.Put(db, keyBytes, valueBytes) |> ignore
    txn.Commit() |> ignore

let loadAllPlayerCards () =

    use txn = gameState.BlackjackRound.Environment.BeginTransaction()
    // Use the existing database instead of creating a new one
    use cursor = txn.CreateCursor gameState.BlackjackRound.Database
    let mutable playerCardsList = []

    let struct (firstResult, firstKey, firstValue) = cursor.First()

    if firstResult = MDBResultCode.Success then
        let valueBytes = firstValue.CopyToNewArray()

        if valueBytes.Length > 0 then
            let json = System.Text.Encoding.UTF8.GetString(valueBytes)
            let playerData = JsonSerializer.Deserialize<PlayerCards> json
            playerCardsList <- playerData :: playerCardsList

        let mutable continue' = true

        while continue' do
            let struct (nextResult, nextKey, nextValue) = cursor.Next()

            if nextResult = MDBResultCode.Success then
                let valueBytes = nextValue.CopyToNewArray()

                if valueBytes.Length > 0 then
                    let json = System.Text.Encoding.UTF8.GetString(valueBytes)
                    let playerData = JsonSerializer.Deserialize<PlayerCards> json
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
            JsonSerializer.Deserialize<PlayerCards>(json) |> Some
        else
            None
    with _ ->
        None

// Helper functions
let cardToString card =
    let suits = [| "S"; "H"; "D"; "C" |]
    let ranks = [| "A"; "2"; "3"; "4"; "5"; "6"; "7"; "8"; "9"; "10"; "J"; "Q"; "K" |]
    let suit = suits.[card % 4]
    let rank = ranks.[card % 13]
    rank + suit

let cardValue card =
    let value = card % 13 + 1
    if value > 10 then 10 else value

let handValue cards =
    let total = cards |> List.sumBy cardValue
    let aces = cards |> List.filter (fun c -> c % 13 + 1 = 1) |> List.length

    let rec adjustForAces total aces =
        if total > 21 && aces > 0 then
            adjustForAces (total - 10) (aces - 1)
        else
            total

    adjustForAces total aces

let createPlayerResponse (userId: string option) (cards: Card list option) =
    {| UserId = userId
       Cards = cards |> Option.map (List.map cardToString)
       Total = cards |> Option.map handValue
       RemainingCards = getRemainingCards gameState.Dealer
       TotalStartingCards = totalStartingCards |}

let broadcastMessage message =
    let data = System.Text.Encoding.UTF8.GetBytes(JsonSerializer.Serialize message)

    webSockets
    |> Seq.filter (fun ws -> ws.State = WebSocketState.Open)
    |> Seq.iter (fun ws ->
        try
            ws.SendAsync(ArraySegment data, WebSocketMessageType.Text, true, CancellationToken.None)
            |> ignore
        with _ ->
            ())

// Game logic
let dealInitialCards userId =
    let card1 = dealCard gameState.Dealer
    let card2 = dealCard gameState.Dealer
    let cards: Card list = [ card1; card2 ]
    savePlayerCards userId cards false

    let playerCards =
        { UserId = userId
          Cards = cards
          Finished = false }

    printfn "🆕 Player %s joined - Initial cards: %A (Total: %d)" userId cards (handValue cards)
    playerCards

let hitPlayer userId =
    match loadPlayerCards userId with
    | Some player when not player.Finished ->
        let stopwatch = System.Diagnostics.Stopwatch.StartNew()
        let newCard = dealCard gameState.Dealer
        stopwatch.Stop()
        let updatedCards = newCard :: player.Cards
        savePlayerCards userId updatedCards player.Finished
        let updatedPlayer = { player with Cards = updatedCards }

        printfn
            "🃏 Player %s hit - got card %d in %dms - Hand: %A (Total: %d)"
            userId
            newCard
            stopwatch.ElapsedMilliseconds
            updatedCards
            (handValue updatedCards)

        Some updatedPlayer
    | _ -> None

let playDealerHand providedCards =
    let rec dealerPlay cards =
        let total = handValue cards

        if total < 17 then
            let newCard = dealCard gameState.Dealer
            dealerPlay (newCard :: cards)
        else
            cards

    dealerPlay providedCards


let startNewRound () =
    printfn "🎲 NEW ROUND STARTING!"
    let card1 = dealCard gameState.Dealer
    let card2 = dealCard gameState.Dealer
    let cards = [ cardToString card1; cardToString card2 ]
    let dealerTotal = handValue [ card1; card2 ]
    printfn "🎰 DEALER STARTING HAND: %A (Total: %d)" cards dealerTotal

    let roundEndTime =
        DateTimeOffset.UtcNow.AddSeconds(roundCountdown).ToUnixTimeSeconds()

    gameState <-
        { RoundActive = true
          DealerCards = [ card1; card2 ]
          DealerTotal = handValue [ card1; card2 ]
          RoundStartTime = None
          RoundEndTime = Some roundEndTime
          BlackjackRound = initializeBlackJackRound ()
          Dealer = gameState.Dealer
          Results = None }

    _roundCountdown <- roundCountdown
    newRoundCountdown <- 0
    broadcastMessage
        {| Type = "new_round"
           RoundEndTime = roundEndTime
           DealerCards = [ cardToString card2 ]
           DealerTotal = handValue [ card2 ] |}

let endRound () =
    printfn "⏰ Round ending! Dealer playing..."

    let dealerFinalCards = playDealerHand gameState.DealerCards
    let dealerTotal = handValue dealerFinalCards

    printfn "🎰 DEALER FINAL HAND: %A (Total: %d)" (dealerFinalCards |> List.map cardToString) dealerTotal

    let players = loadAllPlayerCards ()

    let results =
        players
        |> List.map (fun (player: PlayerCards) ->
            let playerTotal = handValue player.Cards

            let won =
                if playerTotal > 21 then false
                elif dealerTotal > 21 then true
                elif playerTotal > dealerTotal then true
                else false

            let result =
                {| UserId = player.UserId
                   Cards = player.Cards |> List.map cardToString
                   Won = won
                   Total = playerTotal |}

            printfn
                "👤 Player %s: %A (Total: %d) - %s"
                player.UserId
                player.Cards
                playerTotal
                (if won then "WON" else "LOST")

            result)
    
    gameState <- { gameState with RoundActive = false; DealerCards = dealerFinalCards; Results = Some results }

    broadcastMessage
        {| Type = "round_results"
           DealerCards = dealerFinalCards |> List.map cardToString
           DealerTotal = dealerTotal
           RoundStartTime = DateTimeOffset.UtcNow.AddSeconds(nextRoundWaitTime).ToUnixTimeSeconds()
           Results = results |}

    newRoundCountdown <- nextRoundWaitTime

// Single timer to handle both round countdown and new round countdown
let gameTimer =
    new Timer(
        fun _ ->
            try
                if gameState.RoundActive then
                    // Active round countdown
                    printfn "⌛ Round active - %d seconds remaining..." _roundCountdown
                    _roundCountdown <- _roundCountdown - 1

                    if _roundCountdown <= 0 then
                        endRound ()
                elif newRoundCountdown > 0 then
                    // New round countdown
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

// Web handlers
let hitHandler: HttpHandler =
    fun next ctx ->
        task {
            let! body = ctx.ReadBodyFromRequestAsync()
            let data = JsonSerializer.Deserialize<{| UserId: string |}> body

            if not gameState.RoundActive then
                return! json {| Error = "Round not active" |} next ctx
            else
                let result =
                    match loadPlayerCards data.UserId with
                    | Some existing -> hitPlayer data.UserId // Player exists, hit them
                    | None -> Some(dealInitialCards data.UserId) // New player, deal initial cards

                match result with
                | Some cards ->
                    let response = createPlayerResponse (Some data.UserId) (Some cards.Cards)

                    broadcastMessage
                        {| response with
                            Type = "player_cards" |}

                    return! json response next ctx
                | None -> return! json {| Error = "Cannot deal card" |} next ctx
        }

type LoadRoundData = {
    UserId: string
    Cards: string array
    Total: int
    RemainingCards: int
    TotalStartingCards: int
    CurrentlyConnectedPlayers: array<{| Cards: list<string>; Total: int; UserId: string; Won: bool |}>
    Finished: bool
    FirstDealerCard: string
    RoundEndTime: int64
    DealerTotal: int
}

type LoadResultsData = {
    UserId: string
    Cards: string array
    Total: int
    RemainingCards: int
    TotalStartingCards: int
    CurrentlyConnectedPlayers: PlayerCards array
    Finished: bool
    AllDealerCards: string array
    DealerTotal: int
    PlayerResults: list<{| Cards: list<string>; Total: int; UserId: string; Won: bool |}>
    RoundStartTime: int64
}

type GameResponse =
    | LOAD_ROUND of LoadRoundData
    | LOAD_RESULTS of LoadResultsData

let getUserCardsHandler userId : HttpHandler =
    fun next ctx ->
        task {
            let playerCards = loadPlayerCards userId
            let response = createPlayerResponse (Some userId) (playerCards |> Option.map (fun pc -> pc.Cards))
            let players = loadAllPlayerCards ()


            let gameResponse =
                if gameState.RoundActive then
                    LOAD_ROUND {
                        UserId = response.UserId |> Option.defaultValue null
                        Cards = response.Cards |> Option.map Array.ofList |> Option.defaultValue null
                        Total = response.Total |> Option.defaultValue 0
                        RemainingCards = response.RemainingCards
                        TotalStartingCards = response.TotalStartingCards
                        CurrentlyConnectedPlayers = players |> List.map (fun (player: PlayerCards) -> {|
                            Cards = player.Cards |> List.map cardToString;
                            UserId = player.UserId;
                            Total = handValue player.Cards;
                            Won = false
                        |}) |> List.toArray
                        Finished = playerCards |> Option.map (fun pc -> pc.Finished) |> Option.defaultValue false
                        FirstDealerCard = if gameState.DealerCards.IsEmpty then null else cardToString gameState.DealerCards.Head
                        RoundEndTime = gameState.RoundEndTime |> Option.defaultValue 0L
                        DealerTotal = gameState.DealerTotal
                    }
                else
                    LOAD_RESULTS {
                        UserId = response.UserId |> Option.defaultValue null
                        Cards = response.Cards |> Option.map Array.ofList |> Option.defaultValue null
                        Total = response.Total |> Option.defaultValue 0
                        RemainingCards = response.RemainingCards
                        TotalStartingCards = response.TotalStartingCards
                        CurrentlyConnectedPlayers = loadAllPlayerCards () |> List.toArray
                        Finished = playerCards |> Option.map (fun pc -> pc.Finished) |> Option.defaultValue false
                        AllDealerCards = gameState.DealerCards |> List.map cardToString |> List.toArray
                        DealerTotal = gameState.DealerTotal
                        PlayerResults = gameState.Results |> Option.defaultValue []
                        RoundStartTime = gameState.RoundStartTime |> Option.defaultValue 0L
                    }
            
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
                            // Parse message to get user ID and store the mapping
                            let message = System.Text.Encoding.UTF8.GetString(buffer, 0, result.Count)

                            try
                                let data = JsonSerializer.Deserialize<{| UserId: string |}> message
                                webSocketUsers.TryAdd(webSocket, data.UserId) |> ignore
                            with _ ->
                                () // Ignore parsing errors
                        elif result.MessageType = WebSocketMessageType.Close then
                            do! webSocket.CloseAsync(WebSocketCloseStatus.NormalClosure, "", CancellationToken.None)
                with _ ->
                    ()

                // Clean up when connection closes
                webSocketUsers.TryRemove(webSocket) |> ignore

                return Some ctx
            else
                return! next ctx
        }

// Routes
let webApp =
    router {
        post "/hit" hitHandler
        getf "/cards/%s" getUserCardsHandler
        get "/ws" websocketHandler
    }

let app =
    application {
        use_router webApp
        use_static "wwwroot"
        service_config (fun services -> services.AddCors())

        app_config (fun app ->
            app.UseCors(fun builder -> builder.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader() |> ignore)
            |> ignore

            app.UseWebSockets())
    }

[<EntryPoint>]
let main args =
    printfn "🎲 Blackjack server starting..."
    printfn "🎲 NEW ROUND STARTING!"

    // Keep the application running and prevent timer disposal
    run app

    // Clean up timer when application shuts down
    gameTimer.Dispose()
    0
