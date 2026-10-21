export class ApiError extends Error {
  constructor(public status: number, message: string, public fields: Record<string, string> = {}) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: options.method ?? (options.body ? 'POST' : 'GET'),
    credentials: 'include',
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'Request failed', data.fields ?? {});
  return data as T;
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
