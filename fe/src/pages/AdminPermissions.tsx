import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '../api';
import { useAuth } from '../auth';
import { useToast } from '../toast';

interface Matrix {
  roles: string[];
  permissions: { code: string; description: string }[];
  grants: Record<string, string[]>;
  locked: Record<string, string[]>;
}

/** sec-002: roles x permissions; each checkbox grants or revokes immediately. */
export function AdminPermissionsPage() {
  const { refresh } = useAuth();
  const toast = useToast();
  const [matrix, setMatrix] = useState<Matrix | null>(null);
  const [busy, setBusy] = useState('');

  const load = useCallback(() => api<Matrix>('/admin/permissions').then(setMatrix), []);
  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (role: string, code: string, granted: boolean) => {
    setBusy(`${role}:${code}`);
    try {
      await api(`/admin/roles/${role}/permissions/${code}`, { method: 'PUT', body: { granted } });
      toast(`${granted ? 'Granted' : 'Revoked'} ${code} for ${role}`, 'success');
      await Promise.all([load(), refresh()]);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not update permission', 'error');
    } finally {
      setBusy('');
    }
  };

  if (!matrix) return <p className="muted">Loading...</p>;
  return (
    <div>
      <h1>Role permissions</h1>
      <p className="muted">Changes apply to the next request each user makes.</p>
      <div className="table-wrap">
        <table data-testid="permission-matrix">
          <thead>
            <tr>
              <th>Permission</th>
              {matrix.roles.map((r) => (
                <th key={r}>{r}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.permissions.map((p) => (
              <tr key={p.code}>
                <td>
                  <strong>{p.code}</strong>
                  <div className="muted small">{p.description}</div>
                </td>
                {matrix.roles.map((r) => {
                  const granted = matrix.grants[r]?.includes(p.code) ?? false;
                  const locked = matrix.locked[r]?.includes(p.code) ?? false;
                  return (
                    <td key={r}>
                      <input
                        type="checkbox"
                        aria-label={`${p.code} for ${r}`}
                        checked={granted}
                        disabled={locked || busy !== ''}
                        title={locked ? 'Required so administration cannot be locked out' : undefined}
                        onChange={(e) => toggle(r, p.code, e.target.checked)}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
