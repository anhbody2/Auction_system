import { describe, expect, it } from 'vitest';
import { relativeTime } from './relativeTime';

describe('ui-1b.3 relativeTime', () => {
  const now = Date.parse('2026-10-23T12:00:00.000Z');
  const ago = (seconds: number) => new Date(now - seconds * 1000).toISOString();

  it('says just now under a minute (and for clock skew into the future)', () => {
    expect(relativeTime(ago(0), now)).toBe('just now');
    expect(relativeTime(ago(59), now)).toBe('just now');
    expect(relativeTime(ago(-30), now)).toBe('just now');
  });

  it('counts minutes, hours and days', () => {
    expect(relativeTime(ago(60), now)).toBe('1 min ago');
    expect(relativeTime(ago(2 * 60 + 30), now)).toBe('2 min ago');
    expect(relativeTime(ago(59 * 60), now)).toBe('59 min ago');
    expect(relativeTime(ago(3600), now)).toBe('1 h ago');
    expect(relativeTime(ago(23 * 3600), now)).toBe('23 h ago');
    expect(relativeTime(ago(24 * 3600), now)).toBe('1 day ago');
    expect(relativeTime(ago(3 * 24 * 3600), now)).toBe('3 days ago');
  });
});
