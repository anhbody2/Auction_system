import { useEffect } from 'react';
import { creditReviewedToast, goodsReviewedToast, type CreditRequestUserEvent, type GoodsReviewedEvent } from '../requestToasts';
import { useToast } from '../toast';
import { openAuthedStream } from './authedStream';
import { auctionFinished, creditLoaded, outbid, refreshCredit } from './creditSlice';
import { useAppDispatch } from './index';

/**
 * crd-003: the signed-in customer's own events (GET /api/me/events): 'outbid' lowers locked credit,
 * 'auction-finished' fetches credit again. After a dropped connection credit is fetched once on reconnect,
 * since events sent meanwhile are lost. sec-003: the stream is reopened after the session is renewed.
 * stf-010: approval decisions on the user's goods and credit requests show a toast on any page.
 */
export function useUserEvents(enabled: boolean, userId: number | undefined) {
  const dispatch = useAppDispatch();
  const toast = useToast();
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
        const data = JSON.parse((e as MessageEvent<string>).data) as CreditRequestUserEvent;
        dispatch(creditLoaded({ credit: Number(data.balance), locked: Number(data.held) }));
        window.dispatchEvent(new CustomEvent('credit-request-reviewed', { detail: data }));
        const message = creditReviewedToast(data);
        if (message) toast(message.text, message.kind);
      });
      // stf-010: staff approved or rejected goods; My Goods and the create-auction form listen for the window event.
      source.addEventListener('goods-reviewed', (e) => {
        const data = JSON.parse((e as MessageEvent<string>).data) as GoodsReviewedEvent;
        const message = goodsReviewedToast(data);
        toast(message.text, message.kind);
        window.dispatchEvent(new CustomEvent<GoodsReviewedEvent>('goods-reviewed', { detail: data }));
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
  }, [enabled, userId, dispatch, toast]);
}
