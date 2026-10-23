import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, money } from '../api';
import { useAuth } from '../auth';
import { share } from '../creditBar';
import { GoodsOwned } from '../components/GoodsOwned';
import { Card } from '../components/ui';
import { useCredit } from '../store/useCredit';
import { CREDIT_REQUEST_EVENT } from './Credit';

interface Summary {
  leadingBids: number;
  pendingTopup: number;
  pendingWithdraw: number;
}

export function DashboardPage() {
  const { user } = useAuth();
  const { credit, locked } = useCredit();
  const [summary, setSummary] = useState<Summary | null>(null);

  const load = useCallback(() => {
    api<Summary>('/me/summary').then(setSummary);
  }, []);
  // Credit or locked credit moving (own bid, outbid, settlement, approval) changes the leading count or the
  // pending totals too, so the summary follows the live credit store; approvals also fire a window event.
  useEffect(load, [load, credit, locked]);
  useEffect(() => {
    window.addEventListener(CREDIT_REQUEST_EVENT, load);
    return () => window.removeEventListener(CREDIT_REQUEST_EVENT, load);
  }, [load]);

  if (!user) return null;
  const available = credit - locked;
  const firstName = (user.fullName ?? '').trim().split(/\s+/)[0] || user.username;
  const leading = summary?.leadingBids ?? 0;
  const pending = summary ? summary.pendingTopup + summary.pendingWithdraw : 0;

  return (
    <div>
      <h1>Welcome back, {firstName}</h1>
      <div className="dash-cards">
        <Card tone="navy" className="dash-available">
          <div className="dash-label">Available credit</div>
          <div className="ui-money ui-money-xl" data-testid="dashboard-available">
            {money(available)}
          </div>
          <div className="dash-sub">
            Total <span data-testid="dashboard-credit">{money(credit)}</span>
          </div>
          <div className="credit-bar" role="img" aria-label={`${money(available)} available and ${money(locked)} locked of ${money(credit)}`} data-testid="credit-bar">
            <span className="credit-bar-available" style={{ width: `${share(available, credit)}%` }} />
            <span className="credit-bar-locked" style={{ width: `${share(locked, credit)}%` }} />
          </div>
          <div className="row dash-actions">
            <Link to="/credit?mode=topup" className="btn btn-light">
              Add credit
            </Link>
            <Link to="/credit?mode=withdraw" className="btn btn-outline-light">
              Withdraw
            </Link>
          </div>
        </Card>
        <Card>
          <div className="dash-label muted">Locked credit</div>
          <div className="ui-money ui-money-lg" data-testid="dashboard-locked">
            {money(locked)}
          </div>
          <p className="muted small" data-testid="dashboard-leading">
            Held against {leading} leading bid{leading === 1 ? '' : 's'}. Released automatically if you're outbid.
          </p>
        </Card>
        <Card>
          <div className="dash-label muted">Pending requests</div>
          <div className="ui-money ui-money-lg" data-testid="dashboard-pending">
            {money(pending)}
          </div>
          <p className="muted small">
            {summary && pending > 0 ? (
              <>
                Top-ups {money(summary.pendingTopup)} · withdrawals {money(summary.pendingWithdraw)} waiting for staff approval.
              </>
            ) : (
              'No top-up or withdrawal requests waiting for staff.'
            )}{' '}
            <Link to="/credit">Manage requests</Link>
          </p>
        </Card>
      </div>
      <div className="dash-lower">
        <GoodsOwned />
      </div>
    </div>
  );
}
