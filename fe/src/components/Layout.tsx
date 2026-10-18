import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { money } from '../api';
import { can, useAuth } from '../auth';

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

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
              <NavLink to="/my-auctions">My Auctions</NavLink>
              <NavLink to="/my-bids">My Biddings</NavLink>
              <NavLink to="/credit">Credit</NavLink>
            </>
          )}
          {can(user, 'report.view') && <NavLink to="/staff/statistics">Statistics</NavLink>}
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
                <span className="pill">{money(user.creditBalance - user.heldBalance)}</span>
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
        <Outlet />
      </main>
    </>
  );
}
