import { Router } from 'express';
import { asyncHandler } from '../lib/http';
import { auctionWorkbook, reportFileName } from '../lib/report';
import { HttpError } from '../lib/http';
import { MAX_CHART_DAYS, auctionStatistics, dailyBuckets, statFilterSchema } from '../lib/statistics';
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

/** stf-002: download the current filter as an Excel workbook. */
staffRouter.get(
  '/auctions/export',
  requirePermission('report.export'),
  asyncHandler(async (req, res) => {
    const filter = statFilterSchema.parse(req.query);
    const { rows, summary } = await auctionStatistics(filter);
    const wb = auctionWorkbook(filter, rows, summary);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${reportFileName(filter)}"`);
    res.send(Buffer.from(await wb.xlsx.writeBuffer()));
  }),
);

/** stf-003: per-day counts by status and per-day sale value for the charts. */
staffRouter.get(
  '/auctions/summary',
  requirePermission('report.view'),
  asyncHandler(async (req, res) => {
    const filter = statFilterSchema.parse(req.query);
    const days = (Date.parse(filter.to) - Date.parse(filter.from)) / 86_400_000 + 1;
    if (days > MAX_CHART_DAYS) {
      throw new HttpError(400, `Charts cover at most ${MAX_CHART_DAYS} days`, { to: `Pick a range of at most ${MAX_CHART_DAYS} days` });
    }
    const { rows, summary } = await auctionStatistics(filter);
    res.json({ filter, days: dailyBuckets(filter, rows), summary });
  }),
);
