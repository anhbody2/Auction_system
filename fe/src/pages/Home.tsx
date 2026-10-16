import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, type Auction } from '../api';
import { useAuth } from '../auth';
import { AuctionCard } from '../components/AuctionCard';
import { FIELD_LABELS, SearchTools, type Search, type SearchField } from '../components/SearchTools';

function Section({ id, title, empty, auctions, onElapsed }: { id: string; title: string; empty: string; auctions: Auction[]; onElapsed: () => void }) {
  return (
    <section aria-labelledby={id} data-testid={`section-${id}`}>
      <h2 id={id}>
        {title} <span className="muted small">({auctions.length})</span>
      </h2>
      {auctions.length === 0 ? (
        <p className="muted">{empty}</p>
      ) : (
        <div className="grid">
          {auctions.map((a) => (
            <AuctionCard key={a.id} auction={a} onElapsed={onElapsed} />
          ))}
        </div>
      )}
    </section>
  );
}

export function HomePage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const search: Search = { q: params.get('q') ?? '', field: (params.get('field') as SearchField) || 'all' };
  const [auctions, setAuctions] = useState<Auction[] | null>(null);
  const [days, setDays] = useState(7);

  const load = useCallback(() => {
    const qs = search.q ? `?${new URLSearchParams({ q: search.q, field: search.field })}` : '';
    api<{ auctions: Auction[]; justCompletedDays: number }>(`/auctions${qs}`).then((r) => {
      setAuctions(r.auctions);
      setDays(r.justCompletedDays);
    });
  }, [search.q, search.field]);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  const onSearch = (s: Search) => setParams(s.q ? { q: s.q, field: s.field } : {});
  const by = (s: Auction['status']) => auctions?.filter((a) => a.status === s) ?? [];
  const searching = !!search.q;

  return (
    <div>
      <div className="hero">
        <h1>Find something worth bidding on</h1>
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
      <SearchTools value={search} onSearch={onSearch} />
      {searching && auctions && (
        <p data-testid="search-summary">
          {auctions.length} result{auctions.length === 1 ? '' : 's'} for <strong>"{search.q}"</strong> in {FIELD_LABELS[search.field].toLowerCase()}
        </p>
      )}
      {!auctions ? (
        <p className="muted">Loading auctions...</p>
      ) : (
        <>
          <Section id="live" title="Live auctions" empty={searching ? 'No live auctions match.' : 'No auctions are live right now.'} auctions={by('active')} onElapsed={load} />
          <Section id="upcoming" title="Starting soon" empty={searching ? 'No upcoming auctions match.' : 'Nothing scheduled yet.'} auctions={by('upcoming')} onElapsed={load} />
          <Section
            id="completed"
            title={`Just completed (last ${days} days)`}
            empty={searching ? 'No completed auctions match.' : 'No recently completed auctions.'}
            auctions={by('ended')}
            onElapsed={load}
          />
        </>
      )}
    </div>
  );
}
