// Cryptographic utilities using browser-native Web Crypto API

import { MAX_FILENAME_LENGTH } from '../types';

/**
 * Generate a cryptographically strong room ID (6-char base36 uppercase).
 * e.g. "AB7K9X"
 */
export function generateRoomId(): string {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return array[0].toString(36).toUpperCase().padStart(6, '0').slice(-6);
}

/**
 * Generate a cryptographically strong peer ID using randomUUID.
 */
export function generatePeerId(): string {
  return `peer_${crypto.randomUUID().replace(/-/g, '')}`;
}

/**
 * Generate a transfer ID using randomUUID.
 */
export function generateTransferId(): string {
  return crypto.randomUUID();
}

/**
 * Generate a file ID using randomUUID.
 */
export function generateFileId(): string {
  return crypto.randomUUID();
}

/**
 * Generate a join token that encodes the room ID for URL-safe sharing.
 * Encodes to base64url.
 */
export function generateJoinToken(roomId: string): string {
  const bytes = new TextEncoder().encode(roomId);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Decode a join token back to a room ID.
 * Returns null if invalid.
 */
export function decodeJoinToken(token: string): string | null {
  try {
    const base64 = token.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const decoded = atob(padded);
    const bytes = Uint8Array.from(decoded, (c) => c.charCodeAt(0));
    const roomId = new TextDecoder().decode(bytes);
    // Validate: room IDs are alphanumeric uppercase 6 chars
    if (/^[A-Z0-9]{1,32}$/.test(roomId)) return roomId;
    return null;
  } catch {
    return null;
  }
}

/**
 * Compute SHA-256 hash of a Blob using Web Crypto API.
 * Returns hex string.
 */
export async function hashBlob(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Compute SHA-256 of an ArrayBuffer.
 */
export async function hashArrayBuffer(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ─── Filename Sanitization ───────────────────────────────────────────────────

/**
 * Sanitize a filename received from a remote peer.
 * - Strips path separators
 * - Removes null bytes and control characters
 * - Truncates to MAX_FILENAME_LENGTH
 * - Falls back to 'file' if empty after sanitization
 */
export function sanitizeFilename(raw: string): string {
  // Strip path traversal
  let name = raw
    .replace(/[/\\]/g, '_')
    .replace(/\.\./g, '_')
    .replace(/[\x00-\x1f\x7f]/g, '_')   // control chars
    .replace(/[<>:"?*|]/g, '_')           // Windows-forbidden chars
    .trim();

  if (name.length === 0) name = 'file';
  if (name.length > MAX_FILENAME_LENGTH) name = name.slice(0, MAX_FILENAME_LENGTH);

  return name;
}

// ─── Random display name ─────────────────────────────────────────────────────

const ADJECTIVES = ['Swift', 'Bright', 'Calm', 'Daring', 'Bold', 'Quick', 'Keen', 'Wild'];
const NOUNS = ['Panda', 'Falcon', 'Otter', 'Fox', 'Lynx', 'Raven', 'Wolf', 'Hawk'];

export function generateDisplayName(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(Math.random() * 99) + 1;
  return `${adj} ${noun} ${num}`;
}
