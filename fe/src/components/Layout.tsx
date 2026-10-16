import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { money } from '../api';
import { useAuth } from '../auth';

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
          {user && <NavLink to="/dashboard">Dashboard</NavLink>}
        </nav>
        <div className="userbox">
          {user ? (
            <>
              <span className="who" data-testid="current-user">
                {user.username}
              </span>
              <span className="pill">{money(user.creditBalance - user.heldBalance)}</span>
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
