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
          <div className="muted small">Available credit</div>
          <div className="big">{money(user.creditBalance - user.heldBalance)}</div>
        </div>
        <div className="card">
          <div className="muted small">Held in active bids</div>
          <div className="big">{money(user.heldBalance)}</div>
        </div>
      </div>
    </div>
  );
}
