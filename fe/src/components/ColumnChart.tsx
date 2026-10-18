import { useEffect, useRef, useState } from 'react';

export interface Series {
  key: string;
  label: string;
  color: string;
}

interface Props {
  title: string;
  /** One entry per x position (a day). Values are read by series key. */
  data: ({ label: string } & Record<string, number | string>)[];
  series: Series[];
  format?: (n: number) => string;
  /** Whole-number data (counts): never draw fractional ticks. */
  integer?: boolean;
  testId?: string;
}

const H = 220;
const M = { top: 12, right: 8, bottom: 26, left: 52 };
const GAP = 2; // surface gap between stacked segments
const RADIUS = 4;

function niceStep(max: number, ticks = 4) {
  const raw = max / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  return (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
}

/** Column path with a rounded data-end (top) and a square baseline. */
function columnPath(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, h, w / 2);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

/** stf-003: stacked (or single-series) column chart with hover tooltip, legend and a table view. */
export function ColumnChart({ title, data, series, format = (n) => String(n), integer, testId }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(280, Math.floor(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const totals = data.map((d) => series.reduce((s, se) => s + Number(d[se.key] ?? 0), 0));
  const max = Math.max(...totals, 0);
  const step = max > 0 ? (integer ? Math.max(1, niceStep(max)) : niceStep(max)) : 1;
  const top = max > 0 ? Math.ceil(max / step) * step : 4;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);

  const plotW = width - M.left - M.right;
  const plotH = H - M.top - M.bottom;
  const band = plotW / Math.max(data.length, 1);
  const barW = Math.max(2, Math.min(24, band * 0.6));
  const y = (v: number) => M.top + plotH - (v / top) * plotH;
  const labelEvery = Math.max(1, Math.ceil(data.length / Math.floor(plotW / 64)));

  const hovered = hover !== null ? data[hover] : null;

  return (
    <figure className="chart" data-testid={testId}>
      <figcaption className="chart-title">{title}</figcaption>
      {series.length > 1 && (
        <ul className="chart-legend" aria-label={`${title} legend`}>
          {series.map((s) => (
            <li key={s.key}>
              <span className="swatch" style={{ background: s.color }} aria-hidden="true" />
              {s.label}
            </li>
          ))}
        </ul>
      )}
      <div className="chart-plot" ref={wrap} onMouseLeave={() => setHover(null)}>
        <svg width={width} height={H} role="img" aria-label={`${title}, ${data.length} days`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} className={t === 0 ? 'chart-baseline' : 'chart-grid'} />
              <text x={M.left - 6} y={y(t)} dy="0.32em" textAnchor="end" className="chart-tick">
                {format(t)}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const cx = M.left + band * i + band / 2;
            let acc = 0;
            const visible = series.filter((s) => Number(d[s.key] ?? 0) > 0);
            return (
              <g key={i}>
                {visible.map((s, j) => {
                  const v = Number(d[s.key]);
                  const y0 = y(acc);
                  acc += v;
                  const y1 = y(acc);
                  const isTop = j === visible.length - 1;
                  // leave a surface gap above every segment that has another one stacked on it
                  const h = Math.max(1, y0 - y1 - (isTop ? 0 : GAP));
                  const yTop = isTop ? y1 : y1 + GAP;
                  return isTop ? (
                    <path key={s.key} d={columnPath(cx - barW / 2, yTop, barW, h, RADIUS)} style={{ fill: s.color }} />
                  ) : (
                    <rect key={s.key} x={cx - barW / 2} y={yTop} width={barW} height={h} style={{ fill: s.color }} />
                  );
                })}
                {i % labelEvery === 0 && (
                  <text x={cx} y={H - M.bottom + 16} textAnchor="middle" className="chart-tick">
                    {d.label}
                  </text>
                )}
                {/* hit target: the whole band, taller than the mark */}
                <rect
                  x={M.left + band * i}
                  y={M.top}
                  width={band}
                  height={plotH}
                  fill="transparent"
                  tabIndex={0}
                  role="button"
                  aria-label={`${d.label}: ${series.map((s) => `${s.label} ${format(Number(d[s.key] ?? 0))}`).join(', ')}`}
                  onMouseEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  className={hover === i ? 'chart-hit active' : 'chart-hit'}
                />
              </g>
            );
          })}
        </svg>
        {hovered && hover !== null && (
          <div
            className="chart-tooltip"
            role="status"
            data-testid={testId ? `${testId}-tooltip` : undefined}
            style={{ left: Math.min(Math.max(M.left + band * hover + band / 2, 80), width - 80) }}
          >
            <strong>{hovered.label}</strong>
            {series.map((s) => (
              <div key={s.key} className="row">
                <span className="swatch" style={{ background: s.color }} aria-hidden="true" />
                <span>{s.label}</span>
                <span className="chart-tooltip-value">{format(Number(hovered[s.key] ?? 0))}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <details className="chart-table">
        <summary>Show data table</summary>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Day</th>
                {series.map((s) => (
                  <th key={s.key}>{s.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((d, i) => (
                <tr key={i}>
                  <td>{d.label}</td>
                  {series.map((s) => (
                    <td key={s.key}>{format(Number(d[s.key] ?? 0))}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
