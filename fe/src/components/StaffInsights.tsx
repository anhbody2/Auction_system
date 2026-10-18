import { useEffect, useState } from 'react';
import { api, money } from '../api';
import type { StatFilter } from '../pages/StaffStatistics';
import { statQuery } from '../pages/StaffStatistics';

interface Revenue {
  totalCommission: number;
  totalSales: number;
  settledCount: number;
}
interface Ranked {
  username: string;
  value: number;
  count: number;
}
interface Customers {
  registrations: number;
  activeBidders: number;
  activeSellers: number;
  topSellers: Ranked[];
  topBidders: Ranked[];
}

function TopList({ title, rows, testId }: { title: string; rows: Ranked[]; testId: string }) {
  return (
    <div className="card" data-testid={testId}>
      <div className="muted small">{title}</div>
      {rows.length === 0 ? (
        <p className="muted small">No sales in this period.</p>
      ) : (
        <ol className="top-list">
          {rows.map((r) => (
            <li key={r.username}>
              <span>{r.username}</span>
              <span className="muted small">
                {r.count} sale{r.count === 1 ? '' : 's'}
              </span>
              <strong>{money(r.value)}</strong>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** stf-004: revenue and customer figures for the selected date range (the status filter does not apply). */
export function StaffInsights({ filter }: { filter: StatFilter }) {
  const [data, setData] = useState<{ revenue: Revenue; customers: Customers } | null>(null);

  useEffect(() => {
    const qs = statQuery(filter);
    Promise.all([
      api<{ revenue: Revenue }>(`/staff/revenue?${qs}`),
      api<{ customers: Customers }>(`/staff/customers?${qs}`),
    ])
      .then(([r, c]) => setData({ revenue: r.revenue, customers: c.customers }))
      .catch(() => setData(null)); // an invalid range is reported by the list above
  }, [filter]);

  if (!data) return null;
  const { revenue, customers } = data;
  const tile = (label: string, value: string, testId: string) => (
    <div className="card" data-testid={testId}>
      <div className="muted small">{label}</div>
      <div className="big">{value}</div>
    </div>
  );
  return (
    <section className="insights" aria-label="Revenue and customers">
      <h2>Revenue and customers</h2>
      <p className="muted small">
        {filter.from} to {filter.to}. Revenue counts sales settled in the period; the status filter does not apply here.
      </p>
      <div className="grid stats">
        {tile('Commission revenue', money(revenue.totalCommission), 'revenue-commission')}
        {tile(`Sales value (${revenue.settledCount} settled)`, money(revenue.totalSales), 'revenue-sales')}
        {tile('New registrations', String(customers.registrations), 'customers-registrations')}
        {tile('Active bidders', String(customers.activeBidders), 'customers-bidders')}
        {tile('Active sellers', String(customers.activeSellers), 'customers-sellers')}
      </div>
      <div className="grid top-lists">
        <TopList title="Top 5 sellers by sales value" rows={customers.topSellers} testId="top-sellers" />
        <TopList title="Top 5 bidders by winning bids" rows={customers.topBidders} testId="top-bidders" />
      </div>
    </section>
  );
}
