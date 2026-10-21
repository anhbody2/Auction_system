import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { api } from '../api';

/**
 * crd-003: the navbar and dashboard credit figures.
 *  - credit: loaded with the page (from the signed-in user), after a deposit or withdrawal, and when an
 *    auction the user is in finishes. Bids never change it.
 *  - locked: changes straight away when the user bids (up) or is outbid (down).
 */
export interface CreditState {
  credit: number | null;
  locked: number | null;
}

export const initialCreditState: CreditState = { credit: null, locked: null };

const cents = (n: number) => Math.round(n * 100) / 100;

/** Fetches credit and locked credit again (GET /api/credit). */
export const refreshCredit = createAsyncThunk('credit/refresh', async () => {
  const s = await api<{ balance: number; held: number }>('/credit');
  return { credit: s.balance, locked: s.held };
});

/** 'auction-finished' on the user's event stream: settlement may have moved credit, so fetch it again. */
export const auctionFinished = createAsyncThunk('credit/auctionFinished', async (_event: { auctionId: number }, { dispatch }) => {
  await dispatch(refreshCredit());
});

const creditSlice = createSlice({
  name: 'credit',
  initialState: initialCreditState,
  reducers: {
    creditLoaded(_state, action: PayloadAction<{ credit: number; locked: number }>) {
      return { credit: action.payload.credit, locked: action.payload.locked };
    },
    creditCleared() {
      return initialCreditState;
    },
    /** The user's own bid: `released` is their earlier hold on the same auction, freed when they raise. */
    bidPlaced(state, action: PayloadAction<{ amount: number; released: number }>) {
      if (state.locked == null) return;
      state.locked = cents(state.locked + action.payload.amount - action.payload.released);
    },
    /** Someone outbid the user: their hold on that auction is released. */
    outbid(state, action: PayloadAction<{ amount: number }>) {
      if (state.locked == null) return;
      state.locked = Math.max(0, cents(state.locked - action.payload.amount));
    },
  },
  extraReducers: (builder) => {
    builder.addCase(refreshCredit.fulfilled, (_state, action) => action.payload);
  },
});

export const { creditLoaded, creditCleared, bidPlaced, outbid } = creditSlice.actions;
export const creditReducer = creditSlice.reducer;
