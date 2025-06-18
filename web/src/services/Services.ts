import { Effect, Layer, Runtime } from 'effect';
import { BlackjackService, blackjackServiceLive } from './AppService';
import {
  GameService,
  makeGameServiceLive,
} from './GameService';

export const MainLayer = Layer.merge(
  blackjackServiceLive,
  makeGameServiceLive.pipe(Layer.provide(blackjackServiceLive))
);
const runtimeEffect = Layer.toRuntime(MainLayer).pipe(Effect.scoped);
const rt = Effect.runSync(runtimeEffect);

export default {
  blackjackService: Runtime.runSync(rt)(BlackjackService),
  gameService: Runtime.runSync(rt)(GameService),
};
