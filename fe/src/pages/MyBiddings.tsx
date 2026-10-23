import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, money } from '../api';
import { CREDIT_LABELS, RESULT, winRate, type BidHistoryItem, type BidTotals, type MyStatus } from '../bidHistory';
import { Pill } from '../components/ui';

const FILTERS: ('all' | MyStatus)[] = ['all', 'winning', 'outbid', 'won', 'lost', 'cancelled'];

/** ui-3a.1: 'Bid history' from the 3a mockup: totals, then one row per lot with my bid, credit state and result. */
export function MyBiddingsPage() {
  const [items, setItems] = useState<BidHistoryItem[] | null>(null);
  const [totals, setTotals] = useState<BidTotals | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('all');

  useEffect(() => {
    api<{ items: BidHistoryItem[]; totals: BidTotals }>('/me/bids').then((r) => {
      setItems(r.items);
      setTotals(r.totals);
    });
  }, []);

  const shown = items?.filter((i) => filter === 'all' || i.myStatus === filter) ?? [];
  const count = (f: (typeof FILTERS)[number]) => items?.filter((i) => f === 'all' || i.myStatus === f).length ?? 0;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Bid history</h1>
          <p className="muted">Every bid you've placed, newest first.</p>
        </div>
        {totals && (
          <dl className="page-totals">
            <div>
              <dt>Bids placed</dt>
              <dd data-testid="bids-placed">{totals.bidsPlaced}</dd>
            </div>
            <div>
              <dt>Win rate</dt>
              <dd data-testid="win-rate">{winRate(totals)}</dd>
            </div>
          </dl>
        )}
      </div>
      <div className="tabs" role="tablist" aria-label="Filter by outcome">
        {FILTERS.map((f) => (
          <button key={f} role="tab" aria-selected={filter === f} className={filter === f ? 'tab active' : 'tab'} onClick={() => setFilter(f)}>
            {f === 'all' ? 'All' : RESULT[f].label} ({count(f)})
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
          <table data-testid="my-bids" className="history-table">
            <thead>
              <tr>
                <th>Lot</th>
                <th>Your bid</th>
                <th>Final / highest</th>
                <th>Placed</th>
                <th>Credit</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((i) => (
                <tr key={i.auction.id} data-testid={`my-bid-${i.auction.id}`}>
                  <td>
                    <div className="history-lot">
                      {i.auction.goods.images[0] ? <img src={i.auction.goods.images[0]} alt="" className="owned-thumb" /> : <span className="owned-thumb lot-thumb-empty" aria-hidden="true" />}
                      <div>
                        <Link to={`/auctions/${i.auction.id}`}>{i.auction.name}</Link>
                        <div className="muted small">
                          Lot #{i.auction.id} · by {i.auction.seller.username}
                          {i.bidCount > 1 && ` · ${i.bidCount} bids`}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td data-testid="my-latest">{money(i.myLatestBid)}</td>
                  <td data-testid="highest">{money(i.auction.currentPrice)}</td>
                  <td className="muted small" data-testid="placed">
                    {new Date(i.myLatestBidAt).toLocaleString()}
                  </td>
                  <td data-testid="credit-state" data-state={i.creditState}>
                    {CREDIT_LABELS[i.creditState]}
                  </td>
                  <td>
                    <Pill tone={RESULT[i.myStatus].tone} testId="my-status">
                      {RESULT[i.myStatus].label}
                    </Pill>
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
