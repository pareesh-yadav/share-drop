import React from 'react';
import { Header } from '../components/layout/Header';
import { Card } from '../components/ui';
import { HelpCircle, Wifi, Shield, Zap, AlertTriangle, Globe } from 'lucide-react';

export default function HelpPage() {
  return (
    <div className="min-h-screen bg-[var(--color-surface-0)] flex flex-col">
      <Header />
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-8 space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text-main)]">Help</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">How ShareDrop works</p>
        </div>

        <Section title="What is ShareDrop?" icon={<HelpCircle />}>
          <p>
            ShareDrop is a browser-based file sharing tool that transfers files directly between devices
            using WebRTC DataChannels. Files go peer-to-peer whenever possible — no permanent cloud storage is involved.
          </p>
        </Section>

        <Section title="How peer-to-peer transfer works" icon={<Zap />}>
          <ol className="list-decimal list-inside space-y-2">
            <li>Device A creates a room and gets a short room code.</li>
            <li>Device B scans the QR code or enters the room code.</li>
            <li>Both devices negotiate a WebRTC connection via a signaling server.</li>
            <li>Once connected, files are sent directly over an encrypted DataChannel.</li>
            <li>The signaling server is not involved in the file transfer itself.</li>
          </ol>
        </Section>

        <Section title="What is WebRTC?" icon={<Wifi />}>
          <p>
            WebRTC (Web Real-Time Communication) is a browser standard for peer-to-peer communication.
            It enables direct connections between browsers for audio, video, and data — without a server in the middle.
            File data in ShareDrop travels over a WebRTC DataChannel, which provides ordered, reliable delivery.
          </p>
        </Section>

        <Section title="Why is signaling required?" icon={<HelpCircle />}>
          <p>
            To establish a direct WebRTC connection, both devices must first exchange connection metadata
            (called SDP offer/answer) and network candidates (ICE candidates). This exchange happens via
            our signaling server. Once the connection is established, the signaling server is no longer involved.
          </p>
        </Section>

        <Section title="What is a TURN server?" icon={<Wifi />}>
          <p>
            In some networks (corporate firewalls, strict NAT), direct WebRTC connections fail.
            A TURN server acts as a relay — file data passes through it, but it is encrypted end-to-end via DTLS.
            TURN is only used as a fallback. We do not log or store relayed data.
          </p>
          <p className="mt-2 text-[var(--color-text-dim)]">
            You can see whether your connection is Direct or Relay in the Connection Diagnostics panel on the room page.
          </p>
        </Section>

        <Section title="Is the file uploaded to a server?" icon={<Shield />}>
          <p>
            No. Files are never uploaded to our server during a normal peer-to-peer transfer.
            If TURN relay is required, file bytes temporarily pass through the TURN relay server
            (encrypted via DTLS) but are not stored.
          </p>
        </Section>

        <Section title="Browser compatibility" icon={<Globe />}>
          <p>ShareDrop requires a modern browser with WebRTC support:</p>
          <ul className="list-disc list-inside mt-2 space-y-1">
            <li>Google Chrome 74+ ✅</li>
            <li>Microsoft Edge 79+ ✅</li>
            <li>Mozilla Firefox 72+ ✅</li>
            <li>Safari 15.4+ ✅ (with some limitations)</li>
            <li>Chrome for Android ✅</li>
            <li>Safari on iOS 15.4+ ✅</li>
          </ul>
        </Section>

        <Section title="Large file limitations" icon={<AlertTriangle />}>
          <ul className="list-disc list-inside space-y-1">
            <li>Browser memory limits may affect files larger than 1 GB on some devices.</li>
            <li>Mobile browsers may suspend background tabs, interrupting transfers.</li>
            <li>TURN relay bandwidth is finite — very large files may be slower over relay.</li>
            <li>ShareDrop uses File System Access API (Chrome/Edge) to stream writes directly to disk when available, reducing memory pressure for large files.</li>
          </ul>
        </Section>

        <Section title="Troubleshooting" icon={<HelpCircle />}>
          <ul className="list-disc list-inside space-y-1">
            <li><strong>Connection failed:</strong> Try switching networks (e.g., mobile data instead of Wi-Fi) or using a different browser.</li>
            <li><strong>Transfer stalls:</strong> Both devices must keep the browser tab active. Background tabs may be throttled.</li>
            <li><strong>QR not scanning:</strong> Use the room code directly instead.</li>
            <li><strong>Room not found:</strong> Rooms expire after 30 minutes. Create a new room.</li>
          </ul>
        </Section>
      </main>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[var(--color-brand-500)] dark:text-[var(--color-brand-400)] w-4 h-4 shrink-0" aria-hidden>{icon}</span>
        <h2 className="text-sm font-semibold text-[var(--color-text-main)]">{title}</h2>
      </div>
      <div className="text-sm text-[var(--color-text-muted)] leading-relaxed space-y-2">{children}</div>
    </Card>
  );
}
