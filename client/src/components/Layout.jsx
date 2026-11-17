import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { CategoriesProvider } from '../categories.jsx';
import Icon from './Icons.jsx';
import GlobalSearch from './GlobalSearch.jsx';
import { useAuth } from '../auth.jsx';
import { initials } from '../pages/Employees.jsx';
import { api } from '../api.js';
import { timeAgo } from '../pages/Notifications.jsx';
import { tw } from './tw.js';

// The Aspire mark: an asset tag with its punched hole
export function BrandMark({ className = '', dark = true }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <span className="relative grid place-items-center w-10 h-10 rounded-lg bg-[#5EC2B1] text-pine">
        <Icon name="box" size={21} />
        <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-pine" />
      </span>
      <span className="leading-tight">
        <strong className={`block text-[17px] ${dark ? 'text-white' : 'text-ink'}`}>Aspire</strong>
        <span className={`text-xs ${dark ? 'text-pine-dim' : 'text-muted'}`}>System Management</span>
      </span>
    </div>
  );
}

const NAV = [
  { to: '/', label: 'Dashboard', icon: 'dashboard', end: true },
  { to: '/inventory', label: 'Inventory', icon: 'box' },
  { to: '/assignments', label: 'Assignments', icon: 'clipboard' },
  { to: '/repairs', label: 'Repairs', icon: 'wrench', badge: 'repairs' },
  { to: '/departments', label: 'Departments', icon: 'building' },
  { to: '/reports', label: 'Reports', icon: 'report' },
  { to: '/users', label: 'Users', icon: 'users', perm: 'users' },
  { to: '/notifications', label: 'Notifications', icon: 'bell', perm: 'notifications' },
  { to: '/recycle-bin', label: 'Recycle Bin', icon: 'trash', perm: 'recycleBin' },
];

// Bell with unread count + latest changes (admins only). Polls every 30 s.
function NotificationBell() {
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [latest, setLatest] = useState([]);
  const ref = useRef();

  const refresh = () => api.unreadCount().then((r) => setCount(r.count)).catch(() => {});
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 30000);
    window.addEventListener('notifications:changed', refresh);
    return () => { clearInterval(t); window.removeEventListener('notifications:changed', refresh); };
  }, []);
  useEffect(() => {
    if (!open) return;
    api.notifications({ limit: 8 }).then(setLatest).catch(() => {});
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const readAll = async () => {
    await api.markAllRead();
    setCount(0);
    setLatest((l) => l.map((n) => ({ ...n, read: true })));
  };

  return (
    <div className="relative" ref={ref}>
      <button className={`${tw.iconBtn} relative !w-10 !h-10`} onClick={() => setOpen((o) => !o)} aria-label={`Notifications (${count} unread)`}>
        <Icon name="bell" size={20} />
        {count > 0 && (
          <span className="absolute top-0.5 right-0.5 grid place-items-center min-w-[18px] h-[18px] px-1 rounded-full bg-danger text-white text-[11px] font-bold">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-20 w-[360px] max-w-[calc(100vw-32px)] overflow-hidden bg-white border border-line rounded-xl shadow-pop animate-pop">
          <div className="flex items-center justify-between px-4 py-3 border-b border-line">
            <strong>Notifications</strong>
            {count > 0 && <button className="text-[13px] font-semibold text-brand hover:underline" onClick={readAll}>Mark all read</button>}
          </div>
          {latest.length ? (
            latest.map((n) => (
              <Link
                key={n._id}
                to="/notifications"
                onClick={() => setOpen(false)}
                className={`flex flex-col gap-0.5 px-4 py-2.5 border-b border-line text-[13px] leading-snug !text-ink hover:no-underline hover:bg-paper ${n.read ? '' : 'bg-brand-soft'}`}
              >
                <span>{n.message}</span>
                <small className="text-[11.5px] text-muted">{timeAgo(n.createdAt)}</small>
              </Link>
            ))
          ) : (
            <div className="p-5 text-center text-muted">No changes yet.</div>
          )}
          <Link to="/notifications" className="block p-2.5 text-center text-[13px] font-semibold" onClick={() => setOpen(false)}>View all notifications</Link>
        </div>
      )}
    </div>
  );
}

function UserMenu() {
  const { user, logout, isAdmin, can } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef();
  useEffect(() => {
    if (!open) return;
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button className="flex items-center gap-2.5 px-1.5 py-1 rounded-xl text-left hover:bg-paper" onClick={() => setOpen((o) => !o)}>
        <span className="grid place-items-center w-9 h-9 rounded-full bg-pine text-white text-sm font-semibold">{initials(user.name)}</span>
        <span className="flex flex-col leading-tight max-md:hidden">
          <span className="font-semibold">{user.name}</span>
          <small className="text-xs text-muted">{isAdmin ? 'Administrator' : 'Staff'}</small>
        </span>
      </button>
      {open && (
        <div className="absolute right-0 top-[52px] z-20 min-w-[200px] p-1.5 bg-white border border-line rounded-xl shadow-pop animate-pop [&>*]:flex [&>*]:w-full [&>*]:items-center [&>*]:gap-2.5 [&>*]:px-2.5 [&>*]:py-2 [&>*]:rounded-md [&>*]:text-ink [&>*:hover]:bg-paper [&>*:hover]:no-underline">
          <Link to="/profile" onClick={() => setOpen(false)}><Icon name="users" size={15} /> My profile</Link>
          {can('users') && <Link to="/users" onClick={() => setOpen(false)}><Icon name="edit" size={15} /> Manage users</Link>}
          <button className="!text-danger" onClick={() => { logout(); navigate('/login'); }}><Icon name="arrow" size={15} /> Log out</button>
        </div>
      )}
    </div>
  );
}

export default function Layout() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { can } = useAuth();
  const { pathname } = useLocation();
  // Badge on "Repairs": items still Damaged or In repair.
  // Refreshed on page change, right after anything is saved, and every minute (other users' changes).
  const [badges, setBadges] = useState({});
  useEffect(() => {
    const load = () => api.repairSummary().then((r) => setBadges({ repairs: r.needsAction })).catch(() => {});
    load();
    const onChange = (e) => /repairs|assignments|items/.test(e.detail?.path || '') && load();
    window.addEventListener('data:changed', onChange);
    const timer = setInterval(load, 60000);
    return () => {
      window.removeEventListener('data:changed', onChange);
      clearInterval(timer);
    };
  }, [pathname]);



  return (
    <div className="flex min-h-full">
      <aside
        className={`w-60 shrink-0 h-screen sticky top-0 z-30 overflow-y-auto bg-pine text-pine-text flex flex-col
          max-md:fixed max-md:left-0 max-md:transition-transform ${open ? '' : 'max-md:-translate-x-full'}`}
      >
        <BrandMark className="px-5 pt-6 pb-7" />
        <nav className="flex flex-col gap-0.5 px-3">
          {NAV.filter((n) => !n.perm || can(n.perm)).map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium hover:no-underline transition-colors ${
                  isActive ? 'bg-pine-3 text-white shadow-[inset_3px_0_0_#5EC2B1]' : 'text-pine-text hover:bg-pine-2 hover:text-white'
                }`
              }
            >
              <Icon name={n.icon} size={19} />
              {n.label}
              {n.badge && badges[n.badge] > 0 && (
                <span className="ml-auto min-w-[22px] px-1.5 rounded-full bg-warn text-white text-[11.5px] font-semibold text-center leading-5">{badges[n.badge]}</span>
              )}
            </NavLink>
          ))}
        </nav>
      </aside>
      {open && <div className="fixed inset-0 z-[25] bg-black/35 md:hidden" onClick={() => setOpen(false)} />}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-20 h-16 flex items-center justify-end gap-4 px-7 bg-white/90 backdrop-blur border-b border-line max-md:px-4 max-md:gap-2.5">
          <button className={`${tw.iconBtn} md:hidden mr-auto`} onClick={() => setOpen(true)} aria-label="Menu">
            <Icon name="menu" />
          </button>
          <GlobalSearch />
          {can('notifications') && <NotificationBell />}
          <UserMenu />
        </header>
        <main className="w-full max-w-[1400px] px-7 pt-7 pb-12 space-y-5 max-md:px-4 max-md:pt-5">
          <CategoriesProvider>
            <Outlet />
          </CategoriesProvider>
        </main>
      </div>
    </div>
  );
}
