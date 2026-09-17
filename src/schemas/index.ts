// Zod schemas for runtime validation of all messages

import { z } from 'zod';
import { MAX_FILENAME_LENGTH, MAX_SIGNALING_PAYLOAD_BYTES, PROTOCOL_VERSION } from '../types';

// ─── Peer & Room Schemas ──────────────────────────────────────────────────────

export const DeviceTypeSchema = z.enum(['desktop', 'mobile', 'tablet', 'unknown']);

export const PeerSchema = z.object({
  id: z.string().max(128),
  displayName: z.string().max(64).default('Anonymous'),
  deviceType: DeviceTypeSchema.default('unknown'),
  connectedAt: z.number().int().positive(),
});

export const RoomSchema = z.object({
  id: z.string().min(1).max(32),
  createdAt: z.number().int().positive(),
  expiresAt: z.number().int().positive(),
  peers: z.array(PeerSchema).max(10),
  passwordProtected: z.boolean().optional(),
});

// ─── Base Signaling Schema ────────────────────────────────────────────────────

const BaseSignalSchema = z.object({
  type: z.string(),
  roomId: z.string().max(32),
  fromPeerId: z.string().max(128),
  toPeerId: z.string().max(128).optional(),
  timestamp: z.number().int().positive(),
  protocolVersion: z.literal(PROTOCOL_VERSION),
});

// ─── Signaling Schemas ────────────────────────────────────────────────────────

export const RoomCreatedSchema = BaseSignalSchema.extend({
  type: z.literal('room:created'),
  room: RoomSchema,
  myPeerId: z.string().max(128),
});

export const RoomJoinedSchema = BaseSignalSchema.extend({
  type: z.literal('room:joined'),
  room: RoomSchema,
  myPeerId: z.string().max(128),
});

export const RoomExpiredSchema = BaseSignalSchema.extend({
  type: z.literal('room:expired'),
});

export const PeerJoinedSchema = BaseSignalSchema.extend({
  type: z.literal('peer:joined'),
  peer: PeerSchema,
});

export const PeerLeftSchema = BaseSignalSchema.extend({
  type: z.literal('peer:left'),
  peerId: z.string().max(128),
});

const RTCSdpSchema = z.object({
  type: z.enum(['offer', 'answer', 'pranswer', 'rollback']),
  sdp: z.string().max(MAX_SIGNALING_PAYLOAD_BYTES),
});

export const OfferSchema = BaseSignalSchema.extend({
  type: z.literal('offer'),
  sdp: RTCSdpSchema,
  toPeerId: z.string().max(128),
});

export const AnswerSchema = BaseSignalSchema.extend({
  type: z.literal('answer'),
  sdp: RTCSdpSchema,
  toPeerId: z.string().max(128),
});

const IceCandidateInitSchema = z.object({
  candidate: z.string().max(2048).optional(),
  sdpMid: z.string().max(64).nullable().optional(),
  sdpMLineIndex: z.number().int().nullable().optional(),
  usernameFragment: z.string().max(256).nullable().optional(),
});

export const IceCandidateSchema = BaseSignalSchema.extend({
  type: z.literal('ice:candidate'),
  candidate: IceCandidateInitSchema,
  toPeerId: z.string().max(128),
});

export const PingSchema = BaseSignalSchema.extend({ type: z.literal('peer:ping') });
export const PongSchema = BaseSignalSchema.extend({ type: z.literal('peer:pong') });

export const ErrorSignalSchema = BaseSignalSchema.extend({
  type: z.literal('error'),
  code: z.string().max(64),
  message: z.string().max(512),
});

export const SignalingMessageSchema = z.discriminatedUnion('type', [
  RoomCreatedSchema,
  RoomJoinedSchema,
  RoomExpiredSchema,
  PeerJoinedSchema,
  PeerLeftSchema,
  OfferSchema,
  AnswerSchema,
  IceCandidateSchema,
  PingSchema,
  PongSchema,
  ErrorSignalSchema,
]);

// ─── Transfer Schemas ─────────────────────────────────────────────────────────

const FileMetadataSchema = z.object({
  transferId: z.string().uuid(),
  fileId: z.string().uuid(),
  name: z.string()
    .max(MAX_FILENAME_LENGTH)
    .refine(
      (n) => !/[<>:"/\\|?*\x00-\x1f]/.test(n),
      'Filename contains invalid characters'
    ),
  size: z.number().int().nonnegative().max(100 * 1024 * 1024 * 1024), // 100 GB max
  mimeType: z.string().max(256),
  lastModified: z.number().int().optional(),
  hash: z.string().max(128).optional(),
});

export const TransferRequestSchema = z.object({
  type: z.literal('TRANSFER_REQUEST'),
  transferId: z.string().uuid(),
  files: z.array(FileMetadataSchema).min(1).max(100),
  totalSize: z.number().int().nonnegative(),
  protocolVersion: z.literal(PROTOCOL_VERSION),
});

export const TransferAcceptSchema = z.object({
  type: z.literal('TRANSFER_ACCEPT'),
  transferId: z.string().uuid(),
});

export const TransferRejectSchema = z.object({
  type: z.literal('TRANSFER_REJECT'),
  transferId: z.string().uuid(),
  reason: z.string().max(256).optional(),
});

export const FileStartSchema = z.object({
  type: z.literal('FILE_START'),
  transferId: z.string().uuid(),
  fileId: z.string().uuid(),
  totalChunks: z.number().int().positive(),
  chunkSize: z.number().int().positive().max(1024 * 1024),
});

export const FileCompleteSchema = z.object({
  type: z.literal('FILE_COMPLETE'),
  transferId: z.string().uuid(),
  fileId: z.string().uuid(),
  receivedBytes: z.number().int().nonnegative(),
  hash: z.string().max(128).optional(),
});

export const TransferCompleteSchema = z.object({
  type: z.literal('TRANSFER_COMPLETE'),
  transferId: z.string().uuid(),
});

export const TransferCancelSchema = z.object({
  type: z.literal('TRANSFER_CANCEL'),
  transferId: z.string().uuid(),
  reason: z.string().max(256).optional(),
});

export const TransferErrorSchema = z.object({
  type: z.literal('TRANSFER_ERROR'),
  transferId: z.string().uuid(),
  fileId: z.string().uuid().optional(),
  error: z.string().max(512),
});

// JSON-parseable transfer messages (FILE_CHUNK is binary, handled separately)
export const TransferMessageSchema = z.discriminatedUnion('type', [
  TransferRequestSchema,
  TransferAcceptSchema,
  TransferRejectSchema,
  FileStartSchema,
  FileCompleteSchema,
  TransferCompleteSchema,
  TransferCancelSchema,
  TransferErrorSchema,
]);

// ─── Settings Schema ──────────────────────────────────────────────────────────

export const SettingsSchema = z.object({
  displayName: z.string().min(1).max(64),
  theme: z.enum(['dark', 'light', 'system']),
  autoAccept: z.boolean(),
  downloadBehavior: z.enum(['auto', 'prompt', 'stream']),
  desktopNotifications: z.boolean(),
  soundEnabled: z.boolean(),
  maxConcurrentTransfers: z.number().int().min(1).max(5),
});

export type ValidatedSignalingMessage = z.infer<typeof SignalingMessageSchema>;
export type ValidatedTransferMessage = z.infer<typeof TransferMessageSchema>;
export type ValidatedPeer = z.infer<typeof PeerSchema>;
export type ValidatedRoom = z.infer<typeof RoomSchema>;
export type ValidatedFileMetadata = z.infer<typeof FileMetadataSchema>;
