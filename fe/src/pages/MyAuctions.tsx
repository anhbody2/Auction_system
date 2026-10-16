import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, money, type Auction, type AuctionStatus } from '../api';
import { Countdown, StatusBadge } from '../components/AuctionBits';

const FILTERS: ('all' | AuctionStatus)[] = ['all', 'active', 'upcoming', 'ended', 'cancelled'];

export function MyAuctionsPage() {
  const [auctions, setAuctions] = useState<Auction[] | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('all');

  useEffect(() => {
    api<{ auctions: Auction[] }>('/me/auctions').then((r) => setAuctions(r.auctions));
  }, []);

  const shown = auctions?.filter((a) => filter === 'all' || a.status === filter) ?? [];
  const count = (f: (typeof FILTERS)[number]) => auctions?.filter((a) => f === 'all' || a.status === f).length ?? 0;

  return (
    <div>
      <div className="row spread">
        <h1>My auctions</h1>
        <Link to="/auctions/new" className="btn btn-primary">
          + New auction
        </Link>
      </div>
      <div className="tabs" role="tablist" aria-label="Filter by status">
        {FILTERS.map((f) => (
          <button key={f} role="tab" aria-selected={filter === f} className={filter === f ? 'tab active' : 'tab'} onClick={() => setFilter(f)}>
            {f[0].toUpperCase() + f.slice(1)} ({count(f)})
          </button>
        ))}
      </div>
      {!auctions ? (
        <p className="muted">Loading...</p>
      ) : shown.length === 0 ? (
        <p className="muted">{auctions.length === 0 ? "You haven't created any auctions yet." : 'No auctions in this state.'}</p>
      ) : (
        <div className="table-wrap">
          <table data-testid="my-auctions">
            <thead>
              <tr>
                <th>Auction</th>
                <th>Status</th>
                <th>Highest bid</th>
                <th>Bids</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((a) => (
                <tr key={a.id} data-testid={`my-auction-${a.id}`}>
                  <td>
                    <Link to={`/auctions/${a.id}`}>{a.name}</Link>
                  </td>
                  <td>
                    <StatusBadge status={a.status} />
                  </td>
                  <td data-testid="highest-bid">{a.currentPrice ? money(a.currentPrice) : <span className="muted">No bids</span>}</td>
                  <td>{a.bidCount}</td>
                  <td>
                    <Countdown status={a.status} startTime={a.startTime} endTime={a.endTime} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
