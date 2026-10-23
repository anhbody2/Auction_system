import { describe, expect, it } from 'vitest';
import { CREDIT_LABELS, RESULT, winRate } from './bidHistory';

describe('ui-3a.1 winRate', () => {
  it('is won / (won + lost) in whole percent', () => {
    expect(winRate({ won: 1, lost: 1 })).toBe('50%');
    expect(winRate({ won: 2, lost: 1 })).toBe('67%');
    expect(winRate({ won: 3, lost: 0 })).toBe('100%');
    expect(winRate({ won: 0, lost: 4 })).toBe('0%');
  });

  it("is '-' with no finished lots", () => {
    expect(winRate({ won: 0, lost: 0 })).toBe('-');
  });
});

describe('ui-3a.1 labels', () => {
  it('shows Leading for the API status winning and words for every credit state', () => {
    expect(RESULT.winning.label).toBe('Leading');
    expect(Object.values(CREDIT_LABELS)).toEqual(['Locked', 'Charged', 'Released', '-']);
  });
});
