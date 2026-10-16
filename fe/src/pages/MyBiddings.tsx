import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, money, type Auction } from '../api';
import { Countdown } from '../components/AuctionBits';

type MyStatus = 'winning' | 'outbid' | 'won' | 'lost' | 'cancelled';
interface Item {
  auction: Auction;
  myLatestBid: number;
  myLatestBidAt: string;
  myStatus: MyStatus;
}

const FILTERS: ('all' | MyStatus)[] = ['all', 'winning', 'outbid', 'won', 'lost', 'cancelled'];

export function MyBiddingsPage() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('all');

  useEffect(() => {
    api<{ items: Item[] }>('/me/bids').then((r) => setItems(r.items));
  }, []);

  const shown = items?.filter((i) => filter === 'all' || i.myStatus === filter) ?? [];
  const count = (f: (typeof FILTERS)[number]) => items?.filter((i) => f === 'all' || i.myStatus === f).length ?? 0;

  return (
    <div>
      <h1>My biddings</h1>
      <div className="tabs" role="tablist" aria-label="Filter by outcome">
        {FILTERS.map((f) => (
          <button key={f} role="tab" aria-selected={filter === f} className={filter === f ? 'tab active' : 'tab'} onClick={() => setFilter(f)}>
            {f[0].toUpperCase() + f.slice(1)} ({count(f)})
          </button>
        ))}
      </div>
      {!items ? (
        <p className="muted">Loading...</p>
      ) : shown.length === 0 ? (
        <p className="muted">
          {items.length === 0 ? (
            <>
              You haven't bid on anything yet. <Link to="/">Browse auctions</Link>
            </>
          ) : (
            'Nothing here.'
          )}
        </p>
      ) : (
        <div className="table-wrap">
          <table data-testid="my-bids">
            <thead>
              <tr>
                <th>Auction</th>
                <th>My latest bid</th>
                <th>Highest bid</th>
                <th>Status</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((i) => (
                <tr key={i.auction.id} data-testid={`my-bid-${i.auction.id}`}>
                  <td>
                    <Link to={`/auctions/${i.auction.id}`}>{i.auction.name}</Link>
                    <div className="muted small">by {i.auction.seller.username}</div>
                  </td>
                  <td data-testid="my-latest">{money(i.myLatestBid)}</td>
                  <td data-testid="highest">{money(i.auction.currentPrice)}</td>
                  <td>
                    <span className={`badge badge-${i.myStatus}`} data-testid="my-status">
                      {i.myStatus}
                    </span>
                  </td>
                  <td>
                    <Countdown status={i.auction.status} startTime={i.auction.startTime} endTime={i.auction.endTime} />
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
