import React, { useState, useEffect } from 'react';
import { useBlackjackState, usePlayerName } from '../services/App/AppHook';
import { Button, Card, Typography } from '@material-tailwind/react';

const o = {
    "Alice": {
        "cards": [
            { "rank": "K", "suit": "hearts" },
            { "rank": "9", "suit": "spades" }
        ],
        "score": 19,
        "state": "won"
    },
    "Bob": {
        "cards": [
            { "rank": "A", "suit": "clubs" },
            { "rank": "J", "suit": "diamonds" }
        ],
        "score": 21,
        "state": "won"
    },
    "Charlie": {
        "cards": [
            { "rank": "8", "suit": "hearts" },
            { "rank": "7", "suit": "clubs" },
            { "rank": "9", "suit": "spades" }
        ],
        "score": 24,
        "state": "lost"
    },
    "Diana": {
        "cards": [
            { "rank": "Q", "suit": "spades" },
            { "rank": "6", "suit": "hearts" }
        ],
        "score": 16,
        "state": "lost"
    },
    "Eddie": {
        "cards": [
            { "rank": "A", "suit": "hearts" },
            { "rank": "A", "suit": "spades" },
            { "rank": "9", "suit": "clubs" }
        ],
        "score": 21,
        "state": "push"
    },
    "Fiona": {
        "cards": [
            { "rank": "7", "suit": "diamonds" },
            { "rank": "7", "suit": "hearts" },
            { "rank": "7", "suit": "clubs" }
        ],
        "score": 21,
        "state": "won"
    },
    "George": {
        "cards": [
            { "rank": "5", "suit": "spades" },
            { "rank": "6", "suit": "diamonds" }
        ],
        "score": 11,
        "state": "playing"
    },
    "Hannah": {
        "cards": [
            { "rank": "10", "suit": "clubs" },
            { "rank": "4", "suit": "spades" },
            { "rank": "5", "suit": "hearts" }
        ],
        "score": 19,
        "state": "won"
    },
    "Ivan": {
        "cards": [
            { "rank": "J", "suit": "hearts" },
            { "rank": "8", "suit": "diamonds" },
            { "rank": "6", "suit": "clubs" }
        ],
        "score": 24,
        "state": "lost"
    },
    "Julia": {
        "cards": [
            { "rank": "A", "suit": "diamonds" },
            { "rank": "K", "suit": "clubs" }
        ],
        "score": 21,
        "state": "won"
    },
    "Kevin": {
        "cards": [
            { "rank": "9", "suit": "hearts" },
            { "rank": "3", "suit": "spades" }
        ],
        "score": 12,
        "state": "playing"
    },
    "Luna": {
        "cards": [
            { "rank": "Q", "suit": "diamonds" },
            { "rank": "Q", "suit": "hearts" }
        ],
        "score": 20,
        "state": "push"
    },
    "Mike": {
        "cards": [
            { "rank": "2", "suit": "clubs" },
            { "rank": "3", "suit": "spades" },
            { "rank": "4", "suit": "hearts" },
            { "rank": "5", "suit": "diamonds" },
            { "rank": "7", "suit": "clubs" }
        ],
        "score": 21,
        "state": "won"
    },
    "Nina": {
        "cards": [
            { "rank": "K", "suit": "spades" },
            { "rank": "5", "suit": "hearts" },
            { "rank": "9", "suit": "diamonds" }
        ],
        "score": 24,
        "state": "lost"
    },
    "Oscar": {
        "cards": [
            { "rank": "8", "suit": "clubs" },
            { "rank": "8", "suit": "diamonds" }
        ],
        "score": 16,
        "state": "lost"
    },
    "Penny": {
        "cards": [
            { "rank": "A", "suit": "spades" },
            { "rank": "7", "suit": "hearts" }
        ],
        "score": 18,
        "state": "playing"
    },
    "Quinn": {
        "cards": [
            { "rank": "J", "suit": "clubs" },
            { "rank": "9", "suit": "spades" }
        ],
        "score": 19,
        "state": "push"
    },
    "Rachel": {
        "cards": [
            { "rank": "6", "suit": "hearts" },
            { "rank": "6", "suit": "diamonds" },
            { "rank": "6", "suit": "clubs" },
            { "rank": "4", "suit": "spades" }
        ],
        "score": 22,
        "state": "lost"
    },
    "Steve": {
        "cards": [
            { "rank": "A", "suit": "clubs" },
            { "rank": "Q", "suit": "spades" }
        ],
        "score": 21,
        "state": "won"
    },
    "Tina": {
        "cards": [
            { "rank": "10", "suit": "hearts" },
            { "rank": "7", "suit": "diamonds" }
        ],
        "score": 17,
        "state": "playing"
    }
}


export default function MinimalTable(props: { gameState: ReturnType<typeof useBlackjackState>, hit: () => void }) {
    const gameState = props.gameState.currentGameState;
    const [countdown, setCountdown] = useState(0);
    const playerName = usePlayerName();

    const formatCard = (card) => `${card.rank}${card.suit[0].toUpperCase()}`;

    // Update countdown every second
    useEffect(() => {
        // @ts-ignore
        if (!gameState?.countdownTo?.Fields?.[0]) return;

        const updateCountdown = () => {
            const now = Math.floor(Date.now() / 1000);
            // @ts-ignore
            const targetTime = gameState.countdownTo.Fields[0];
            const remaining = Math.max(0, targetTime - now);
            setCountdown(remaining);
        };

        updateCountdown(); // Initial update
        const interval = setInterval(updateCountdown, 1000);

        return () => clearInterval(interval);
    }, [gameState?.countdownTo]);

    if (!gameState) {
        return null;
    }

    // Helper function to determine dealer status
    const getDealerStatus = () => {
        if (gameState.dealerScore === 21) {
            return { text: "BLACKJACK!", color: "text-yellow-300" };
        }
        if (gameState.dealerScore > 21) {
            return { text: "BUST!", color: "text-red-300" };
        }
        if (gameState.gameStatus === 'game_ended') {
            return { text: "STAND", color: "text-yellow-300" };
        }
        return null;
    };

    // Helper function to determine player status
    const getPlayerStatus = (hand) => {
        if (hand.score === 21) {
            return { text: "BLACKJACK!", color: "text-yellow-300" };
        }
        if (hand.score > 21) {
            return { text: "BUST!", color: "text-red-300" };
        }
        if (hand.result && hand.result.Case === "Some") {
            const result = hand.result.Fields[0];
            if (result === "win") {
                return { text: "WIN!", color: "text-green-300" };
            } else if (result === "loss") {
                return { text: "LOSS!", color: "text-red-300" };
            } else if (result === "push") {
                return { text: "PUSH!", color: "text-yellow-300" };
            }
        }
        if (hand.state === "standing") {
            return { text: "STAND", color: "text-yellow-300" };
        }
        return null;
    };

    const dealerStatus = getDealerStatus();

    // Get countdown display text
    const getCountdownText = () => {
        // @ts-ignore
        if (!gameState.countdownTo?.Fields?.[0]) return null;

        if (gameState.gameStatus === 'playing') {
            return `Round ends in: ${countdown}s`;
        } else if (gameState.gameStatus === 'game_ended') {
            return `Next round in: ${countdown}s`;
        }
        return null;
    };

    const countdownText = getCountdownText();

    // Get current player's hand and other players
    const currentPlayerHand = gameState.playerHands[playerName];
    const otherPlayers = Object.entries(gameState.playerHands).filter(([playerId]) => playerId !== playerName);

    return (
        <div className="flex flex-col p-6 bg-green-800 text-white max-w-4xl mx-auto rounded-lg max-w-[500px] h-full">
            <div className="flex-1 w-full">
                <div className="h-[150px] rounded-none bg-[transparent] flex flex-col p-5">
                    <div className="flex justify-between items-center mb-3">
                        <Typography color="white" variant="h5">Dealer</Typography>
                        <Typography color="white" variant="h5">Score: {gameState.dealerScore}</Typography>
                    </div>
                    <div className="flex gap-2 flex-wrap mb-[5px]">
                        {gameState.dealerHand.map((card, i) => (
                            <span key={i} className="bg-white text-black px-3 py-2 rounded-lg text-lg font-medium shadow-md">
                                {formatCard(card)}
                            </span>
                        ))}
                    </div>
                    {dealerStatus && (
                        <p className={`${dealerStatus.color} text-sm font-semibold`}>
                            {dealerStatus.text}
                        </p>
                    )}
                </div>
                <Card className="h-[200px] rounded-none bg-[transparent] flex flex-col p-5 bg-[var(--color-green-700)]">
                    <div className="flex justify-between items-center mb-3">
                        <Typography color="white" variant="h5">{playerName} (You)</Typography>
                        {currentPlayerHand && <Typography color="white" variant="h5">Score: {currentPlayerHand.score}</Typography>}
                    </div>
                    <div className="flex-1">
                        {currentPlayerHand && (
                            <div>
                                <div className="flex gap-2 flex-wrap mb-[5px]">
                                    {currentPlayerHand.cards.map((card, i) => (
                                        <span key={i} className="bg-white text-black px-3 py-2 rounded-lg text-lg font-medium shadow-md">
                                            {formatCard(card)}
                                        </span>
                                    ))}
                                </div>
                                <div>
                                    {(() => {
                                        const playerStatus = getPlayerStatus(currentPlayerHand);
                                        return playerStatus && (
                                            <p className={`${playerStatus.color} text-sm font-semibold`}>
                                                {playerStatus.text}
                                            </p>
                                        );
                                    })()}
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="flex flex-col gap-3 min-w-24 self-end w-full">
                        <Button
                            variant="filled"
                            color="blue"
                            className="w-full px-4 py-3 roundeds"
                            disabled={gameState.gameStatus === 'game_ended' || (currentPlayerHand && getPlayerStatus(currentPlayerHand)?.text === 'BUST!')}
                            onClick={props.hit}
                        >
                            HIT
                        </Button>
                    </div>
                </Card>
                {otherPlayers.length > 0 && (
                    <div className="flex gap-4 flex-wrap mt-5">
                        {otherPlayers.map(([playerId, hand]: any) => {
                            const playerStatus = getPlayerStatus(hand);
                            return (
                                <Card className="rounded-none bg-[transparent] flex flex-col bg-[var(--color-green-700)]">
                                    <div key={playerId} className="bg-opacity-20 p-3">
                                        <div className="flex justify-between items-left mb-2 flex-col">
                                            <span className="text-white text-sm font-medium text-left">{playerId}</span>
                                            <span className="text-white text-sm font-bold">Score: {hand.score}</span>
                                        </div>
                                        <div className="flex gap-1 flex-wrap mb-2">
                                            {hand.cards.map((card, i) => (
                                                <span key={i} className="bg-white text-black px-2 py-1 rounded text-sm">
                                                    {formatCard(card)}
                                                </span>
                                            ))}
                                        </div>
                                        <div className="h-4">
                                            {playerStatus && (
                                                <p className={`${playerStatus.color} text-xs`}>
                                                    {playerStatus.text}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </Card>
                            );
                        })}
                    </div>
                )}
            </div>

            <div className="flex justify-between self-end items-center w-full mb-6">
                <p className="text-sm opacity-75">Game Status: {gameState.gameStatus.replace('_', ' ')}</p>
                {countdownText && (
                    <div className="text-sm bg-black bg-opacity-30 px-3 py-1 text-center rounded w-[150px]">
                        {countdownText}
                    </div>
                )}
            </div>
        </div>
    );
}