import { describe, expect, it } from 'vitest';
import type { Auction } from './api';
import { liveCountLabel, splitSections } from './homeSections';

const lot = (id: number, status: Auction['status']) => ({ id, status }) as Auction;

describe('home-1.2 homepage sections', () => {
  it('keeps live lots in the trending section and ended ones in completed, in the server order', () => {
    const { trending, completed } = splitSections([lot(3, 'active'), lot(1, 'active'), lot(9, 'ended'), lot(7, 'ended'), lot(5, 'upcoming'), lot(6, 'cancelled')]);
    expect(trending.map((a) => a.id)).toEqual([3, 1]);
    expect(completed.map((a) => a.id)).toEqual([9, 7]);
  });

  it('labels the live count with the real number', () => {
    expect(liveCountLabel(0)).toBe('0 live auctions');
    expect(liveCountLabel(1)).toBe('1 live auction');
    expect(liveCountLabel(1284)).toBe('1,284 live auctions');
  });
});
