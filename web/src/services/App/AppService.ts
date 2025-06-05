import { Effect, Context } from "effect"
import { proxy } from "valtio"

type DebugConfig = {
  isDebugMode: boolean
  debugDelay: number
}

const debugConfig: DebugConfig = {
  isDebugMode: false,
  debugDelay: 2000
}

const tryPromise = <A>(config: {
  try: () => Promise<A>
  catch: (error: unknown) => Error
  debugValue?: A
}) => {
  if (debugConfig.isDebugMode && config.debugValue !== undefined) {
    return Effect.gen(function* () {
      yield* Effect.sleep(debugConfig.debugDelay)
      return config.debugValue
    })
  }

  return Effect.tryPromise(config)
}

const setDebugMode = (enabled: boolean, delay: number = 2000) => {
  debugConfig.isDebugMode = enabled
  debugConfig.debugDelay = delay
}

interface HttpService {
  readonly get: (url: string) => Effect.Effect<Response | undefined, Error>
  readonly post: (url: string, body?: any) => Effect.Effect<Response | undefined, Error>
  readonly put: (url: string, body?: any) => Effect.Effect<Response | undefined, Error>
  readonly delete: (url: string) => Effect.Effect<Response | undefined, Error>
}

class HttpServiceTag extends Context.Tag("HttpService")<
  HttpServiceTag,
  HttpService
>() { }

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

export type Card = {
  suit: "hearts" | "diamonds" | "clubs" | "spades"
  rank: "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K"
  value: number
}

export interface GameState {
  playerHand: Card[]
  dealerHand: Card[]
  deck: Card[]
  gameStatus: "playing" | "playerWins" | "dealerWins" | "push" | "playerBust" | "dealerBust"
  playerScore: number
  dealerScore: number
}

export type GameStateSnapshot = {
  readonly [K in keyof GameState]: GameState[K] extends (infer U)[]
  ? readonly U[]
  : GameState[K]
}

const gameState = proxy<GameState>({
  playerHand: [],
  dealerHand: [],
  deck: [],
  gameStatus: "playing",
  playerScore: 0,
  dealerScore: 0
})

export interface BlackjackService {
  hit: (userId: string) => Effect.Effect<void, Error>
}

class BlackjackServiceTag extends Context.Tag("BlackjackService")<
  BlackjackServiceTag,
  BlackjackService
>() { }

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

const blackjackServiceLive: BlackjackService = {
  hit: (userId: string) =>
    Effect.tryPromise({
      try: async () => {
        const response = await fetch('http://localhost:8080/game-action', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type: 'hit',
            userId: userId
          })
        })
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }
        
        const result = await response.json()
        console.log('Hit action result:', result)
      },
      catch: (error) => new Error(`Failed to hit: ${error}`)
    })
}

export {
  HttpServiceTag,
  httpServiceLive,
  BlackjackServiceTag,
  blackjackServiceLive,
  gameState,
  setDebugMode,
  tryPromise
}