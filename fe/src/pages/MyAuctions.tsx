import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, money, type Auction } from '../api';
import { Countdown, StatusBadge } from '../components/AuctionBits';

export function MyAuctionsPage() {
  const [auctions, setAuctions] = useState<Auction[] | null>(null);

  useEffect(() => {
    api<{ auctions: Auction[] }>('/me/auctions').then((r) => setAuctions(r.auctions));
  }, []);

  return (
    <div>
      <div className="row spread">
        <h1>My auctions</h1>
        <Link to="/auctions/new" className="btn btn-primary">
          + New auction
        </Link>
      </div>
      {!auctions ? (
        <p className="muted">Loading...</p>
      ) : auctions.length === 0 ? (
        <p className="muted">You haven't created any auctions yet.</p>
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
              {auctions.map((a) => (
                <tr key={a.id}>
                  <td>
                    <Link to={`/auctions/${a.id}`}>{a.name}</Link>
                  </td>
                  <td>
                    <StatusBadge status={a.status} />
                  </td>
                  <td>{a.currentPrice ? money(a.currentPrice) : <span className="muted">No bids</span>}</td>
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
