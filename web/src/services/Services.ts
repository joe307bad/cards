import { Effect, Layer, Runtime } from 'effect';
import { BlackjackService, blackjackServiceLive } from './App/AppService';
import {
  GameWebSocketService,
  makeGameWebSocketServiceLive,
} from './WebSocketService';

export const MainLayer = Layer.merge(
  blackjackServiceLive,
  makeGameWebSocketServiceLive.pipe(Layer.provide(blackjackServiceLive))
);
const runtimeEffect = Layer.toRuntime(MainLayer).pipe(Effect.scoped);
const rt = Effect.runSync(runtimeEffect);

export default {
  blackjackService: Runtime.runSync(rt)(BlackjackService),
  gameService: Runtime.runSync(rt)(GameWebSocketService),
};
