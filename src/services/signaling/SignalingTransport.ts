// SignalingTransport interface — the core abstraction.
// The React app depends only on this interface, not on any specific transport.

import type { SignalingMessage, Room } from '../../types';

export type SignalCallback = (msg: SignalingMessage) => void;
export type DisconnectCallback = () => void;
export type ErrorCallback = (err: Error) => void;

export interface SignalingTransport {
  /**
   * Connect to the signaling server.
   */
  connect(): Promise<void>;

  /**
   * Create a new room. Returns the created room and assigns a peer ID.
   */
  createRoom(displayName: string, deviceType: string): Promise<{ room: Room; myPeerId: string }>;

  /**
   * Join an existing room by ID.
   */
  joinRoom(
    roomId: string,
    displayName: string,
    deviceType: string
  ): Promise<{ room: Room; myPeerId: string }>;

  /**
   * Send a signaling message to a specific peer or broadcast to the room.
   */
  sendSignal(msg: SignalingMessage): void;

  /**
   * Register a callback for incoming signaling messages.
   * Returns an unsubscribe function.
   */
  onSignal(callback: SignalCallback): () => void;

  /**
   * Register a callback for transport disconnection.
   */
  onDisconnect(callback: DisconnectCallback): () => void;

  /**
   * Register a callback for transport errors.
   */
  onError(callback: ErrorCallback): () => void;

  /**
   * Disconnect and clean up.
   */
  disconnect(): void;

  /**
   * Whether the transport is currently connected.
   */
  isConnected(): boolean;
}
