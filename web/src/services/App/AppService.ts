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


export interface BlackjackService {
  hit: (userId: string) => Effect.Effect<void, Error>
}

class BlackjackServiceTag extends Context.Tag("BlackjackService")<
  BlackjackServiceTag,
  BlackjackService
>() { }

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
  setDebugMode,
  tryPromise
}