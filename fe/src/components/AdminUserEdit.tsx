import { useState, type FormEvent } from 'react';
import { ApiError, api } from '../api';
import type { AdminUser } from '../pages/AdminUserDetail';
import { ROLE_OPTIONS } from '../pages/AdminUsers';
import { useToast } from '../toast';
import { Field } from './Field';

/** adm-003: edit profile fields, role and status. Role and status are fixed when editing yourself. */
export function AdminUserEdit({ user, isSelf, onSaved }: { user: AdminUser; isSelf: boolean; onSaved: (u: AdminUser) => void }) {
  const toast = useToast();
  const [values, setValues] = useState({
    email: user.email,
    fullName: user.fullName ?? '',
    phone: user.phone ?? '',
    address: user.address ?? '',
    role: user.role,
    status: user.status,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const bind = (name: 'email' | 'fullName' | 'phone' | 'address') => ({
    name,
    value: values[name],
    error: errors[name],
    onChange: (e: { target: { value: string } }) => setValues((v) => ({ ...v, [name]: e.target.value })),
  });

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrors({});
    setBusy(true);
    const body: Record<string, string> = { email: values.email, fullName: values.fullName, phone: values.phone, address: values.address };
    if (!isSelf) {
      body.role = values.role;
      // Pending users stay pending until they confirm their email, unless the admin picks a status.
      if (values.status === 'active' || values.status === 'locked') body.status = values.status;
    }
    try {
      const res = await api<{ user: AdminUser }>(`/admin/users/${user.id}`, { method: 'PATCH', body });
      toast('User updated', 'success');
      onSaved(res.user);
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
    <form className="card" onSubmit={onSubmit} noValidate aria-label="Edit user">
      <h2>Edit user</h2>
      <Field label="Email" type="email" {...bind('email')} />
      <Field label="Full name" {...bind('fullName')} />
      <Field label="Phone" type="tel" {...bind('phone')} />
      <Field label="Address" multiline {...bind('address')} />
      <div className="row">
        <div className="field">
          <label htmlFor="edit-role">Role</label>
          <select id="edit-role" value={values.role} disabled={isSelf} onChange={(e) => setValues((v) => ({ ...v, role: e.target.value }))}>
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="edit-status">Status</label>
          <select id="edit-status" value={values.status} disabled={isSelf} onChange={(e) => setValues((v) => ({ ...v, status: e.target.value }))}>
            {values.status === 'pending' && <option value="pending">pending</option>}
            <option value="active">active</option>
            <option value="locked">locked</option>
          </select>
        </div>
      </div>
      {isSelf && <p className="muted small">You cannot change your own role or status.</p>}
      <button className="btn btn-primary" type="submit" disabled={busy}>
        {busy ? 'Saving...' : 'Save changes'}
      </button>
    </form>
  );
}
