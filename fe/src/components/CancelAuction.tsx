import { useState } from 'react';
import { ApiError, api, type Auction } from '../api';
import { useToast } from '../toast';

export function CancelAuction({ auction, onDone }: { auction: Auction; onDone: () => void }) {
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!auction.isOwner || (auction.status !== 'active' && auction.status !== 'upcoming')) return null;

  const cancel = async () => {
    setBusy(true);
    try {
      await api(`/auctions/${auction.id}/cancel`, { method: 'POST' });
      toast('Auction cancelled', 'success');
      onDone();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Cancel failed', 'error');
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <div className="cancel-box">
      {confirming ? (
        <>
          <p className="small">
            Cancel this auction?{auction.bidCount > 0 && ` All ${auction.bidCount} bid(s) will be voided and bidders' held credit released.`}
          </p>
          <div className="row">
            <button className="btn btn-danger" onClick={cancel} disabled={busy}>
              Yes, cancel auction
            </button>
            <button className="btn btn-ghost" onClick={() => setConfirming(false)}>
              Keep it
            </button>
          </div>
        </>
      ) : (
        <button className="btn btn-ghost" onClick={() => setConfirming(true)}>
          Cancel auction
        </button>
      )}
    </div>
  );
}
