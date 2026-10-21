import { useEffect } from 'react';
import type { BidEvent } from '../api';
import { bidReceived, loadAuction } from './auctionSlice';
import { useAppDispatch } from './index';

/**
 * rt-001: listens to GET /api/auctions/:id/events while the page is open. EventSource reconnects by itself
 * after a drop; on every reconnect the auction is reloaded, so bids sent while disconnected are not missed.
 */
export function useAuctionEvents(auctionId: number | null) {
  const dispatch = useAppDispatch();
  useEffect(() => {
    if (auctionId == null || typeof EventSource === 'undefined') return;
    const source = new EventSource(`/api/auctions/${auctionId}/events`);
    let dropped = false;
    source.addEventListener('bid', (e) => {
      try {
        dispatch(bidReceived(JSON.parse((e as MessageEvent<string>).data) as BidEvent));
      } catch {
        // A malformed frame: ignore it; the next reload brings the page back in step.
      }
    });
    source.onerror = () => {
      dropped = true;
    };
    source.onopen = () => {
      if (dropped) {
        dropped = false;
        dispatch(loadAuction(auctionId));
      }
    };
    return () => source.close();
  }, [auctionId, dispatch]);
}
