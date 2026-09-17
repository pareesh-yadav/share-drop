import React, { useState } from 'react';
import { Header } from '../components/layout/Header';
import { Card, Input, Button, Divider } from '../components/ui';
import { useSettingsStore } from '../stores/settingsStore';
import { User, Palette, Bell, Download, Shield } from 'lucide-react';

export default function SettingsPage() {
  const store = useSettingsStore();
  const [name, setName] = useState(store.displayName);
  const [saved, setSaved] = useState(false);

  function saveName() {
    store.setDisplayName(name);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="min-h-screen bg-[var(--color-surface-0)] flex flex-col">
      <Header />
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-8 space-y-6">
        <h1 className="text-xl font-semibold text-[var(--color-text-main)]">Settings</h1>

        {/* General */}
        <Card className="p-5 space-y-4">
          <div className="flex items-center gap-2 text-[var(--color-text-muted)] mb-1">
            <User className="w-4 h-4 text-[var(--color-brand-500)]" />
            <span className="text-sm font-medium">General</span>
          </div>
          <div className="flex gap-3">
            <Input
              label="Display Name"
              id="display-name-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={64}
              placeholder="Your name on this device"
              className="flex-1"
            />
            <Button
              onClick={saveName}
              variant="secondary"
              className="self-end"
            >
              {saved ? 'Saved!' : 'Save'}
            </Button>
          </div>
        </Card>

        {/* Theme */}
        <Card className="p-5 space-y-4">
          <div className="flex items-center gap-2 text-[var(--color-text-muted)] mb-1">
            <Palette className="w-4 h-4 text-[var(--color-brand-500)]" />
            <span className="text-sm font-medium">Appearance</span>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">Theme</label>
            <div className="grid grid-cols-3 gap-2 mt-1">
              {(['dark', 'light', 'system'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => store.setTheme(t)}
                  className={`rounded-xl p-3 text-sm capitalize border transition-all cursor-pointer ${
                    store.theme === t
                      ? 'border-[var(--color-brand-500)] bg-[var(--color-brand-500)]/15 text-[var(--color-brand-500)] dark:text-[var(--color-brand-300)] font-semibold shadow-sm'
                      : 'border-[var(--color-surface-3)] text-[var(--color-text-muted)] hover:text-[var(--color-text-main)] hover:bg-[var(--color-surface-2)]'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </Card>

        {/* Transfers */}
        <Card className="p-5 space-y-4">
          <div className="flex items-center gap-2 text-[var(--color-text-muted)] mb-1">
            <Download className="w-4 h-4 text-[var(--color-brand-500)]" />
            <span className="text-sm font-medium">Transfers</span>
          </div>
          <ToggleSetting
            id="auto-accept-toggle"
            label="Auto-accept transfers"
            description="Automatically accept all incoming transfers without confirmation. Disabled by default."
            checked={store.autoAccept}
            onChange={store.setAutoAccept}
          />
        </Card>

        {/* Notifications */}
        <Card className="p-5 space-y-4">
          <div className="flex items-center gap-2 text-[var(--color-text-muted)] mb-1">
            <Bell className="w-4 h-4 text-[var(--color-brand-500)]" />
            <span className="text-sm font-medium">Notifications</span>
          </div>
          <ToggleSetting
            id="desktop-notif-toggle"
            label="Desktop notifications"
            description="Show browser notifications for transfers and connections."
            checked={store.desktopNotifications}
            onChange={store.setDesktopNotifications}
          />
          <ToggleSetting
            id="sound-toggle"
            label="Sound"
            description="Play sounds for transfer events."
            checked={store.soundEnabled}
            onChange={store.setSoundEnabled}
          />
        </Card>

        {/* Privacy */}
        <Card className="p-5 space-y-3">
          <div className="flex items-center gap-2 text-[var(--color-text-muted)] mb-1">
            <Shield className="w-4 h-4 text-[var(--color-brand-500)]" />
            <span className="text-sm font-medium">Privacy & Data</span>
          </div>
          <div className="space-y-2 text-xs text-[var(--color-text-muted)] leading-relaxed">
            <p>
              <span className="text-[var(--color-text-main)] font-medium">What is stored locally: </span>
              Your display name, theme preference, and transfer history metadata (file names/sizes only, not file contents).
            </p>
            <p>
              <span className="text-[var(--color-text-main)] font-medium">What signaling does: </span>
              Signaling briefly routes WebRTC offer/answer/ICE messages through our server to establish the peer connection.
              No file data passes through the signaling server.
            </p>
            <p>
              <span className="text-[var(--color-text-main)] font-medium">What TURN relay means: </span>
              If a direct WebRTC connection cannot be established (due to strict NAT or firewall), file data may be relayed through a TURN server.
              We do not log or store relayed data.
            </p>
            <p>
              <span className="text-[var(--color-text-main)] font-medium">What is never stored: </span>
              File contents, passwords, personal data beyond your chosen display name.
            </p>
          </div>
        </Card>
      </main>
    </div>
  );
}

function ToggleSetting({
  id, label, description, checked, onChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <label htmlFor={id} className="text-sm text-[var(--color-text-main)] cursor-pointer font-medium">{label}</label>
        <p className="text-xs text-[var(--color-text-dim)] mt-0.5">{description}</p>
      </div>
      <button
        id={id}
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`shrink-0 w-10 h-5.5 rounded-full transition-colors relative cursor-pointer ${checked ? 'bg-[var(--color-brand-500)]' : 'bg-[var(--color-surface-3)]'}`}
      >
        <span
          className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`}
        />
        <span className="sr-only">{checked ? 'On' : 'Off'}</span>
      </button>
    </div>
  );
}
