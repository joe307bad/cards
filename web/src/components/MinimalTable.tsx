import React, { useState, useEffect } from 'react';
import { useBlackjackState } from '../services/App/AppHook';

export default function MinimalTable(props: { gameState: ReturnType<typeof useBlackjackState>, hit: () => void, stand: () => void }) {
  const gameState = props.gameState.currentGameState;
  const [countdown, setCountdown] = useState(0);
  
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

  return (
    <div className="p-6 bg-green-800 text-white max-w-2xl mx-auto rounded-lg">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Blackjack Game</h2>
        {countdownText && (
          <div className="text-sm bg-black bg-opacity-30 px-3 py-1 rounded">
            {countdownText}
          </div>
        )}
      </div>
      
      <div className="flex gap-6">
        {/* Game Area */}
        <div className="flex-1">
          <div className="mb-4">
            <h3 className="font-semibold mb-2">Dealer (Score: {gameState.dealerScore})</h3>
            <div className="flex gap-1 flex-wrap">
              {gameState.dealerHand.map((card, i) => (
                <span key={i} className="bg-white text-black px-2 py-1 rounded text-sm">
                  {formatCard(card)}
                </span>
              ))}
            </div>
            {dealerStatus && (
              <p className={`${dealerStatus.color} text-sm mt-1`}>
                {dealerStatus.text}
              </p>
            )}
          </div>

          {Object.entries(gameState.playerHands).map(([playerId, hand]: any) => {
            const playerStatus = getPlayerStatus(hand);
            return (
              <div key={playerId} className="mb-4">
                <h3 className="font-semibold mb-2">Player (Score: {hand.score})</h3>
                <div className="flex gap-1 flex-wrap">
                  {hand.cards.map((card, i) => (
                    <span key={i} className="bg-white text-black px-2 py-1 rounded text-sm">
                      {formatCard(card)}
                    </span>
                  ))}
                </div>
                {playerStatus && (
                  <p className={`${playerStatus.color} text-sm mt-1`}>
                    {playerStatus.text}
                  </p>
                )}
              </div>
            );
          })}

          <div className="mt-4">
            <p className="text-sm opacity-75">Game Status: {gameState.gameStatus.replace('_', ' ')}</p>
          </div>
        </div>

        {/* Controls Column */}
        <div className="flex flex-col gap-2 min-w-24">
          <button
            className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded font-semibold disabled:opacity-50"
            disabled={gameState.gameStatus === 'game_ended'}
            onClick={props.hit}
          >
            Hit
          </button>
          <button
            className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded font-semibold disabled:opacity-50"
            disabled={gameState.gameStatus === 'game_ended'}
            onClick={props.stand}
          >
            Stand
          </button>
        </div>
      </div>
    </div>
  );
}