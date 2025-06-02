import { Effect, Context } from "effect"
import { proxy } from "valtio"

// ===== Debug Configuration =====

type DebugConfig = {
  isDebugMode: boolean
  debugDelay: number // milliseconds
}

const debugConfig: DebugConfig = {
  isDebugMode: false,
  debugDelay: 2000
}

// Abstracted Effect.tryPromise that can switch to debug mode
const tryPromise = <A>(config: {
  try: () => Promise<A>
  catch: (error: unknown) => Error
  debugValue?: A
}) => {
  if (debugConfig.isDebugMode && config.debugValue !== undefined) {
    // In debug mode, return a delayed effect with mock data
    return Effect.gen(function* () {
      yield* Effect.sleep(debugConfig.debugDelay)
      return config.debugValue
    })
  }
  
  // In production mode, use real promises
  return Effect.tryPromise(config)
}

// Helper to set debug mode at runtime
const setDebugMode = (enabled: boolean, delay: number = 2000) => {
  debugConfig.isDebugMode = enabled
  debugConfig.debugDelay = delay
}

// ===== HTTP API Service =====

interface HttpService {
  readonly get: (url: string) => Effect.Effect<Response | undefined, Error>
  readonly post: (url: string, body?: any) => Effect.Effect<Response | undefined, Error>
  readonly put: (url: string, body?: any) => Effect.Effect<Response | undefined, Error>
  readonly delete: (url: string) => Effect.Effect<Response | undefined, Error>
}

class HttpServiceTag extends Context.Tag("HttpService")<
  HttpServiceTag,
  HttpService
>() {}

// Mock responses for debug mode
const mockResponse = (data: any): Response => ({
  ok: true,
  status: 200,
  statusText: "OK",
  json: () => Promise.resolve(data),
  text: () => Promise.resolve(JSON.stringify(data)),
  blob: () => Promise.resolve(new Blob()),
  arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
  formData: () => Promise.resolve(new FormData()),
  clone: () => mockResponse(data),
  body: null,
  bodyUsed: false,
  headers: new Headers(),
  redirected: false,
  type: "basic",
  url: ""
} as Response)

// Implementation
const httpServiceLive: HttpService = {
  get: (url: string) =>
    tryPromise({
      try: () => fetch(url, { method: "GET" }),
      catch: (error) => new Error(`HTTP GET failed: ${error}`),
      debugValue: mockResponse({ message: `Mock GET response for ${url}`, timestamp: Date.now() })
    }),
  
  post: (url: string, body?: any) =>
    tryPromise({
      try: () => fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined
      }),
      catch: (error) => new Error(`HTTP POST failed: ${error}`),
      debugValue: mockResponse({ message: `Mock POST response for ${url}`, receivedBody: body, timestamp: Date.now() })
    }),
  
  put: (url: string, body?: any) =>
    tryPromise({
      try: () => fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined
      }),
      catch: (error) => new Error(`HTTP PUT failed: ${error}`),
      debugValue: mockResponse({ message: `Mock PUT response for ${url}`, receivedBody: body, timestamp: Date.now() })
    }),
  
  delete: (url: string) =>
    tryPromise({
      try: () => fetch(url, { method: "DELETE" }),
      catch: (error) => new Error(`HTTP DELETE failed: ${error}`),
      debugValue: mockResponse({ message: `Mock DELETE response for ${url}`, timestamp: Date.now() })
    })
}

// ===== Blackjack Service =====

type Card = {
  suit: "hearts" | "diamonds" | "clubs" | "spades"
  rank: "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K"
  value: number
}

type GameState = {
  playerHand: Card[]
  dealerHand: Card[]
  deck: Card[]
  gameStatus: "playing" | "playerWins" | "dealerWins" | "push" | "playerBust" | "dealerBust"
  playerScore: number
  dealerScore: number
}

// Valtio state store
const gameState = proxy<GameState>({
  playerHand: [],
  dealerHand: [],
  deck: [],
  gameStatus: "playing",
  playerScore: 0,
  dealerScore: 0
})

interface BlackjackService {
  readonly newGame: () => Effect.Effect<void>
  readonly hit: () => Effect.Effect<void>
  readonly stand: () => Effect.Effect<void>
  readonly getGameState: () => Effect.Effect<GameState>
}

class BlackjackServiceTag extends Context.Tag("BlackjackService")<
  BlackjackServiceTag,
  BlackjackService
>() {}

// Helper functions
const createDeck = (): Card[] => {
  const suits: Card["suit"][] = ["hearts", "diamonds", "clubs", "spades"]
  const ranks: Card["rank"][] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"]
  const deck: Card[] = []
  
  for (const suit of suits) {
    for (const rank of ranks) {
      let value: number
      if (rank === "A") value = 11
      else if (["J", "Q", "K"].includes(rank)) value = 10
      else value = parseInt(rank)
      
      deck.push({ suit, rank, value })
    }
  }
  
  return shuffleDeck(deck)
}

const shuffleDeck = (deck: Card[]): Card[] => {
  const shuffled = [...deck]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

const calculateScore = (hand: Card[]): number => {
  let score = hand.reduce((sum, card) => sum + card.value, 0)
  let aces = hand.filter(card => card.rank === "A").length
  
  while (score > 21 && aces > 0) {
    score -= 10
    aces--
  }
  
  return score
}

const dealCard = (deck: Card[]): { card: Card; remainingDeck: Card[] } => {
  const [card, ...remainingDeck] = deck
  return { card, remainingDeck }
}

// Implementation
const blackjackServiceLive: BlackjackService = {
  newGame: () =>
    Effect.sync(() => {
      const deck = createDeck()
      
      // Deal initial cards
      const { card: playerCard1, remainingDeck: deck1 } = dealCard(deck)
      const { card: dealerCard1, remainingDeck: deck2 } = dealCard(deck1)
      const { card: playerCard2, remainingDeck: deck3 } = dealCard(deck2)
      const { card: dealerCard2, remainingDeck: finalDeck } = dealCard(deck3)
      
      gameState.playerHand = [playerCard1, playerCard2]
      gameState.dealerHand = [dealerCard1, dealerCard2]
      gameState.deck = finalDeck
      gameState.playerScore = calculateScore(gameState.playerHand)
      gameState.dealerScore = calculateScore(gameState.dealerHand)
      gameState.gameStatus = "playing"
    }),
  
  hit: () =>
    Effect.sync(() => {
      if (gameState.gameStatus !== "playing") return
      
      const { card, remainingDeck } = dealCard(gameState.deck)
      gameState.playerHand.push(card)
      gameState.deck = remainingDeck
      gameState.playerScore = calculateScore(gameState.playerHand)
      
      if (gameState.playerScore > 21) {
        gameState.gameStatus = "playerBust"
      }
    }),
  
  stand: () =>
    Effect.sync(() => {
      if (gameState.gameStatus !== "playing") return
      
      // Dealer hits until 17 or higher
      while (gameState.dealerScore < 17) {
        const { card, remainingDeck } = dealCard(gameState.deck)
        gameState.dealerHand.push(card)
        gameState.deck = remainingDeck
        gameState.dealerScore = calculateScore(gameState.dealerHand)
      }
      
      // Determine winner
      if (gameState.dealerScore > 21) {
        gameState.gameStatus = "dealerBust"
      } else if (gameState.playerScore > gameState.dealerScore) {
        gameState.gameStatus = "playerWins"
      } else if (gameState.dealerScore > gameState.playerScore) {
        gameState.gameStatus = "dealerWins"
      } else {
        gameState.gameStatus = "push"
      }
    }),
  
  getGameState: () =>
    Effect.succeed(gameState)
}

// ===== Usage Examples =====

// Example HTTP usage with debug logging
const makeApiCall = Effect.gen(function* () {
  const http = yield* HttpServiceTag
  
  console.log("Making API call... (debug mode:", debugConfig.isDebugMode, ")")
  const response = yield* http.get("https://api.example.com/data")
  
  const data = yield* tryPromise({
    try: () => response?.json() ?? Promise.resolve(),
    catch: (error) => new Error(`JSON parse failed: ${error}`),
    debugValue: { users: [{ id: 1, name: "Mock User" }], total: 1 }
  })
  
  console.log("API response received:", data)
  return data
})

// Export services and examples
export {
  type BlackjackService,
  type GameState,
  type Card,
  HttpServiceTag,
  httpServiceLive,
  BlackjackServiceTag,
  blackjackServiceLive,
  gameState,
  setDebugMode,
  tryPromise
}

// Debug mode examples:
// setDebugMode(true, 3000) // Enable debug mode with 3 second delays
// setDebugMode(false) // Disable debug mode (use real API calls)

// To run the examples:
// Effect.runPromise(runHttpExample).catch(console.error)
// Effect.runPromise(runBlackjackExample).catch(console.error)