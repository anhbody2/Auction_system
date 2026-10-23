import { useEffect, useRef, useState } from 'react';
import { warningText } from '../idleSession';

/**
 * sec-005: shown before the idle logout, with a countdown to `deadline` (epoch ms) updated every second.
 * Any activity closes it (AuthProvider); so does 'Stay signed in'.
 */
export function IdleWarning({ deadline, onStay }: { deadline: number; onStay: () => void }) {
  const [now, setNow] = useState(Date.now);
  const stay = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    stay.current?.focus();
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="idle-backdrop">
      <div className="idle-warning card" role="alertdialog" aria-modal="true" aria-labelledby="idle-title" aria-describedby="idle-text" data-testid="idle-warning">
        <h2 id="idle-title">Are you still there?</h2>
        <p id="idle-text" data-testid="idle-countdown" aria-live="polite">
          {warningText(deadline - now)}
        </p>
        <button ref={stay} className="btn btn-primary" type="button" onClick={onStay}>
          Stay signed in
        </button>
      </div>
    </div>
  );
}
