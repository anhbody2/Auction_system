import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError, api } from '../api';
import { Field } from '../components/Field';
import { PasswordRules } from '../components/PasswordRules';
import { useToast } from '../toast';
import { rules, validate } from '../validate';

/**
 * The new-password form behind both mailed links (mail-003). mail-004: the change link opens it at
 * /change-password/new (mode 'change'), the forgot-password link at /reset-password; only the words differ.
 * The server decides where the user goes next (profile when saved in their own signed-in browser, else login).
 */
export function ResetPasswordPage({ mode = 'reset' }: { mode?: 'reset' | 'change' }) {
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
      const res = await api<{ message: string; next: '/profile' | '/login' }>('/auth/reset-password', { body: { ...values, token: params.get('token') ?? '' } });
      toast(res.message, 'success');
      navigate(res.next, { state: { notice: res.message } });
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
      <h1>{mode === 'change' ? 'Change your password' : 'Set a new password'}</h1>
      <form onSubmit={onSubmit} noValidate>
        <Field label="New password" autoComplete="new-password" {...bind('newPassword')} />
        <PasswordRules value={values.newPassword} />
        <Field label="Confirm new password" autoComplete="new-password" {...bind('confirmPassword')} />
        {formError && (
          <p className="error" role="alert">
            {formError}
          </p>
        )}
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Saving...' : mode === 'change' ? 'Change password' : 'Reset password'}
        </button>
      </form>
    </div>
  );
}
