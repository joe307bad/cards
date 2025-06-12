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
type PlayerCards = { UserId: string; Cards: int list; Finished: bool }
type GameState = {
    RoundActive: bool
    DealerCards: String list
    Dealer: HighSpeedCardDealer.DealerState
}

// Add this with your other mutable state variables (near totalStartingCards)
let webSocketUsers = new ConcurrentDictionary<WebSocket, string>()
let mutable gameState = {
    RoundActive = true
    DealerCards = []
    Dealer = initializeDealer "./blackjack_db"
}

// Initialize total starting cards count

let webSockets = new ConcurrentBag<WebSocket>()

// Track total starting cards for the dealer
let totalStartingCards = totalCards

// Timer state
let mutable roundCountdown = 10
let mutable newRoundCountdown = 0

// Database operations
let userCardsKey userId = sprintf "user_cards_%s" userId

let savePlayerCards userId cards finished =
    use txn = gameState.Dealer.Environment.BeginTransaction()
    use db = txn.OpenDatabase()
    let playerData = { UserId = userId; Cards = cards; Finished = finished }
    let json = JsonSerializer.Serialize playerData
    let keyBytes = System.Text.Encoding.UTF8.GetBytes(userCardsKey userId)
    let valueBytes = System.Text.Encoding.UTF8.GetBytes json
    txn.Put(db, keyBytes, valueBytes) |> ignore
    txn.Commit() |> ignore

let loadPlayerCards userId =
    try
        use txn = gameState.Dealer.Environment.BeginTransaction(TransactionBeginFlags.ReadOnly)
        use db = txn.OpenDatabase()
        
        let keyBytes = System.Text.Encoding.UTF8.GetBytes(userCardsKey userId)
        let success, value = txn.TryGet(db, keyBytes)
        
        if success then
            let json = System.Text.Encoding.UTF8.GetString(value.AsSpan())
            JsonSerializer.Deserialize<PlayerCards>(json) |> Some
        else
            None
    with
    | _ -> None

let clearAllPlayerCards () =
    use txn = gameState.Dealer.Environment.BeginTransaction()
    use db = txn.OpenDatabase()
    
    // Drop and recreate the database to clear all player data
    txn.DropDatabase(db) |> ignore
    txn.Commit() |> ignore

// Helper functions
let cardToString card =
    let suits = [|"S"; "H"; "D"; "C"|]  // Spades, Hearts, Diamonds, Clubs
    let ranks = [|"A"; "2"; "3"; "4"; "5"; "6"; "7"; "8"; "9"; "10"; "J"; "Q"; "K"|]
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
        else total
    adjustForAces total aces

let getCurrentlyConnectedPlayers () =
    webSocketUsers
    |> Seq.filter (fun kvp -> kvp.Key.State = WebSocketState.Open)
    |> Seq.length

let createPlayerResponse userId cards =
    {| 
        UserId = userId
        Cards = cards |> List.map cardToString  // ADD THIS MAP
        Total = handValue cards
        RemainingCards = getRemainingCards gameState.Dealer
        TotalStartingCards = totalStartingCards
        CurrentlyConnectedPlayers = getCurrentlyConnectedPlayers()
    |}
let broadcastMessage message =
    let data = System.Text.Encoding.UTF8.GetBytes(JsonSerializer.Serialize message)
    webSockets
    |> Seq.filter (fun ws -> ws.State = WebSocketState.Open)
    |> Seq.iter (fun ws -> 
        try ws.SendAsync(ArraySegment data, WebSocketMessageType.Text, true, CancellationToken.None) |> ignore
        with _ -> ())

// Game logic
let dealInitialCards userId =
    let card1 = dealCard gameState.Dealer
    let card2 = dealCard gameState.Dealer
    let cards = [card1; card2]
    savePlayerCards userId cards false
    
    let playerCards = { UserId = userId; Cards = cards; Finished = false }
    printfn "🆕 Player %s joined - Initial cards: %A (Total: %d)" 
        userId cards (handValue cards)
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
        printfn "🃏 Player %s hit - got card %d in %dms - Hand: %A (Total: %d)" 
            userId newCard stopwatch.ElapsedMilliseconds updatedCards (handValue updatedCards)
        Some updatedPlayer
    | _ -> None

let getAllPlayers () =
    let activePlayers = ResizeArray<PlayerCards>()
    
    // Get user IDs from active WebSocket connections
    let activeUserIds = 
        webSocketUsers
        |> Seq.filter (fun kvp -> kvp.Key.State = WebSocketState.Open)
        |> Seq.map (fun kvp -> kvp.Value)
        |> Set.ofSeq
    
    for userId in activeUserIds do
        match loadPlayerCards userId with
        | Some playerData -> activePlayers.Add playerData
        | None -> () // Player ID is tracked but no data found
    
    activePlayers |> Seq.toArray

let finishAllPlayers () =
    let players = getAllPlayers()
    for player in players do
        savePlayerCards player.UserId player.Cards true

let playDealerHand () =
    let rec dealerPlay cards =
        let total = handValue cards
        if total < 17 then
            let newCard = dealCard gameState.Dealer
            dealerPlay (newCard :: cards)
        else cards
    
    let card1 = dealCard gameState.Dealer
    let card2 = dealCard gameState.Dealer
    dealerPlay [card1; card2]


let startNewRound () =
    printfn "🎲 NEW ROUND STARTING!"
    clearAllPlayerCards()
    gameState <- {
        RoundActive = true
        DealerCards = []
        Dealer = gameState.Dealer
    }
    roundCountdown <- 10
    newRoundCountdown <- 0
    
    // Calculate when the round will end (10 seconds from now)
    let roundEndTime = System.DateTimeOffset.UtcNow.AddSeconds(roundCountdown).ToUnixTimeMilliseconds()
    
    broadcastMessage {| 
        Type = "new_round"
        RoundEndTimestamp = roundEndTime
    |}

let endRound () =
    printfn "⏰ Round ending! Dealer playing..."
    gameState <- { gameState with RoundActive = false }
    
    // Force all players to stand
    finishAllPlayers()
    
    // Dealer plays
    let dealerFinalCards = playDealerHand()
    let dealerTotal = handValue dealerFinalCards
    gameState <- { gameState with DealerCards = dealerFinalCards |> List.map cardToString }
    
    // Print dealer's final hand
    printfn "🎰 DEALER FINAL HAND: %A (Total: %d)" (dealerFinalCards |> List.map cardToString) dealerTotal
    
    // Calculate and print results
    let players = getAllPlayers()
    let results = 
        players
        |> Array.map (fun player ->
            let playerTotal = handValue player.Cards
            let won = 
                if playerTotal > 21 then false
                elif dealerTotal > 21 then true
                elif playerTotal > dealerTotal then true
                else false
            let result = {| 
                UserId = player.UserId
                Cards = player.Cards |> List.map cardToString  // ADD THIS MAP
                Won = won
                Total = playerTotal 
            |}
            printfn "👤 Player %s: %A (Total: %d) - %s" 
                player.UserId player.Cards playerTotal (if won then "WON" else "LOST")
            result)
    
    // Broadcast COMBINED dealer cards and results in a single message
    broadcastMessage {| 
        Type = "round_results"
        DealerCards = dealerFinalCards |> List.map cardToString
        DealerTotal = dealerTotal
        Results = results 
    |}
    
    // Start countdown to next round
    newRoundCountdown <- 5

// Single timer to handle both round countdown and new round countdown
let gameTimer = 
    new Timer(fun _ -> 
        try
            if gameState.RoundActive then
                // Active round countdown
                printfn "⌛ Round active - %d seconds remaining..." roundCountdown
                roundCountdown <- roundCountdown - 1
                if roundCountdown <= 0 then
                    endRound()
            elif newRoundCountdown > 0 then
                // New round countdown
                printfn "🕐 Next round starts in %d seconds..." newRoundCountdown
                newRoundCountdown <- newRoundCountdown - 1
                if newRoundCountdown = 0 then
                    startNewRound()
        with ex ->
            printfn "Timer error: %s" ex.Message
    , null, 1000, 1000)

// Web handlers
let hitHandler : HttpHandler =
    fun next ctx ->
        task {
            let! body = ctx.ReadBodyFromRequestAsync()
            let data = JsonSerializer.Deserialize<{| UserId: string |}> body
            
            if not gameState.RoundActive then
                return! json {| Error = "Round not active" |} next ctx
            else
                let result = 
                    match loadPlayerCards data.UserId with
                    | Some existing -> hitPlayer data.UserId  // Player exists, hit them
                    | None -> Some (dealInitialCards data.UserId)  // New player, deal initial cards
                
                match result with
                | Some cards ->
                    let response = createPlayerResponse data.UserId cards.Cards
                    broadcastMessage {| Type = "player_cards"; Data = response |}
                    return! json response next ctx
                | None ->
                    return! json {| Error = "Cannot deal card" |} next ctx
        }

let getUserCardsHandler userId : HttpHandler =
    fun next ctx ->
        task {
            match loadPlayerCards userId with
            | Some playerCards ->
                let response = createPlayerResponse userId playerCards.Cards
                return! json {| 
                    UserId = response.UserId
                    Cards = response.Cards
                    Total = response.Total
                    RemainingCards = response.RemainingCards
                    TotalStartingCards = response.TotalStartingCards
                    CurrentlyConnectedPlayers = response.CurrentlyConnectedPlayers
                    Finished = playerCards.Finished
                    RoundActive = gameState.RoundActive
                |} next ctx
            | None ->
                return! json {| Error = "User not found" |} next ctx
        }

let websocketHandler : HttpHandler =
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
                            with _ -> () // Ignore parsing errors
                        elif result.MessageType = WebSocketMessageType.Close then
                            do! webSocket.CloseAsync(WebSocketCloseStatus.NormalClosure, "", CancellationToken.None)
                with _ -> ()
                
                // Clean up when connection closes
                webSocketUsers.TryRemove(webSocket) |> ignore
                
                return Some ctx
            else
                return! next ctx
        }

// Routes
let webApp = router {
    post "/hit" hitHandler
    getf "/cards/%s" getUserCardsHandler
    get "/ws" websocketHandler
}

let app = application {
    use_router webApp
    use_static "wwwroot"
    service_config (fun services -> 
        services.AddCors())
    app_config (fun app -> 
        app.UseCors(fun builder -> 
            builder.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader() |> ignore) |> ignore
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