import { describe, expect, it } from 'vitest';
import { initials } from './initials';

describe('ui-0.1 initials', () => {
  it('takes the first letters of the first two words of the full name', () => {
    expect(initials('Alice Seller', 'alice')).toBe('AS');
    expect(initials('  maria  de la cruz ', 'maria')).toBe('MD');
  });

  it('uses the first two letters of a single-word name', () => {
    expect(initials('Cher', 'cher99')).toBe('CH');
  });

  it('falls back to the username when there is no full name', () => {
    expect(initials(null, 'bob')).toBe('BO');
    expect(initials('   ', 'x')).toBe('X');
  });

  it('keeps unicode letters whole', () => {
    expect(initials('Đặng Ánh', 'dang')).toBe('ĐÁ');
    expect(initials(null, '😀bob')).toBe('😀B');
  });
});
