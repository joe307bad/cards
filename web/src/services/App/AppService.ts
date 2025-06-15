import { Effect, Context, Layer } from "effect"

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

export interface IBlackjackService {
    hit: (url: string, userId: string) => Effect.Effect<void, Error>
    get: (url: string, userId: string) => Effect.Effect<GameResponse, Error>
}

class BlackjackService extends Context.Tag("BlackjackService")<
    BlackjackService,
    IBlackjackService
>() { }

type HitResponse = {
    cards: Array<string>,
    remainingCards: number,
    total: number,
    totalStartingCards: number,
    userId: "string"
}

interface PlayerCards {
    userId: string
    cards: string[]
    finished: boolean
    total: number;
    won: boolean;
}

interface LoadRoundData {
    userId: string;
    cards: string[] | null;
    total: number;
    remainingCards: number;
    totalStartingCards: number;
    currentlyConnectedPlayers: Array<{
        cards: string[];
        total: number;
        userId: string;
        result: string;
    }>;
    finished: boolean;
    firstDealerCard: string;
    roundEndTime: number;
    dealerTotal: number;
}

interface LoadResultsData {
    userId: string;
    cards: string[] | null;
    total: number;
    remainingCards: number;
    totalStartingCards: number;
    currentlyConnectedPlayers: PlayerCards[];
    finished: boolean;
    allDealerCards: string[];
    dealerTotal: number;
    playerResults: Array<{
        cards: string[];
        total: number;
        userId: string;
        result: string;
    }>;
    roundStartTime: number;
}

interface GameResponse {
    case: 'LOAD_ROUND' | 'LOAD_RESULTS';
    fields: [LoadRoundData] | [LoadResultsData];
}

function isLoadRoundResponse(response: GameResponse): response is GameResponse & { case: 'LOAD_ROUND'; fields: [LoadRoundData] } {
    return response.case === 'LOAD_ROUND';
}

function isLoadResultsResponse(response: GameResponse): response is GameResponse & { case: 'LOAD_RESULTS'; fields: [LoadResultsData] } {
    return response.case === 'LOAD_RESULTS';
}

function getLoadRoundData(response: GameResponse): LoadRoundData | null {
    return isLoadRoundResponse(response) ? response.fields[0] : null;
}

function getLoadResultsData(response: GameResponse): LoadResultsData | null {
    return isLoadResultsResponse(response) ? response.fields[0] : null;
}

const blackjackServiceLive = Layer.succeed(BlackjackService, {
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

                return await response.json() as GameResponse;

            },
            catch: (error) => new Error(`Failed to hit: ${error}`)
        })
})

export {
    BlackjackService,
    blackjackServiceLive,
    isLoadResultsResponse,
    isLoadRoundResponse,
    getLoadResultsData,
    getLoadRoundData
}