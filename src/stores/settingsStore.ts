import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Settings, Theme } from '../types';
import { generateDisplayName } from '../utils/crypto';

interface SettingsState extends Settings {
  setDisplayName: (name: string) => void;
  setTheme: (theme: Theme) => void;
  setAutoAccept: (v: boolean) => void;
  setDesktopNotifications: (v: boolean) => void;
  setSoundEnabled: (v: boolean) => void;
  setMaxConcurrentTransfers: (n: number) => void;
  reset: () => void;
}

const DEFAULT_SETTINGS: Settings = {
  displayName: generateDisplayName(),
  theme: 'system',
  autoAccept: false,
  downloadBehavior: 'prompt',
  desktopNotifications: false,
  soundEnabled: false,
  maxConcurrentTransfers: 3,
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,

      setDisplayName: (name) => set({ displayName: name.slice(0, 64) || DEFAULT_SETTINGS.displayName }),
      setTheme: (theme) => set({ theme }),
      setAutoAccept: (autoAccept) => set({ autoAccept }),
      setDesktopNotifications: (desktopNotifications) => set({ desktopNotifications }),
      setSoundEnabled: (soundEnabled) => set({ soundEnabled }),
      setMaxConcurrentTransfers: (maxConcurrentTransfers) => set({ maxConcurrentTransfers }),
      reset: () => set(DEFAULT_SETTINGS),
    }),
    {
      name: 'sharedrop-settings',
      version: 1,
    }
  )
);
