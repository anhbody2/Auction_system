import { useEffect, useState } from 'react';
import type { AuctionStatus } from '../api';

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`badge badge-${status}`} data-testid="status">
      {status}
    </span>
  );
}

/** sell-007: 'New' while the auction is upcoming and has not reached its start time; null after. */
export function newTagLabel(status: string, startTime: string, now = Date.now()) {
  return status === 'upcoming' && now < new Date(startTime).getTime() ? 'New' : null;
}

/** sell-007: the 'New' tag; disappears live when the countdown reaches the start time. */
export function NewTag({ status, startTime }: { status: string; startTime: string }) {
  const now = useNow();
  const label = newTagLabel(status, startTime, now);
  if (!label) return null;
  return (
    <span className="badge badge-new" data-testid="new-tag">
      {label}
    </span>
  );
}

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function formatDuration(ms: number, withSeconds = false) {
  if (ms <= 0) return '0s';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d) return withSeconds ? `${d}d ${h}h ${m}m ${sec}s` : `${d}d ${h}h ${m}m`;
  if (h) return `${h}h ${m}m ${sec}s`;
  return `${m}m ${sec}s`;
}

/**
 * Live countdown. Calls onElapsed once when the target passes. ui-1b.2: `format="ends-in"` (bid panel) reads
 * 'Ends in 1d 2h 3m 4s' with seconds always, and 'Ended' without the date.
 */
export function Countdown({
  status,
  startTime,
  endTime,
  onElapsed,
  format = 'left',
}: {
  status: AuctionStatus;
  startTime: string;
  endTime: string;
  onElapsed?: () => void;
  format?: 'left' | 'ends-in';
}) {
  const now = useNow();
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();
  const live = status === 'upcoming' && now >= start ? 'active' : status === 'active' && now >= end ? 'ended' : status;

  useEffect(() => {
    if (live !== status) onElapsed?.();
  }, [live, status, onElapsed]);

  const panel = format === 'ends-in';
  if (live === 'cancelled') return <span className="muted" data-testid="countdown">Cancelled</span>;
  if (live === 'ended') return <span className="muted" data-testid="countdown">{panel ? 'Ended' : `Ended ${new Date(endTime).toLocaleDateString()}`}</span>;
  if (live === 'upcoming') return <span data-testid="countdown">Starts in {formatDuration(start - now, panel)}</span>;
  if (panel) return <span data-testid="countdown">Ends in {formatDuration(end - now, true)}</span>;
  return (
    <span data-testid="countdown" className={end - now < 60_000 ? 'error' : ''}>
      {formatDuration(end - now)} left
    </span>
  );
}
