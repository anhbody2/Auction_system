import { describe, expect, it } from 'vitest';
import { safeFrom } from './safeFrom';

describe('ui-1a.3 safeFrom', () => {
  it('keeps paths inside the app, with their query', () => {
    expect(safeFrom('/')).toBe('/');
    expect(safeFrom('/?category=2&sort=bids')).toBe('/?category=2&sort=bids');
  });

  it('drops empty values, absolute and protocol-relative URLs', () => {
    for (const raw of [null, undefined, '', 'https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)']) {
      expect(safeFrom(raw)).toBeUndefined();
    }
  });
});
