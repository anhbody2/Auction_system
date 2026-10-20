import { money } from '../api';
import { useAuth } from '../auth';

export function DashboardPage() {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <div>
      <h1>Welcome, {user.fullName ?? user.username}</h1>
      <div className="grid stats">
        <div className="card">
          <div className="muted small">Credit</div>
          <div className="big" data-testid="dashboard-credit">{money(user.creditBalance)}</div>
          <div className="muted small">Changes on top up, withdrawal and when an auction closes</div>
        </div>
        <div className="card">
          <div className="muted small">Locked credit</div>
          <div className="big" data-testid="dashboard-locked">{money(user.heldBalance)}</div>
          <div className="muted small">Held in active bids</div>
        </div>
      </div>
    </div>
  );
}
