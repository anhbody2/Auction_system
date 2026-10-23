import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, money, type Auction } from '../api';
import { RESULT_LABELS, isTab, myAuctionsTabs, type MyAuctionsTab, type MyBidItem } from '../myAuctionsTabs';
import { useCredit } from '../store/useCredit';
import { Countdown } from './AuctionBits';
import { Card, Pill, SegmentedTabs } from './ui';

/**
 * ui-2a.3: 'My auctions' on the dashboard with Bidding / Selling / Ended tabs (counts in the labels, the tab
 * kept in ?tab=). Rows link to the lot; 'Outbid · Rebid' opens it with the bid input focused.
 */
export function MyAuctionsCard() {
  const [params, setParams] = useSearchParams();
  const tab: MyAuctionsTab = isTab(params.get('tab')) ? (params.get('tab') as MyAuctionsTab) : 'bidding';
  const [bids, setBids] = useState<MyBidItem[] | null>(null);
  const [mine, setMine] = useState<Auction[] | null>(null);
  const { locked } = useCredit();

  const load = useCallback(() => {
    api<{ items: MyBidItem[] }>('/me/bids').then((r) => setBids(r.items));
    api<{ auctions: Auction[] }>('/me/auctions').then((r) => setMine(r.auctions));
  }, []);
  // Locked credit moves on an own bid, an outbid and a settlement: the standings move with it.
  useEffect(load, [load, locked]);

  const data = bids && mine ? myAuctionsTabs(bids, mine) : null;
  const tabs = [
    { value: 'bidding' as const, label: 'Bidding', count: data?.bidding.length },
    { value: 'selling' as const, label: 'Selling', count: data?.selling.length },
    { value: 'ended' as const, label: 'Ended', count: data?.ended.length },
  ];

  return (
    <Card
      title="My auctions"
      actions={<SegmentedTabs tabs={tabs} value={tab} onChange={(v) => setParams((p) => ({ ...Object.fromEntries(p), tab: v }))} label="My auctions" testId="my-auctions-tabs" />}
      testId="my-auctions-card"
    >
      {!data ? (
        <p className="muted">Loading...</p>
      ) : (
        <div className="table-wrap" role="tabpanel" aria-label={tab}>
          {tab === 'bidding' &&
            (data.bidding.length === 0 ? (
              <p className="muted dash-empty">You are not bidding on anything right now.</p>
            ) : (
              <table data-testid="tab-bidding">
                <thead>
                  <tr>
                    <th>Lot</th>
                    <th>Highest</th>
                    <th>Your bid</th>
                    <th>Time left</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.bidding.map((b) => (
                    <tr key={b.auction.id} data-testid={`row-${b.auction.id}`}>
                      <td>
                        <Link to={`/auctions/${b.auction.id}`}>{b.auction.name}</Link>
                      </td>
                      <td>{money(b.auction.currentPrice)}</td>
                      <td>{money(b.myLatestBid)}</td>
                      <td>
                        <Countdown status={b.auction.status} startTime={b.auction.startTime} endTime={b.auction.endTime} onElapsed={load} />
                      </td>
                      <td>
                        {b.myStatus === 'winning' ? (
                          <Pill tone="steel" testId="standing">
                            Leading
                          </Pill>
                        ) : (
                          <Link to={`/auctions/${b.auction.id}?bid=1`} className="ui-pill ui-pill-cream" data-testid="standing">
                            Outbid · Rebid
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}
          {tab === 'selling' &&
            (data.selling.length === 0 ? (
              <p className="muted dash-empty">
                Nothing for sale right now. <Link to="/auctions/new">Sell an item</Link>
              </p>
            ) : (
              <table data-testid="tab-selling">
                <thead>
                  <tr>
                    <th>Lot</th>
                    <th>Highest</th>
                    <th>Bids</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {data.selling.map((a) => (
                    <tr key={a.id} data-testid={`row-${a.id}`}>
                      <td>
                        <Link to={`/auctions/${a.id}`}>{a.name}</Link>
                      </td>
                      <td>{a.currentPrice ? money(a.currentPrice) : <span className="muted">Starts {money(a.initialPrice)}</span>}</td>
                      <td>{a.bidCount}</td>
                      <td>
                        <Countdown status={a.status} startTime={a.startTime} endTime={a.endTime} onElapsed={load} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}
          {tab === 'ended' &&
            (data.ended.length === 0 ? (
              <p className="muted dash-empty">No ended auctions yet.</p>
            ) : (
              <table data-testid="tab-ended">
                <thead>
                  <tr>
                    <th>Lot</th>
                    <th>Final</th>
                    <th>Your bid</th>
                    <th>Ended</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {data.ended.map((e) => (
                    <tr key={`${e.side}-${e.auction.id}`} data-testid={`row-${e.auction.id}`}>
                      <td>
                        <Link to={`/auctions/${e.auction.id}`}>{e.auction.name}</Link>
                      </td>
                      <td>{money(e.auction.currentPrice ?? e.auction.initialPrice)}</td>
                      <td>{e.myBid == null ? <span className="muted">Your lot</span> : money(e.myBid)}</td>
                      <td>{new Date(e.auction.endTime).toLocaleDateString()}</td>
                      <td>
                        <Pill tone={e.result === 'won' || e.result === 'sold' ? 'navy' : 'muted'} testId="result">
                          {RESULT_LABELS[e.result]}
                        </Pill>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}
        </div>
      )}
    </Card>
  );
}
