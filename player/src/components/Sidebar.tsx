import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../core/AuthContext';

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { username, logout } = useAuth();

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
    <aside className="hidden md:flex flex-col h-screen fixed left-0 top-0 z-40 w-64"
      style={{
        background: '#0A0A0A',
        borderRight: '1px solid #494454',
      }}>
      {/* Logo */}
      <div className="px-6 pt-10 pb-8 text-3xl font-bold tracking-tighter"
        style={{ color: '#D0BCFF' }}>
        hifi
      </div>

      {/* Navigation */}
      <nav className="flex-1 flex flex-col gap-0.5 pt-2">
        {navItems.map(item => {
          const active = isActive(item.path);
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className="flex items-center gap-3 px-6 py-2.5 w-full text-left border-none cursor-pointer text-sm font-bold"
              style={{
                background: active ? 'rgba(208,188,255,0.2)' : 'transparent',
                color: active ? '#D0BCFF' : '#CBC3D7',
                fontWeight: active ? 700 : 400,
                borderRight: active ? '4px solid #D0BCFF' : '4px solid transparent',
              }}
            >
              <span className="material-symbols-outlined text-xl"
                style={{ fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0" }}>
                {item.icon}
              </span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* User profile at bottom */}
      <div className="px-6 pb-6">
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg cursor-pointer hover:bg-white/5 transition-colors"
          onClick={logout}>
          <div className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: '#D0BCFF' }}>
            <span className="material-symbols-outlined text-sm"
              style={{ color: '#1A0A2E' }}>
              person
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold truncate"
              style={{ color: '#E5E2E1' }}>
              {username || 'User'}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}