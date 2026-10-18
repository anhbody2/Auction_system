import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { DeleteUser } from '../components/DeleteUser';

export interface AdminUserRow {
  id: number;
  username: string;
  email: string;
  role: string;
  status: string;
  fullName: string | null;
  createdAt: string;
}

export const ROLE_OPTIONS = ['customer', 'staff', 'admin'];
export const STATUS_OPTIONS = ['active', 'pending', 'locked', 'deleted'];
const PAGE_SIZE = 20;

/** adm-001: search, filter and page through users. Filters live in the URL so the list survives a reload. */
export function AdminUsersPage() {
  const { user: me } = useAuth();
  const [params, setParams] = useSearchParams();
  const [reload, setReload] = useState(0);
  const q = params.get('q') ?? '';
  const role = params.get('role') ?? '';
  const status = params.get('status') ?? '';
  const page = Number(params.get('page') ?? '1') || 1;

  const [draft, setDraft] = useState({ q, role, status });
  const [data, setData] = useState<{ users: AdminUserRow[]; total: number } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const qs = new URLSearchParams({ q, role, status, page: String(page), pageSize: String(PAGE_SIZE) });
    setError('');
    api<{ users: AdminUserRow[]; total: number }>(`/admin/users?${qs}`)
      .then(setData)
      .catch(() => setError('Could not load users'));
  }, [q, role, status, page, reload]);

  const apply = (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (draft.q.trim()) next.q = draft.q.trim();
    if (draft.role) next.role = draft.role;
    if (draft.status) next.status = draft.status;
    setParams(next);
  };
  const goPage = (p: number) => setParams({ ...Object.fromEntries(params), page: String(p) });
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div>
      <div className="row spread">
        <h1>User management</h1>
        <Link to="/admin/users/new" className="btn btn-primary">
          + Add user
        </Link>
      </div>
      <form className="card row filters" role="search" onSubmit={apply}>
        <label className="field grow">
          Search
          <input
            name="q"
            placeholder="Username or email"
            value={draft.q}
            onChange={(e) => setDraft({ ...draft, q: e.target.value })}
          />
        </label>
        <label className="field">
          Role
          <select name="role" value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })}>
            <option value="">All roles</option>
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Status
          <select name="status" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
            <option value="">All (not deleted)</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <button className="btn btn-primary" type="submit">
          Apply
        </button>
      </form>

      {error && <p className="error">{error}</p>}
      {!data ? (
        <p className="muted">Loading...</p>
      ) : data.users.length === 0 ? (
        <p className="muted">No users match these filters.</p>
      ) : (
        <>
          <p className="muted small" data-testid="user-total">
            {data.total} user{data.total === 1 ? '' : 's'}
          </p>
          <div className="table-wrap">
            <table data-testid="user-table">
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.users.map((u) => (
                  <tr key={u.id} data-testid={`user-row-${u.username}`}>
                    <td>
                      <Link to={`/admin/users/${u.id}`}>{u.username}</Link>
                    </td>
                    <td>{u.email}</td>
                    <td data-testid="user-role">{u.role}</td>
                    <td>
                      <span className={`badge badge-user-${u.status}`}>{u.status}</span>
                    </td>
                    <td>{new Date(u.createdAt).toLocaleDateString()}</td>
                    <td>
                      {u.status !== 'deleted' && u.id !== me?.id && (
                        <DeleteUser user={u} onDeleted={() => setReload((n) => n + 1)} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <div className="row pager">
              <button className="btn btn-ghost" disabled={page <= 1} onClick={() => goPage(page - 1)}>
                Previous
              </button>
              <span className="muted small">
                Page {page} of {pages}
              </span>
              <button className="btn btn-ghost" disabled={page >= pages} onClick={() => goPage(page + 1)}>
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
