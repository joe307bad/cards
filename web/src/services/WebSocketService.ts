import { Effect, Context, Layer } from "effect"
import { proxy } from "valtio"
import { BlackjackService, getLoadResultsData, getLoadRoundData, isLoadResultsResponse, isLoadRoundResponse } from "./App/AppService";

type CardCode = string;
export type Card = {
	suit: "hearts" | "diamonds" | "clubs" | "spades"
	rank: "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K"
}

export function convertCardCodeToCard(cardCode: CardCode): Card {
	if (!cardCode || cardCode.length < 2) {
		throw new Error(`Invalid card code: ${cardCode}`);
	}

	const suitChar = cardCode.slice(-1).toUpperCase();
	const rankStr = cardCode.slice(0, -1).toUpperCase();

	const suitMap: Record<string, Card['suit']> = {
		'S': 'spades',
		'H': 'hearts',
		'D': 'diamonds',
		'C': 'clubs'
	};

	const suit = suitMap[suitChar];
	if (!suit) {
		throw new Error(`Invalid suit: ${suitChar}`);
	}

	const validRanks: Card['rank'][] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
	if (!validRanks.includes(rankStr as Card['rank'])) {
		throw new Error(`Invalid rank: ${rankStr}`);
	}

	return {
		suit,
		rank: rankStr as Card['rank']
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

interface PlayerCardsData {
	Cards: CardCode[];
	RemainingCards: number;
	Total: number;
	TotalStartingCards: number;
	UserId: string;
}

type WebSocketMessage =
	| {
		Type: "new_round";
		RoundEndTime: number;
		DealerCards: CardCode[]
		DealerTotal: number;
	}
	| {
		Type: "round_results";
		DealerCards: CardCode[];
		DealerTotal: number;
		Results: PlayerResult[];
		RoundStartTime: number;
	}
	| {
		Type: "player_cards";
		Cards: CardCode[];
		RemainingCards: number;
		Total: number;
		TotalStartingCards: number;
		UserId: string;
	};

type ProcessedResult =
	| {
		type: "NEW_ROUND";
		roundEndTimestamp: number;
		message: string;
		dealerCards: string[];
		dealerTotal: number;
	}
	| {
		type: "ROUND_RESULTS";
		dealerCards: CardCode[];
		dealerTotal: number;
		playerResults: PlayerResult[];
		dealerBusted: boolean;
		message: string;
		roundStartTime: number;
	}
	| {
		type: "PLAYER_CARDS";
		playerId: string;
		cards: CardCode[];
		total: number;
		remainingCards: number;
		isBusted: boolean;
		message: string;
	}
	| {
		type: "UNKNOWN";
		originalMessage: any;
		error: string;
	};

function processWebSocketMessage(rawMessage: string): ProcessedResult {
	try {
		const message: WebSocketMessage = JSON.parse(rawMessage);

		switch (message.Type) {
			case "new_round":
				return {
					type: "NEW_ROUND",
					roundEndTimestamp: message.RoundEndTime,
					message: `New round started, ending at ${new Date(message.RoundEndTime).toLocaleTimeString()}`,
					dealerCards: message.DealerCards,
					dealerTotal: message.DealerTotal
				};

			case "round_results":
				const dealerBusted = message.DealerTotal > 21;
				const playerCount = message.Results.length;
				const winnersCount = message.Results.filter(r => r.Result == 'won').length;
				console.log({message})

				return {
					type: "ROUND_RESULTS",
					dealerCards: message.DealerCards,
					dealerTotal: message.DealerTotal,
					playerResults: message.Results,
					dealerBusted,
					roundStartTime: message.RoundStartTime,
					message: playerCount > 0
						? `Round ended: Dealer ${message.DealerTotal}${dealerBusted ? ' (BUST)' : ''}, ${winnersCount}/${playerCount} players won`
						: `Round ended: Dealer ${message.DealerTotal}${dealerBusted ? ' (BUST)' : ''}, no players participated`
				};

			case "player_cards":
				const isBusted = message.Total > 21;
				const cardCount = message.Cards.length;

				return {
					type: "PLAYER_CARDS",
					playerId: message.UserId,
					cards: message.Cards,
					total: message.Total,
					remainingCards: message.RemainingCards,
					isBusted,
					message: `${message.UserId}: ${cardCount} cards, total ${message.Total}${isBusted ? ' (BUST)' : ''}`
				};

			default:
				const _exhaustive: never = message;
				return {
					type: "UNKNOWN",
					originalMessage: message,
					error: "Unknown message type"
				};
		}
	} catch (error) {
		return {
			type: "UNKNOWN",
			originalMessage: rawMessage,
			error: `Failed to parse message: ${error instanceof Error ? error.message : 'Unknown error'}`
		};
	}
}

export type PlayerState = {
	cards: Card[]
	score: number
	state: "PLAYING" | "WON" | "LOST" | "PUSH" | string
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
	currentGameState: {
		timestamp: 0,
		playerHands: {},
		dealerHand: [],
		dealerScore: 0,
		deck: [],
		gameStatus: "",
		roundStartTime: 0,
		roundEndTime: 0,
		countdownTo: 0
	} as unknown as GameState,
	lastError: null as Error | null,
	ws: null as WebSocket | null
})

export interface IGameWebSocketService {
	readonly connect: (url: string, playerName: string) => Effect.Effect<void, Error>
	readonly disconnect: Effect.Effect<void, never>
}

class GameWebSocketService extends Context.Tag("GameWebSocketService")<
	GameWebSocketService,
	IGameWebSocketService
>() { }

const makeGameWebSocketServiceLive = Layer.effect(
	GameWebSocketService,
	Effect.gen(function* () {
		const blackjackService = yield* BlackjackService;
		return {
			connect: (url: string, playerName: string) => {
				const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
				const wsUrl = `${protocol}//${url}/ws`;
				return Effect.gen(function* () {
					// @ts-ignore 
					const r = yield* blackjackService.get(process.env.URL, playerName);
					const gameState = gameWebSocketState.currentGameState;

					if (isLoadResultsResponse(r)) {
						const loadResults = getLoadResultsData(r);
						
						if (loadResults) {
							gameState.countdownTo = loadResults.roundStartTime
							gameState.dealerHand = loadResults.allDealerCards.map(convertCardCodeToCard).reverse()
							gameState.dealerScore = loadResults.dealerTotal
							gameState.gameStatus = 'game_ended'

							loadResults.playerResults.forEach(result => {
								gameState.playerHands[result.userId] = {
									cards: result.cards.map(convertCardCodeToCard),
									score: result.total,
									state: result.result.toLowerCase()
								}
							})
						}
					} else if (isLoadRoundResponse(r)) {
						const loadRound = getLoadRoundData(r);
						if (loadRound) {

							gameState.dealerHand = [convertCardCodeToCard(loadRound.firstDealerCard)]
							gameState.countdownTo = loadRound.roundEndTime
							gameState.dealerScore = loadRound.dealerTotal
							gameState.gameStatus = 'playing';

							loadRound.currentlyConnectedPlayers.forEach(result => {
								gameState.playerHands[result.userId] = {
									cards: result.cards.map(convertCardCodeToCard),
									score: result.total,
									state: result?.result?.toLowerCase()
								}
							})
						}
					}

					return yield* Effect.sync(() => {
						try {
							const ws = new WebSocket(wsUrl)

							ws.onopen = () => {
								gameWebSocketState.isConnected = true
								gameWebSocketState.lastError = null
							}

							ws.onerror = (error) => {
								gameWebSocketState.isConnected = false
								const errorObj = new Error(`WebSocket error: ${error}`)
								gameWebSocketState.lastError = errorObj
							}

							ws.onmessage = (event) => {
								try {
									const processed = processWebSocketMessage(event.data);
									const gameState = gameWebSocketState.currentGameState;

									switch (processed.type) {
										case 'NEW_ROUND':
											gameState.dealerHand = processed.dealerCards.map(convertCardCodeToCard).reverse()
											gameState.countdownTo = processed.roundEndTimestamp
											gameState.dealerScore = processed.dealerTotal
											gameState.gameStatus = 'playing';
											gameState.playerHands = {};
											break;
										case 'PLAYER_CARDS':
											gameState.playerHands[processed.playerId] = {
												cards: processed.cards.map(convertCardCodeToCard).reverse(),
												score: processed.total,
												state: 'playing'
											}
											break;
										case 'ROUND_RESULTS':
											gameState.countdownTo = processed.roundStartTime
											gameState.dealerHand = processed.dealerCards.map(convertCardCodeToCard).reverse()
											gameState.dealerScore = processed.dealerTotal
											gameState.gameStatus = 'game_ended'

											processed.playerResults.forEach(result => {
												gameState.playerHands[result.UserId] = {
													cards: result.Cards.map(convertCardCodeToCard),
													score: result.Total,
													state: result.Result.toLowerCase()
												}
											})

									}
								} catch (error) {
									console.error("Failed to parse game state:", error)
								}
							}

							ws.onclose = () => {
								gameWebSocketState.isConnected = false
							}

							gameWebSocketState.ws = ws

						} catch (error) {
							gameWebSocketState.isConnected = false
							const errorObj = new Error(`Failed to create WebSocket: ${error}`)
							gameWebSocketState.lastError = errorObj
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
				gameWebSocketState.currentGameState
			}),
		}

	}))

export {
	GameWebSocketService,
	makeGameWebSocketServiceLive,
	gameWebSocketState,
}