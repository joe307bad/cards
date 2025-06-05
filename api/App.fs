open System
open System.IO
open System.Threading
open System.Threading.Tasks
open Microsoft.AspNetCore.Builder
open Microsoft.AspNetCore.Hosting
open Microsoft.Extensions.DependencyInjection
open Microsoft.Extensions.Hosting
open Microsoft.Extensions.Logging
open Giraffe
open Saturn
open System.Net.WebSockets
open Microsoft.Data.Sqlite
open Newtonsoft.Json
open System.Text
open System.Collections.Concurrent
open Microsoft.AspNetCore.Cors

// Configuration
type GameConfig = {
    roundDurationSeconds: int
    gameEndDisplaySeconds: int
}

let mutable gameConfig = { roundDurationSeconds = 10; gameEndDisplaySeconds = 5 }

// Domain Types
type Card =
    { suit: string
      rank: string
      value: int }

type PlayerState =
    { cards: Card[]
      score: int
      state: string
      result: string option } // Added result field for win/loss/push

type GameState =
    { timestamp: int64
      playerHands: Map<string, PlayerState>
      dealerHand: Card[]
      dealerScore: int
      deck: Card[]
      gameStatus: string // "playing", "dealer_turn", "game_ended", "waiting_for_new_round"
      roundStartTime: int64
      roundEndTime: int64 option }

type GameAction = { ``type``: string; userId: string }

// Logging utilities
let logPlayerState (userId: string) (player: PlayerState) (action: string) =
    let cardsStr = 
        player.cards 
        |> Array.map (fun c -> sprintf "%s%s" c.rank (c.suit.[0..0].ToUpper()))
        |> String.concat ", "
    
    let resultStr = 
        match player.result with
        | Some r -> sprintf " [Result: %s]" r
        | None -> ""
    
    printfn "🎲 Player %s %s: Cards=[%s] Score=%d State=%s%s" 
        userId action cardsStr player.score player.state resultStr

let logAllPlayersState (gameState: GameState) (context: string) =
    printfn "📊 %s - All Players Status:" context
    gameState.playerHands
    |> Map.iter (fun userId player ->
        let cardsStr = 
            player.cards 
            |> Array.map (fun c -> sprintf "%s%s" c.rank (c.suit.[0..0].ToUpper()))
            |> String.concat ", "
        
        let resultStr = 
            match player.result with
            | Some r -> sprintf " [%s]" r
            | None -> ""
        
        printfn "   👤 %s: [%s] Score=%d State=%s%s" 
            userId cardsStr player.score player.state resultStr)

let logDealerState (dealerHand: Card[]) (dealerScore: int) (context: string) =
    let cardsStr = 
        dealerHand 
        |> Array.map (fun c -> sprintf "%s%s" c.rank (c.suit.[0..0].ToUpper()))
        |> String.concat ", "
    
    printfn "🏠 Dealer %s: [%s] Score=%d" context cardsStr dealerScore

let logGameStateTransition (oldStatus: string) (newStatus: string) (context: string) =
    if oldStatus <> newStatus then
        printfn "🔄 Game State Change: %s -> %s (%s)" oldStatus newStatus context

// Round countdown logging
let logRoundCountdown (gameState: GameState) =
    if gameState.gameStatus = "playing" then
        let now = DateTimeOffset.UtcNow.ToUnixTimeSeconds()
        let roundDuration = int64 gameConfig.roundDurationSeconds
        let timeRemaining = (gameState.roundStartTime + roundDuration) - now
        
        if timeRemaining > 0 then
            printfn "⏱️  Round countdown: %d seconds remaining" timeRemaining
        elif timeRemaining = 0 then
            printfn "⏰ Round countdown: TIME'S UP!"
        else
            printfn "⏰ Round countdown: OVERTIME (%d seconds over)" (abs timeRemaining)

// Game Logic
let createDeck () =
    let suits = [ "hearts"; "diamonds"; "clubs"; "spades" ]

    let ranks =
        [ ("A", 11)
          ("2", 2)
          ("3", 3)
          ("4", 4)
          ("5", 5)
          ("6", 6)
          ("7", 7)
          ("8", 8)
          ("9", 9)
          ("10", 10)
          ("J", 10)
          ("Q", 10)
          ("K", 10) ]

    [ for suit in suits do
          for (rank, value) in ranks do
              yield
                  { suit = suit
                    rank = rank
                    value = value } ]
    |> List.sortBy (fun _ -> System.Random().Next())

let calculateScore (cards: Card[]) =
    let mutable score = cards |> Array.sumBy (fun c -> c.value)
    let aces = cards |> Array.filter (fun c -> c.rank = "A") |> Array.length

    // Adjust for aces
    let mutable acesAsOne = 0

    while score > 21 && acesAsOne < aces do
        score <- score - 10
        acesAsOne <- acesAsOne + 1

    score

let dealInitialCards (deck: Card[]) =
    if deck.Length >= 2 then
        let dealerCards = deck.[0..1]
        let remainingDeck = deck.[2..]
        let dealerScore = calculateScore dealerCards
        (dealerCards, dealerScore, remainingDeck)
    else
        ([||], 0, deck)

let createInitialGameState () =
    let now = DateTimeOffset.UtcNow.ToUnixTimeSeconds()
    let fullDeck = createDeck () |> List.toArray
    let (dealerCards, dealerScore, remainingDeck) = dealInitialCards fullDeck
    
    printfn "🆕 Creating new game state with %d cards in deck" remainingDeck.Length
    logDealerState dealerCards dealerScore "Initial Deal"
    printfn "⏱️  New round started - %d seconds on the clock" gameConfig.roundDurationSeconds
    
    { timestamp = now
      playerHands = Map.empty
      dealerHand = dealerCards
      dealerScore = dealerScore
      deck = remainingDeck
      gameStatus = "playing"
      roundStartTime = now
      roundEndTime = None }

// Database Setup
let getDbPath () =
    if Directory.Exists("/data") then
        "/data/blackjack.db"
    else
        "./blackjack.db"

let initDatabase () =
    let connectionString = sprintf "Data Source=%s" (getDbPath ())
    use connection = new SqliteConnection(connectionString)
    connection.Open()

    let createTableSql =
        """
        CREATE TABLE IF NOT EXISTS game_state (
            id INTEGER PRIMARY KEY,
            data TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE TABLE IF NOT EXISTS game_config (
            id INTEGER PRIMARY KEY,
            round_duration_seconds INTEGER NOT NULL DEFAULT 10,
            game_end_display_seconds INTEGER NOT NULL DEFAULT 5
        );
    """

    use command = new SqliteCommand(createTableSql, connection)
    command.ExecuteNonQuery() |> ignore

let saveGameState (gameState: GameState) =
    let connectionString = sprintf "Data Source=%s" (getDbPath ())
    use connection = new SqliteConnection(connectionString)
    connection.Open()

    let json = JsonConvert.SerializeObject(gameState)
    let sql = "INSERT OR REPLACE INTO game_state (id, data) VALUES (1, @data)"
    use command = new SqliteCommand(sql, connection)
    command.Parameters.AddWithValue("@data", json) |> ignore
    command.ExecuteNonQuery() |> ignore

let loadGameState () =
    let connectionString = sprintf "Data Source=%s" (getDbPath ())
    use connection = new SqliteConnection(connectionString)
    connection.Open()

    let sql = "SELECT data FROM game_state WHERE id = 1"
    use command = new SqliteCommand(sql, connection)

    match command.ExecuteScalar() with
    | null -> createInitialGameState ()
    | data -> JsonConvert.DeserializeObject<GameState>(data.ToString())

let saveGameConfig (config: GameConfig) =
    let connectionString = sprintf "Data Source=%s" (getDbPath ())
    use connection = new SqliteConnection(connectionString)
    connection.Open()

    let sql = "INSERT OR REPLACE INTO game_config (id, round_duration_seconds, game_end_display_seconds) VALUES (1, @round, @display)"
    use command = new SqliteCommand(sql, connection)
    command.Parameters.AddWithValue("@round", config.roundDurationSeconds) |> ignore
    command.Parameters.AddWithValue("@display", config.gameEndDisplaySeconds) |> ignore
    command.ExecuteNonQuery() |> ignore

let loadGameConfig () =
    let connectionString = sprintf "Data Source=%s" (getDbPath ())
    use connection = new SqliteConnection(connectionString)
    connection.Open()

    let sql = "SELECT round_duration_seconds, game_end_display_seconds FROM game_config WHERE id = 1"
    use command = new SqliteCommand(sql, connection)
    
    match command.ExecuteReader() with
    | reader when reader.Read() ->
        { roundDurationSeconds = reader.GetInt32(0)
          gameEndDisplaySeconds = reader.GetInt32(1) }
    | _ -> { roundDurationSeconds = 10; gameEndDisplaySeconds = 5 }

let dealCard (gameState: GameState) =
    if gameState.deck.Length > 0 then
        let card = gameState.deck.[0]
        let newDeck = gameState.deck.[1..]
        printfn "🃏 Dealing card: %s%s (Remaining deck: %d cards)" 
            card.rank (card.suit.[0..0].ToUpper()) newDeck.Length
        Some(card, { gameState with deck = newDeck })
    else
        printfn "⚠️ Cannot deal card - deck is empty!"
        None

let processHit (gameState: GameState) (userId: string) =
    printfn "🎯 Processing HIT for player %s (Game Status: %s)" userId gameState.gameStatus
    
    // Reject hits if game is not in playing state
    if gameState.gameStatus <> "playing" then
        printfn "❌ Hit rejected - game not in playing state"
        gameState
    else
        match dealCard gameState with
        | Some(card, newGameState) ->
            let currentPlayer =
                newGameState.playerHands
                |> Map.tryFind userId
                |> Option.defaultValue
                    { cards = [||]
                      score = 0
                      state = "playing"
                      result = None }

            printfn "📋 Player %s before hit: %d cards, score %d" 
                userId currentPlayer.cards.Length currentPlayer.score

            let newCards = Array.append currentPlayer.cards [| card |]
            let newScore = calculateScore newCards

            let newState =
                if newScore > 21 then "bust"
                elif newScore = 21 then "blackjack"
                else "playing"

            let updatedPlayer =
                { cards = newCards
                  score = newScore
                  state = newState
                  result = None }

            logPlayerState userId updatedPlayer "after HIT"

            let updatedHands = newGameState.playerHands |> Map.add userId updatedPlayer

            let finalGameState = 
                { newGameState with
                    playerHands = updatedHands
                    timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds() }
            
            // Log all players after this action
            logAllPlayersState finalGameState "After Hit Action"
            
            finalGameState
        | None -> 
            printfn "❌ Hit failed - no cards available"
            gameState

let processStand (gameState: GameState) (userId: string) =
    printfn "🛑 Processing STAND for player %s (Game Status: %s)" userId gameState.gameStatus
    
    // Reject stands if game is not in playing state
    if gameState.gameStatus <> "playing" then
        printfn "❌ Stand rejected - game not in playing state"
        gameState
    else
        let currentPlayer =
            gameState.playerHands
            |> Map.tryFind userId
            |> Option.defaultValue
                { cards = [||]
                  score = 0
                  state = "playing"
                  result = None }

        let updatedPlayer = { currentPlayer with state = "standing" }
        logPlayerState userId updatedPlayer "STAND"
        
        let updatedHands = gameState.playerHands |> Map.add userId updatedPlayer

        let finalGameState = 
            { gameState with
                playerHands = updatedHands
                timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds() }
        
        // Log all players after this action
        logAllPlayersState finalGameState "After Stand Action"
        
        finalGameState

let forceAllPlayersToStand (gameState: GameState) =
    printfn "⏰ Forcing all playing players to stand (round timeout)"
    
    let updatedHands =
        gameState.playerHands
        |> Map.map (fun userId player ->
            if player.state = "playing" then
                printfn "   🛑 Forcing %s to stand (was playing)" userId
                { player with state = "standing" }
            else
                player)
    
    let finalGameState = { gameState with playerHands = updatedHands }
    logAllPlayersState finalGameState "After Forcing All to Stand"
    finalGameState

let dealerHit (gameState: GameState) =
    match dealCard gameState with
    | Some(card, newGameState) ->
        let newDealerHand = Array.append newGameState.dealerHand [| card |]
        let newDealerScore = calculateScore newDealerHand
        
        logDealerState newDealerHand newDealerScore "after HIT"
        
        { newGameState with
            dealerHand = newDealerHand
            dealerScore = newDealerScore }
    | None -> 
        printfn "❌ Dealer hit failed - no cards available"
        gameState

let playDealerTurn (gameState: GameState) =
    printfn "🏠 Starting dealer turn"
    logDealerState gameState.dealerHand gameState.dealerScore "Initial"
    
    let rec dealerPlay state =
        if state.dealerScore < 17 then
            printfn "🏠 Dealer must hit (score %d < 17)" state.dealerScore
            let newState = dealerHit state
            dealerPlay newState
        else
            printfn "🏠 Dealer stands (score %d >= 17)" state.dealerScore
            state
    
    // Only play dealer turn if dealer doesn't already have 21 (blackjack)
    if gameState.dealerScore = 21 then
        printfn "🏠 Dealer has blackjack - no additional cards needed"
        gameState
    else
        let finalState = dealerPlay gameState
        logDealerState finalState.dealerHand finalState.dealerScore "Final"
        finalState

let calculateResults (gameState: GameState) =
    printfn "🧮 Calculating results for all players"
    let dealerScore = gameState.dealerScore
    let dealerBust = dealerScore > 21
    let dealerBlackjack = dealerScore = 21 && gameState.dealerHand.Length = 2
    
    printfn "🏠 Dealer final: Score=%d Bust=%b Blackjack=%b" dealerScore dealerBust dealerBlackjack
    
    let updatedHands =
        gameState.playerHands
        |> Map.map (fun userId player ->
            let playerBlackjack = player.score = 21 && player.cards.Length = 2
            let result =
                match player.state with
                | "bust" -> Some "loss"
                | _ when playerBlackjack && not dealerBlackjack -> Some "win"
                | _ when playerBlackjack && dealerBlackjack -> Some "push"
                | _ when not playerBlackjack && dealerBlackjack -> Some "loss"
                | _ when dealerBust && player.score <= 21 -> Some "win"
                | _ when player.score > dealerScore && player.score <= 21 -> Some "win"
                | _ when player.score = dealerScore && player.score <= 21 -> Some "push"
                | _ -> Some "loss"
            
            let updatedPlayer = { player with result = result }
            
            // Log individual result calculation
            printfn "🎯 %s: Score=%d PlayerBJ=%b DealerBJ=%b -> %s" 
                userId player.score playerBlackjack dealerBlackjack 
                (match result with Some r -> r | None -> "unknown")
            
            updatedPlayer)
    
    let finalGameState = { gameState with playerHands = updatedHands }
    logAllPlayersState finalGameState "Final Results"
    finalGameState

let shouldEndRound (gameState: GameState) =
    let now = DateTimeOffset.UtcNow.ToUnixTimeSeconds()
    let roundDuration = int64 gameConfig.roundDurationSeconds
    let timeRemaining = (gameState.roundStartTime + roundDuration) - now
    
    if timeRemaining <= 0 && gameState.gameStatus = "playing" then
        printfn "⏰ Round should end - time expired (started at %d, duration %d, now %d)" 
            gameState.roundStartTime roundDuration now
        true
    else
        false

let processRoundEnd (gameState: GameState) =
    printfn "🏁 Processing round end"
    let oldStatus = gameState.gameStatus
    
    let stateAfterStand = forceAllPlayersToStand gameState
    let stateAfterDealer = playDealerTurn stateAfterStand
    let stateWithResults = calculateResults stateAfterDealer
    let now = DateTimeOffset.UtcNow.ToUnixTimeSeconds()
    
    let finalState = 
        { stateWithResults with
            gameStatus = "game_ended"
            roundEndTime = Some now
            timestamp = now }
    
    logGameStateTransition oldStatus finalState.gameStatus "Round End"
    printfn "🏁 Round ended at %d, results display until %d" now (now + int64 gameConfig.gameEndDisplaySeconds)
    
    finalState

let shouldStartNewRound (gameState: GameState) =
    match gameState.roundEndTime with
    | Some endTime ->
        let now = DateTimeOffset.UtcNow.ToUnixTimeSeconds()
        let displayDuration = int64 gameConfig.gameEndDisplaySeconds
        let shouldStart = now >= (endTime + displayDuration)
        
        if shouldStart && gameState.gameStatus = "game_ended" then
            printfn "🔄 Should start new round - display period ended (ended at %d, display %d, now %d)" 
                endTime displayDuration now
            true
        else
            false
    | None -> false

let startNewRound () =
    printfn "🎮 Starting new round"
    let newState = createInitialGameState ()
    logGameStateTransition "game_ended" newState.gameStatus "New Round"
    newState

// WebSocket Management
let webSocketConnections = ConcurrentDictionary<string, WebSocket>()

let addWebSocketConnection (webSocket: WebSocket) =
    let connectionId = Guid.NewGuid().ToString()
    webSocketConnections.TryAdd(connectionId, webSocket) |> ignore
    printfn "🔌 WebSocket connected: %s (Total: %d)" connectionId webSocketConnections.Count
    connectionId

let removeWebSocketConnection (connectionId: string) =
    webSocketConnections.TryRemove(connectionId) |> ignore
    printfn "🔌 WebSocket disconnected: %s (Total: %d)" connectionId webSocketConnections.Count

let broadcastToAll (message: string) =
    let messageBytes = Encoding.UTF8.GetBytes(message)
    let buffer = ArraySegment<byte>(messageBytes)

    let tasks =
        webSocketConnections.Values
        |> Seq.choose (fun ws ->
            if ws.State = WebSocketState.Open then
                Some(ws.SendAsync(buffer, WebSocketMessageType.Text, true, CancellationToken.None))
            else
                None)
        |> Seq.toArray

    if tasks.Length > 0 then
        Task.WaitAll(tasks)

// Game State Management with Automatic Rounds
let mutable private cachedGameState = loadGameState ()
let private gameStateLock = obj()

let getCachedGameState () = cachedGameState

let updateGameState (updateFn: GameState -> GameState) =
    lock gameStateLock (fun () ->
        let currentState = loadGameState ()
        let newState = updateFn currentState
        saveGameState newState
        cachedGameState <- newState
        newState
    )

// Background Service for Game Management
let startGameManager () =
    printfn "🎮 Starting game manager background service"
    
    let timer =
        new Timer(
            (fun _ ->
                try
                    let currentState = updateGameState (fun state ->
                        // Log countdown for active rounds
                        logRoundCountdown state
                        
                        match state.gameStatus with
                        | "playing" when shouldEndRound state ->
                            processRoundEnd state
                        | "game_ended" when shouldStartNewRound state ->
                            startNewRound ()
                        | _ -> state
                    )
                    
                    // Always broadcast current state
                    let stateWithCurrentTime = { currentState with timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds() }
                    let json = JsonConvert.SerializeObject(stateWithCurrentTime)
                    broadcastToAll json
                with ex ->
                    printfn "❌ Error in game manager: %s" ex.Message),
            null,
            TimeSpan.Zero,
            TimeSpan.FromSeconds 1.0
        )

    timer

// Handlers
let gameActionHandler: HttpHandler =
    fun next ctx ->
        task {
            let! body = ctx.ReadBodyFromRequestAsync()
            let action = JsonConvert.DeserializeObject<GameAction>(body)
            
            printfn "🎮 Received game action: %s from user %s" action.``type`` action.userId
            
            let newGameState = updateGameState (fun state ->
                match action.``type`` with
                | "hit" -> processHit state action.userId
                | "stand" -> processStand state action.userId
                | _ -> 
                    printfn "❌ Unknown action type: %s" action.``type``
                    state
            )
            
            return! json {| success = true |} next ctx
        }

let configHandler: HttpHandler =
    fun next ctx ->
        task {
            let! body = ctx.ReadBodyFromRequestAsync()
            let newConfig = JsonConvert.DeserializeObject<GameConfig>(body)
            printfn "⚙️ Config updated: Round=%ds, Display=%ds" newConfig.roundDurationSeconds newConfig.gameEndDisplaySeconds
            gameConfig <- newConfig
            saveGameConfig newConfig
            return! json {| success = true; config = newConfig |} next ctx
        }

let getConfigHandler: HttpHandler =
    fun next ctx ->
        task {
            return! json gameConfig next ctx
        }

let webSocketHandler: HttpHandler =
    fun next ctx ->
        task {
            if ctx.WebSockets.IsWebSocketRequest then
                let! webSocket = ctx.WebSockets.AcceptWebSocketAsync()
                let connectionId = addWebSocketConnection webSocket

                try
                    let buffer = Array.zeroCreate 4096

                    let rec loop () =
                        task {
                            let! result = webSocket.ReceiveAsync(ArraySegment<byte>(buffer), CancellationToken.None)

                            if result.MessageType = WebSocketMessageType.Close then
                                removeWebSocketConnection connectionId
                                return ()
                            else
                                return! loop ()
                        }

                    do! loop ()
                    return Some ctx
                with _ ->
                    removeWebSocketConnection connectionId
                    return Some ctx
            else
                return! (setStatusCode 400 >=> text "WebSocket connection required") next ctx
        }

// Routes
let webApp =
    choose
        [ GET >=> route "/ws" >=> webSocketHandler
          POST >=> route "/game-action" >=> gameActionHandler
          POST >=> route "/config" >=> configHandler
          GET >=> route "/config" >=> getConfigHandler
          GET >=> route "/" >=> text "F# Blackjack Server with Automatic Rounds" ]

// Application Setup
let configureApp (app: IApplicationBuilder) = 
    app.UseCors().UseWebSockets().UseGiraffe(webApp)

let configureServices (services: IServiceCollection) = 
    services.AddGiraffe().AddCors(fun options ->
        options.AddDefaultPolicy(fun builder ->
            builder.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader() |> ignore
        )
    ) |> ignore

[<EntryPoint>]
let main args =
    printfn "🚀 Starting F# Blackjack Server"
    
    // Initialize database
    printfn "💾 Initializing database"
    initDatabase ()
    
    // Load configuration
    printfn "⚙️ Loading configuration"
    gameConfig <- loadGameConfig ()
    printfn "⚙️ Config loaded: Round=%ds, Display=%ds" gameConfig.roundDurationSeconds gameConfig.gameEndDisplaySeconds

    // Start game manager
    printfn "🎮 Starting game manager"
    let _ = startGameManager ()

    // Create and run web host
    printfn "🌐 Starting web server on http://0.0.0.0:8080"
    Host
        .CreateDefaultBuilder(args)
        .ConfigureWebHostDefaults(fun webHostBuilder ->
            webHostBuilder.Configure(configureApp).ConfigureServices(configureServices).UseUrls("http://0.0.0.0:8080")
            |> ignore)
        .Build()
        .Run()

    0