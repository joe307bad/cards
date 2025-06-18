import { Effect, Context, Layer } from 'effect';
import { proxy } from 'valtio';
import {
  BlackjackService,
  getLoadResultsData,
  getLoadRoundData,
  isLoadResultsResponse,
  isLoadRoundResponse,
} from './AppService';

type CardCode = string;
export type Card = {
  readonly suit: 'hearts' | 'diamonds' | 'clubs' | 'spades' | string;
  readonly rank:
    | 'A'
    | '2'
    | '3'
    | '4'
    | '5'
    | '6'
    | '7'
    | '8'
    | '9'
    | '10'
    | 'J'
    | 'Q'
    | 'K'
    | string;
};

export function convertCardCodeToCard(cardCode: CardCode): Card {
  if (!cardCode || cardCode.length < 2) {
    throw new Error(`Invalid card code: ${cardCode}`);
  }

  const suitChar = cardCode.slice(-1).toUpperCase();
  const rankStr = cardCode.slice(0, -1).toUpperCase();

  const suitMap: Record<string, Card['suit']> = {
    S: 'spades',
    H: 'hearts',
    D: 'diamonds',
    C: 'clubs',
  };

  const suit = suitMap[suitChar];
  if (!suit) {
    throw new Error(`Invalid suit: ${suitChar}`);
  }

  const validRanks: Card['rank'][] = [
    'A',
    '2',
    '3',
    '4',
    '5',
    '6',
    '7',
    '8',
    '9',
    '10',
    'J',
    'Q',
    'K',
  ];
  if (!validRanks.includes(rankStr as Card['rank'])) {
    throw new Error(`Invalid rank: ${rankStr}`);
  }

  return {
    suit,
    rank: rankStr as Card['rank'],
  };
}

export function convertCardCodesToCards(cardCodes: CardCode[]): Card[] {
  return cardCodes.map(convertCardCodeToCard);
}

interface PlayerResult {
  Cards: CardCode[];
  Total: number;
  UserId: string;
  Result: string;
}

enum MessageType {
  NEW_ROUND = 'new_round',
  ROUND_RESULTS = 'round_results',
  PLAYER_CARDS = 'player_cards',
  UNKNOWN = 'unknown',
}

type WebSocketMessage =
  | {
      Type: MessageType.NEW_ROUND;
      RoundEndTime: number;
      DealerCards: string[];
      DealerTotal: number;
    }
  | {
      Type: MessageType.ROUND_RESULTS;
      DealerCards: string[];
      DealerTotal: number;
      Results: PlayerResult[];
      RoundStartTime: number;
    }
  | {
      Type: MessageType.PLAYER_CARDS;
      Cards: string[];
      RemainingCards: number;
      Total: number;
      TotalStartingCards: number;
      UserId: string;
    };

export type PlayerState = {
  cards: Card[];
  score: number;
  state: 'PLAYING' | 'WON' | 'LOST' | 'PUSH' | string;
};

export interface GameState {
  timestamp: number;
  playerHands: Record<string, PlayerState>;
  dealerHand: Card[];
  dealerScore: number;
  deck: Card[];
  gameStatus: 'playing' | 'game_ended';
  roundStartTime: number;
  roundEndTime: number;
  countdownTo: number;
  remaingingCards: number;
  totalStartingCards: number;
  wins: number;
}

export type GameStateSnapshot = {
  readonly [K in keyof GameState]: GameState[K] extends (infer U)[]
    ? readonly U[]
    : GameState[K] extends Record<string, infer V>
      ? Record<string, V>
      : GameState[K];
};

const gameState = proxy({
  isConnected: false,
  currentGameState: {
    timestamp: 0,
    playerHands: {},
    dealerHand: [],
    dealerScore: 0,
    deck: [],
    gameStatus: 'game_ended',
    roundStartTime: 0,
    roundEndTime: 0,
    countdownTo: 0,
    remaingingCards: 0,
    totalStartingCards: 0,
    wins: 0,
  } as GameState,
  lastError: null as Error | null,
  ws: null as WebSocket | null,
});

export interface IGameService {
  readonly connect: (
    url: string,
    playerName: string
  ) => Effect.Effect<void, Error>;
  readonly disconnect: Effect.Effect<void, never>;
}

class GameService extends Context.Tag('GameService')<
  GameService,
  IGameService
>() {}

const makeGameServiceLive = Layer.effect(
  GameService,
  Effect.gen(function* () {
    const blackjackService = yield* BlackjackService;
    return {
      connect: (url: string, playerName: string) => {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${url}/ws`;
        return Effect.gen(function* () {
          // @ts-ignore
          const r = yield* blackjackService.get(process.env.URL, playerName);
          const state = gameState.currentGameState;

          if (isLoadResultsResponse(r)) {
            const loadResults = getLoadResultsData(r);

            if (loadResults) {
              state.countdownTo = loadResults.roundStartTime;
              state.dealerHand = loadResults.allDealerCards
                .map(convertCardCodeToCard)
                .reverse();
              state.dealerScore = loadResults.dealerTotal;
              state.gameStatus = 'game_ended';
              state.remaingingCards = loadResults.remainingCards;
              state.totalStartingCards = loadResults.totalStartingCards;
              state.wins = loadResults.wins;

              loadResults.playerResults.forEach(result => {
                state.playerHands[result.userId] = {
                  cards: result.cards.map(convertCardCodeToCard).reverse(),
                  score: result.total,
                  state: result.result.toLowerCase(),
                };
              });
            }
          } else if (isLoadRoundResponse(r)) {
            const loadRound = getLoadRoundData(r);
            if (loadRound) {
              state.dealerHand = [
                convertCardCodeToCard(loadRound.firstDealerCard),
              ];
              state.countdownTo = loadRound.roundEndTime;
              state.dealerScore = loadRound.dealerTotal;
              state.gameStatus = 'playing';
              state.totalStartingCards = loadRound.totalStartingCards;
              state.remaingingCards = loadRound.remainingCards;
              state.wins = loadRound.wins;

              loadRound.currentlyConnectedPlayers.forEach(result => {
                state.playerHands[result.userId] = {
                  cards: result.cards.map(convertCardCodeToCard).reverse(),
                  score: result.total,
                  state: result?.result?.toLowerCase(),
                };
              });
            }
          }

          return yield* Effect.sync(() => {
            try {
              const ws = new WebSocket(wsUrl);

              ws.onopen = () => {
                gameState.isConnected = true;
                gameState.lastError = null;
              };

              ws.onerror = error => {
                gameState.isConnected = false;
                const errorObj = new Error(`WebSocket error: ${error}`);
                gameState.lastError = errorObj;
              };

              ws.onmessage = event => {
                
                try {
                  const processed = (function () {
                    try {
                      const message: WebSocketMessage = JSON.parse(event.data);
                      return message;
                    } catch {
                      return null;
                    }
                  })();

                  const state = gameState.currentGameState;

                  if (!processed) {
                    return;
                  }

                  switch (processed.Type) {
                    case MessageType.NEW_ROUND:
                      state.dealerHand = processed.DealerCards.map(
                        convertCardCodeToCard
                      ).reverse();
                      state.countdownTo = processed.RoundEndTime;
                      state.dealerScore = processed.DealerTotal;
                      state.gameStatus = 'playing';
                      state.playerHands = {};
                      break;
                    case MessageType.PLAYER_CARDS:
                      state.playerHands[processed.UserId] = {
                        cards: processed.Cards.map(
                          convertCardCodeToCard
                        ).reverse(),
                        score: processed.Total,
                        state: 'playing',
                      };
                      state.remaingingCards = processed.RemainingCards;
                      state.totalStartingCards = processed.TotalStartingCards;
                      break;
                    case MessageType.ROUND_RESULTS:
                      state.countdownTo = processed.RoundStartTime;
                      state.dealerHand = processed.DealerCards.map(
                        convertCardCodeToCard
                      ).reverse();
                      state.dealerScore = processed.DealerTotal;
                      state.gameStatus = 'game_ended';

                      processed.Results.forEach(result => {
                        if (
                          result.UserId === playerName &&
                          result.Result.toLowerCase() === 'win'
                        ) {
                          state.wins++;
                        }

                        state.playerHands[result.UserId] = {
                          cards: result.Cards.map(
                            convertCardCodeToCard
                          ).reverse(),
                          score: result.Total,
                          state: result.Result.toLowerCase(),
                        };
                      });
                  }
                } catch (error) {
                  console.error('Failed to parse game state:', error);
                }
              };

              ws.onclose = () => {
                gameState.isConnected = false;
              };

              gameState.ws = ws;
            } catch (error) {
              gameState.isConnected = false;
              const errorObj = new Error(
                `Failed to create WebSocket: ${error}`
              );
              gameState.lastError = errorObj;
            }
          });
        });
      },

      disconnect: Effect.sync(() => {
        if (gameState.ws) {
          gameState.ws.close();
          gameState.ws = null;
        }
        gameState.isConnected = false;
        gameState.currentGameState;
      }),
    };
  })
);

export { GameService, makeGameServiceLive, gameState };
