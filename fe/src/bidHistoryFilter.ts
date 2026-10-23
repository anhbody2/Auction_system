import type { MyStatus } from './bidHistory';

/**
 * ui-3a.2: the bid history tabs. Active = Leading + Outbid (live lots); Cancelled lots appear under All only.
 */
export type HistoryTab = 'all' | 'active' | 'won' | 'lost';

export const HISTORY_TABS: { value: HistoryTab; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
];

const IN_TAB: Record<HistoryTab, (s: MyStatus) => boolean> = {
  all: () => true,
  active: (s) => s === 'winning' || s === 'outbid',
  won: (s) => s === 'won',
  lost: (s) => s === 'lost',
};

export const isHistoryTab = (v: string | null): v is HistoryTab => !!v && v in IN_TAB;

/** Lot search: case-insensitive part of the name, or the exact lot number with or without '#'. */
export function matchesLot(item: { auction: { id: number; name: string } }, q: string) {
  const query = q.trim();
  if (!query) return true;
  const id = query.replace(/^#/, '');
  if (/^\d+$/.test(id) && Number(id) === item.auction.id) return true;
  return item.auction.name.toLowerCase().includes(query.toLowerCase());
}

export function filterHistory<T extends { myStatus: MyStatus; auction: { id: number; name: string } }>(items: T[], tab: HistoryTab, q: string) {
  return items.filter((i) => IN_TAB[tab](i.myStatus) && matchesLot(i, q));
}

/** Count per tab after the search, for the tab labels. */
export function tabCounts<T extends { myStatus: MyStatus; auction: { id: number; name: string } }>(items: T[], q: string) {
  return Object.fromEntries(HISTORY_TABS.map((t) => [t.value, filterHistory(items, t.value, q).length])) as Record<HistoryTab, number>;
}
