/** ui-1b.1: up to this many thumbnail tiles under the hero image. */
export const MAX_TILES = 5;

export type Tile = { kind: 'image'; index: number } | { kind: 'more'; index: number; more: number };

/**
 * Thumbnail tiles for `count` images: all of them when they fit, otherwise the first MAX_TILES - 1 and a '+N'
 * tile (N = the images not shown) that opens the lightbox at the first hidden one.
 */
export function galleryTiles(count: number): Tile[] {
  if (count <= 1) return [];
  if (count <= MAX_TILES) return Array.from({ length: count }, (_, index) => ({ kind: 'image', index }));
  const shown = MAX_TILES - 1;
  return [
    ...Array.from({ length: shown }, (_, index): Tile => ({ kind: 'image', index })),
    { kind: 'more', index: shown, more: count - shown },
  ];
}

/** Next / previous image in the lightbox, wrapping around. */
export const step = (index: number, delta: number, count: number) => (index + delta + count) % count;
