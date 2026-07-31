import { useNavigate, useLocation } from 'react-router-dom';

export default function MobileBottomNav() {
  const navigate = useNavigate();
  const location = useLocation();

  const items = [
    { path: '/player', label: 'Play', icon: 'play_circle' },
    { path: '/library', label: 'Browse', icon: 'explore' },
    { path: '/settings', label: 'Settings', icon: 'settings' },
  ];

  function isActive(path: string) {
    if (path === '/library') return location.pathname.startsWith('/library');
    return location.pathname === path;
  }

  return (
    <nav className="md:hidden fixed bottom-0 w-full z-50 flex justify-around items-center px-4 py-3 bg-surface/80 backdrop-blur-2xl rounded-t-xl border-t border-white/15 shadow-[0_-8px_32px_rgba(0,0,0,0.5)]">
      {items.map(item => {
        const active = isActive(item.path);
        return (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            className={`flex flex-col items-center justify-center gap-0.5 px-4 py-1 rounded-xl transition-colors border-none cursor-pointer ${
              active
                ? 'text-primary bg-primary/10'
                : 'text-on-surface-variant hover:bg-white/5'
            }`}
            style={{ background: active ? 'rgba(208,188,255,0.1)' : 'transparent' }}
          >
            <span className="material-symbols-outlined text-xl">{item.icon}</span>
            <span className="text-label-sm">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
