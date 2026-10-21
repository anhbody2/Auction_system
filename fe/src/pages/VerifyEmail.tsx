import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError, api } from '../api';
import { useAuth } from '../auth';
import { ResendActivation } from '../components/ResendActivation';

/**
 * mail-002: opening the activation link activates the account, signs the user in and takes them to the
 * main page with "Your account is activated". A used or expired link offers a new email.
 */
export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [error, setError] = useState('');
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    api<{ message: string }>('/auth/verify-email', { body: { token } })
      .then(async (r) => {
        await refresh();
        navigate('/', { replace: true, state: { notice: r.message } });
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Activation failed'));
  }, [token, navigate, refresh]);

  return (
    <div className="card narrow">
      <h1>Account activation</h1>
      {!error ? (
        <p className="muted">Checking your link...</p>
      ) : (
        <>
          <p className="error" role="alert">
            {error}
          </p>
          <ResendActivation token={token} />
          <p className="small">
            <Link to="/login">Go to log in</Link>
          </p>
        </>
      )}
    </div>
  );
}
