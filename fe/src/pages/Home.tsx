import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, type Auction } from '../api';
import { FIELD_LABELS, SORT_LABELS, browseApiQuery, browseParams, isFiltered, readBrowse, type Browse, type Sort } from '../browseQuery';
import { AuctionCard } from '../components/AuctionCard';
import { liveCountLabel, splitSections } from '../homeSections';
import { SegmentedTabs } from '../components/ui';

function Section({ id, title, empty, auctions, onElapsed }: { id: string; title: string; empty: string; auctions: Auction[]; onElapsed: () => void }) {
  return (
    <section aria-labelledby={id} data-testid={`section-${id}`} className="home-section">
      <h2 id={id}>
        {title} <span className="muted small">({auctions.length})</span>
      </h2>
      <LotGrid auctions={auctions} empty={empty} onElapsed={onElapsed} />
    </section>
  );
}

function LotGrid({ auctions, empty, onElapsed }: { auctions: Auction[]; empty: string; onElapsed: () => void }) {
  return auctions.length === 0 ? (
    <p className="muted">{empty}</p>
  ) : (
    <div className="lot-grid">
      {auctions.map((a) => (
        <AuctionCard key={a.id} auction={a} onElapsed={onElapsed} />
      ))}
    </div>
  );
}

export function HomePage() {
  const [params, setParams] = useSearchParams();
  const browse = readBrowse(params);
  const apiQuery = browseApiQuery(browse);
  const [auctions, setAuctions] = useState<Auction[] | null>(null);
  const [categories, setCategories] = useState<{ id: number; name: string }[]>([]);

  useEffect(() => {
    api<{ categories: { id: number; name: string }[] }>('/categories').then((r) => setCategories(r.categories));
  }, []);

  const load = useCallback(() => {
    api<{ auctions: Auction[]; justCompletedLimit: number }>(`/auctions${apiQuery}`).then((r) => setAuctions(r.auctions));
  }, [apiQuery]);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  // ui-1a.2: every change pushes a history entry, so Back restores the previous filter.
  const go = (next: Partial<Browse>) => setParams(browseParams({ ...browse, ...next }));
  const { trending, completed } = splitSections(auctions ?? []);
  const searching = !!browse.q;
  const filtered = isFiltered(browse);
  const chips = [
    { value: 'all', label: 'All' },
    { value: 'ending', label: 'Ending soon' },
    ...categories.map((c) => ({ value: String(c.id), label: c.name })),
  ];

  return (
    <div>
      <div className="chip-bar">
        <SegmentedTabs tabs={chips} value={browse.category || 'all'} onChange={(v) => go({ category: v === 'all' ? '' : v })} label="Categories" testId="category-chips" />
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
      {/* home-1.2: one 'Trending lots' section as in mockup 1a, the same for guests and customers. */}
      <section aria-labelledby="live" data-testid="section-live" className="home-section">
        <div className="browse-head">
          <div>
            <h1 id="live" className="browse-title">
              Trending lots
            </h1>
            {auctions && (
              // The cards refresh on a 30 s poll, not live, so the mockup's 'bids update in real time' is left out.
              <p className="muted browse-sub" data-testid="live-count">
                {liveCountLabel(trending.length)}
              </p>
            )}
          </div>
          <label className="sort-control">
            <span className="sort-label">Sort:</span>
            <select value={browse.sort} onChange={(e) => go({ sort: e.target.value as Sort })} data-testid="sort">
              {Object.entries(SORT_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        </div>
        {!auctions ? (
          <p className="muted">Loading auctions...</p>
        ) : (
          <LotGrid auctions={trending} empty={filtered ? 'No live auctions match.' : 'No auctions are live right now.'} onElapsed={load} />
        )}
      </section>
      {auctions && (
        <Section
          id="completed"
          title="Just completed"
          empty={filtered ? 'No completed auctions match.' : 'No recently completed auctions.'}
          auctions={completed}
          onElapsed={load}
        />
      )}
    </div>
  );
}
