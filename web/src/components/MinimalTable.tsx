import React, { useState, useEffect } from 'react';
import { useBlackjackState, usePlayerName } from '../services/App/AppHook';
import { Button, Card, Typography } from '@material-tailwind/react';

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
        <div className="flex flex-col p-6 bg-green-800 text-white max-w-4xl mx-auto rounded-lg max-w-[1000px] h-full items-start">
            <div className="flex-1 w-full flex flex-col  items-center">
                <div className="max-w-[500px] w-full flex flex-col">
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


                    <div className="flex justify-between self-end items-center w-full mb-6">
                        <p className="text-sm opacity-75">Game Status: {gameState.gameStatus.replace('_', ' ')}</p>
                        {countdownText && (
                            <div className="text-sm bg-black bg-opacity-30 px-3 py-1 text-center rounded w-[150px]">
                                {countdownText}
                            </div>
                        )}
                    </div>
                    <Card className="h-[200px] rounded-none bg-[transparent] flex flex-col p-5 bg-[var(--color-green-700)]">
                        <div className="flex justify-between items-center mb-3">
                            <Typography color="white" variant="h6">{playerName} (You)</Typography>
                            {currentPlayerHand && <Typography color="white" variant="h6">Score: {currentPlayerHand.score}</Typography>}
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

                </div>
                {otherPlayers.length > 0 && (
                    <div className="flex justify-center items-center gap-4 flex-wrap mt-5">
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
        </div>
    );
}