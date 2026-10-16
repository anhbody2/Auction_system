import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError, api } from '../api';
import { Field } from '../components/Field';
import { useToast } from '../toast';
import { rules, validate } from '../validate';

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [values, setValues] = useState({ newPassword: '', confirmPassword: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const errs = validate(values, {
      newPassword: rules.password,
      confirmPassword: [(v, all) => (v && v === all.newPassword ? undefined : 'Passwords do not match')],
    });
    setErrors(errs);
    setFormError('');
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const res = await api<{ message: string }>('/auth/reset-password', { body: { ...values, token: params.get('token') ?? '' } });
      toast(res.message, 'success');
      navigate('/login');
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields);
        setFormError(err.message);
      }
    } finally {
      setBusy(false);
    }
  };

  const bind = (name: keyof typeof values) => ({
    name,
    type: 'password',
    value: values[name],
    error: errors[name],
    onChange: (e: { target: { value: string } }) => setValues((v) => ({ ...v, [name]: e.target.value })),
  });

  return (
    <div className="card narrow">
      <h1>Set a new password</h1>
      <form onSubmit={onSubmit} noValidate>
        <Field label="New password" autoComplete="new-password" {...bind('newPassword')} />
        <Field label="Confirm new password" autoComplete="new-password" {...bind('confirmPassword')} />
        {formError && (
          <p className="error" role="alert">
            {formError}
          </p>
        )}
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Saving...' : 'Reset password'}
        </button>
      </form>
    </div>
  );
}
