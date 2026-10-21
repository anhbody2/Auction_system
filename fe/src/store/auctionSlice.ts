import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { ApiError, api, type Auction, type Bid, type BidEvent } from '../api';

/**
 * rt-001: the auction page's data. The bid panel, the facts box and the bid history all read from here,
 * so a bid from any source (own submit or a pushed event) updates every part of the page at once.
 */
export interface AuctionState {
  /** Id the page asked for; responses for any other id are dropped. */
  requestedId: number | null;
  auction: Auction | null;
  /** Highest first, as GET /api/auctions/:id/bids returns them. */
  bids: Bid[];
  loading: boolean;
  error: string;
}

export const initialState: AuctionState = { requestedId: null, auction: null, bids: [], loading: false, error: '' };

/** Loads (or quietly reloads) the auction and its bids. The page keeps showing old data while it runs. */
export const loadAuction = createAsyncThunk('auction/load', async (id: number, { rejectWithValue }) => {
  try {
    const [r, b] = await Promise.all([api<{ auction: Auction }>(`/auctions/${id}`), api<{ bids: Bid[] }>(`/auctions/${id}/bids`)]);
    return { auction: r.auction, bids: b.bids };
  } catch (e) {
    return rejectWithValue(e instanceof ApiError ? e.message : 'Failed to load auction');
  }
});

const auctionSlice = createSlice({
  name: 'auction',
  initialState,
  reducers: {
    /** A bid on the open auction, from the event stream or from the viewer's own POST. */
    bidReceived(state, action: PayloadAction<BidEvent>) {
      const ev = action.payload;
      const auction = state.auction;
      if (!auction || ev.auctionId !== auction.id) return;
      if (state.bids.some((b) => b.id === ev.bid.id)) return; // already applied (own POST and its pushed copy)
      const outbid = new Set(ev.outbidBidIds);
      for (const b of state.bids) if (outbid.has(b.id) || b.status === 'active') b.status = 'outbid';
      state.bids.unshift(ev.bid);
      auction.currentPrice = ev.currentPrice;
      auction.nextMinBid = ev.nextMinBid;
      auction.bidCount = ev.bidCount;
      auction.reserveMet = ev.reserveMet;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadAuction.pending, (state, action) => {
        if (state.requestedId !== action.meta.arg) {
          // A different auction: drop the old one so it is never shown under the new URL.
          Object.assign(state, initialState, { requestedId: action.meta.arg });
        }
        state.loading = true;
      })
      .addCase(loadAuction.fulfilled, (state, action) => {
        if (action.meta.arg !== state.requestedId) return;
        state.loading = false;
        state.error = '';
        state.auction = action.payload.auction;
        state.bids = action.payload.bids;
      })
      .addCase(loadAuction.rejected, (state, action) => {
        if (action.meta.arg !== state.requestedId) return;
        state.loading = false;
        state.error = (action.payload as string | undefined) ?? 'Failed to load auction';
      });
  },
});

export const { bidReceived } = auctionSlice.actions;
export const auctionReducer = auctionSlice.reducer;
