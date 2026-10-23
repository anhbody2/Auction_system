import type { ReactNode } from 'react';

/** ui-0.1: white panel with the mockup's 16px radius; `tone="navy"` is the dark summary card. */
export function Card({ title, actions, tone, className = '', children, testId }: { title?: ReactNode; actions?: ReactNode; tone?: 'navy'; className?: string; children: ReactNode; testId?: string }) {
  return (
    <section className={`ui-card ${tone === 'navy' ? 'ui-card-navy' : ''} ${className}`.trim()} data-testid={testId}>
      {(title || actions) && (
        <header className="ui-card-head">
          {title && <h2 className="ui-card-title">{title}</h2>}
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}
