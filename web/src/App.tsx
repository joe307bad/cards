import { useEffect, useState } from 'react';
import {
  useBlackjackState,
  usePlayerName,
  useWsService,
} from './services/App/AppHook';
import MinimalTable from './components/MinimalTable';

export function App() {
  const state = useBlackjackState();
  const ws = useWsService();
  const playerName = usePlayerName();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (playerName) {
      ws.connect().then(() => setLoaded(true));
    }
  }, [playerName]);

  return loaded && <MinimalTable gameState={state} />;
}
