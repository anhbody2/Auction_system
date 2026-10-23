import type { ReactNode } from 'react';

export type PillTone = 'navy' | 'steel' | 'cream' | 'muted' | 'dark-red';

/** ui-0.1: rounded status label. Always carries text, so the colour is never the only signal. */
export function Pill({ tone = 'steel', dot, children, testId, title }: { tone?: PillTone; dot?: boolean; children: ReactNode; testId?: string; title?: string }) {
  return (
    <span className={`ui-pill ui-pill-${tone}`} data-testid={testId} title={title}>
      {dot && <span className="ui-pill-dot" aria-hidden="true" />}
      {children}
    </span>
  );
}
