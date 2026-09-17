import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Share2, History, Settings, HelpCircle, Moon, Sun } from 'lucide-react';
import { useSettingsStore } from '../../stores/settingsStore';
import { useRoomStore } from '../../stores/roomStore';
import { cn } from '../../utils/cn';

export function Header() {
  const roomId = useRoomStore((s) => s.room?.id);
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const location = useLocation();

  const [systemIsDark, setSystemIsDark] = React.useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)').matches : true
  );

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setSystemIsDark(e.matches);
    media.addEventListener('change', handler);
    return () => media.removeEventListener('change', handler);
  }, []);

  const isDark = theme === 'dark' || (theme === 'system' && systemIsDark);
  const isInRoom = location.pathname.startsWith('/room');

  function toggleTheme() {
    setTheme(isDark ? 'light' : 'dark');
  }

  return (
    <header className="sticky top-0 z-40 w-full border-b border-[var(--color-surface-3)]/80 bg-[var(--color-surface-0)]/85 backdrop-blur-xl transition-colors">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
        {/* Logo */}
        <Link
          to="/"
          className="flex items-center gap-2.5 group"
          aria-label="ShareDrop home"
        >
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[var(--color-brand-400)] to-[var(--color-brand-600)] flex items-center justify-center shadow-lg shadow-[var(--color-brand-500)]/20">
            <Share2 className="w-4 h-4 text-white" aria-hidden />
          </div>
          <span className="font-semibold text-[var(--color-text-main)] text-sm hidden sm:block group-hover:text-[var(--color-brand-500)] transition-colors">
            ShareDrop
          </span>
        </Link>

        {/* Room ID badge */}
        {isInRoom && roomId && (
          <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-surface-3)]">
            <span className="text-xs text-[var(--color-text-dim)] font-medium">Room</span>
            <span className="text-xs font-mono font-bold text-[var(--color-brand-500)] dark:text-[var(--color-brand-300)] tracking-widest">{roomId}</span>
          </div>
        )}

        {/* Nav actions */}
        <nav className="flex items-center gap-1" aria-label="Main navigation">
          <NavButton to="/history" icon={<History className="w-4 h-4" />} label="History" />
          <NavButton to="/settings" icon={<Settings className="w-4 h-4" />} label="Settings" />
          <NavButton to="/help" icon={<HelpCircle className="w-4 h-4" />} label="Help" />
          <button
            onClick={toggleTheme}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] hover:bg-[var(--color-surface-2)] transition-all cursor-pointer"
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-[var(--color-brand-600)]" />}
          </button>
        </nav>
      </div>
    </header>
  );
}

function NavButton({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  const location = useLocation();
  const isActive = location.pathname === to;
  return (
    <Link
      to={to}
      className={cn(
        'w-8 h-8 rounded-lg flex items-center justify-center transition-all',
        isActive
          ? 'bg-[var(--color-brand-500)]/15 text-[var(--color-brand-500)] dark:text-[var(--color-brand-300)] font-medium'
          : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] hover:bg-[var(--color-surface-2)]'
      )}
      aria-label={label}
      title={label}
    >
      {icon}
    </Link>
  );
}
