import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError, api, money } from '../api';
import { useAuth } from '../auth';
import { AdminUserEdit } from '../components/AdminUserEdit';
import type { AdminUserRow } from './AdminUsers';

export interface AdminUser extends AdminUserRow {
  phone: string | null;
  address: string | null;
  emailVerified: boolean;
  creditBalance: number;
  heldBalance: number;
  updatedAt: string;
  auctionCount: number;
  bidCount: number;
}

/** adm-001: full details of one user. */
export function AdminUserDetailPage() {
  const { id } = useParams();
  const { user: me } = useAuth();
  const [user, setUser] = useState<AdminUser | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(
    () =>
      api<{ user: AdminUser }>(`/admin/users/${id}`)
        .then((r) => setUser(r.user))
        .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load user')),
    [id],
  );
  useEffect(() => {
    load();
  }, [load]);

  if (error) return <p className="error">{error}</p>;
  if (!user) return <p className="muted">Loading...</p>;
  return (
    <div>
      <p>
        <Link to="/admin/users">&larr; All users</Link>
      </p>
      <h1>{user.username}</h1>
      <div className="card">
        <dl className="facts" data-testid="user-detail">
          <dt>Full name</dt>
          <dd>{user.fullName ?? '-'}</dd>
          <dt>Email</dt>
          <dd>
            {user.email} <span className="muted small">({user.emailVerified ? 'verified' : 'not verified'})</span>
          </dd>
          <dt>Phone</dt>
          <dd>{user.phone ?? '-'}</dd>
          <dt>Address</dt>
          <dd>{user.address ?? '-'}</dd>
          <dt>Role</dt>
          <dd data-testid="detail-role">{user.role}</dd>
          <dt>Status</dt>
          <dd data-testid="detail-status">{user.status}</dd>
          <dt>Credit</dt>
          <dd>
            {money(user.creditBalance)} ({money(user.heldBalance)} held)
          </dd>
          <dt>Auctions / bids</dt>
          <dd>
            {user.auctionCount} / {user.bidCount}
          </dd>
          <dt>Created</dt>
          <dd>{new Date(user.createdAt).toLocaleString()}</dd>
        </dl>
      </div>
      {user.status !== 'deleted' && (
        <div className="admin-panels">
          <AdminUserEdit key={user.updatedAt} user={user} isSelf={me?.id === user.id} onSaved={setUser} />
        </div>
      )}
    </div>
  );
}
