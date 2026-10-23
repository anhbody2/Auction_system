import { useRef, type KeyboardEvent } from 'react';

export interface SegmentedTab<T extends string> {
  value: T;
  label: string;
  count?: number;
}

/** ui-0.1: pill tabs (role=tablist). Arrow keys move between tabs. */
export function SegmentedTabs<T extends string>({ tabs, value, onChange, label, testId, variant = 'pills' }: { tabs: SegmentedTab<T>[]; value: T; onChange: (value: T) => void; label: string; testId?: string; variant?: 'pills' | 'segment' }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (i + step + tabs.length) % tabs.length;
    onChange(tabs[next].value);
    refs.current[next]?.focus();
  };
  return (
    <div className={`ui-tabs ui-tabs-${variant}`} role="tablist" aria-label={label} data-testid={testId}>
      {tabs.map((t, i) => {
        const selected = t.value === value;
        return (
          <button
            key={t.value}
            ref={(el) => (refs.current[i] = el)}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            className={`ui-tab ${selected ? 'is-active' : ''}`}
            onClick={() => onChange(t.value)}
            onKeyDown={(e) => onKey(e, i)}
            data-testid={testId ? `${testId}-${t.value}` : undefined}
          >
            {t.label}
            {t.count != null && <span className="ui-tab-count"> · {t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
