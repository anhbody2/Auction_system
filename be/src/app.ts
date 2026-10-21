import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import { config } from './config';
import { asyncHandler, errorHandler } from './lib/http';
import { closeDueAuctions } from './lib/settlement';
import { jsonReplacer } from './lib/json';
import { adminRouter } from './routes/admin';
import { adminUsersRouter } from './routes/adminUsers';
import { auctionsRouter } from './routes/auctions';
import { authRouter } from './routes/auth';
import { bidsRouter } from './routes/bids';
import { creditRouter } from './routes/credit';
import { devRouter } from './routes/dev';
import { goodsRouter } from './routes/goods';
import { meRouter } from './routes/me';
import { messagesRouter } from './routes/messages';
import { staffRouter } from './routes/staff';
import { staffGoodsRouter } from './routes/staffGoods';
import { uploadsRouter } from './routes/uploads';

/** Serves config.uploadDir, looked up per request so tests can point UPLOAD_DIR at a temp folder. */
function uploadsStatic(): express.RequestHandler {
  const handlers = new Map<string, express.RequestHandler>();
  return (req, res, next) => {
    const dir = config.uploadDir;
    if (!handlers.has(dir)) handlers.set(dir, express.static(dir, { immutable: true, maxAge: '30d', index: false }));
    handlers.get(dir)!(req, res, next);
  };
}

export function createApp() {
  const app = express();
  app.set('json replacer', jsonReplacer);
  app.use(cors({ origin: config.appUrl, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());

  // upl-001: uploaded images; random names, so they can be cached for good.
  app.use(
    '/uploads',
    (_req, res, next) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      next();
    },
    uploadsStatic(),
    (_req: express.Request, res: express.Response) => res.status(404).json({ error: 'Not found' }),
  );
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  // Safety net beside the hourly close job: settle auctions whose end time passed before serving
  // anything that might show them. SETTLE_ON_REQUEST=0 leaves closing to the scheduler only.
  app.use(
    '/api',
    asyncHandler(async (_req, _res, next) => {
      if (config.settleOnRequest) await closeDueAuctions();
      next();
    }),
  );
  app.use('/api/auth', authRouter);
  app.use('/api/me', meRouter);
  app.use('/api/admin/users', adminUsersRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/staff/goods', staffGoodsRouter);
  app.use('/api/staff', staffRouter);
  app.use('/api/credit', creditRouter);
  app.use('/api/uploads', uploadsRouter);
  app.use('/api', goodsRouter);
  app.use('/api', auctionsRouter);
  app.use('/api', bidsRouter);
  app.use('/api', messagesRouter);
  if (process.env.NODE_ENV !== 'production') app.use('/api/dev', devRouter);

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));
  app.use(errorHandler);
  return app;
}
