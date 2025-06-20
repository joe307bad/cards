import { useState, useEffect, useCallback } from 'react';
import {
  useBlackjackActions,
  useBlackjackState,
  usePlayerName,
} from '../services/App/AppHook';
import { Button, Card, Typography } from '@material-tailwind/react';
import CardDeck from './CardScene';

function formatNumber(num: number): string {
  const absNum = Math.abs(num);
  const sign = num < 0 ? '-' : '';

  if (absNum >= 1_000_000_000) {
    return (
      sign + (absNum / 1_000_000_000).toFixed(4).replace(/\.?0+$/, '') + ' b'
    );
  } else if (absNum >= 1_000_000) {
    return sign + (absNum / 1_000_000).toFixed(4).replace(/\.?0+$/, '') + 'M';
  } else if (absNum >= 1_000) {
    return sign + (absNum / 1_000).toFixed(4).replace(/\.?0+$/, '') + 'k';
  } else {
    return num.toLocaleString();
  }
}

export default function MinimalTable(props: {
  gameState: ReturnType<typeof useBlackjackState>;
}) {
  const actions = useBlackjackActions();
  const gameState = props.gameState.currentGameState;
  const [countdown, setCountdown] = useState(0);
  const playerName = usePlayerName();
  const [standing, setStanding] = useState(false);
  const [loading, setLoading] = useState(false);

  const hit = useCallback(() => {
    setLoading(true);
    actions.hit().then(() => setLoading(false));
  }, [playerName]);

  useEffect(() => {
    if (!gameState?.countdownTo) return;

    const updateCountdown = () => {
      const now = Math.floor(Date.now() / 1000);
      const targetTime = gameState.countdownTo;
      const remaining = Math.max(0, targetTime - now);
      setCountdown(remaining);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, [gameState?.countdownTo]);

  useEffect(() => {
    if (gameState?.gameStatus === 'playing') {
      setStanding(false);
    }
  }, [gameState?.gameStatus]);

  if (!gameState) {
    return null;
  }

  const getStatusBadge = () => {

    if (currentPlayerHand.score === 21) {
      return (
        <span className="ml-2 inline-flex items-center px-1 py-1 rounded text-xs font-semibold bg-yellow-100 text-yellow-800 border border-yellow-300">
          BLACKJACK!
        </span>
      );
    }
    
    if (currentPlayerHand.state === 'win') {
      return (
        <span className="ml-2 inline-flex items-center px-1 py-1 rounded text-xs font-semibold bg-green-100 text-green-800 border border-green-300">
          WIN
        </span>
      );
    }

    if (currentPlayerHand.state === 'loss') {
      return (
        <span className="ml-2 inline-flex items-center px-1 py-1 rounded text-xs font-semibold bg-red-100 text-red-800 border border-red-300">
          LOSS
        </span>
      );
    }

    if (currentPlayerHand.score > 21) {
      return (
        <span className="ml-2 inline-flex items-center px-1 py-1 rounded text-xs font-semibold bg-red-100 text-red-800 border border-red-300">
          BUST
        </span>
      );
    }

    if (currentPlayerHand.score === gameState.dealerScore) {
      return (
        <span className="ml-2 inline-flex items-center px-1 py-1 rounded text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-300">
          PUSH
        </span>
      );
    }

    if (gameState.gameStatus === 'game_ended') {
      return (
        <span className="ml-2 inline-flex items-center px-1 py-1 rounded text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-300">
          STAND
        </span>
      );
    }

    return null;
  };

  const getDealerBadge = () => {
    if (gameState.gameStatus !== 'game_ended') {
      return  null
    }

    if (gameState.dealerScore === 21 && gameState.dealerHand.length === 2) {
      return (
        <span className="inline-flex items-center px-1 py-1 rounded text-xs font-semibold bg-yellow-100 text-yellow-800 border border-yellow-300">
          BLACKJACK!
        </span>
      );
    }

    if (currentPlayerHand?.state === 'loss') {
      return (
        <span className="inline-flex items-center px-1 py-1 rounded text-xs font-semibold bg-green-100 text-green-800 border border-green-300">
          WIN
        </span>
      );
    }

    if (currentPlayerHand?.state === 'win') {
      return (
        <span className="inline-flex items-center px-1 py-1 rounded text-xs font-semibold bg-red-100 text-red-800 border border-red-300">
          LOSS
        </span>
      );
    }

    if (gameState.dealerScore > 21) {
      return (
        <span className="inline-flex items-center px-1 py-1 rounded text-xs font-semibold bg-red-100 text-red-800 border border-red-300">
          BUST
        </span>
      );
    }

    if (currentPlayerHand?.score === gameState.dealerScore) {
      return (
        <span className="inline-flex items-center px-1 py-1 rounded text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-300">
          PUSH
        </span>
      );
    }

    if (gameState.gameStatus === 'game_ended') {
      return (
        <span className="inline-flex items-center px-1 py-1 rounded text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-300">
          STAND
        </span>
      );
    }

    return null;
  };

  const getPlayerStatus = hand => {
    if (hand.score === 21 && hand.cards.length === 2) {
      return (
        <span className="inline-flex items-center px-1 py-1 rounded text-xs font-semibold bg-yellow-100 text-yellow-800 border border-yellow-300">
          BLACKJACK!
        </span>
      );
    }

    if (hand.score > 21) {
      return (
        <span className="inline-flex items-center px-1 py-1 rounded text-xs font-semibold bg-red-100 text-red-800 border border-red-300">
          LOSS
        </span>
      );
    }

    if (gameState.dealerScore > 21 && gameState.gameStatus === 'game_ended') {
      return (
        <span className="inline-flex items-center px-1 py-1 rounded text-xs font-semibold bg-green-100 text-green-800 border border-green-300">
          WIN
        </span>
      );
    }

    if (
      hand.score > gameState.dealerScore &&
      gameState.gameStatus === 'game_ended'
    ) {
      return (
        <span className="inline-flex items-center px-1 py-1 rounded text-xs font-semibold bg-green-100 text-green-800 border border-green-300">
          WIN
        </span>
      );
    }
    if (
      hand.score === gameState.dealerScore &&
      gameState.gameStatus === 'game_ended'
    ) {
      return (
        <span className="inline-flex items-center px-1 py-1 rounded text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-300">
          PUSH
        </span>
      );
    }

    if (gameState.gameStatus === 'game_ended') {
      return (
        <span className="inline-flex items-center px-1 py-1 rounded text-xs font-semibold bg-red-100 text-red-800 border border-red-300">
          LOSS
        </span>
      );
    }

    return null;
  };

  const getCountdownText = () => {
    // @ts-ignore
    if (!gameState.countdownTo) return null;

    if (gameState.gameStatus === 'playing') {
      return `Round ends in: ${countdown}s`;
    } else if (gameState.gameStatus === 'game_ended') {
      return `Next round in: ${countdown}s`;
    }
    return null;
  };

  const countdownText = getCountdownText();

  const currentPlayerHand = gameState?.playerHands?.[playerName];
  const otherPlayers = Object.entries(gameState?.playerHands ?? {}).filter(
    ([playerId]) => playerId !== playerName
  );

  const disableButtons =
    standing ||
    loading ||
    gameState.gameStatus === 'game_ended' ||
    currentPlayerHand?.score >= 21 ||
    currentPlayerHand?.state == 'win' ||
    currentPlayerHand?.state == 'loss';
  const players = Object.keys(gameState?.playerHands).length;

  return (
    <div className="flex flex-col p-6 bg-green-800 text-white max-w-4xl mx-auto rounded-lg max-w-[1000px] h-full items-start">
      <div className="flex-1 w-full flex flex-col  items-center">
        <div className="max-w-[500px] w-full flex flex-col">
          <div className="min-h-[150px] rounded-none bg-[transparent] flex flex-col">
            <div className="flex mb-3 w-full">
              <div className="flex-1 flex items-center flex-row">
                <Typography color="white" variant="h5">
                  Dealer
                </Typography>
                <p className="pl-2">{'\u2660'}</p>
                {gameState.dealerScore > 0 && (
                  <Typography className="pl-2" color="white" variant="h5">
                    {gameState.dealerScore}
                  </Typography>
                )}
                <div className="pl-2">{getDealerBadge()}</div>
              </div>

              {countdownText && (
                <div className="text-sm bg-black bg-opacity-30 px-3 py-1 justify-center text-center rounded w-[150px]">
                  {countdownText}
                </div>
              )}
            </div>
            <CardDeck cards={gameState.dealerHand} />
          </div>
          <div className="flex justify-between pb-2">
            <div>
              Wins: {gameState.wins}
            </div>
            <div>
              Score: {currentPlayerHand?.score ?? 0}
            </div>
          </div>
          <Card className="min-h-[200px] rounded-none bg-[transparent] flex flex-col p-3 bg-[var(--color-green-700)]">
            <div className="flex mb-3">
              <Typography
                color="white"
                className="truncate flex-1"
                variant="h6"
              >
                {playerName} (You)
              </Typography>
              <div className="flex items-center">
                {currentPlayerHand && getStatusBadge()}
              </div>
            </div>

            <div className="flex-1">
              {currentPlayerHand && (
                <CardDeck cards={currentPlayerHand?.cards} />
              )}
            </div>
            <div className="flex flex-row gap-3 min-w-24 self-end w-full">
              <Button
                variant="filled"
                color="teal"
                className="w-[50%] px-4 text-md py-3 roundeds"
                disabled={disableButtons}
                onClick={() => setStanding(true)}
              >
                STAND
              </Button>
              <Button
                variant="filled"
                color="blue"
                className="w-[50%] px-4 text-md py-3 roundeds"
                disabled={disableButtons}
                onClick={hit}
              >
                HIT
              </Button>
            </div>
          </Card>
        </div>
        <div className="justify-between flex pt-5 w-full max-w-[500px]">
          <span className="bg-purple-600 text-white text-sm text-xs px-3 py-1 rounded font-medium">
            {players} player{players > 1 ? 's' : players == 0 ? 's' : ''} dealt
            in
          </span>
          <span className="bg-indigo-600 text-white text-sm text-xs px-3 py-1 rounded font-medium ml-2">
            {(
              gameState?.totalStartingCards - gameState?.remaingingCards
            ).toLocaleString()}{' '}
            cards dealt
          </span>
        </div>
        {otherPlayers.length > 0 && (
          <div className="flex justify-center items-center gap-4 flex-wrap mt-5">
            {otherPlayers.map(([playerId, hand]: any) => {
              return (
                <Card className="rounded-none bg-[transparent] flex flex-col bg-[var(--color-green-700)]">
                  <div key={playerId} className="bg-opacity-20 p-3">
                    <div className="flex items-center mb-3">
                      <Typography color="white" variant="h6">
                        {playerId}
                      </Typography>
                      <p className="pl-2 text-white">♣</p>
                      <Typography className="pl-2" color="white" variant="h6">
                        {hand.score}
                      </Typography>
                    </div>
                    <CardDeck cards={hand.cards ?? []} />
                    <div className="pt-2">{getPlayerStatus(hand)}</div>
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
