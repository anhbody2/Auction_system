import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { money } from '../api';
import { can, useAuth } from '../auth';
import { useAppSelector } from '../store';
import { useCredit, useCreditSync } from '../store/useCredit';
import { useStaffEvents } from '../store/useStaffEvents';
import { MessengerChat } from './MessengerChat';
import { ResendActivation } from './ResendActivation';
import { TopSearch } from './TopSearch';
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
  const isCustomer = user?.role === 'customer';
  const roleLinks = ROLE_LINKS.filter((l) => can(user, l.permission));
  const pending = { goods: goodsPending, credit: creditPending };

  const onLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <>
      <header className={!user ? 'topbar' : isCustomer ? 'topbar topbar-split' : 'topbar topbar-split topbar-staff'}>
        <Link to="/" className="brand" aria-label="Beat'em home">
          <img className="brand-mark" src="/logo.svg" alt="" aria-hidden="true" />
          <span className="brand-name">Beat'em</span>
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
          {/* hdr-1.1 / hdr-1.2: signed-in users get links left of the centred search and links on its right.
              Customers: Browse Dashboard Bids | Credit My goods My Auctions; staff and admin: Browse | their role pages. */}
          {user ? (
            <>
              <div className="nav-group nav-left">
                <NavLink to="/" end>
                  Browse
                </NavLink>
                {isCustomer && (
                  <>
                    <NavLink to="/dashboard">Dashboard</NavLink>
                    <NavLink to="/my-bids">Bids</NavLink>
                  </>
                )}
              </div>
              {isCustomer ? (
                <div className="nav-group nav-right">
                  <NavLink to="/credit">Credit</NavLink>
                  <NavLink to="/goods">My goods</NavLink>
                  <NavLink to="/my-auctions">My Auctions</NavLink>
                </div>
              ) : (
                <RoleLinks links={roleLinks} pending={pending} />
              )}
            </>
          ) : (
            <NavLink to="/" end>
              Browse
            </NavLink>
          )}
        </nav>
        {/* ui-1a.2 / hdr-1.2: the browsing search sits in every role's bar. */}
        <TopSearch />
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
      <SiteFooter />
      <MessengerChat />
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

/** Staff and admin pages, each shown only with its permission (sec-002), in nav order. */
const ROLE_LINKS: { to: string; label: string; permission: string; badge?: 'goods' | 'credit' }[] = [
  { to: '/staff/statistics', label: 'Statistics', permission: 'report.view' },
  { to: '/staff/auctions', label: 'Manage auctions', permission: 'auction.manage' },
  { to: '/staff/goods', label: 'Goods', permission: 'goods.manage', badge: 'goods' },
  { to: '/staff/credit', label: 'Credit management', permission: 'credit.manage', badge: 'credit' },
  { to: '/admin/users', label: 'Users', permission: 'user.manage' },
  { to: '/admin/permissions', label: 'Permissions', permission: 'permission.manage' },
];

const BADGES = {
  goods: { testId: 'badge-goods-pending', label: 'goods waiting for approval' },
  credit: { testId: 'badge-credit-pending', label: 'credit requests waiting for approval' },
};

/**
 * hdr-1.4: the staff/admin right-hand group. When the role links do not fit their half of the bar (desktop only),
 * they fold into one "Dashboard" menu so the search keeps its place in the row. A hidden copy of the link labels
 * measures the room they would need; the group keeps its flex share (min-width: 0), so the check does not flip-flop.
 */
function RoleLinks({ links, pending }: { links: typeof ROLE_LINKS; pending: Record<'goods' | 'credit', number | null> }) {
  const group = useRef<HTMLDivElement>(null);
  const measure = useRef<HTMLDivElement>(null);
  const [folded, setFolded] = useState(false);
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname, location.search]);
  useLayoutEffect(() => {
    const g = group.current;
    const m = measure.current;
    if (!g || !m) return;
    const desktop = window.matchMedia('(min-width: 901px)');
    const check = () => setFolded(desktop.matches && m.scrollWidth > g.clientWidth);
    const ro = new ResizeObserver(check);
    ro.observe(g);
    desktop.addEventListener('change', check);
    check();
    return () => {
      ro.disconnect();
      desktop.removeEventListener('change', check);
    };
  }, [links.length]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!group.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const items = links.map((l) => (
    <NavLink key={l.to} to={l.to}>
      {l.label}
      {l.badge && <PendingBadge count={pending[l.badge]} testId={BADGES[l.badge].testId} label={BADGES[l.badge].label} />}
    </NavLink>
  ));
  const total = (pending.goods ?? 0) + (pending.credit ?? 0);
  const onRolePage = links.some((l) => location.pathname.startsWith(l.to));

  return (
    <div className={folded ? 'nav-group nav-right nav-folded' : 'nav-group nav-right'} ref={group}>
      <div className="nav-measure" ref={measure} aria-hidden="true">
        {links.map((l) => (
          <span key={l.to}>{l.label}</span>
        ))}
      </div>
      {folded ? (
        <div className="nav-dashboard">
          <button
            type="button"
            className={onRolePage ? 'nav-dashboard-toggle active' : 'nav-dashboard-toggle'}
            aria-expanded={open}
            aria-controls="nav-dashboard-menu"
            onClick={() => setOpen((o) => !o)}
            data-testid="nav-dashboard"
          >
            Dashboard
            {total > 0 && (
              <span className="nav-badge" aria-label={`${total} requests waiting for approval`}>
                {total}
              </span>
            )}
            <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
            </svg>
          </button>
          <div className="nav-dashboard-menu" id="nav-dashboard-menu" hidden={!open} data-testid="nav-dashboard-menu">
            {items}
          </div>
        </div>
      ) : (
        items
      )}
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

/** Site footer: logo and blurb left, link columns right, an outlined wordmark fading into the bottom bar (copyright + quick links). */
const FOOTER_COLUMNS: { title: string; links: { to: string; label: string }[] }[] = [
  {
    title: 'Auctions',
    links: [
      { to: '/', label: 'Browse lots' },
      { to: '/auctions/new', label: 'Start an auction' },
      { to: '/my-auctions', label: 'My auctions' },
      { to: '/my-bids', label: 'My bids' },
    ],
  },
  {
    title: 'Account',
    links: [
      { to: '/dashboard', label: 'Dashboard' },
      { to: '/credit', label: 'Credit' },
      { to: '/goods', label: 'My goods' },
      { to: '/profile', label: 'Profile' },
    ],
  },
  {
    title: 'Help',
    links: [
      { to: '/forgot-password', label: 'Forgot password' },
      { to: '/change-password', label: 'Change password' },
    ],
  },
];

const FOOTER_BOTTOM_LINKS = [
  { to: '/login', label: 'Log in' },
  { to: '/register', label: 'Create an account' },
];

function SiteFooter() {
  return (
    <footer className="site-footer" data-testid="site-footer">
      <div className="site-footer-inner">
        <div className="footer-top">
          <div className="footer-intro">
            <Link to="/" className="footer-brand" aria-label="Beat'em home">
              <img className="footer-mark" src="/logo.svg" alt="" aria-hidden="true" />
            </Link>
            <p className="footer-blurb">Beat'em , Beat'it, Win and Win.</p>
          </div>
          {FOOTER_COLUMNS.map((col) => (
            <nav key={col.title} className="footer-col" aria-label={col.title}>
              <h3>{col.title}</h3>
              <ul>
                {col.links.map((l) => (
                  <li key={l.to}>
                    <Link to={l.to}>{l.label}</Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="footer-wordmark" aria-hidden="true">
          <span>BEAT&apos;EM</span>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} Beat&apos;em / Live online auctions</span>
          <nav className="footer-bottom-links" aria-label="Footer">
            {FOOTER_BOTTOM_LINKS.map((l) => (
              <Link key={l.to} to={l.to}>
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </footer>
  );
}
