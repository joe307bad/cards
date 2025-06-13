import { Effect, Context } from "effect"
type GetUserCardsSuccessResponse = {
   UserId: string;
   Cards: any[];
   Total: number;
   RemainingCards: number;
   TotalStartingCards: number;
   CurrentlyConnectedPlayers: any[];
   Finished: boolean;
   RoundActive: boolean;
};

type GetUserCardsErrorResponse = {
   Error: string;
};

export type GetUserCardsResponse = GetUserCardsSuccessResponse | GetUserCardsErrorResponse;

export interface BlackjackService {
   hit: (url: string, userId: string) => Effect.Effect<void, Error>
   get: (rl: string, userId: string) => Effect.Effect<GetUserCardsResponse, Error>
}

class BlackjackServiceTag extends Context.Tag("BlackjackService")<
   BlackjackServiceTag,
   BlackjackService
>() { }

type HitResponse = {
   cards: Array<string>,
   remainingCards: number,
   total: number,
   totalStartingCards: number,
   userId: "string"
}

const blackjackServiceLive: BlackjackService = {
   hit: (url: string, userId: string) =>
      Effect.tryPromise({
         try: async () => {
            const response = await fetch(`${window.location.protocol}//${url}/hit`, {
               method: 'POST',
               headers: {
                  'Content-Type': 'application/json',
               },
               body: JSON.stringify({
                  UserId: userId
               })
            })

            if (!response.ok) {
               throw new Error(`HTTP error! status: ${response.status}`)
            }

            return await response.json() as HitResponse;
         },
         catch: (error) => new Error(`Failed to hit: ${error}`)
      }),
   get: (url: string, userId: string) =>
      Effect.tryPromise({
         try: async () => {
            const response = await fetch(`${window.location.protocol}//${url}/cards/${userId}`, {
               method: 'GET',
               headers: {
                  'Content-Type': 'application/json',
               }
            })

            if (!response.ok) {
               throw new Error(`HTTP error! status: ${response.status}`)
            }

            return await response.json() as GetUserCardsResponse;
         },
         catch: (error) => new Error(`Failed to hit: ${error}`)
      })
}

export {
   BlackjackServiceTag,
   blackjackServiceLive
}