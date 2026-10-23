import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, money } from '../api';
import { CREDIT_LABELS, RESULT, winRate, type BidHistoryItem, type BidTotals } from '../bidHistory';
import { HISTORY_TABS, filterHistory, isHistoryTab, tabCounts, type HistoryTab } from '../bidHistoryFilter';
import { Pill, SearchInput, SegmentedTabs } from '../components/ui';

/** ui-3a.1: 'Bid history' from the 3a mockup: totals, then one row per lot with my bid, credit state and result. */
export function MyBiddingsPage() {
  const [items, setItems] = useState<BidHistoryItem[] | null>(null);
  const [totals, setTotals] = useState<BidTotals | null>(null);
  // ui-3a.2: tab and lot search live in the URL; a tab change is a history step, typing replaces the entry.
  const [params, setParams] = useSearchParams();
  const tab: HistoryTab = isHistoryTab(params.get('tab')) ? (params.get('tab') as HistoryTab) : 'all';
  const q = params.get('q') ?? '';
  const update = (next: { tab?: HistoryTab; q?: string }, replace = false) => {
    const t = next.tab ?? tab;
    const text = next.q ?? q;
    setParams({ ...(t !== 'all' ? { tab: t } : {}), ...(text ? { q: text } : {}) }, { replace });
  };

  useEffect(() => {
    api<{ items: BidHistoryItem[]; totals: BidTotals }>('/me/bids').then((r) => {
      setItems(r.items);
      setTotals(r.totals);
    });
  }, []);

  const shown = items ? filterHistory(items, tab, q) : [];
  const counts = items ? tabCounts(items, q) : null;

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
      <div className="history-tools">
        <SegmentedTabs
          tabs={HISTORY_TABS.map((t) => ({ ...t, count: counts?.[t.value] }))}
          value={tab}
          onChange={(v) => update({ tab: v })}
          label="Filter by result"
          testId="history-tabs"
        />
        <div className="history-search">
          <SearchInput value={q} onChange={(v) => update({ q: v }, true)} placeholder="Search lots" label="Search lots" testId="history-search" />
        </div>
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
            <span data-testid="no-match">No bids match.</span>
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
