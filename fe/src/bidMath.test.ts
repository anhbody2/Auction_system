import { describe, expect, it } from 'vitest';
import { bidAmount, changeSinceStart, cleanAmount, formatTyping, ladderIncrement, precheck, quickAmounts } from './bidMath';

describe('ui-1b.2 ladderIncrement (same vectors as be/tests/bid.increment.test.ts)', () => {
  it.each([
    [0.5, 0.05],
    [1.0, 0.5],
    [9.99, 0.5],
    [10.0, 1],
    [49.99, 1],
    [50.0, 2.5],
    [99.99, 2.5],
    [100.0, 10],
    [500.0, 10],
    [999.99, 10],
    [1000.0, 100],
    [5000.0, 100],
  ])('increment at %d is %d', (price, inc) => {
    expect(ladderIncrement(price)).toBe(inc);
  });
});

describe('ui-1b.2 quickAmounts', () => {
  it('adds 1, 2 and 5 increments to the highest bid', () => {
    expect(quickAmounts(120, 100)).toEqual([130, 140, 170]);
    expect(quickAmounts(48, 10)).toEqual([49, 50, 53]);
  });

  it('uses the increment of the current tier across ladder boundaries', () => {
    expect(quickAmounts(990, 100)).toEqual([1000, 1010, 1040]);
    expect(quickAmounts(1000, 100)).toEqual([1100, 1200, 1500]);
    expect(quickAmounts(9.5, 1)).toEqual([10, 10.5, 12]);
    expect(quickAmounts(0.9, 0.5)).toEqual([0.95, 1, 1.15]);
  });

  it('starts from the starting price when there are no bids', () => {
    expect(quickAmounts(null, 100)).toEqual([100, 110, 140]);
  });
});

describe('ui-1b.2 changeSinceStart', () => {
  it('is the whole-percent change, null without bids', () => {
    expect(changeSinceStart(165, 100)).toBe(65);
    expect(changeSinceStart(100, 100)).toBe(0);
    expect(changeSinceStart(10.5, 9)).toBe(17);
    expect(changeSinceStart(null, 100)).toBeNull();
  });
});

describe('ui-1b.2 input parsing', () => {
  it('strips everything but digits and one point with 2 decimals', () => {
    expect(cleanAmount('$1,250')).toBe('1250');
    expect(cleanAmount('12.345')).toBe('12.34');
    expect(cleanAmount('1.2.3')).toBe('1.23');
    expect(cleanAmount('abc')).toBe('');
  });

  it('shows thousands separators while typing', () => {
    expect(formatTyping('1250')).toBe('1,250');
    expect(formatTyping('1234567.5')).toBe('1,234,567.5');
    expect(formatTyping('100')).toBe('100');
    expect(formatTyping('1000.')).toBe('1,000.');
    expect(formatTyping('007')).toBe('7');
    expect(formatTyping('')).toBe('');
  });

  it('bids the minimum when the input is empty', () => {
    expect(bidAmount('', 110)).toBe(110);
    expect(bidAmount('1,250', 110)).toBe(1250);
  });
});

describe('ui-1b.2 precheck uses the server wording', () => {
  it('flags amounts below the minimum and over available credit', () => {
    expect(precheck(100, 110, 1000)).toBe('Bid must be at least $110.00');
    expect(precheck(1099, 1100, 5000)).toBe('Bid must be at least $1100.00');
    expect(precheck(5000, 110, 1000)).toBe('Bid exceeds your available credit');
    expect(precheck(110, 110, 1000)).toBeNull();
  });
});
