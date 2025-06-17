import React, {
  createContext,
  useContext,
  ReactNode,
  useState,
  useEffect,
} from 'react';
import { faker } from '@faker-js/faker';
import { Effect } from 'effect';
import { useSnapshot } from 'valtio';
import services from '../Services';
import { gameWebSocketState } from '../WebSocketService';

function generateRandomName(): { name: string; key: string } {
  // Generate elaborate name components
  const firstName = faker.person.firstName();
  const middleName = faker.person.middleName();
  const lastName = faker.person.lastName();
  const suffix = faker.person.suffix();

  // Create the elaborate name
  const elaborateName = `${firstName} ${middleName} ${lastName} ${suffix}`;

  // Replace spaces with hyphens and convert to lowercase
  const baseName = elaborateName.replace(/\s+/g, '-').toLowerCase();

  // Generate 5 character alphanumeric suffix
  const randomSuffix = faker.string.alphanumeric({
    length: 5,
    casing: 'lower',
  });

  return { name: `${baseName}-${randomSuffix}`, key: faker.string.uuid() };
}

const getStoredPlayerName = (): string | null => {
  return localStorage.getItem('blackjack-player-name');
};

const storePlayerName = (name: string): void => {
  localStorage.setItem('blackjack-player-name', name);
};

const getSecretKey = (): string | null => {
  return localStorage.getItem('blackjack-secret-key');
};

const storeSecretKey = (name: string): void => {
  localStorage.setItem('blackjack-secret-key', name);
};

type BlackjackContextType = {
  blackjack: typeof services.blackjackService;
  gs: typeof services.gameService;
  playerName: string;
  secretKey: string;
};

const BlackjackContext = createContext<BlackjackContextType | null>(null);

interface BlackjackProviderProps {
  children: ReactNode;
}

export const BlackjackProvider: React.FC<BlackjackProviderProps> = ({
  children,
}) => {
  const [playerName, setPlayerName] = useState<string>('');
  const [secretKey, setSecretKey] = useState<string>('');

  useEffect(() => {
    let storedName = getStoredPlayerName();
    let secretKey = getSecretKey();

    if (!storedName || !secretKey) {
      const { name, key } = generateRandomName();
      storedName = name;
      secretKey = key;
      storePlayerName(storedName);
      storeSecretKey(secretKey);
    }

    setPlayerName(storedName);
    setSecretKey(secretKey);
  }, []);

  const value: BlackjackContextType = {
    blackjack: services.blackjackService,
    gs: services.gameService,
    playerName,
    secretKey,
  };

  return (
    <BlackjackContext.Provider value={value}>
      {children}
    </BlackjackContext.Provider>
  );
};

const useWsService = () => {
  const context = useContext(BlackjackContext);
  if (!context) {
    throw new Error('useWsService must be used within a BlackjackProvider');
  }

  const connect = async () => {
    await Effect.runPromise(
      //@ts-ignore
      context.gs.connect(process.env.URL, context.playerName)
    );
  };

  return { connect };
};

const useBlackjackService = (): typeof services.blackjackService => {
  const context = useContext(BlackjackContext);
  if (!context) {
    throw new Error(
      'useBlackjackService must be used within a BlackjackProvider'
    );
  }
  return context.blackjack;
};

const useBlackjackState = () => {
  return useSnapshot(gameWebSocketState);
};

const useBlackjackActions = () => {
  const context = useContext(BlackjackContext);
  const service = useBlackjackService();

  if (!context) {
    throw new Error(
      'useBlackjackActions must be used within a BlackjackProvider'
    );
  }

  const hit = async () => {
    await Effect.runPromise(
    //@ts-ignore
      service.hit(process.env.URL, context.playerName, context.secretKey)
    );
  };

  const get = async (playerName: string) => {
    //@ts-ignore
    return Effect.runPromise(service.get(process.env.URL, playerName));
  };

  return { hit, get };
};

const usePlayerName = (): string => {
  const context = useContext(BlackjackContext);
  if (!context) {
    throw new Error('usePlayerName must be used within a BlackjackProvider');
  }
  return context.playerName;
};

export { useBlackjackActions, useBlackjackState, useWsService, usePlayerName };
