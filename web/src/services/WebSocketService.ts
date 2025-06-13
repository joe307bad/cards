import { Effect, Context } from "effect"
import { proxy } from "valtio"

// Card representation
type CardCode = string; // e.g., "5S", "4H", "QD"
export type Card = {
	suit: "hearts" | "diamonds" | "clubs" | "spades"
	rank: "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K"
}

export function convertCardCodeToCard(cardCode: CardCode): Card {
	if (!cardCode || cardCode.length < 2) {
		throw new Error(`Invalid card code: ${cardCode}`);
	}

	// Extract suit (last character) and rank (everything before the last character)
	const suitChar = cardCode.slice(-1).toUpperCase();
	const rankStr = cardCode.slice(0, -1).toUpperCase();

	// Map suit characters to full suit names
	const suitMap: Record<string, Card['suit']> = {
		'S': 'spades',
		'H': 'hearts',
		'D': 'diamonds',
		'C': 'clubs'
	};

	// Validate suit
	const suit = suitMap[suitChar];
	if (!suit) {
		throw new Error(`Invalid suit: ${suitChar}`);
	}

	// Validate rank
	const validRanks: Card['rank'][] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
	if (!validRanks.includes(rankStr as Card['rank'])) {
		throw new Error(`Invalid rank: ${rankStr}`);
	}

	return {
		suit,
		rank: rankStr as Card['rank']
	};
}

// Helper function to convert multiple card codes at once
export function convertCardCodesToCards(cardCodes: CardCode[]): Card[] {
	return cardCodes.map(convertCardCodeToCard);
}

// Player result for round results
interface PlayerResult {
	Cards: CardCode[];
	Total: number;
	UserId: string;
	Won: boolean;
}

// Player cards data
interface PlayerCardsData {
	Cards: CardCode[];
	RemainingCards: number;
	Total: number;
	TotalStartingCards: number;
	UserId: string;
}

// Discriminated union for all possible WebSocket message types
type WebSocketMessage =
	| {
		Type: "new_round";
		RoundEndTimestamp: number;
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

// Discriminated union for processed results
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
					roundEndTimestamp: message.RoundEndTimestamp,
					message: `New round started, ending at ${new Date(message.RoundEndTimestamp).toLocaleTimeString()}`,
					dealerCards: message.DealerCards,
					dealerTotal: message.DealerTotal
				};

			case "round_results":
				const dealerBusted = message.DealerTotal > 21;
				const playerCount = message.Results.length;
				const winnersCount = message.Results.filter(r => r.Won).length;

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
				// TypeScript exhaustiveness check
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
	connectionUrl: "ws://localhost:5000/ws",
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
											state: result.Total === processed.dealerTotal ? 'push' : result.Won ? 'won' : 'lost'
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
		gameWebSocketState.currentGameState
	}),
}

export {
	GameWebSocketServiceTag,
	gameWebSocketServiceLive,
	gameWebSocketState,
}