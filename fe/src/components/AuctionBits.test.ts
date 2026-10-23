import { describe, expect, it } from 'vitest';
import { formatDuration, newTagLabel } from './AuctionBits';

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

describe('ui-1b.2 formatDuration', () => {
  const ms = (d: number, h: number, m: number, s: number) => (((d * 24 + h) * 60 + m) * 60 + s) * 1000;
  it('drops seconds for days by default and keeps them with withSeconds', () => {
    expect(formatDuration(ms(1, 2, 3, 4))).toBe('1d 2h 3m');
    expect(formatDuration(ms(1, 2, 3, 4), true)).toBe('1d 2h 3m 4s');
    expect(formatDuration(ms(0, 2, 14, 37), true)).toBe('2h 14m 37s');
    expect(formatDuration(ms(0, 0, 5, 9))).toBe('5m 9s');
  });
});
