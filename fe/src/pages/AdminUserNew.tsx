import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError, api } from '../api';
import { Field } from '../components/Field';
import { useToast } from '../toast';
import { rules, validate } from '../validate';
import { ROLE_OPTIONS } from './AdminUsers';

const empty = { fullName: '', username: '', email: '', password: '', role: 'customer' };
const schema = { username: rules.username, email: rules.email, password: rules.password };

/** adm-002: admin creates a user with a role; the account is active immediately. */
export function AdminUserNewPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const [values, setValues] = useState(empty);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const clientErrors = validate(values, schema);
  const errorFor = (name: string) => serverErrors[name] ?? (touched[name] ? clientErrors[name] : undefined);

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
      await api('/admin/users', { body: values });
      toast(`User ${values.username} created`, 'success');
      navigate('/admin/users');
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
      <p>
        <Link to="/admin/users">&larr; All users</Link>
      </p>
      <h1>Add user</h1>
      <form onSubmit={onSubmit} noValidate>
        <Field label="Full name (optional)" autoComplete="off" {...bind('fullName')} />
        <Field label="Username" autoComplete="off" {...bind('username')} />
        <Field label="Email" type="email" autoComplete="off" {...bind('email')} />
        <Field label="Password" type="password" autoComplete="new-password" {...bind('password')} />
        <div className="field">
          <label htmlFor="role">Role</label>
          <select id="role" name="role" value={values.role} onChange={(e) => setValues((v) => ({ ...v, role: e.target.value }))}>
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          {serverErrors.role && <span className="field-error">{serverErrors.role}</span>}
        </div>
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Creating...' : 'Create user'}
        </button>
      </form>
    </div>
  );
}
