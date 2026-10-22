import { describe, expect, it } from 'vitest';
import { maskEmail } from './maskEmail';

describe('mail-004 maskEmail', () => {
  it('keeps the first letter and the domain', () => {
    expect(maskEmail('bob@example.com')).toBe('b**@example.com');
    expect(maskEmail('chg_abc123@example.com')).toBe('c*********@example.com');
  });

  it('hides something even for one-letter local parts', () => {
    expect(maskEmail('b@example.com')).toBe('b*@example.com');
  });

  it('uses the last @ and leaves strings that are not addresses alone', () => {
    expect(maskEmail('a@b@example.com')).toBe('a**@example.com');
    expect(maskEmail('no-at-sign')).toBe('no-at-sign');
    expect(maskEmail('@example.com')).toBe('@example.com');
  });
});
