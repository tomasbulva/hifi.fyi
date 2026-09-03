import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../core/AuthContext';

const COLLAPSED_KEY = 'hifi_sidebar_collapsed';

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { username, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSED_KEY) === '1');

  // Persist + drive the main content offset via CSS variable (see index.css)
  useEffect(() => {
    localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0');
    document.documentElement.style.setProperty('--sidebar-w', collapsed ? '4.5rem' : '16rem');
  }, [collapsed]);

  const navItems = [
    { path: '/player', label: 'Play', icon: 'play_circle' },
    { path: '/library', label: 'Browse', icon: 'explore' },
    { path: '/search', label: 'Search', icon: 'search' },
    { path: '/favorites', label: 'Favorites', icon: 'favorite' },
    { path: '/settings', label: 'Settings', icon: 'settings' },
  ];

  function isActive(path: string) {
    if (path === '/library') return location.pathname.startsWith('/library');
    return location.pathname === path;
  }

  return (
    <aside
      className="hidden md:flex flex-col h-screen fixed left-0 top-0 z-40"
      style={{
        background: '#0A0A0A',
        borderRight: '1px solid #494454',
        width: 'var(--sidebar-w)',
        transition: 'width 200ms ease',
      }}
    >
      {/* Logo + collapse toggle */}
      <div className={`flex items-center pt-10 pb-8 px-4 ${collapsed ? 'justify-center px-0' : 'px-6'}`}>
        {collapsed ? (
          <span className="material-symbols-outlined text-3xl" style={{ color: '#D0BCFF' }}>graphic_eq</span>
        ) : (
          <div className="text-3xl font-bold tracking-tighter flex-1" style={{ color: '#D0BCFF' }}>
            hifi
          </div>
        )}
        {!collapsed && (
          <button
            onClick={() => setCollapsed(true)}
            title="Collapse sidebar"
            className="bg-transparent border-none cursor-pointer p-1 rounded hover:bg-white/10"
            style={{ color: '#CBC3D7' }}
          >
            <span className="material-symbols-outlined text-lg">chevron_left</span>
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className={`flex-1 flex flex-col gap-0.5 pt-2 ${collapsed ? 'items-center' : ''}`}>
        {navItems.map(item => {
          const active = isActive(item.path);
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              title={collapsed ? item.label : undefined}
              className={`flex items-center gap-3 py-2.5 text-sm font-bold border-none cursor-pointer ${collapsed ? 'w-10 justify-center rounded-lg' : 'px-6 w-full text-left'}`}
              style={{
                background: active ? 'rgba(208,188,255,0.2)' : 'transparent',
                color: active ? '#D0BCFF' : '#CBC3D7',
                fontWeight: active ? 700 : 400,
                borderRight: collapsed ? 'none' : (active ? '4px solid #D0BCFF' : '4px solid transparent'),
              }}
            >
              <span className="material-symbols-outlined text-xl"
                style={{ fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0" }}>
                {item.icon}
              </span>
              {!collapsed && <span>{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* User profile at bottom + expand button when collapsed */}
      <div className={collapsed ? 'flex flex-col items-center gap-2 pb-6' : 'px-6 pb-6'}>
        {collapsed && (
          <button
            onClick={() => setCollapsed(false)}
            title="Expand sidebar"
            className="bg-transparent border-none cursor-pointer p-1 rounded hover:bg-white/10"
            style={{ color: '#CBC3D7' }}
          >
            <span className="material-symbols-outlined text-lg">chevron_right</span>
          </button>
        )}
        <div
          className={`flex items-center gap-3 py-2.5 rounded-lg cursor-pointer hover:bg-white/5 transition-colors ${collapsed ? 'justify-center w-10' : 'px-4'}`}
          onClick={logout}
          title={collapsed ? `Log out ${username || ''}` : undefined}
        >
          <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: '#D0BCFF' }}>
            <span className="material-symbols-outlined text-sm"
              style={{ color: '#1A0A2E' }}>
              person
            </span>
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate"
                style={{ color: '#E5E2E1' }}>
                {username || 'User'}
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
