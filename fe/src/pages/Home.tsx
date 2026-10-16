import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Auction } from '../api';
import { useAuth } from '../auth';
import { AuctionCard } from '../components/AuctionCard';

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
  const [auctions, setAuctions] = useState<Auction[] | null>(null);
  const [days, setDays] = useState(7);

  const load = useCallback(() => {
    api<{ auctions: Auction[]; justCompletedDays: number }>('/auctions').then((r) => {
      setAuctions(r.auctions);
      setDays(r.justCompletedDays);
    });
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  const by = (s: Auction['status']) => auctions?.filter((a) => a.status === s) ?? [];

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
      {!auctions ? (
        <p className="muted">Loading auctions...</p>
      ) : (
        <>
          <Section id="live" title="Live auctions" empty="No auctions are live right now." auctions={by('active')} onElapsed={load} />
          <Section id="upcoming" title="Starting soon" empty="Nothing scheduled yet." auctions={by('upcoming')} onElapsed={load} />
          <Section id="completed" title={`Just completed (last ${days} days)`} empty="No recently completed auctions." auctions={by('ended')} onElapsed={load} />
        </>
      )}
    </div>
  );
}
