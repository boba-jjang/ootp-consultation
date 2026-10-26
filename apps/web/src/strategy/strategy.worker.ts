import { handleStrategyRequest, type StrategyRequest } from './handler.ts';

/**
 * The strategy view's Web Worker: one request in, one response out. Everything it does is in
 * handler.ts, which Vitest tests in Node; this file only moves the messages.
 */
self.onmessage = (event: MessageEvent<StrategyRequest>) => {
  self.postMessage(handleStrategyRequest(event.data));
};
