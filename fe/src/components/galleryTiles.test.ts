import { describe, expect, it } from 'vitest';
import { galleryTiles, step } from './galleryTiles';

describe('ui-1b.1 galleryTiles', () => {
  it('shows no thumbnails for zero or one image', () => {
    expect(galleryTiles(0)).toEqual([]);
    expect(galleryTiles(1)).toEqual([]);
  });

  it('shows every image when five or fewer', () => {
    expect(galleryTiles(5).map((t) => t.kind)).toEqual(['image', 'image', 'image', 'image', 'image']);
    expect(galleryTiles(2)).toEqual([{ kind: 'image', index: 0 }, { kind: 'image', index: 1 }]);
  });

  it('turns the fifth tile into +N for more than five', () => {
    const tiles = galleryTiles(7);
    expect(tiles).toHaveLength(5);
    expect(tiles[4]).toEqual({ kind: 'more', index: 4, more: 3 });
    expect(galleryTiles(6)[4]).toEqual({ kind: 'more', index: 4, more: 2 });
  });
});

describe('ui-1b.1 lightbox step', () => {
  it('wraps both ways', () => {
    expect(step(0, -1, 7)).toBe(6);
    expect(step(6, 1, 7)).toBe(0);
    expect(step(3, 1, 7)).toBe(4);
  });
});
