import { Router } from 'express';
import { asyncHandler } from '../lib/http';
import { auctionStatistics, statFilterSchema } from '../lib/statistics';
import { requirePermission } from '../middleware/auth';

export const staffRouter = Router();

/** stf-001: auctions in a start-date range with a status, plus count and totals. */
staffRouter.get(
  '/auctions',
  requirePermission('report.view'),
  asyncHandler(async (req, res) => {
    const filter = statFilterSchema.parse(req.query);
    const { rows, summary } = await auctionStatistics(filter);
    res.json({ filter, auctions: rows, summary });
  }),
);
