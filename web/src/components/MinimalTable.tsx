import { useState, useEffect, useCallback } from 'react';
import {
  useBlackjackActions,
  useBlackjackState,
  usePlayerName,
} from '../hooks/AppHook';
import { Button, Card, Typography } from '@material-tailwind/react';
import CardDeck from './CardDeck';
import { StatusBadge } from './StatusBadge';

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

  const getCountdownText = () => {
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
                <div className="pl-2">
                  <StatusBadge
                    offense={gameState.dealerScore}
                    defense={currentPlayerHand?.score}
                    gameState={gameState.gameStatus}
                  />
                </div>
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
            <div>Wins: {gameState.wins}</div>
            <div>Score: {currentPlayerHand?.score ?? 0}</div>
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
                <StatusBadge
                  defense={gameState.dealerScore}
                  offense={currentPlayerHand?.score}
                  gameState={gameState.gameStatus}
                />
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
                    <div className="pt-2">
                      <StatusBadge
                        defense={gameState.dealerScore}
                        offense={hand.score}
                        gameState={gameState.gameStatus}
                      />
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
