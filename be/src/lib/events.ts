import { EventEmitter } from 'node:events';
import type { Request, Response } from 'express';
import { jsonReplacer } from './json';

/**
 * rt-001: in-process event bus plus Server-Sent Events helpers. One API process, so an EventEmitter is
 * enough; a second process would need a shared channel (e.g. Postgres LISTEN/NOTIFY). See docs/realtime.md.
 */
const bus = new EventEmitter();
bus.setMaxListeners(0); // one listener per open page

export interface StreamEvent {
  /** SSE event name, e.g. 'bid'. */
  type: string;
  /** Sent as the SSE id; lets the client tell events apart. */
  id?: string;
  data: unknown;
}

const auctionChannel = (auctionId: bigint) => `auction:${auctionId}`;

export function publishAuctionEvent(auctionId: bigint, event: StreamEvent) {
  bus.emit(auctionChannel(auctionId), event);
}

export const HEARTBEAT_MS = 25_000;

/**
 * Turns the response into an SSE stream that forwards every event on `channel` until the client goes away.
 * Headers are flushed at once and a comment line is sent every HEARTBEAT_MS so proxies keep it open.
 */
function streamChannel(req: Request, res: Response, channel: string) {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  // Tell EventSource to wait 2 s before reconnecting after a drop.
  res.write('retry: 2000\n\n');
  res.write(': connected\n\n');

  const send = (event: StreamEvent) => {
    let frame = `event: ${event.type}\n`;
    if (event.id) frame += `id: ${event.id}\n`;
    frame += `data: ${JSON.stringify(event.data, jsonReplacer)}\n\n`;
    res.write(frame);
  };
  const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);
  bus.on(channel, send);
  req.on('close', () => {
    clearInterval(heartbeat);
    bus.off(channel, send);
  });
}

export function streamAuction(req: Request, res: Response, auctionId: bigint) {
  streamChannel(req, res, auctionChannel(auctionId));
}

/** For tests: how many streams are listening to an auction. */
export function auctionListenerCount(auctionId: bigint) {
  return bus.listenerCount(auctionChannel(auctionId));
}
