import { describe, expect, it } from 'vitest';
import { share } from './creditBar';

describe('ui-2a.1 credit bar share', () => {
  it('is the part of the total in percent', () => {
    expect(share(750, 1000)).toBe(75);
    expect(share(250, 1000)).toBe(25);
  });

  it('is empty without credit and stays within 0-100', () => {
    expect(share(0, 0)).toBe(0);
    expect(share(-5, 100)).toBe(0);
    expect(share(150, 100)).toBe(100);
  });
});
