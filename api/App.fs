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

// Domain Types
type Card =
    { suit: string
      rank: string
      value: int }

type PlayerState =
    { cards: Card[]
      score: int
      state: string }

type GameState =
    { timestamp: int64
      playerHands: Map<string, PlayerState>
      dealerHand: Card[]
      dealerScore: int
      deck: Card[]
      gameStatus: string }

type GameAction = { ``type``: string; userId: string }

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

let createInitialGameState () =
    { timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds()
      playerHands = Map.empty
      dealerHand = [||]
      dealerScore = 0
      deck = createDeck () |> List.toArray
      gameStatus = "playing" }

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
        )
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

let calculateScore (cards: Card[]) =
    let mutable score = cards |> Array.sumBy (fun c -> c.value)
    let aces = cards |> Array.filter (fun c -> c.rank = "A") |> Array.length

    // Adjust for aces
    let mutable acesAsOne = 0

    while score > 21 && acesAsOne < aces do
        score <- score - 10
        acesAsOne <- acesAsOne + 1

    score

let dealCard (gameState: GameState) =
    if gameState.deck.Length > 0 then
        let card = gameState.deck.[0]
        let newDeck = gameState.deck.[1..]
        Some(card, { gameState with deck = newDeck })
    else
        None

let processHit (gameState: GameState) (userId: string) =
    match dealCard gameState with
    | Some(card, newGameState) ->
        let currentPlayer =
            newGameState.playerHands
            |> Map.tryFind userId
            |> Option.defaultValue
                { cards = [||]
                  score = 0
                  state = "playing" }

        let newCards = Array.append currentPlayer.cards [| card |]
        let newScore = calculateScore newCards

        let newState =
            if newScore > 21 then "lost"
            elif newScore = 21 then "won"
            else "playing"

        let updatedPlayer =
            { cards = newCards
              score = newScore
              state = newState }

        let updatedHands = newGameState.playerHands |> Map.add userId updatedPlayer

        { newGameState with
            playerHands = updatedHands
            timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds() }
    | None -> gameState

let processStand (gameState: GameState) (userId: string) =
    let currentPlayer =
        gameState.playerHands
        |> Map.tryFind userId
        |> Option.defaultValue
            { cards = [||]
              score = 0
              state = "playing" }

    let updatedPlayer = { currentPlayer with state = "push" }
    let updatedHands = gameState.playerHands |> Map.add userId updatedPlayer

    { gameState with
        playerHands = updatedHands
        timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds() }

// WebSocket Management
let webSocketConnections = ConcurrentDictionary<string, WebSocket>()

let addWebSocketConnection (webSocket: WebSocket) =
    let connectionId = Guid.NewGuid().ToString()
    webSocketConnections.TryAdd(connectionId, webSocket) |> ignore
    connectionId

let removeWebSocketConnection (connectionId: string) =
    webSocketConnections.TryRemove(connectionId) |> ignore

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

    Task.WaitAll(tasks)

// Background Service for Broadcasting Game State
let startGameStateBroadcaster () =
    let timer =
        new Timer(
            (fun _ ->
                try
                    let gameState = loadGameState ()
                    // Update timestamp to current server time before broadcasting
                    let gameStateWithCurrentTime = { gameState with timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds() }
                    let json = JsonConvert.SerializeObject(gameStateWithCurrentTime)
                    broadcastToAll json
                with ex ->
                    printfn "Error broadcasting game state: %s" ex.Message),
            null,
            TimeSpan.Zero,
            TimeSpan.FromSeconds(1.0)
        )

    timer

// Handlers
let mutable private cachedGameState = loadGameState ()
let private gameStateLock = obj()

let getCachedGameState () = cachedGameState // Fast, no locking for reads

let updateGameState (updateFn: GameState -> GameState) =
    lock gameStateLock (fun () ->
        let currentState = loadGameState () // Read from DB to ensure consistency
        let newState = updateFn currentState
        saveGameState newState
        cachedGameState <- newState // Update cache
        newState
    )

let gameActionHandler: HttpHandler =
    fun next ctx ->
        task {
            let! body = ctx.ReadBodyFromRequestAsync()
            let action = JsonConvert.DeserializeObject<GameAction>(body)
            
            let newGameState = updateGameState (fun state ->
                match action.``type`` with
                | "hit" -> processHit state action.userId
                | "stand" -> processStand state action.userId
                | _ -> state
            )
            
            return! json {| success = true |} next ctx
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
          GET >=> route "/" >=> text "F# Blackjack Server" ]

// Application Setup
let configureApp (app: IApplicationBuilder) = app.UseWebSockets().UseGiraffe(webApp)

let configureServices (services: IServiceCollection) = services.AddGiraffe() |> ignore

[<EntryPoint>]
let main args =
    // Initialize database
    initDatabase ()

    // Start background broadcaster
    let _ = startGameStateBroadcaster ()

    // Create and run web host
    Host
        .CreateDefaultBuilder(args)
        .ConfigureWebHostDefaults(fun webHostBuilder ->
            webHostBuilder.Configure(configureApp).ConfigureServices(configureServices).UseUrls("http://0.0.0.0:8080")
            |> ignore)
        .Build()
        .Run()

    0