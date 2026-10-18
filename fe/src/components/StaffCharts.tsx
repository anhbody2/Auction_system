import { useEffect, useState } from 'react';
import { ApiError, api, money } from '../api';
import type { StatFilter } from '../pages/StaffStatistics';
import { statQuery } from '../pages/StaffStatistics';
import { ColumnChart, type Series } from './ColumnChart';

interface DayBucket {
  date: string;
  upcoming: number;
  active: number;
  ended: number;
  cancelled: number;
  total: number;
  saleValue: number;
}

// Categorical slots 1-4 in fixed order; colour follows the status, never its rank.
const STATUS_SERIES: Series[] = [
  { key: 'upcoming', label: 'Upcoming', color: 'var(--series-1)' },
  { key: 'active', label: 'Active', color: 'var(--series-2)' },
  { key: 'ended', label: 'Ended', color: 'var(--series-3)' },
  { key: 'cancelled', label: 'Cancelled', color: 'var(--series-4)' },
];
const VALUE_SERIES: Series[] = [{ key: 'saleValue', label: 'Sale value', color: 'var(--series-1)' }];

const dayLabel = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString([], { month: 'short', day: 'numeric' });
};
const compactMoney = (n: number) =>
  n >= 1000 ? `$${new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n)}` : money(n).replace('.00', '');

/** stf-003: auctions per day by status, and sale value per day, for the current filter. */
export function StaffCharts({ filter }: { filter: StatFilter }) {
  const [days, setDays] = useState<DayBucket[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setError('');
    api<{ days: DayBucket[] }>(`/staff/auctions/summary?${statQuery(filter)}`)
      .then((r) => setDays(r.days))
      .catch((err) => {
        setDays(null);
        // An invalid filter is already reported above the table; only show chart-specific errors.
        if (err instanceof ApiError && err.message === 'Validation failed') return;
        setError(err instanceof ApiError ? err.message : 'Could not load charts');
      });
  }, [filter]);

  if (error) return <p className="muted">{error}</p>;
  if (!days) return null;
  // With status=all the bars show the real mix; with one status, only that series.
  const series = filter.status === 'all' ? STATUS_SERIES : STATUS_SERIES.filter((s) => s.key === filter.status);
  const total = days.reduce((s, d) => s + d.total, 0);
  if (total === 0) {
    return (
      <div className="card chart-empty" data-testid="chart-empty">
        No auctions in this range, so there is nothing to chart.
      </div>
    );
  }
  const data = days.map((d) => ({ ...d, label: dayLabel(d.date) }));
  return (
    <div className="charts">
      <ColumnChart title="Auctions per day by status" data={data} series={series} integer testId="chart-status" />
      <ColumnChart title="Final sale value per day" data={data} series={VALUE_SERIES} format={compactMoney} testId="chart-value" />
    </div>
  );
}
