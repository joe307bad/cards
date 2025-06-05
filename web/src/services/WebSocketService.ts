import { Effect, Context } from "effect"
import { proxy } from "valtio"

// Types matching your F# server
export type Card = {
  suit: "hearts" | "diamonds" | "clubs" | "spades"
  rank: "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K"
  value: number
}

export type PlayerState = {
  cards: Card[]
  score: number
  state: "playing" | "won" | "lost" | "push"
}

export interface GameState {
  timestamp: number
  playerHands: Record<string, PlayerState>
  dealerHand: Card[]
  dealerScore: number
  deck: Card[]
  gameStatus: "playing" | "game_ended"
  roundStartTime: number
  roundEndTime: number
  countdownTo: number
}

export type GameStateSnapshot = {
  readonly [K in keyof GameState]: GameState[K] extends (infer U)[]
    ? readonly U[]
    : GameState[K] extends Record<string, infer V>
    ? Record<string, V>
    : GameState[K]
}

// Game state proxy
const gameWebSocketState = proxy({
  isConnected: false,
  currentGameState: null as GameState | null,
  connectionUrl: "ws://localhost:8080/ws",
  lastError: null as Error | null,
  ws: null as WebSocket | null
})

// WebSocket Service Interface
export interface GameWebSocketService {
  readonly connect: (url?: string) => Effect.Effect<void, Error>
  readonly disconnect: Effect.Effect<void, never>
  readonly sendAction: (action: { type: "hit" | "stand", userId: string }) => Effect.Effect<void, Error>
  readonly getGameState: () => Effect.Effect<GameState | null, never>
  readonly isConnected: () => Effect.Effect<boolean, never>
}

// Service Tag
class GameWebSocketServiceTag extends Context.Tag("GameWebSocketService")<
  GameWebSocketServiceTag,
  GameWebSocketService
>() {}

// WebSocket Service Implementation
const gameWebSocketServiceLive: GameWebSocketService = {
  connect: (url?: string) => {
    const wsUrl = url || gameWebSocketState.connectionUrl
    
    return Effect.gen(function* () {
      console.log(`Connecting to WebSocket at ${wsUrl}...`)
      
      return yield* Effect.async<void, Error>((resume) => {
        try {
          const ws = new WebSocket(wsUrl)
          
          ws.onopen = () => {
            gameWebSocketState.isConnected = true
            gameWebSocketState.lastError = null
            resume(Effect.succeed(void 0))
          }
          
          ws.onerror = (error) => {
            gameWebSocketState.isConnected = false
            const errorObj = new Error(`WebSocket error: ${error}`)
            gameWebSocketState.lastError = errorObj
            resume(Effect.fail(errorObj))
          }
          
          ws.onmessage = (event) => {
            try {
              const gameState = JSON.parse(event.data) as GameState
              gameWebSocketState.currentGameState = gameState
              
              // Log the game state every time we receive it
              // console.log("🎮 Game State Update:")
              // console.log(`📊 Timestamp: ${new Date(gameState.timestamp * 1000).toISOString()}`)
              // console.log(`🎯 Game Status: ${gameState.gameStatus}`)
              // console.log(`🃏 Cards in deck: ${gameState.deck.length}`)
              // console.log(`🏠 Dealer hand: ${gameState.dealerHand.length} cards, Score: ${gameState.dealerScore}`)
              
              const playerCount = Object.keys(gameState.playerHands).length
              // console.log(`👥 Players: ${playerCount}`)
              
              for (const [userId, player] of Object.entries(gameState.playerHands)) {
                console.log(`  Player ${userId}: ${player.cards.length} cards, Score: ${player.score}, State: ${player.state}`)
              }
              
              console.log("─".repeat(50))
              
            } catch (error) {
              console.error("Failed to parse game state:", error)
            }
          }
          
          ws.onclose = () => {
            gameWebSocketState.isConnected = false
            console.log("WebSocket connection closed")
          }
          
          // Store ws reference for cleanup
          gameWebSocketState.ws = ws
          
        } catch (error) {
          gameWebSocketState.isConnected = false
          const errorObj = new Error(`Failed to create WebSocket: ${error}`)
          gameWebSocketState.lastError = errorObj
          resume(Effect.fail(errorObj))
        }
      })
    })
  },

  disconnect: Effect.sync(() => {
    if (gameWebSocketState.ws) {
      gameWebSocketState.ws.close()
      gameWebSocketState.ws = null
    }
    gameWebSocketState.isConnected = false
    gameWebSocketState.currentGameState = null
  }),

  sendAction: (action: { type: "hit" | "stand", userId: string }) => {
    return Effect.gen(function* () {
      if (!gameWebSocketState.isConnected || !gameWebSocketState.ws) {
        yield* Effect.fail(new Error("WebSocket not connected"))
      }
      
      if (gameWebSocketState.ws!.readyState !== WebSocket.OPEN) {
        yield* Effect.fail(new Error("WebSocket not ready"))
      }
      
      yield* Effect.sync(() => {
        // Send via HTTP POST instead of WebSocket message
        fetch("http://localhost:8080/game-action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(action)
        }).catch(error => {
          console.error("Failed to send game action:", error)
        })
      })
    })
  },

  getGameState: () => Effect.succeed(gameWebSocketState.currentGameState),

  isConnected: () => Effect.succeed(gameWebSocketState.isConnected)
}

// Main Program Function
const createGameWebSocketProgram = () => Effect.gen(function* () {
  console.log("🚀 Starting WebSocket Game Client...")
  
  const service = gameWebSocketServiceLive
  
  // Connect to WebSocket
  yield* service.connect()
  console.log("✅ Connected to game server!")
  
  // Keep the connection alive
  yield* Effect.never
})

// Program with cleanup
const gameWebSocketProgram = createGameWebSocketProgram().pipe(
  Effect.ensuring(Effect.sync(() => console.log("🔌 Disconnecting...")))
)

// Export everything
export {
  GameWebSocketServiceTag,
  gameWebSocketServiceLive,
  gameWebSocketState,
  gameWebSocketProgram
}