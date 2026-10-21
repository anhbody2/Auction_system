import { describe, expect, it } from 'vitest';
import { newTagLabel } from './AuctionBits';

describe('sell-007 newTagLabel', () => {
  const start = '2026-10-21T10:00:00.000Z';
  const at = (iso: string) => new Date(iso).getTime();

  it("is 'New' for an upcoming auction before its start time", () => {
    expect(newTagLabel('upcoming', start, at('2026-10-21T09:59:59.000Z'))).toBe('New');
  });

  it('is gone once now reaches the start time, even if the stored status is still upcoming', () => {
    expect(newTagLabel('upcoming', start, at('2026-10-21T10:00:00.000Z'))).toBeNull();
    expect(newTagLabel('upcoming', start, at('2026-10-21T11:00:00.000Z'))).toBeNull();
  });

  it('never shows for active, ended or cancelled auctions', () => {
    for (const status of ['active', 'ended', 'cancelled']) expect(newTagLabel(status, start, at('2026-10-21T09:00:00.000Z'))).toBeNull();
  });
});
