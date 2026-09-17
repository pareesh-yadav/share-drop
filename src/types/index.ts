// Core domain types for ShareDrop

// ─── Room ───────────────────────────────────────────────────────────────────

export type DeviceType = 'desktop' | 'mobile' | 'tablet' | 'unknown';

export interface Peer {
  id: string;
  displayName: string;
  deviceType: DeviceType;
  connectedAt: number;
}

export interface Room {
  id: string;
  createdAt: number;
  expiresAt: number;
  peers: Peer[];
  passwordProtected?: boolean;
}

// ─── Connection ──────────────────────────────────────────────────────────────

export type ConnectionState =
  | 'idle'
  | 'creating-room'
  | 'joining-room'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'failed'
  | 'expired';

export type TransportType = 'direct' | 'relay' | 'unknown';

export interface ConnectionInfo {
  state: ConnectionState;
  transportType: TransportType;
  iceState: RTCIceConnectionState | null;
  dataChannelState: RTCDataChannelState | null;
  signalingState: RTCSignalingState | null;
  rtt?: number;
  connectedAt?: number;
}

// ─── Signaling ───────────────────────────────────────────────────────────────

export type SignalType =
  | 'room:created'
  | 'room:joined'
  | 'room:expired'
  | 'peer:joined'
  | 'peer:left'
  | 'offer'
  | 'answer'
  | 'ice:candidate'
  | 'peer:ping'
  | 'peer:pong'
  | 'error';

export interface BaseSignalMessage {
  type: SignalType;
  roomId: string;
  fromPeerId: string;
  toPeerId?: string;
  timestamp: number;
  protocolVersion: 1;
}

export interface RoomCreatedMessage extends BaseSignalMessage {
  type: 'room:created';
  room: Room;
  myPeerId: string;
}

export interface RoomJoinedMessage extends BaseSignalMessage {
  type: 'room:joined';
  room: Room;
  myPeerId: string;
}

export interface RoomExpiredMessage extends BaseSignalMessage {
  type: 'room:expired';
}

export interface PeerJoinedMessage extends BaseSignalMessage {
  type: 'peer:joined';
  peer: Peer;
}

export interface PeerLeftMessage extends BaseSignalMessage {
  type: 'peer:left';
  peerId: string;
}

export interface OfferMessage extends BaseSignalMessage {
  type: 'offer';
  sdp: RTCSessionDescriptionInit;
  toPeerId: string;
}

export interface AnswerMessage extends BaseSignalMessage {
  type: 'answer';
  sdp: RTCSessionDescriptionInit;
  toPeerId: string;
}

export interface IceCandidateMessage extends BaseSignalMessage {
  type: 'ice:candidate';
  candidate: RTCIceCandidateInit;
  toPeerId: string;
}

export interface PingMessage extends BaseSignalMessage {
  type: 'peer:ping';
}

export interface PongMessage extends BaseSignalMessage {
  type: 'peer:pong';
}

export interface ErrorMessage extends BaseSignalMessage {
  type: 'error';
  code: string;
  message: string;
}

export type SignalingMessage =
  | RoomCreatedMessage
  | RoomJoinedMessage
  | RoomExpiredMessage
  | PeerJoinedMessage
  | PeerLeftMessage
  | OfferMessage
  | AnswerMessage
  | IceCandidateMessage
  | PingMessage
  | PongMessage
  | ErrorMessage;

// ─── Transfer ────────────────────────────────────────────────────────────────

export type TransferMessageType =
  | 'TRANSFER_REQUEST'
  | 'TRANSFER_ACCEPT'
  | 'TRANSFER_REJECT'
  | 'FILE_START'
  | 'FILE_CHUNK'
  | 'FILE_COMPLETE'
  | 'TRANSFER_COMPLETE'
  | 'TRANSFER_CANCEL'
  | 'TRANSFER_ERROR';

export interface FileMetadata {
  transferId: string;
  fileId: string;
  name: string;
  size: number;
  mimeType: string;
  lastModified?: number;
  hash?: string; // SHA-256, computed after transfer for integrity
}

export interface TransferRequest {
  type: 'TRANSFER_REQUEST';
  transferId: string;
  files: FileMetadata[];
  totalSize: number;
  protocolVersion: 1;
}

export interface TransferAccept {
  type: 'TRANSFER_ACCEPT';
  transferId: string;
}

export interface TransferReject {
  type: 'TRANSFER_REJECT';
  transferId: string;
  reason?: string;
}

export interface FileStart {
  type: 'FILE_START';
  transferId: string;
  fileId: string;
  totalChunks: number;
  chunkSize: number;
}

export interface FileChunk {
  type: 'FILE_CHUNK';
  transferId: string;
  fileId: string;
  chunkIndex: number;
  data: ArrayBuffer;
}

export interface FileComplete {
  type: 'FILE_COMPLETE';
  transferId: string;
  fileId: string;
  receivedBytes: number;
  hash?: string;
}

export interface TransferComplete {
  type: 'TRANSFER_COMPLETE';
  transferId: string;
}

export interface TransferCancel {
  type: 'TRANSFER_CANCEL';
  transferId: string;
  reason?: string;
}

export interface TransferError {
  type: 'TRANSFER_ERROR';
  transferId: string;
  fileId?: string;
  error: string;
}

export type TransferMessage =
  | TransferRequest
  | TransferAccept
  | TransferReject
  | FileStart
  | FileChunk
  | FileComplete
  | TransferComplete
  | TransferCancel
  | TransferError;

// ─── Transfer State ──────────────────────────────────────────────────────────

export type TransferStatus =
  | 'pending'
  | 'waiting'
  | 'transferring'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'rejected';

export type TransferDirection = 'send' | 'receive';

export interface FileProgress {
  fileId: string;
  name: string;
  size: number;
  mimeType: string;
  bytesTransferred: number;
  status: TransferStatus;
  integrityVerified?: boolean;
}

export interface TransferRecord {
  transferId: string;
  direction: TransferDirection;
  peerId: string;
  peerName: string;
  files: FileProgress[];
  totalSize: number;
  totalBytesTransferred: number;
  status: TransferStatus;
  startedAt: number;
  completedAt?: number;
  speed: number;           // bytes/sec rolling average
  eta: number;             // seconds, -1 if unknown
  error?: string;
}

// ─── Transfer Events ─────────────────────────────────────────────────────────

export type TransferEvent =
  | { type: 'request'; record: TransferRecord }
  | { type: 'accepted'; transferId: string }
  | { type: 'rejected'; transferId: string }
  | { type: 'started'; transferId: string }
  | { type: 'progress'; transferId: string; fileId: string; bytesTransferred: number; speed: number; eta: number }
  | { type: 'file-complete'; transferId: string; fileId: string; integrityVerified?: boolean }
  | { type: 'completed'; transferId: string }
  | { type: 'cancelled'; transferId: string }
  | { type: 'failed'; transferId: string; error: string };

// ─── History ─────────────────────────────────────────────────────────────────

export interface HistoryEntry {
  id: string;
  transferId: string;
  direction: TransferDirection;
  peerName: string;
  files: Array<{ name: string; size: number; mimeType: string }>;
  totalSize: number;
  status: TransferStatus;
  startedAt: number;
  completedAt?: number;
  speed: number;
  integrityVerified?: boolean;
}

// ─── Settings ────────────────────────────────────────────────────────────────

export type Theme = 'dark' | 'light' | 'system';
export type DownloadBehavior = 'auto' | 'prompt' | 'stream';

export interface Settings {
  displayName: string;
  theme: Theme;
  autoAccept: boolean;
  downloadBehavior: DownloadBehavior;
  desktopNotifications: boolean;
  soundEnabled: boolean;
  maxConcurrentTransfers: number;
}

// ─── Protocol Constants ──────────────────────────────────────────────────────

export const PROTOCOL_VERSION = 1 as const;
export const CHUNK_SIZE = 64 * 1024; // 64 KB
export const MAX_BUFFERED_AMOUNT = 16 * 1024 * 1024; // 16 MB
export const BUFFERED_AMOUNT_LOW_THRESHOLD = 4 * 1024 * 1024; // 4 MB
export const ROOM_TTL_MS = 30 * 60 * 1000; // 30 minutes
export const MAX_FILENAME_LENGTH = 255;
export const MAX_FILES_PER_TRANSFER = 100;
export const MAX_SIGNALING_PAYLOAD_BYTES = 65_536; // 64 KB
export const MAX_PEERS_PER_ROOM = 10;
export const RECONNECT_MAX_ATTEMPTS = 5;
export const RECONNECT_BASE_DELAY_MS = 1000;
export const CONNECTION_TIMEOUT_MS = 30_000;
export const PROGRESS_THROTTLE_MS = 100; // UI update throttle
export const SPEED_SAMPLE_WINDOW_MS = 3000; // 3-second rolling average
