import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError, api } from '../api';
import { Field } from '../components/Field';
import { useToast } from '../toast';
import { rules, validate } from '../validate';

const empty = { fullName: '', username: '', email: '', phone: '', address: '', password: '', confirmPassword: '' };

export function RegisterPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const [values, setValues] = useState(empty);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const clientErrors = validate(values, rules);
  const errorFor = (name: string) => serverErrors[name] ?? (touched[name] ? clientErrors[name as keyof typeof clientErrors] : undefined);

  const bind = (name: keyof typeof empty) => ({
    name,
    value: values[name],
    error: errorFor(name),
    onChange: (e: { target: { value: string } }) => {
      setValues((v) => ({ ...v, [name]: e.target.value }));
      setServerErrors(({ [name]: _, ...rest }) => rest);
    },
    onBlur: () => setTouched((t) => ({ ...t, [name]: true })),
  });

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(Object.fromEntries(Object.keys(empty).map((k) => [k, true])));
    if (Object.keys(clientErrors).length) return;
    setBusy(true);
    try {
      const res = await api<{ message: string }>('/auth/register', { body: values });
      toast(res.message, 'success');
      navigate('/login');
    } catch (err) {
      if (err instanceof ApiError) {
        setServerErrors(err.fields);
        toast(err.message, 'error');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card narrow">
      <h1>Create account</h1>
      <form onSubmit={onSubmit} noValidate>
        <Field label="Full name" autoComplete="name" {...bind('fullName')} />
        <Field label="Username" autoComplete="username" {...bind('username')} />
        <Field label="Email" type="email" autoComplete="email" {...bind('email')} />
        <Field label="Phone" type="tel" autoComplete="tel" {...bind('phone')} />
        <Field label="Address (optional)" multiline {...bind('address')} />
        <Field label="Password" type="password" autoComplete="new-password" {...bind('password')} />
        <Field label="Confirm password" type="password" autoComplete="new-password" {...bind('confirmPassword')} />
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Creating...' : 'Create account'}
        </button>
      </form>
      <p className="muted small">
        Already registered? <Link to="/login">Log in</Link>
      </p>
    </div>
  );
}
