import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, type Auction } from '../api';
import { useAuth } from '../auth';
import { FIELD_LABELS, SORT_LABELS, browseApiQuery, browseParams, isFiltered, readBrowse, type Browse, type Sort } from '../browseQuery';
import { AuctionCard } from '../components/AuctionCard';
import { SegmentedTabs } from '../components/ui';

function Section({ id, title, empty, auctions, onElapsed }: { id: string; title: string; empty: string; auctions: Auction[]; onElapsed: () => void }) {
  return (
    <section aria-labelledby={id} data-testid={`section-${id}`}>
      <h2 id={id}>
        {title} <span className="muted small">({auctions.length})</span>
      </h2>
      {auctions.length === 0 ? (
        <p className="muted">{empty}</p>
      ) : (
        <div className="lot-grid">
          {auctions.map((a) => (
            <AuctionCard key={a.id} auction={a} onElapsed={onElapsed} onChanged={onElapsed} />
          ))}
        </div>
      )}
    </section>
  );
}

export function HomePage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const browse = readBrowse(params);
  const apiQuery = browseApiQuery(browse);
  const [auctions, setAuctions] = useState<Auction[] | null>(null);
  const [days, setDays] = useState(7);
  const [categories, setCategories] = useState<{ id: number; name: string }[]>([]);

  useEffect(() => {
    api<{ categories: { id: number; name: string }[] }>('/categories').then((r) => setCategories(r.categories));
  }, []);

  const load = useCallback(() => {
    api<{ auctions: Auction[]; justCompletedDays: number }>(`/auctions${apiQuery}`).then((r) => {
      setAuctions(r.auctions);
      setDays(r.justCompletedDays);
    });
  }, [apiQuery]);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  // ui-1a.2: every change pushes a history entry, so Back restores the previous filter.
  const go = (next: Partial<Browse>) => setParams(browseParams({ ...browse, ...next }));
  const by = (s: Auction['status']) => auctions?.filter((a) => a.status === s) ?? [];
  const searching = !!browse.q;
  const filtered = isFiltered(browse);
  const chips = [
    { value: 'all', label: 'All' },
    { value: 'ending', label: 'Ending soon' },
    ...categories.map((c) => ({ value: String(c.id), label: c.name })),
  ];
  const liveCount = by('active').length;

  return (
    <div>
      <div className="chip-bar">
        <SegmentedTabs tabs={chips} value={browse.category || 'all'} onChange={(v) => go({ category: v === 'all' ? '' : v })} label="Categories" testId="category-chips" />
      </div>
      <div className="hero browse-head">
        <div>
          <h1>Find something worth bidding on</h1>
          {auctions && (
            <p className="muted small" data-testid="live-count">
              {liveCount.toLocaleString('en-US')} live auction{liveCount === 1 ? '' : 's'}
            </p>
          )}
          <p className="muted">
            {user ? (
              <>
                Signed in as {user.username}. <Link to="/auctions/new">Sell an item</Link>
              </>
            ) : (
              <>
                Browse freely. <Link to="/register">Create an account</Link> or <Link to="/login">log in</Link> to bid.
              </>
            )}
          </p>
        </div>
        <label className="sort-control">
          <span className="muted small">Sort by</span>
          <select value={browse.sort} onChange={(e) => go({ sort: e.target.value as Sort })} data-testid="sort">
            {Object.entries(SORT_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>
      {searching && auctions && (
        <p data-testid="search-summary" className="row">
          <span>
            {auctions.length} result{auctions.length === 1 ? '' : 's'} for <strong>"{browse.q}"</strong> in {FIELD_LABELS[browse.field].toLowerCase()}
          </span>
          <button className="btn btn-ghost btn-small" type="button" onClick={() => go({ q: '', field: 'all' })}>
            Clear
          </button>
        </p>
      )}
      {filtered && auctions?.length === 0 && (
        <div className="empty-state" data-testid="no-match">
          <p>No lots match.</p>
          <button className="btn btn-primary" type="button" onClick={() => setParams({})}>
            Clear filters
          </button>
        </div>
      )}
      {!auctions ? (
        <p className="muted">Loading auctions...</p>
      ) : (
        <>
          <Section id="live" title="Live auctions" empty={filtered ? 'No live auctions match.' : 'No auctions are live right now.'} auctions={by('active')} onElapsed={load} />
          <Section id="upcoming" title="Starting soon" empty={filtered ? 'No upcoming auctions match.' : 'Nothing scheduled yet.'} auctions={by('upcoming')} onElapsed={load} />
          <Section
            id="completed"
            title={`Just completed (last ${days} days)`}
            empty={filtered ? 'No completed auctions match.' : 'No recently completed auctions.'}
            auctions={by('ended')}
            onElapsed={load}
          />
        </>
      )}
    </div>
  );
}
