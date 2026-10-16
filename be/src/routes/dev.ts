import { Router } from 'express';
import { getOutbox } from '../lib/mailer';

// Development/test helpers. Not mounted when NODE_ENV=production.
export const devRouter = Router();

devRouter.get('/outbox', (req, res) => {
  const to = typeof req.query.to === 'string' ? req.query.to.toLowerCase() : undefined;
  res.json({ mails: getOutbox(to) });
});
