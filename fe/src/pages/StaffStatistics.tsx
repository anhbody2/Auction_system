import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, api, money } from '../api';
import { can, useAuth } from '../auth';
import { StatusBadge } from '../components/AuctionBits';

export interface StatFilter {
  from: string;
  to: string;
  status: string;
}

export interface StatRow {
  id: number;
  title: string;
  seller: string;
  startTime: string;
  endTime: string;
  status: string;
  startingPrice: number;
  finalPrice: number | null;
  winner: string | null;
  commission: number | null;
}

export interface StatSummary {
  count: number;
  totalStartingPrice: number;
  totalFinalPrice: number;
  totalCommission: number;
}

const STATUSES = ['all', 'upcoming', 'active', 'ended', 'cancelled'];

/** Local calendar date as YYYY-MM-DD. */
export const isoDay = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

/** Query string for the staff endpoints; tz makes from/to whole local days. */
export const statQuery = (f: StatFilter) =>
  new URLSearchParams({ ...f, tz: String(new Date().getTimezoneOffset()) }).toString();

const when = (iso: string) => new Date(iso).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });

/** stf-001: filter auctions by start date range and status, list them with totals. */
export function StaffStatisticsPage() {
  const { user } = useAuth();
  const today = new Date();
  const [draft, setDraft] = useState<StatFilter>({
    from: isoDay(new Date(today.getTime() - 29 * 24 * 3600 * 1000)),
    to: isoDay(today),
    status: 'all',
  });
  const [filter, setFilter] = useState<StatFilter>(draft);
  const [data, setData] = useState<{ auctions: StatRow[]; summary: StatSummary } | null>(null);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setError('');
    api<{ auctions: StatRow[]; summary: StatSummary }>(`/staff/auctions?${statQuery(filter)}`)
      .then((d) => {
        setData(d);
        setFieldErrors({});
      })
      .catch((err) => {
        setData(null);
        if (err instanceof ApiError) {
          setFieldErrors(err.fields);
          setError(Object.values(err.fields)[0] ?? err.message);
        } else setError('Could not load statistics');
      });
  }, [filter]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setFilter({ ...draft });
  };

  return (
    <div>
      <h1>Auction statistics</h1>
      <form className="card row filters" onSubmit={submit} aria-label="Statistics filter">
        <label className="field">
          From
          <input type="date" name="from" value={draft.from} aria-invalid={!!fieldErrors.from || undefined} onChange={(e) => setDraft({ ...draft, from: e.target.value })} />
        </label>
        <label className="field">
          To
          <input type="date" name="to" value={draft.to} aria-invalid={!!fieldErrors.to || undefined} onChange={(e) => setDraft({ ...draft, to: e.target.value })} />
        </label>
        <label className="field">
          Status
          <select name="status" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s[0].toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <button className="btn btn-primary" type="submit">
          Show
        </button>
      </form>
      <p className="muted small">Auctions are matched on their start time; both dates are included.</p>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {data && (
        <>
          <div className="row spread">
            <p data-testid="stat-count">
              <strong>{data.summary.count}</strong> auction{data.summary.count === 1 ? '' : 's'}
            </p>
            {can(user, 'report.export') && (
              // stf-002: same filter as the table; the server streams an .xlsx attachment.
              <a className="btn btn-ghost" href={`/api/staff/auctions/export?${statQuery(filter)}`} download>
                Export to Excel
              </a>
            )}
          </div>
          {data.auctions.length === 0 ? (
            <p className="muted">No auctions match this filter.</p>
          ) : (
            <div className="table-wrap">
              <table data-testid="stat-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Seller</th>
                    <th>Start</th>
                    <th>End</th>
                    <th>Status</th>
                    <th>Starting price</th>
                    <th>Final price</th>
                    <th>Winner</th>
                    <th>Commission</th>
                  </tr>
                </thead>
                <tbody>
                  {data.auctions.map((a) => (
                    <tr key={a.id} data-testid={`stat-row-${a.id}`}>
                      <td>
                        <Link to={`/auctions/${a.id}`}>{a.title}</Link>
                      </td>
                      <td>{a.seller}</td>
                      <td>{when(a.startTime)}</td>
                      <td>{when(a.endTime)}</td>
                      <td>
                        <StatusBadge status={a.status} />
                      </td>
                      <td>{money(a.startingPrice)}</td>
                      <td>{a.finalPrice !== null ? money(a.finalPrice) : '-'}</td>
                      <td>{a.winner ?? '-'}</td>
                      <td>{a.commission !== null ? money(a.commission) : '-'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr data-testid="stat-summary">
                    <th colSpan={5}>Total ({data.summary.count})</th>
                    <th>{money(data.summary.totalStartingPrice)}</th>
                    <th>{money(data.summary.totalFinalPrice)}</th>
                    <th />
                    <th>{money(data.summary.totalCommission)}</th>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
