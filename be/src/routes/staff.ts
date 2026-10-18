import { Router } from 'express';
import { asyncHandler } from '../lib/http';
import { auctionWorkbook, reportFileName } from '../lib/report';
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
