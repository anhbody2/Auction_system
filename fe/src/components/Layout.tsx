import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { money } from '../api';
import { can, useAuth } from '../auth';
import { useAppSelector } from '../store';
import { useCredit, useCreditSync } from '../store/useCredit';
import { useStaffEvents } from '../store/useStaffEvents';
import { ResendActivation } from './ResendActivation';
import { initials } from './ui';

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // mail-002 (and others): a one-off message passed with navigate(path, { state: { notice } }).
  const notice = (location.state as { notice?: string } | null)?.notice;
  useCreditSync();
  const { credit, locked } = useCredit();
  // stf-009: live approval queues and their nav badges.
  useStaffEvents();
  const { goodsPending, creditPending } = useAppSelector((s) => s.approvals);
  // ui-0.1: on narrow screens the nav folds behind a menu button; any navigation closes it.
  const [navOpen, setNavOpen] = useState(false);
  useEffect(() => setNavOpen(false), [location.pathname, location.search]);

  const onLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <>
      <header className="topbar">
        <Link to="/" className="brand" aria-label="BidHouse home">
          <span className="brand-mark" aria-hidden="true">
            <span className="brand-dot" />
          </span>
          <span className="brand-name">BidHouse</span>
        </Link>
        <button
          type="button"
          className="nav-toggle"
          aria-expanded={navOpen}
          aria-controls="main-nav"
          onClick={() => setNavOpen((o) => !o)}
          data-testid="nav-toggle"
        >
          <span className="sr-only">Menu</span>
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </button>
        <nav id="main-nav" className={navOpen ? 'is-open' : ''}>
          <NavLink to="/" end>
            Browse
          </NavLink>
          {user?.role === 'customer' && (
            <>
              <NavLink to="/dashboard">Dashboard</NavLink>
              <NavLink to="/my-bids">Bids</NavLink>
              <NavLink to="/credit">Credit</NavLink>
              <NavLink to="/goods">My goods</NavLink>
              <NavLink to="/my-auctions">My Auctions</NavLink>
            </>
          )}
          {can(user, 'report.view') && <NavLink to="/staff/statistics">Statistics</NavLink>}
          {can(user, 'auction.manage') && <NavLink to="/staff/auctions">Manage auctions</NavLink>}
          {can(user, 'goods.manage') && (
            <NavLink to="/staff/goods">
              Goods
              <PendingBadge count={goodsPending} testId="badge-goods-pending" label="goods waiting for approval" />
            </NavLink>
          )}
          {can(user, 'credit.manage') && (
            <NavLink to="/staff/credit">
              Credit management
              <PendingBadge count={creditPending} testId="badge-credit-pending" label="credit requests waiting for approval" />
            </NavLink>
          )}
          {can(user, 'user.manage') && <NavLink to="/admin/users">Users</NavLink>}
          {can(user, 'permission.manage') && <NavLink to="/admin/permissions">Permissions</NavLink>}
        </nav>
        <div className="userbox">
          {user ? (
            <>
              {user.role === 'customer' ? (
                <span className="bid-limit" title="Available credit: credit minus credit locked in your bids">
                  <span className="bid-limit-label">Bid limit</span>
                  <span className="bid-limit-value" data-testid="bid-limit">
                    {money(credit - locked)}
                  </span>
                </span>
              ) : (
                <span className="ui-pill ui-pill-steel" data-testid="current-role">
                  {user.role}
                </span>
              )}
              <UserMenu
                username={user.username}
                fullName={user.fullName}
                credit={user.role === 'customer' ? { credit, locked } : null}
                onLogout={onLogout}
              />
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

/**
 * ui-0.1: the avatar opens a small menu with the credit breakdown, Profile and Log out. The menu stays in the
 * DOM while closed (hidden), so the credit figures keep their testids for the existing credit specs.
 */
function UserMenu({ username, fullName, credit, onLogout }: { username: string; fullName: string | null; credit: { credit: number; locked: number } | null; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="user-menu" ref={box}>
      <span className="who" data-testid="current-user">
        {username}
      </span>
      <button
        type="button"
        className="avatar"
        aria-expanded={open}
        aria-label="Account menu"
        onClick={() => setOpen((o) => !o)}
        data-testid="avatar"
      >
        {initials(fullName, username)}
      </button>
      <div className="user-menu-panel" hidden={!open} data-testid="user-menu">
        {credit && (
          <dl className="user-menu-credit">
            <dt>Total credit</dt>
            <dd data-testid="header-credit">{money(credit.credit)}</dd>
            <dt>Locked in bids</dt>
            <dd data-testid="header-locked">{money(credit.locked)}</dd>
          </dl>
        )}
        <Link to="/profile" className="user-menu-item">
          Profile
        </Link>
        <button type="button" className="user-menu-item" onClick={onLogout}>
          Log out
        </button>
      </div>
    </div>
  );
}

/** stf-009: how many requests wait in a queue; hidden at zero. */
function PendingBadge({ count, testId, label }: { count: number | null; testId: string; label: string }) {
  if (!count) return null;
  return (
    <span className="nav-badge" data-testid={testId} aria-label={`${count} ${label}`}>
      {count}
    </span>
  );
}
