import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ApiError, api } from '../api';
import { useAuth } from '../auth';
import { maskEmail } from '../maskEmail';
import { useToast } from '../toast';

export const CHECK_EMAIL_PATH = '/change-password/check-email';

/**
 * mail-004 (SRS: Flow of change password): changing the password always goes through an emailed link.
 * send() mails the signed-in user a link to the change-password page; failures (429 resend limit, 502 mail)
 * become an error toast.
 */
export function useSendChangeLink() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try {
      await api<{ message: string }>('/me/password/link', { method: 'POST' });
      return true;
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not send the email', 'error');
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { send, busy };
}

/** The 'Change password' action (profile, old /change-password route): sends the mail, then the check-mail screen. */
export function ChangePasswordButton({ label = 'Change password' }: { label?: string }) {
  const navigate = useNavigate();
  const { send, busy } = useSendChangeLink();
  const onClick = async () => {
    if (await send()) navigate(CHECK_EMAIL_PATH, { state: { sent: true } });
  };
  return (
    <button  className="btn btn-primary" type="button" onClick={onClick} disabled={busy}>
      {busy ? 'Sending...' : label}
    </button>
  );
}

/** Old route and bookmarks: one explicit action, so opening or reloading the page never sends mail by itself. */
export function ChangePasswordPage() {
  return (
    <div className="card narrow">
      <h1>Change password</h1>
      <p className="muted">We email you a link to a page where you choose the new password.</p>
      <ChangePasswordButton label="Send me the change-password email" />
    </div>
  );
}

/** Req-1: the check-mail screen. It never sends by itself; Resend does (once a minute, server-enforced). */
export function CheckEmailPage() {
  const { user } = useAuth();
  const toast = useToast();
  const location = useLocation();
  const [sent, setSent] = useState(Boolean((location.state as { sent?: boolean } | null)?.sent));
  const { send, busy } = useSendChangeLink();
  const email = maskEmail(user?.email ?? '');

  const resend = async () => {
    if (!(await send())) return;
    setSent(true);
    toast(`We sent a new email to ${email}`, 'success');
  };

  return (
    <div className="card narrow" data-testid="check-mail-screen">
      <h1>Check your email</h1>
      {sent ? (
        <p data-testid="check-mail-text">
          We sent a link to change your password to <strong>{email}</strong>. Open it to choose a new password.
        </p>
      ) : (
        <p data-testid="check-mail-text">
          Send a link to change your password to <strong>{email}</strong>, then open it to choose a new password.
        </p>
      )}
      <p className="muted small">The link works for 1 hour. Asking for a new email makes the older links stop working.</p>
      <div className="check-mail-actions">
        <button className="btn" type="button" onClick={resend} disabled={busy}>
          {busy ? 'Sending...' : sent ? 'Resend email' : 'Send email'}
        </button>
        <Link to="/profile">Back to profile</Link>
      </div>
    </div>
  );
}
