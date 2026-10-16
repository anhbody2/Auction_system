import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import { config } from './config';
import { errorHandler } from './lib/http';
import { jsonReplacer } from './lib/json';
import { auctionsRouter } from './routes/auctions';
import { authRouter } from './routes/auth';
import { creditRouter } from './routes/credit';
import { devRouter } from './routes/dev';
import { meRouter } from './routes/me';

export function createApp() {
  const app = express();
  app.set('json replacer', jsonReplacer);
  app.use(cors({ origin: config.appUrl, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRouter);
  app.use('/api/me', meRouter);
  app.use('/api/credit', creditRouter);
  app.use('/api', auctionsRouter);
  if (process.env.NODE_ENV !== 'production') app.use('/api/dev', devRouter);

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));
  app.use(errorHandler);
  return app;
}
