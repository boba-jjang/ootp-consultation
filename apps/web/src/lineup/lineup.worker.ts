import { handleLineupRequest, type LineupRequest } from './handler.ts';

/**
 * The Lineup card's Web Worker: one request in, one response out. Everything it does is in
 * handler.ts, which Vitest tests in Node; this file only moves the messages.
 */
self.onmessage = (event: MessageEvent<LineupRequest>) => {
  self.postMessage(handleLineupRequest(event.data));
};
