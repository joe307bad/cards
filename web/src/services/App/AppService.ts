import { Effect, Context } from "effect"

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
  BlackjackServiceTag,
  blackjackServiceLive
}