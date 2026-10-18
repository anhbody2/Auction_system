import { useState, type FormEvent } from 'react';
import { ApiError, api } from '../api';
import { useToast } from '../toast';
import { rules, validate } from '../validate';
import { Field } from './Field';

const schema = { password: rules.password, confirmPassword: rules.confirmPassword };

/** adm-005: admin sets a new password for a user without knowing the old one. */
export function AdminSetPassword({ userId }: { userId: number }) {
  const toast = useToast();
  const [values, setValues] = useState({ password: '', confirmPassword: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const clientErrors = validate(values, schema);
    setErrors(clientErrors);
    if (Object.keys(clientErrors).length) return;
    setBusy(true);
    try {
      const res = await api<{ message: string }>(`/admin/users/${userId}/password`, {
        method: 'PUT',
        body: { newPassword: values.password, confirmPassword: values.confirmPassword },
      });
      toast(res.message, 'success');
      setValues({ password: '', confirmPassword: '' });
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors({ password: err.fields.newPassword, confirmPassword: err.fields.confirmPassword });
        toast(err.message, 'error');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card" onSubmit={onSubmit} noValidate aria-label="Set password">
      <h2>Set password</h2>
      <Field
        label="New password"
        name="admin-new-password"
        type="password"
        autoComplete="new-password"
        value={values.password}
        error={errors.password}
        onChange={(e) => setValues((v) => ({ ...v, password: e.target.value }))}
      />
      <Field
        label="Confirm new password"
        name="admin-confirm-password"
        type="password"
        autoComplete="new-password"
        value={values.confirmPassword}
        error={errors.confirmPassword}
        onChange={(e) => setValues((v) => ({ ...v, confirmPassword: e.target.value }))}
      />
      <button className="btn btn-primary" type="submit" disabled={busy}>
        {busy ? 'Saving...' : 'Set password'}
      </button>
    </form>
  );
}
