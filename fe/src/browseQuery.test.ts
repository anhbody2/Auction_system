import { describe, expect, it } from 'vitest';
import { browseApiQuery, browseParams, isFiltered, readBrowse } from './browseQuery';

const read = (qs: string) => readBrowse(new URLSearchParams(qs));

describe('ui-1a.2 browse state in the URL', () => {
  it('reads defaults from an empty URL', () => {
    expect(read('')).toEqual({ q: '', field: 'all', category: '', sort: '' });
    expect(isFiltered(read(''))).toBe(false);
  });

  it('reads every param and drops unknown values', () => {
    expect(read('q=lamp&field=seller&category=3&sort=price_desc')).toEqual({ q: 'lamp', field: 'seller', category: '3', sort: 'price_desc' });
    expect(read('field=nope&category=abc&sort=random')).toEqual({ q: '', field: 'all', category: '', sort: '' });
    expect(read('category=ending').category).toBe('ending');
  });

  it('writes only what is set (field only with a keyword) and round-trips', () => {
    expect(browseParams({ q: '', field: 'seller', category: '', sort: '' })).toEqual({});
    const b = { q: 'oak', field: 'product' as const, category: '2', sort: 'ending' as const };
    expect(read(new URLSearchParams(browseParams(b)).toString())).toEqual(b);
  });

  it('maps the Ending soon chip to endingSoon=1 for the API', () => {
    expect(browseApiQuery(read(''))).toBe('');
    expect(browseApiQuery(read('category=ending&sort=ending'))).toBe('?endingSoon=1&sort=ending');
  });

  it('home-1.1: the default sort is the server most bids; the old sort=bids URL falls back to it', () => {
    expect(read('sort=bids').sort).toBe('');
    expect(browseApiQuery(read('sort=bids'))).toBe('');
    expect(browseApiQuery(read('q=oak&field=product&category=2'))).toBe('?q=oak&field=product&category=2');
  });
});
