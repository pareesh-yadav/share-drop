/**
 * WebRTCManager
 *
 * Manages the lifecycle of RTCPeerConnections and RTCDataChannels.
 * One WebRTCManager instance handles connections to multiple peers.
 *
 * IMPORTANT: This class does NOT live in React state or Zustand.
 * RTCPeerConnection and RTCDataChannel are not serializable.
 * The manager communicates with the UI via Zustand store updates
 * and typed event callbacks.
 *
 * Architecture:
 *   WebRTCManager
 *     ├── PeerConnection map (peerId → RTCPeerConnection)
 *     ├── DataChannel map (peerId → RTCDataChannel)
 *     └── Emits events → TransferEngine + Zustand stores
 */

import {
  BUFFERED_AMOUNT_LOW_THRESHOLD,
  CONNECTION_TIMEOUT_MS,
  PROTOCOL_VERSION,
} from '../../types';
import type { SignalingMessage } from '../../types';
import { useConnectionStore } from '../../stores/connectionStore';
import { useUIStore } from '../../stores/uiStore';
import { logger } from '../../utils/logger';
import type { SignalingManager } from '../signaling/SignalingManager';

export type DataChannelMessageHandler = (
  peerId: string,
  data: ArrayBuffer | string
) => void;

export interface ICEServerConfig {
  urls: string[];
  username?: string;
  credential?: string;
}

function getIceServers(): RTCIceServer[] {
  const stunUrls = import.meta.env.VITE_STUN_SERVERS
    ? (import.meta.env.VITE_STUN_SERVERS as string).split(',').map((s: string) => s.trim())
    : ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'];

  const servers: RTCIceServer[] = [{ urls: stunUrls }];

  // TURN servers (production: fetch from server-side endpoint)
  const turnEnv = import.meta.env.VITE_TURN_SERVERS as string | undefined;
  if (turnEnv) {
    try {
      const turnConfigs = JSON.parse(turnEnv) as ICEServerConfig[];
      servers.push(...turnConfigs);
    } catch {
      logger.webrtc.warn('Failed to parse VITE_TURN_SERVERS');
    }
  }

  return servers;
}

export class WebRTCManager {
  private signalingManager: SignalingManager;
  private connections = new Map<string, RTCPeerConnection>();
  private dataChannels = new Map<string, RTCDataChannel>();
  private myPeerId = '';
  private roomId = '';
  private dataChannelHandlers: Set<DataChannelMessageHandler> = new Set();
  private connectionTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(signalingManager: SignalingManager) {
    this.signalingManager = signalingManager;
    signalingManager.setWebRTCCallback(this.handleSignal.bind(this));
  }

  setIdentity(myPeerId: string, roomId: string) {
    this.myPeerId = myPeerId;
    this.roomId = roomId;
  }

  /**
   * Initiate a WebRTC connection to a peer (as the offerer).
   */
  async connectToPeer(remotePeerId: string): Promise<void> {
    if (this.connections.has(remotePeerId)) {
      logger.webrtc.warn(`Already connected/connecting to ${remotePeerId}`);
      return;
    }

    const pc = this.createPeerConnection(remotePeerId);

    // Create the data channel (offerer creates it)
    const dc = pc.createDataChannel('file-transfer', {
      ordered: true,
    });
    dc.bufferedAmountLowThreshold = BUFFERED_AMOUNT_LOW_THRESHOLD;
    this.setupDataChannel(remotePeerId, dc);

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      this.signalingManager.sendSignal({
        type: 'offer',
        roomId: this.roomId,
        fromPeerId: this.myPeerId,
        toPeerId: remotePeerId,
        sdp: pc.localDescription!,
        timestamp: Date.now(),
        protocolVersion: PROTOCOL_VERSION,
      });

      logger.webrtc.info(`Offer sent to ${remotePeerId}`);
    } catch (err) {
      logger.webrtc.error('Failed to create offer', err);
      this.cleanupPeer(remotePeerId);
    }
  }

  /**
   * Handle incoming signaling messages (offer/answer/ICE candidate).
   */
  private async handleSignal(msg: SignalingMessage, fromPeerId: string) {
    switch (msg.type) {
      case 'offer':
        await this.handleOffer(fromPeerId, msg.sdp);
        break;
      case 'answer':
        await this.handleAnswer(fromPeerId, msg.sdp);
        break;
      case 'ice:candidate':
        await this.handleIceCandidate(fromPeerId, msg.candidate);
        break;
      default:
        break;
    }
  }

  private async handleOffer(remotePeerId: string, sdp: RTCSessionDescriptionInit) {
    logger.webrtc.info(`Handling offer from ${remotePeerId}`);

    const pc = this.createPeerConnection(remotePeerId);

    // Listen for data channel (answerer receives it)
    pc.ondatachannel = (event) => {
      const dc = event.channel;
      dc.bufferedAmountLowThreshold = BUFFERED_AMOUNT_LOW_THRESHOLD;
      this.setupDataChannel(remotePeerId, dc);
      logger.webrtc.info(`DataChannel received from ${remotePeerId}`);
    };

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      this.signalingManager.sendSignal({
        type: 'answer',
        roomId: this.roomId,
        fromPeerId: this.myPeerId,
        toPeerId: remotePeerId,
        sdp: pc.localDescription!,
        timestamp: Date.now(),
        protocolVersion: PROTOCOL_VERSION,
      });

      logger.webrtc.info(`Answer sent to ${remotePeerId}`);
    } catch (err) {
      logger.webrtc.error('Failed to handle offer', err);
      this.cleanupPeer(remotePeerId);
    }
  }

  private async handleAnswer(remotePeerId: string, sdp: RTCSessionDescriptionInit) {
    const pc = this.connections.get(remotePeerId);
    if (!pc) {
      logger.webrtc.warn(`No connection found for ${remotePeerId} when handling answer`);
      return;
    }

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      logger.webrtc.info(`Answer set for ${remotePeerId}`);
    } catch (err) {
      logger.webrtc.error('Failed to set remote description', err);
    }
  }

  private async handleIceCandidate(remotePeerId: string, candidateInit: RTCIceCandidateInit) {
    const pc = this.connections.get(remotePeerId);
    if (!pc) return;

    try {
      if (candidateInit.candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(candidateInit));
      }
    } catch (err) {
      logger.webrtc.warn('Failed to add ICE candidate', err);
    }
  }

  private createPeerConnection(remotePeerId: string): RTCPeerConnection {
    const pc = new RTCPeerConnection({ iceServers: getIceServers() });
    this.connections.set(remotePeerId, pc);

    // Connection state tracking
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      logger.webrtc.info(`Connection state [${remotePeerId}]: ${state}`);

      const storeState = (() => {
        switch (state) {
          case 'connecting': return 'connecting' as const;
          case 'connected': return 'connected' as const;
          case 'disconnected': return 'reconnecting' as const;
          case 'failed': return 'failed' as const;
          case 'closed': return 'disconnected' as const;
          default: return 'idle' as const;
        }
      })();

      useConnectionStore.getState().setConnectionState(remotePeerId, storeState);

      if (state === 'connected') {
        const timeout = this.connectionTimeouts.get(remotePeerId);
        if (timeout) {
          clearTimeout(timeout);
          this.connectionTimeouts.delete(remotePeerId);
        }
        useUIStore.getState().addToast({
          type: 'success',
          title: 'Peer Connected',
          message: 'WebRTC DataChannel is ready',
          duration: 3000,
        });
      }

      if (state === 'failed') {
        useUIStore.getState().addToast({
          type: 'error',
          title: 'Connection Failed',
          message: 'Unable to establish a peer connection.',
        });
      }
    };

    // ICE connection state
    pc.oniceconnectionstatechange = () => {
      const iceState = pc.iceConnectionState;
      logger.webrtc.debug(`ICE state [${remotePeerId}]: ${iceState}`);
      useConnectionStore.getState().updateConnectionInfo(remotePeerId, {
        iceState,
      });
    };

    // Signaling state
    pc.onsignalingstatechange = () => {
      useConnectionStore.getState().updateConnectionInfo(remotePeerId, {
        signalingState: pc.signalingState,
      });
    };

    // ICE candidates — trickle ICE
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.signalingManager.sendSignal({
          type: 'ice:candidate',
          roomId: this.roomId,
          fromPeerId: this.myPeerId,
          toPeerId: remotePeerId,
          candidate: event.candidate.toJSON(),
          timestamp: Date.now(),
          protocolVersion: PROTOCOL_VERSION,
        });
      }
    };

    // Determine transport type from ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.signalingManager.sendSignal({
          type: 'ice:candidate',
          roomId: this.roomId,
          fromPeerId: this.myPeerId,
          toPeerId: remotePeerId,
          candidate: event.candidate.toJSON(),
          timestamp: Date.now(),
          protocolVersion: PROTOCOL_VERSION,
        });
      } else {
        // ICE gathering complete — check transport type
        this.determineTransportType(pc, remotePeerId);
      }
    };

    // Connection timeout
    const timeout = setTimeout(() => {
      if (pc.connectionState !== 'connected') {
        logger.webrtc.error(`Connection timeout for ${remotePeerId}`);
        useConnectionStore.getState().setConnectionState(remotePeerId, 'failed');
        useUIStore.getState().addToast({
          type: 'error',
          title: 'Connection Timed Out',
          message: 'Could not connect to peer. Try reopening the room.',
        });
        this.cleanupPeer(remotePeerId);
      }
    }, CONNECTION_TIMEOUT_MS);
    this.connectionTimeouts.set(remotePeerId, timeout);

    useConnectionStore.getState().setConnectionState(remotePeerId, 'connecting');

    return pc;
  }

  private setupDataChannel(remotePeerId: string, dc: RTCDataChannel) {
    this.dataChannels.set(remotePeerId, dc);

    dc.onopen = () => {
      logger.webrtc.info(`DataChannel open [${remotePeerId}]`);
      useConnectionStore.getState().updateConnectionInfo(remotePeerId, {
        dataChannelState: dc.readyState,
      });
    };

    dc.onclose = () => {
      logger.webrtc.info(`DataChannel closed [${remotePeerId}]`);
      useConnectionStore.getState().updateConnectionInfo(remotePeerId, {
        dataChannelState: dc.readyState,
      });
    };

    dc.onerror = (event) => {
      logger.webrtc.error('DataChannel error', event);
    };

    dc.onmessage = (event) => {
      const data = event.data as ArrayBuffer | string;
      this.dataChannelHandlers.forEach((h) => h(remotePeerId, data));
    };
  }

  private async determineTransportType(pc: RTCPeerConnection, peerId: string) {
    try {
      const stats = await pc.getStats();
      stats.forEach((report) => {
        if (report.type === 'candidate-pair' && report.state === 'succeeded') {
          const localCandidate = stats.get(report.localCandidateId);
          if (localCandidate?.candidateType === 'relay') {
            useConnectionStore.getState().setTransportType(peerId, 'relay');
          } else {
            useConnectionStore.getState().setTransportType(peerId, 'direct');
          }
        }
      });
    } catch {
      // Stats not available — leave as unknown
    }
  }

  /**
   * Send data to a peer via DataChannel.
   */
  send(peerId: string, data: string | ArrayBuffer): boolean {
    const dc = this.dataChannels.get(peerId);
    if (!dc || dc.readyState !== 'open') {
      logger.webrtc.warn(`DataChannel not open for ${peerId}`);
      return false;
    }
    try {
      dc.send(data as string);
      return true;
    } catch (err) {
      logger.webrtc.error('Failed to send via DataChannel', err);
      return false;
    }
  }

  /**
   * Get buffered amount for a peer's data channel.
   */
  getBufferedAmount(peerId: string): number {
    return this.dataChannels.get(peerId)?.bufferedAmount ?? 0;
  }

  /**
   * Set bufferedamountlow handler for backpressure.
   */
  onBufferedAmountLow(peerId: string, cb: () => void): (() => void) | null {
    const dc = this.dataChannels.get(peerId);
    if (!dc) return null;
    dc.onbufferedamountlow = cb;
    return () => { dc.onbufferedamountlow = null; };
  }

  /**
   * Register a handler for incoming DataChannel messages.
   */
  onDataChannelMessage(handler: DataChannelMessageHandler): () => void {
    this.dataChannelHandlers.add(handler);
    return () => this.dataChannelHandlers.delete(handler);
  }

  /**
   * Check if a data channel is open for a peer.
   */
  isChannelOpen(peerId: string): boolean {
    return this.dataChannels.get(peerId)?.readyState === 'open';
  }

  /**
   * Get all connected peer IDs.
   */
  getConnectedPeers(): string[] {
    return Array.from(this.connections.entries())
      .filter(([, pc]) => pc.connectionState === 'connected')
      .map(([id]) => id);
  }

  /**
   * Clean up a specific peer connection.
   */
  cleanupPeer(peerId: string) {
    const timeout = this.connectionTimeouts.get(peerId);
    if (timeout) {
      clearTimeout(timeout);
      this.connectionTimeouts.delete(peerId);
    }

    const dc = this.dataChannels.get(peerId);
    if (dc) {
      dc.onmessage = null;
      dc.onopen = null;
      dc.onclose = null;
      dc.onerror = null;
      dc.onbufferedamountlow = null;
      try { dc.close(); } catch { /* ignore */ }
      this.dataChannels.delete(peerId);
    }

    const pc = this.connections.get(peerId);
    if (pc) {
      pc.onconnectionstatechange = null;
      pc.oniceconnectionstatechange = null;
      pc.onsignalingstatechange = null;
      pc.onicecandidate = null;
      pc.ondatachannel = null;
      try { pc.close(); } catch { /* ignore */ }
      this.connections.delete(peerId);
    }

    useConnectionStore.getState().removeConnection(peerId);
    logger.webrtc.info(`Cleaned up peer ${peerId}`);
  }

  /**
   * Destroy all connections.
   */
  destroy() {
    for (const peerId of Array.from(this.connections.keys())) {
      this.cleanupPeer(peerId);
    }
    this.dataChannelHandlers.clear();
    logger.webrtc.info('WebRTCManager destroyed');
  }
}
