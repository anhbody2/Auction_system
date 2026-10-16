import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, api, type User } from '../api';
import { useAuth } from '../auth';
import { Field } from '../components/Field';
import { useToast } from '../toast';
import { rules, validate } from '../validate';

const profileRules = { fullName: rules.fullName, email: rules.email, phone: rules.phone };

export function ProfilePage() {
  const { refresh } = useAuth();
  const toast = useToast();
  const [values, setValues] = useState({ fullName: '', email: '', phone: '', address: '' });
  const [loaded, setLoaded] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ user: User }>('/me/profile').then(({ user }) => {
      setValues({ fullName: user.fullName ?? '', email: user.email, phone: user.phone ?? '', address: user.address ?? '' });
      setLoaded(true);
    });
  }, []);

  const bind = (name: keyof typeof values) => ({
    name,
    value: values[name],
    error: errors[name],
    onChange: (e: { target: { value: string } }) => {
      setValues((v) => ({ ...v, [name]: e.target.value }));
      setErrors(({ [name]: _, ...rest }) => rest);
    },
  });

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const clientErrors = validate(values, profileRules);
    setErrors(clientErrors);
    if (Object.keys(clientErrors).length) return;
    setBusy(true);
    try {
      await api('/me/profile', { method: 'PUT', body: values });
      await refresh();
      toast('Profile saved', 'success');
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields);
        toast(err.message, 'error');
      }
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) return <p className="muted">Loading...</p>;
  return (
    <div className="card narrow">
      <h1>My profile</h1>
      <form onSubmit={onSubmit} noValidate>
        <Field label="Full name" {...bind('fullName')} />
        <Field label="Email" type="email" {...bind('email')} />
        <Field label="Phone" type="tel" {...bind('phone')} />
        <Field label="Address" multiline {...bind('address')} />
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Saving...' : 'Save changes'}
        </button>
      </form>
    </div>
  );
}
