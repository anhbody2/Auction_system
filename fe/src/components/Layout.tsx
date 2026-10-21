import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { money } from '../api';
import { can, useAuth } from '../auth';
import { useCredit, useCreditSync } from '../store/useCredit';
import { ResendActivation } from './ResendActivation';

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // mail-002 (and others): a one-off message passed with navigate(path, { state: { notice } }).
  const notice = (location.state as { notice?: string } | null)?.notice;
  useCreditSync();
  const { credit, locked } = useCredit();

  const onLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <>
      <header className="topbar">
        <Link to="/" className="brand">
          BidHouse
        </Link>
        <nav>
          <NavLink to="/">Auctions</NavLink>
          {user?.role === 'customer' && (
            <>
              <NavLink to="/dashboard">Dashboard</NavLink>
              <NavLink to="/goods">My goods</NavLink>
              <NavLink to="/my-auctions">My Auctions</NavLink>
              <NavLink to="/my-bids">My Biddings</NavLink>
              <NavLink to="/credit">Credit</NavLink>
            </>
          )}
          {can(user, 'report.view') && <NavLink to="/staff/statistics">Statistics</NavLink>}
          {can(user, 'auction.manage') && <NavLink to="/staff/auctions">Manage auctions</NavLink>}
          {can(user, 'goods.manage') && <NavLink to="/staff/goods">Goods</NavLink>}
          {can(user, 'credit.manage') && <NavLink to="/staff/credit">Credit management</NavLink>}
          {can(user, 'user.manage') && <NavLink to="/admin/users">Users</NavLink>}
          {can(user, 'permission.manage') && <NavLink to="/admin/permissions">Permissions</NavLink>}
          {user && <NavLink to="/profile">Profile</NavLink>}
        </nav>
        <div className="userbox">
          {user ? (
            <>
              <span className="who" data-testid="current-user">
                {user.username}
              </span>
              {user.role === 'customer' ? (
                <>
                  <span className="pill" title="Credit">
                    Credit <span data-testid="header-credit">{money(credit)}</span>
                  </span>
                  <span className="pill pill-muted" title="Locked credit: held in active bids">
                    Locked credit <span data-testid="header-locked">{money(locked)}</span>
                  </span>
                </>
              ) : (
                <span className="pill" data-testid="current-role">
                  {user.role}
                </span>
              )}
              <button className="btn btn-ghost" onClick={onLogout}>
                Log out
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="btn btn-ghost">
                Log in
              </Link>
              <Link to="/register" className="btn btn-primary">
                Register
              </Link>
            </>
          )}
        </div>
      </header>
      <main className="container">
        {user?.status === 'pending' && (
          <div className="banner" data-testid="pending-banner">
            Confirm your email address: we sent an activation link to {user.email}. <ResendActivation />
          </div>
        )}
        {notice && (
          <p className="notice notice-success" role="status" data-testid="page-notice">
            {notice}
          </p>
        )}
        <Outlet />
      </main>
    </>
  );
}
