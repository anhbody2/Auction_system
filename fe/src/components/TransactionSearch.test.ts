import { describe, expect, it } from 'vitest';
import {
  MAX_AMOUNT_MESSAGE,
  MIN_AMOUNT_MESSAGE,
  WINDOW_MESSAGE,
  defaultFilter,
  datePresets,
  earliestDay,
  filterQuery,
  presetFor,
  validateTransactionFilter,
} from '../transactionSearch';

const today = new Date(2026, 9, 21, 12); // 21 Oct 2026, local noon
const base = { ...defaultFilter(today) };

describe('trx-001 client-side transaction filter checks (same rules and messages as the server)', () => {
  it('defaults to the last 30 days with no other filter, and passes', () => {
    expect(base).toEqual({ from: '2026-09-21', to: '2026-10-21', name: '', id: '', min: '', max: '', q: '', type: '' });
    expect(earliestDay(today)).toBe('2026-09-21');
    expect(validateTransactionFilter(base, today)).toEqual({});
  });

  it('dates older than 30 days, or from after to, are refused', () => {
    expect(validateTransactionFilter({ ...base, from: '2026-09-20' }, today)).toEqual({ from: WINDOW_MESSAGE });
    expect(validateTransactionFilter({ ...base, to: '2026-09-01', from: '2026-09-01' }, today)).toMatchObject({ from: WINDOW_MESSAGE, to: WINDOW_MESSAGE });
    expect(validateTransactionFilter({ ...base, from: '2026-10-10', to: '2026-10-01' }, today)).toEqual({ from: 'From date must be on or before To date' });
  });

  it('min must be at least $1; max optional but not below min', () => {
    expect(validateTransactionFilter({ ...base, min: '0.5' }, today)).toEqual({ min: MIN_AMOUNT_MESSAGE });
    expect(validateTransactionFilter({ ...base, min: '1' }, today)).toEqual({});
    expect(validateTransactionFilter({ ...base, min: '100', max: '50' }, today)).toEqual({ max: MAX_AMOUNT_MESSAGE });
    expect(validateTransactionFilter({ ...base, min: '100', max: '' }, today)).toEqual({});
    expect(validateTransactionFilter({ ...base, min: 'abc' }, today)).toEqual({ min: MIN_AMOUNT_MESSAGE });
  });

  it('transaction id must be digits', () => {
    expect(validateTransactionFilter({ ...base, id: '12x' }, today)).toEqual({ id: 'Transaction id must be a number' });
    expect(validateTransactionFilter({ ...base, id: ' 42 ' }, today)).toEqual({});
  });

  it('messages are the server ones', () => {
    expect(WINDOW_MESSAGE).toBe('Date must be within the last 30 days');
    expect(MIN_AMOUNT_MESSAGE).toBe('Minimum amount must be at least $1');
    expect(MAX_AMOUNT_MESSAGE).toBe('Maximum amount must be at least the minimum');
  });

  it('the query sends every non-blank filter together, plus the timezone', () => {
    const q = new URLSearchParams(filterQuery({ ...base, name: 'lamp', min: '5', max: '' }, { page: 2 }));
    expect(Object.fromEntries(q)).toMatchObject({ from: '2026-09-21', to: '2026-10-21', name: 'lamp', min: '5', page: '2' });
    expect(q.has('max')).toBe(false);
    expect(q.has('tz')).toBe(true);
  });
});

describe('ui-3b.2 search box, type and date presets', () => {
  it('sends q and type only when set, next to the old fields', () => {
    const qs = new URLSearchParams(filterQuery({ ...base, q: 'lamp', type: 'hold' }, { page: 1 }));
    expect(qs.get('q')).toBe('lamp');
    expect(qs.get('type')).toBe('hold');
    expect(qs.get('from')).toBe('2026-09-21');
    const plain = new URLSearchParams(filterQuery(base));
    expect(plain.has('q')).toBe(false);
    expect(plain.has('type')).toBe(false);
  });

  it('offers presets derived from the 30-day window, never longer than it', () => {
    const presets = datePresets(today);
    expect(presets.map((p) => p.label)).toEqual(['Last 7 days', 'Last 14 days', 'Last 30 days']);
    expect(presets.at(-1)).toMatchObject({ from: '2026-09-21', to: '2026-10-21' });
    for (const p of presets) expect(validateTransactionFilter({ ...base, from: p.from, to: p.to }, today)).toEqual({});
  });

  it('names the preset a range matches, else custom', () => {
    expect(presetFor(base, today)).toBe(30);
    expect(presetFor({ from: '2026-10-14', to: '2026-10-21' }, today)).toBe(7);
    expect(presetFor({ from: '2026-10-01', to: '2026-10-05' }, today)).toBe('custom');
  });
});
