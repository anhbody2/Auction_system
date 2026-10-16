import { useState, type FormEvent } from 'react';
import { ApiError, api } from '../api';
import { Field } from '../components/Field';
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
      <form onSubmit={onSubmit} noValidate>
        <Field label="Current password" autoComplete="current-password" {...bind('currentPassword')} />
        <Field label="New password" autoComplete="new-password" {...bind('newPassword')} />
        <Field label="Confirm new password" autoComplete="new-password" {...bind('confirmPassword')} />
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Saving...' : 'Change password'}
        </button>
      </form>
    </div>
  );
}
