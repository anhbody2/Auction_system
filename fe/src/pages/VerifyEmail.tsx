import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ApiError, api } from '../api';

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const [state, setState] = useState<{ ok: boolean; text: string } | null>(null);
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    api<{ message: string }>('/auth/verify-email', { body: { token: params.get('token') ?? '' } })
      .then((r) => setState({ ok: true, text: r.message }))
      .catch((e) => setState({ ok: false, text: e instanceof ApiError ? e.message : 'Verification failed' }));
  }, [params]);

  return (
    <div className="card narrow">
      <h1>Email confirmation</h1>
      {!state ? <p className="muted">Checking your link...</p> : <p className={state.ok ? '' : 'error'}>{state.text}</p>}
      <Link to="/login">Go to log in</Link>
    </div>
  );
}
