import React, { memo } from 'react';
import { Monitor, Smartphone, Tablet, Cpu } from 'lucide-react';
import { cn } from '../../utils/cn';
import type { Peer } from '../../types';
import { useConnectionStore } from '../../stores/connectionStore';
import { Badge } from '../../components/ui';

interface Props {
  peers: Peer[];
  selectedPeerId: string | null;
  onSelectPeer: (id: string) => void;
}

export function PeerList({ peers, selectedPeerId, onSelectPeer }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" role="listbox" aria-label="Connected devices">
      {peers.map((peer) => (
        <PeerCard
          key={peer.id}
          peer={peer}
          selected={peer.id === selectedPeerId}
          onSelect={() => onSelectPeer(peer.id)}
        />
      ))}
    </div>
  );
}

interface PeerCardProps {
  peer: Peer;
  selected: boolean;
  onSelect: () => void;
}

const PeerCard = memo(function PeerCard({ peer, selected, onSelect }: PeerCardProps) {
  const connectionInfo = useConnectionStore((s) => s.connections.get(peer.id));
  const state = connectionInfo?.state ?? 'connected';
  const transportType = connectionInfo?.transportType ?? 'unknown';

  const DeviceIcon = getDeviceIcon(peer.deviceType);

  const statusConfig = getStatusConfig(state);

  return (
    <button
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      className={cn(
        'w-full text-left rounded-xl p-4 border transition-all duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-400)]',
        selected
          ? 'border-[var(--color-brand-500)]/60 bg-[var(--color-brand-500)]/10'
          : 'border-[var(--color-surface-3)] bg-[var(--color-surface-2)] hover:border-[var(--color-brand-500)]/30 hover:bg-[var(--color-surface-2)]'
      )}
    >
      <div className="flex items-start gap-3">
        {/* Device icon */}
        <div className={cn(
          'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
          selected ? 'bg-[var(--color-brand-500)]/20' : 'bg-[var(--color-surface-3)]'
        )}>
          <DeviceIcon
            className={cn('w-5 h-5', selected ? 'text-[var(--color-brand-500)] dark:text-[var(--color-brand-300)]' : 'text-[var(--color-text-muted)]')}
            aria-hidden
          />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[var(--color-text-main)] truncate">{peer.displayName}</p>

          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {/* Status indicator */}
            <span className="flex items-center gap-1">
              <span
                className={cn('w-2 h-2 rounded-full', statusConfig.dotClass)}
                aria-hidden
              />
              <span className={cn('text-xs', statusConfig.textClass)}>
                {statusConfig.label}
              </span>
            </span>

            {/* Transport type */}
            {transportType !== 'unknown' && (
              <Badge variant={transportType === 'direct' ? 'success' : 'warning'}>
                {transportType === 'direct' ? 'Direct' : 'Relay'}
              </Badge>
            )}
          </div>

          {selected && (
            <p className="text-xs text-[var(--color-brand-400)] mt-1 font-medium">
              Selected — drop files to send
            </p>
          )}
        </div>
      </div>
    </button>
  );
});

function getDeviceIcon(deviceType: Peer['deviceType']) {
  switch (deviceType) {
    case 'mobile': return Smartphone;
    case 'tablet': return Tablet;
    case 'desktop': return Monitor;
    default: return Cpu;
  }
}

function getStatusConfig(state: string) {
  switch (state) {
    case 'connected':
      return { dotClass: 'bg-emerald-400', textClass: 'text-emerald-400', label: 'Connected' };
    case 'connecting':
      return { dotClass: 'bg-amber-400 animate-pulse', textClass: 'text-amber-400', label: 'Connecting' };
    case 'reconnecting':
      return { dotClass: 'bg-amber-400 animate-pulse', textClass: 'text-amber-400', label: 'Reconnecting' };
    case 'failed':
      return { dotClass: 'bg-red-400', textClass: 'text-red-400', label: 'Failed' };
    default:
      return { dotClass: 'bg-white/20', textClass: 'text-white/40', label: 'Unknown' };
  }
}
