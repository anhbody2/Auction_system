import { describe, expect, it } from 'vitest';
import type { MyStatus } from './bidHistory';
import { filterHistory, isHistoryTab, matchesLot, tabCounts } from './bidHistoryFilter';

const item = (id: number, name: string, myStatus: MyStatus) => ({ auction: { id, name }, myStatus });
const items = [item(12, 'Brass lamp', 'winning'), item(7, 'Oak table', 'outbid'), item(31, 'Lamp shade', 'won'), item(4, 'Silk scarf', 'lost'), item(9, 'Old lamp', 'cancelled')];
const ids = (list: { auction: { id: number } }[]) => list.map((i) => i.auction.id);

describe('ui-3a.2 bid history tabs', () => {
  it('All has everything, Active has leading and outbid, Won and Lost their own; cancelled only under All', () => {
    expect(ids(filterHistory(items, 'all', ''))).toEqual([12, 7, 31, 4, 9]);
    expect(ids(filterHistory(items, 'active', ''))).toEqual([12, 7]);
    expect(ids(filterHistory(items, 'won', ''))).toEqual([31]);
    expect(ids(filterHistory(items, 'lost', ''))).toEqual([4]);
  });

  it('recognises tab names from the URL', () => {
    expect(isHistoryTab('active')).toBe(true);
    expect(isHistoryTab('winning')).toBe(false);
    expect(isHistoryTab(null)).toBe(false);
  });
});

describe('ui-3a.2 lot search', () => {
  it('matches part of the name, any case', () => {
    expect(ids(filterHistory(items, 'all', 'LAMP'))).toEqual([12, 31, 9]);
    expect(matchesLot(item(1, 'Oak table', 'won'), '  oak ')).toBe(true);
  });

  it('matches the exact lot number with or without #', () => {
    expect(ids(filterHistory(items, 'all', '#7'))).toEqual([7]);
    expect(ids(filterHistory(items, 'all', '31'))).toEqual([31]);
    // A number that is not a lot id does not match a lot that merely contains the digits.
    expect(ids(filterHistory(items, 'all', '#1'))).toEqual([]);
  });

  it('combines with the tab, and can leave nothing', () => {
    expect(ids(filterHistory(items, 'active', 'lamp'))).toEqual([12]);
    expect(filterHistory(items, 'lost', 'lamp')).toEqual([]);
  });

  it('counts each tab after the search', () => {
    expect(tabCounts(items, 'lamp')).toEqual({ all: 3, active: 1, won: 1, lost: 0 });
    expect(tabCounts(items, '')).toEqual({ all: 5, active: 2, won: 1, lost: 1 });
  });
});
