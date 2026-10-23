import { describe, expect, it } from 'vitest';
import { chartLabel, priceChart } from './priceChart';

describe('ui-1b.3 priceChart', () => {
  it('is hidden without bids', () => {
    expect(priceChart(100, [], 300, 80)).toBeNull();
  });

  it('runs from the starting price through the bids oldest first, evenly spaced', () => {
    const g = priceChart(100, [150, 120], 300, 80)!;
    expect(g.points.map((p) => p.price)).toEqual([100, 120, 150]);
    expect(g.points.map((p) => p.x)).toEqual([0, 150, 300]);
    // Higher prices sit higher (smaller y), and inside the padding.
    expect(g.points[0].y).toBeGreaterThan(g.points[1].y);
    expect(g.points[1].y).toBeGreaterThan(g.points[2].y);
    for (const p of g.points) {
      expect(p.y).toBeGreaterThanOrEqual(6);
      expect(p.y).toBeLessThanOrEqual(74);
    }
  });

  it('closes the area polygon along the bottom edge', () => {
    const g = priceChart(100, [150, 120], 300, 80)!;
    expect(g.area.startsWith('0,80 ')).toBe(true);
    expect(g.area.endsWith(' 300,80')).toBe(true);
    expect(g.area).toContain(g.line);
  });

  it('handles a single bid (two points)', () => {
    const g = priceChart(50, [55], 200, 60)!;
    expect(g.points).toHaveLength(2);
    expect(g.points[1].x).toBe(200);
  });

  it('draws flat prices as a level line in the middle band', () => {
    const g = priceChart(100, [100], 200, 60)!;
    expect(g.points[0].y).toBe(g.points[1].y);
    expect(g.min).toBeLessThan(100);
    expect(g.max).toBeGreaterThan(100);
  });
});

describe('ui-1b.3 chartLabel', () => {
  it('summarises start, current and bid count', () => {
    const m = (n: number) => `$${n}`;
    expect(chartLabel(100, 150, 2, m)).toBe('Price from $100 to $150 over 2 bids');
    expect(chartLabel(100, 110, 1, m)).toBe('Price from $100 to $110 over 1 bid');
  });
});
