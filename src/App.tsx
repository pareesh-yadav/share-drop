import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useSettingsStore } from './stores/settingsStore';
import { useEffect } from 'react';
import { Toaster } from './components/ui/Toaster';
import { IncomingTransferDialog } from './features/transfers/IncomingTransferDialog';
import { LeaveRoomDialog } from './features/room/LeaveRoomDialog';
import { useShareDrop } from './hooks/useShareDrop';

// Lazy-loaded routes for bundle optimization
const LandingPage = lazy(() => import('./pages/LandingPage'));
const RoomPage = lazy(() => import('./pages/RoomPage'));
const JoinPage = lazy(() => import('./pages/JoinPage'));
const HistoryPage = lazy(() => import('./pages/HistoryPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const HelpPage = lazy(() => import('./pages/HelpPage'));

function AppShell() {
  const {
    createRoom,
    joinRoom,
    leaveRoom,
    sendFiles,
    acceptTransfer,
    rejectTransfer,
    cancelTransfer,
    connectToPeer,
    isLocalMode,
  } = useShareDrop();

  // Apply theme
  const theme = useSettingsStore((s) => s.theme);
  useEffect(() => {
    const root = document.documentElement;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    function applyTheme() {
      const isDark = theme === 'dark' || (theme === 'system' && mediaQuery.matches);
      if (isDark) {
        root.classList.remove('light');
        root.classList.add('dark');
        root.style.colorScheme = 'dark';
      } else {
        root.classList.remove('dark');
        root.classList.add('light');
        root.style.colorScheme = 'light';
      }
    }

    applyTheme();

    if (theme === 'system') {
      mediaQuery.addEventListener('change', applyTheme);
      return () => mediaQuery.removeEventListener('change', applyTheme);
    }
  }, [theme]);

  const ctx = { createRoom, joinRoom, leaveRoom, sendFiles, acceptTransfer, rejectTransfer, cancelTransfer, connectToPeer, isLocalMode };

  return (
    <>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<LandingPage ctx={ctx} />} />
          <Route path="/room/:roomId" element={<RoomPage ctx={ctx} />} />
          <Route path="/join/:token" element={<JoinPage ctx={ctx} />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/help" element={<HelpPage />} />
        </Routes>
      </Suspense>
      <Toaster />
      <IncomingTransferDialog acceptTransfer={acceptTransfer} rejectTransfer={rejectTransfer} />
      <LeaveRoomDialog />
      {isLocalMode && <LocalModeBanner />}
    </>
  );
}

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-surface-0)]">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-2 border-[var(--color-brand-500)] border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-[var(--color-text-dim)] font-mono">Loading...</p>
      </div>
    </div>
  );
}

function LocalModeBanner() {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 py-2 px-4 bg-amber-500/20 border-t border-amber-500/30 text-center">
      <span className="text-xs text-amber-300 font-mono">
        ⚠️ Development Mode — Using BroadcastChannel signaling (same browser only). Set{' '}
        <code className="bg-amber-500/20 px-1 rounded">VITE_SIGNALING_URL</code> for production.
      </span>
    </div>
  );
}

export type AppCtx = ReturnType<typeof useShareDrop>;

export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}
