import ExcelJS from 'exceljs';
import type { customerStatistics, revenueStatistics } from './insights';
import type { StatFilter, StatRow, StatSummary } from './statistics';

export interface Insights {
  revenue: Awaited<ReturnType<typeof revenueStatistics>>;
  customers: Awaited<ReturnType<typeof customerStatistics>>;
}

const MONEY = '"$"#,##0.00';

/** Excel cells cannot hold a Date with zone info; write local wall-clock time for the client's offset. */
const localTime = (d: Date, tz: number) => new Date(d.getTime() - tz * 60_000);

/** stf-002: the same rows and summary the statistics page shows, as an .xlsx workbook. */
export function auctionWorkbook(filter: StatFilter, rows: StatRow[], summary: StatSummary, insights?: Insights) {
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
  if (insights) insightsSheet(wb, filter, insights);
  return wb;
}

export const reportFileName = (f: Pick<StatFilter, 'from' | 'to'>) => `auctions_${f.from}_${f.to}.xlsx`;

/** stf-004: second sheet with revenue and customer figures for the same date range. */
function insightsSheet(wb: ExcelJS.Workbook, filter: StatFilter, { revenue, customers }: Insights) {
  const ws = wb.addWorksheet('Revenue and customers');
  ws.columns = [{ width: 30 }, { width: 18 }, { width: 12 }];
  const heading = (text: string) => {
    const row = ws.addRow([text]);
    row.font = { bold: true };
  };
  const money = (label: string, value: number) => {
    ws.addRow([label, value]).getCell(2).numFmt = MONEY;
  };
  ws.addRow([`Period: ${filter.from} to ${filter.to}`]);
  ws.addRow([]);
  heading('Revenue (sales settled in the period)');
  money('Commission revenue', revenue.totalCommission.toNumber());
  money('Total sales value', revenue.totalSales.toNumber());
  ws.addRow(['Settled sales', revenue.settledCount]);
  ws.addRow([]);
  heading('Customers');
  ws.addRow(['New registrations', customers.registrations]);
  ws.addRow(['Active bidders', customers.activeBidders]);
  ws.addRow(['Active sellers', customers.activeSellers]);
  for (const [title, list] of [
    ['Top sellers (sales value)', customers.topSellers],
    ['Top bidders (winning bids)', customers.topBidders],
  ] as const) {
    ws.addRow([]);
    heading(title);
    const header = ws.addRow(['Username', 'Value', 'Sales']);
    header.font = { italic: true };
    if (list.length === 0) ws.addRow(['(none)']);
    for (const r of list) ws.addRow([r.username, r.value.toNumber(), r.count]).getCell(2).numFmt = MONEY;
  }
}
