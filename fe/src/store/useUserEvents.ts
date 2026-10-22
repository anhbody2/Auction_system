import { useEffect } from 'react';
import { openAuthedStream } from './authedStream';
import { auctionFinished, creditLoaded, outbid, refreshCredit } from './creditSlice';
import { useAppDispatch } from './index';

/**
 * crd-003: the signed-in customer's own events (GET /api/me/events): 'outbid' lowers locked credit,
 * 'auction-finished' fetches credit again. After a dropped connection credit is fetched once on reconnect,
 * since events sent meanwhile are lost. sec-003: the stream is reopened after the session is renewed.
 */
export function useUserEvents(enabled: boolean, userId: number | undefined) {
  const dispatch = useAppDispatch();
  useEffect(() => {
    if (!enabled || userId == null || typeof EventSource === 'undefined') return;
    let dropped = false;
    return openAuthedStream('/api/me/events', (source) => {
      source.addEventListener('outbid', (e) => {
        const data = JSON.parse((e as MessageEvent<string>).data) as { releasedAmount: number };
        dispatch(outbid({ amount: data.releasedAmount }));
      });
      source.addEventListener('auction-finished', (e) => {
        dispatch(auctionFinished(JSON.parse((e as MessageEvent<string>).data) as { auctionId: number }));
      });
      // stf-007: staff reviewed a top-up/withdrawal request; the event carries the new figures.
      source.addEventListener('credit-request', (e) => {
        const data = JSON.parse((e as MessageEvent<string>).data) as { balance: number; held: number };
        dispatch(creditLoaded({ credit: Number(data.balance), locked: Number(data.held) }));
        window.dispatchEvent(new CustomEvent('credit-request-reviewed', { detail: data }));
      });
      source.onerror = () => {
        dropped = true;
      };
      source.onopen = () => {
        if (dropped) {
          dropped = false;
          dispatch(refreshCredit());
        }
      };
    });
  }, [enabled, userId, dispatch]);
}
