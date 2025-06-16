import { useEffect } from 'react';
import {
  useBlackjackActions,
  useBlackjackState,
  usePlayerName,
  useWsService,
} from './services/App/AppHook';
import MinimalTable from './components/MinimalTable';

export function App() {
  const actions = useBlackjackActions();
  const state = useBlackjackState();
  const ws = useWsService();
  const playerName = usePlayerName();

  useEffect(() => {
    if (playerName) {
      ws.connect();
    }
  }, [playerName]);

  return <MinimalTable hit={actions.hit} gameState={state} />;
}
