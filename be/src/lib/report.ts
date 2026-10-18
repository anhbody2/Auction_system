import ExcelJS from 'exceljs';
import type { StatFilter, StatRow, StatSummary } from './statistics';

const MONEY = '"$"#,##0.00';

/** Excel cells cannot hold a Date with zone info; write local wall-clock time for the client's offset. */
const localTime = (d: Date, tz: number) => new Date(d.getTime() - tz * 60_000);

/** stf-002: the same rows and summary the statistics page shows, as an .xlsx workbook. */
export function auctionWorkbook(filter: StatFilter, rows: StatRow[], summary: StatSummary) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'BidHouse';
  wb.created = new Date();
  const ws = wb.addWorksheet('Auctions', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: 'ID', key: 'id', width: 8 },
    { header: 'Title', key: 'title', width: 32 },
    { header: 'Seller', key: 'seller', width: 16 },
    { header: 'Start time', key: 'startTime', width: 18, style: { numFmt: 'yyyy-mm-dd hh:mm' } },
    { header: 'End time', key: 'endTime', width: 18, style: { numFmt: 'yyyy-mm-dd hh:mm' } },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Starting price', key: 'startingPrice', width: 15, style: { numFmt: MONEY } },
    { header: 'Final price', key: 'finalPrice', width: 15, style: { numFmt: MONEY } },
    { header: 'Winner', key: 'winner', width: 16 },
    { header: 'Commission', key: 'commission', width: 14, style: { numFmt: MONEY } },
  ];
  ws.getRow(1).font = { bold: true };
  for (const r of rows) {
    ws.addRow({
      id: Number(r.id),
      title: r.title,
      seller: r.seller,
      startTime: localTime(r.startTime, filter.tz),
      endTime: localTime(r.endTime, filter.tz),
      status: r.status,
      startingPrice: r.startingPrice.toNumber(),
      finalPrice: r.finalPrice?.toNumber() ?? null,
      winner: r.winner,
      commission: r.commission?.toNumber() ?? null,
    });
  }
  const total = ws.addRow({
    id: null,
    title: `Total: ${summary.count} auction${summary.count === 1 ? '' : 's'}`,
    startingPrice: summary.totalStartingPrice.toNumber(),
    finalPrice: summary.totalFinalPrice.toNumber(),
    commission: summary.totalCommission.toNumber(),
  });
  total.font = { bold: true };
  ws.addRow([]);
  ws.addRow([`Filter: ${filter.from} to ${filter.to}, status ${filter.status} (by start time)`]);
  return wb;
}

export const reportFileName = (f: Pick<StatFilter, 'from' | 'to'>) => `auctions_${f.from}_${f.to}.xlsx`;
