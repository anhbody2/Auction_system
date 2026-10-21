import axios, { AxiosError, type AxiosRequestConfig } from 'axios';

export class ApiError extends Error {
  constructor(public status: number, message: string, public fields: Record<string, string> = {}) {
    super(message);
  }
}

export const NETWORK_ERROR = 'Could not reach the server. Check your connection and try again.';

/**
 * sys-004: the one HTTP client for the API (see docs/api-client.md). Cookies go with every call;
 * SSE streams stay on EventSource (store/use*Events.ts).
 */
export const http = axios.create({ baseURL: '/api', withCredentials: true });

let onUnauthorized: (() => void) | null = null;
/** Registered by AuthProvider: a 401 from a protected call signs the user out. Returns an unregister function. */
export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
  return () => {
    if (onUnauthorized === handler) onUnauthorized = null;
  };
}

/** /auth/* answer 401 as part of their normal flow (wrong password, guest probe), so they never sign anyone out. */
const isAuthCall = (url = '') => /^\/?auth\//.test(url);

/** Every error leaves the client as the existing ApiError (status, server message, field errors). */
export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  if (err instanceof AxiosError) {
    if (!err.response) return new ApiError(0, NETWORK_ERROR);
    const data = (err.response.data ?? {}) as { error?: string; fields?: Record<string, string> };
    return new ApiError(err.response.status, data.error ?? 'Request failed', data.fields ?? {});
  }
  return new ApiError(0, err instanceof Error ? err.message : 'Request failed');
}

http.interceptors.response.use(undefined, (err: unknown) => {
  const apiError = toApiError(err);
  if (apiError.status === 401 && err instanceof AxiosError && !isAuthCall(err.config?.url)) onUnauthorized?.();
  return Promise.reject(apiError);
});

export async function api<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown; config?: AxiosRequestConfig } = {},
): Promise<T> {
  const res = await http.request<T>({
    url: path,
    method: options.method ?? (options.body ? 'POST' : 'GET'),
    data: options.body,
    ...options.config,
  });
  return res.data;
}

export interface User {
  id: number;
  email: string;
  username: string;
  role: string;
  status: string;
  emailVerified: boolean;
  creditBalance: number;
  heldBalance: number;
  fullName: string | null;
  phone: string | null;
  address: string | null;
  permissions: string[];
}

export type AuctionStatus = 'upcoming' | 'active' | 'ended' | 'cancelled';

export interface Auction {
  id: number;
  name: string;
  description: string | null;
  seller: { id: number; username: string };
  isOwner: boolean;
  goods: { id: number; name: string; condition: string | null; category: { id: number; name: string } | null; images: string[] };
  initialPrice: number;
  reservePrice?: number | null;
  hasReserve: boolean;
  reserveMet: boolean;
  currentPrice: number | null;
  nextMinBid: number | null;
  bidCount: number;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  status: AuctionStatus;
  winner: { id: number; username: string } | null;
  cancelledAt: string | null;
  closedAt: string | null;
  createdAt: string;
}

export interface Bid {
  id: number;
  amount: number;
  status: string;
  createdAt: string;
  bidder: { id: number; username: string };
}

/** rt-001: pushed on GET /api/auctions/:id/events and returned by POST /api/auctions/:id/bids. */
export interface BidEvent {
  auctionId: number;
  bid: Bid & { status: 'active' };
  /** Bids this one moved from 'active' to 'outbid'. */
  outbidBidIds: number[];
  currentPrice: number;
  nextMinBid: number;
  bidCount: number;
  reserveMet: boolean;
}

export const CONDITION_LABELS: Record<string, string> = {
  new: 'New',
  like_new: 'Like new',
  used: 'Used',
  for_parts: 'For parts',
};

export const money =(n: number | null | undefined) =>
  n == null ? '-' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** gds-001: status is derived from the goods' auctions. */
export type GoodsStatus = 'available' | 'in_auction' | 'sold';

export interface Goods {
  id: number;
  name: string;
  description: string | null;
  condition: string | null;
  category: { id: number; name: string } | null;
  images: string[];
  status: GoodsStatus;
  /** gds-003: the signed-in user won these goods in an auction (shown as 'Bought'; they can auction them again). */
  bought: boolean;
  /** gds-002: why Edit and Delete are off, or null. */
  lockedReason: string | null;
  auctionId: number | null;
  createdAt: string;
  updatedAt: string;
}

export const GOODS_STATUS_LABELS: Record<GoodsStatus, string> = {
  available: 'available',
  in_auction: 'in auction',
  sold: 'sold',
};
