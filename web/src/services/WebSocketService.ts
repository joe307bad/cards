import { Effect, Context } from "effect"
import { proxy } from "valtio"

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

const gameWebSocketState = proxy({
  isConnected: false,
  currentGameState: null as GameState | null,
  connectionUrl: "ws://localhost:8080/ws",
  lastError: null as Error | null,
  ws: null as WebSocket | null
})

export interface GameWebSocketService {
  readonly connect: (url?: string) => Effect.Effect<void, Error>
  readonly disconnect: Effect.Effect<void, never>
}

class GameWebSocketServiceTag extends Context.Tag("GameWebSocketService")<
  GameWebSocketServiceTag,
  GameWebSocketService
>() { }

const gameWebSocketServiceLive: GameWebSocketService = {
  connect: (url?: string) => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${url}/ws` || gameWebSocketState.connectionUrl;

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
              gameWebSocketState.currentGameState = gameState;
            } catch (error) {
              console.error("Failed to parse game state:", error)
            }
          }

          ws.onclose = () => {
            gameWebSocketState.isConnected = false
            console.log("WebSocket connection closed")
          }

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
}

export {
  GameWebSocketServiceTag,
  gameWebSocketServiceLive,
  gameWebSocketState,
}