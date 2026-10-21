import http from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { PASSWORD, app } from './helpers';

export interface SseEvent {
  event: string;
  id?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
}

/** Starts the app on a random port; SSE needs a real socket that stays open. */
export async function listen() {
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  return { server, port: (server.address() as AddressInfo).port };
}

/** Logs in and returns the auth cookie ('name=value'), for requests made outside supertest. */
export async function loginCookie(identifier: string) {
  const res = await request(app).post('/api/auth/login').send({ identifier, password: PASSWORD });
  if (res.status !== 200) throw new Error(`login failed for ${identifier}`);
  return ([] as string[]).concat(res.headers['set-cookie'])[0].split(';')[0];
}

/** Opens an SSE stream and collects parsed events until close(). */
export function subscribe(port: number, path: string, cookie?: string) {
  const events: SseEvent[] = [];
  let req!: http.ClientRequest;
  const ready = new Promise<{ status: number; headers: http.IncomingHttpHeaders }>((resolve, reject) => {
    req = http.get({ host: '127.0.0.1', port, path, headers: cookie ? { cookie } : {} }, (res) => {
      let buffer = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => {
        buffer += chunk;
        let at: number;
        while ((at = buffer.indexOf('\n\n')) >= 0) {
          const frame = buffer.slice(0, at);
          buffer = buffer.slice(at + 2);
          const ev: Partial<SseEvent> = {};
          for (const line of frame.split('\n')) {
            if (line.startsWith('event: ')) ev.event = line.slice(7);
            else if (line.startsWith('id: ')) ev.id = line.slice(4);
            else if (line.startsWith('data: ')) ev.data = JSON.parse(line.slice(6));
          }
          if (ev.event) events.push(ev as SseEvent);
        }
      });
      resolve({ status: res.statusCode!, headers: res.headers });
    });
    req.on('error', (err) => {
      if ((err as NodeJS.ErrnoException).code !== 'ECONNRESET') reject(err);
    });
  });
  return { events, ready, close: () => req.destroy() };
}

export const waitFor = async (check: () => boolean, ms = 3000) => {
  const until = Date.now() + ms;
  while (!check()) {
    if (Date.now() > until) throw new Error('timed out waiting');
    await new Promise((r) => setTimeout(r, 20));
  }
};

export const settle = () => new Promise((r) => setTimeout(r, 300));
