import { useState, type FormEvent } from 'react';
import { ApiError, api } from '../api';
import { Field } from '../components/Field';
import { PasswordRules } from '../components/PasswordRules';
import { useToast } from '../toast';
import { required, rules, validate } from '../validate';

const empty = { currentPassword: '', newPassword: '', confirmPassword: '' };
const passwordRules = {
  currentPassword: [required('Current password is required')],
  newPassword: rules.password,
  confirmPassword: [(v: string, all: Record<string, string>) => (v && v === all.newPassword ? undefined : 'Passwords do not match')],
};

export function ChangePasswordPage() {
  const toast = useToast();
  const [values, setValues] = useState(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [linkSent, setLinkSent] = useState('');
  const [linkBusy, setLinkBusy] = useState(false);

  // mail-003: the SRS way: a link to the new-password form is mailed to the user's own address.
  const sendLink = async () => {
    setLinkBusy(true);
    try {
      const res = await api<{ message: string }>('/me/password/link', { method: 'POST' });
      setLinkSent(res.message);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not send the email', 'error');
    } finally {
      setLinkBusy(false);
    }
  };

  const bind = (name: keyof typeof empty) => ({
    name,
    type: 'password',
    value: values[name],
    error: errors[name],
    onChange: (e: { target: { value: string } }) => {
      setValues((v) => ({ ...v, [name]: e.target.value }));
      setErrors(({ [name]: _, ...rest }) => rest);
    },
  });

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const clientErrors = validate(values, passwordRules);
    setErrors(clientErrors);
    if (Object.keys(clientErrors).length) return;
    setBusy(true);
    try {
      await api('/me/password', { method: 'PUT', body: values });
      setValues(empty);
      toast('Password changed', 'success');
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields);
        toast(err.message, 'error');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card narrow">
      <h1>Change password</h1>
      <div className="link-box">
        <p className="muted small">We email you a link to a form where you choose the new password.</p>
        <button className="btn btn-primary" type="button" onClick={sendLink} disabled={linkBusy}>
          {linkBusy ? 'Sending...' : 'Send me a change-password link'}
        </button>
        {linkSent && (
          <p className="notice notice-success" role="status" data-testid="link-sent">
            {linkSent}
          </p>
        )}
      </div>
      <h2>Or change it now</h2>
      <form onSubmit={onSubmit} noValidate>
        <Field label="Current password" autoComplete="current-password" {...bind('currentPassword')} />
        <Field label="New password" autoComplete="new-password" {...bind('newPassword')} />
        <PasswordRules value={values.newPassword} />
        <Field label="Confirm new password" autoComplete="new-password" {...bind('confirmPassword')} />
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Saving...' : 'Change password'}
        </button>
      </form>
    </div>
  );
}
