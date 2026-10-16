import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, api } from '../api';
import { Field } from '../components/Field';
import { rules, validate } from '../validate';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string>();
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const errs = validate({ email }, { email: rules.email });
    setError(errs.email);
    if (errs.email) return;
    setBusy(true);
    try {
      const res = await api<{ message: string }>('/auth/forgot-password', { body: { email } });
      setDone(res.message);
    } catch (err) {
      setError(err instanceof ApiError ? err.fields.email ?? err.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card narrow">
      <h1>Forgot password</h1>
      {done ? (
        <p role="status">{done}</p>
      ) : (
        <form onSubmit={onSubmit} noValidate>
          <p className="muted small">Enter your account email and we'll send you a reset link.</p>
          <Field label="Email" name="email" type="email" value={email} error={error} onChange={(e) => setEmail(e.target.value)} />
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? 'Sending...' : 'Send reset link'}
          </button>
        </form>
      )}
      <p className="small">
        <Link to="/login">Back to log in</Link>
      </p>
    </div>
  );
}
