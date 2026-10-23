/**
 * ui-1b.3: the small price chart under the highest bid. Points run from the starting price through every bid
 * (oldest first), evenly spaced; the y-range is padded so the line never touches the edges.
 */
export interface ChartGeometry {
  points: { x: number; y: number; price: number }[];
  line: string;
  area: string;
  min: number;
  max: number;
}

const round = (n: number) => Math.round(n * 10) / 10;

export function priceChart(initialPrice: number, bidAmountsNewestFirst: number[], width: number, height: number, pad = 6): ChartGeometry | null {
  if (bidAmountsNewestFirst.length < 1) return null;
  const prices = [initialPrice, ...[...bidAmountsNewestFirst].reverse()];
  let min = Math.min(...prices);
  let max = Math.max(...prices);
  // Flat prices still get a visible band; otherwise pad by 10% of the range.
  const spread = max - min || Math.max(1, max * 0.1);
  min -= spread * 0.1;
  max += spread * 0.1;
  const stepX = width / (prices.length - 1);
  const y = (p: number) => round(pad + (1 - (p - min) / (max - min)) * (height - 2 * pad));
  const points = prices.map((price, i) => ({ x: round(i * stepX), y: y(price), price }));
  const line = points.map((p) => `${p.x},${p.y}`).join(' ');
  const area = `0,${height} ${line} ${round(width)},${height}`;
  return { points, line, area, min, max };
}

/** Accessible summary of the chart. */
export function chartLabel(initialPrice: number, current: number, bidCount: number, money: (n: number) => string) {
  return `Price from ${money(initialPrice)} to ${money(current)} over ${bidCount} bid${bidCount === 1 ? '' : 's'}`;
}
