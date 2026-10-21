import { useState } from 'react';
import { ApiError, api } from '../api';

/** mail-002: asks for a new activation email, by an old link's token or as the signed-in pending user. */
export function ResendActivation({ token }: { token?: string }) {
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const resend = async () => {
    setBusy(true);
    try {
      const res = await api<{ message: string }>('/auth/resend-activation', { body: token ? { token } : {}, method: 'POST' });
      setResult({ ok: true, text: res.message });
    } catch (err) {
      setResult({ ok: false, text: err instanceof ApiError ? err.message : 'Could not send the email' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="resend">
      <button className="btn btn-ghost btn-small" type="button" onClick={resend} disabled={busy}>
        {busy ? 'Sending...' : 'Resend activation email'}
      </button>
      {result && (
        <span className={result.ok ? 'small' : 'small error'} role="status" data-testid="resend-result">
          {result.text}
        </span>
      )}
    </span>
  );
}
