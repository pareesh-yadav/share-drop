import { describe, it, expect } from 'vitest';
import {
  generateRoomId,
  generatePeerId,
  generateTransferId,
  generateJoinToken,
  decodeJoinToken,
  sanitizeFilename,
  generateDisplayName,
} from '../../utils/crypto';
import { formatBytes, formatSpeed, formatEta, calcPercent } from '../../utils/format';
import { SignalingMessageSchema } from '../../schemas';
import { TransferMessageSchema } from '../../schemas';

// ─── Crypto Utils ─────────────────────────────────────────────────────────────

describe('generateRoomId', () => {
  it('generates a 6-character alphanumeric string', () => {
    const id = generateRoomId();
    expect(id).toMatch(/^[A-Z0-9]{6}$/);
  });

  it('generates unique IDs', () => {
    const ids = Array.from({ length: 100 }, generateRoomId);
    const unique = new Set(ids);
    expect(unique.size).toBeGreaterThan(90); // should be very unique
  });
});

describe('generatePeerId', () => {
  it('generates a peer_ prefixed ID', () => {
    const id = generatePeerId();
    expect(id).toMatch(/^peer_[a-f0-9]+$/);
  });
});

describe('generateTransferId', () => {
  it('generates a UUID', () => {
    const id = generateTransferId();
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('generateJoinToken / decodeJoinToken', () => {
  it('encodes and decodes a room ID', () => {
    const roomId = 'AB7K9X';
    const token = generateJoinToken(roomId);
    const decoded = decodeJoinToken(token);
    expect(decoded).toBe(roomId);
  });

  it('returns null for invalid tokens', () => {
    expect(decodeJoinToken('!!!invalid!!!')).toBeNull();
    expect(decodeJoinToken('')).toBeNull();
    expect(decodeJoinToken('aGVsbG8=')).toBeNull(); // "hello" — invalid room ID
  });
});

describe('sanitizeFilename', () => {
  it('strips path separators', () => {
    expect(sanitizeFilename('../../../etc/passwd')).not.toContain('..');
    expect(sanitizeFilename('../../../etc/passwd')).not.toContain('/');
    expect(sanitizeFilename('C:\\Windows\\system32\\file.exe')).not.toContain('\\');
  });

  it('removes null bytes and control characters', () => {
    expect(sanitizeFilename('file\x00name.txt')).not.toContain('\x00');
    expect(sanitizeFilename('file\x1fname.txt')).not.toContain('\x1f');
  });

  it('handles dangerous HTML filenames', () => {
    const result = sanitizeFilename('<script>alert(1)</script>.txt');
    expect(result).not.toContain('<');
    expect(result).not.toContain('>');
  });

  it('falls back to "file" for empty result', () => {
    expect(sanitizeFilename('')).toBe('file');
    expect(sanitizeFilename('   ')).toBe('file');
  });

  it('truncates long filenames', () => {
    const long = 'a'.repeat(300);
    expect(sanitizeFilename(long).length).toBeLessThanOrEqual(255);
  });

  it('preserves normal filenames', () => {
    expect(sanitizeFilename('photo.jpg')).toBe('photo.jpg');
    expect(sanitizeFilename('my document.pdf')).toBe('my document.pdf');
    expect(sanitizeFilename('file-with_underscores.zip')).toBe('file-with_underscores.zip');
  });
});

describe('generateDisplayName', () => {
  it('generates a non-empty display name', () => {
    const name = generateDisplayName();
    expect(name.length).toBeGreaterThan(0);
    expect(typeof name).toBe('string');
  });
});

// ─── Format Utils ─────────────────────────────────────────────────────────────

describe('formatBytes', () => {
  it('formats bytes correctly', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1024 * 1024)).toBe('1 MB');
    expect(formatBytes(1.5 * 1024 * 1024)).toBe('1.5 MB');
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1 GB');
  });
});

describe('formatSpeed', () => {
  it('formats speed as bytes per second', () => {
    expect(formatSpeed(0)).toBe('—');
    expect(formatSpeed(-1)).toBe('—');
    expect(formatSpeed(1024 * 1024)).toBe('1 MB/s');
  });
});

describe('formatEta', () => {
  it('formats ETA correctly', () => {
    expect(formatEta(-1)).toBe('—');
    expect(formatEta(3)).toBe('Almost done');
    expect(formatEta(30)).toBe('30 sec');
    expect(formatEta(90)).toBe('2 min');
    expect(formatEta(3600)).toBe('1.0 hr');
  });

  it('handles Infinity and NaN', () => {
    expect(formatEta(Infinity)).toBe('—');
    expect(formatEta(NaN)).toBe('—');
  });
});

describe('calcPercent', () => {
  it('calculates percentage correctly', () => {
    expect(calcPercent(0, 100)).toBe(0);
    expect(calcPercent(50, 100)).toBe(50);
    expect(calcPercent(100, 100)).toBe(100);
    expect(calcPercent(150, 100)).toBe(100); // clamped
  });

  it('handles zero total', () => {
    expect(calcPercent(0, 0)).toBe(0);
  });
});

// ─── Schema Validation ────────────────────────────────────────────────────────

describe('SignalingMessageSchema', () => {
  const base = {
    roomId: 'AB7K9X',
    fromPeerId: 'peer_abc123',
    timestamp: Date.now(),
    protocolVersion: 1,
  };

  it('validates a peer:joined message', () => {
    const msg = {
      ...base,
      type: 'peer:joined',
      peer: {
        id: 'peer_abc',
        displayName: 'Test User',
        deviceType: 'desktop',
        connectedAt: Date.now(),
      },
    };
    const result = SignalingMessageSchema.safeParse(msg);
    expect(result.success).toBe(true);
  });

  it('rejects unknown message types', () => {
    const msg = { ...base, type: 'unknown:type' };
    const result = SignalingMessageSchema.safeParse(msg);
    expect(result.success).toBe(false);
  });

  it('rejects wrong protocolVersion', () => {
    const msg = { ...base, type: 'peer:ping', protocolVersion: 2 };
    const result = SignalingMessageSchema.safeParse(msg);
    expect(result.success).toBe(false);
  });
});

describe('TransferMessageSchema', () => {
  it('validates a TRANSFER_REQUEST', () => {
    const msg = {
      type: 'TRANSFER_REQUEST',
      transferId: 'a0000000-0000-4000-8000-000000000001',
      files: [{
        transferId: 'a0000000-0000-4000-8000-000000000001',
        fileId: 'a0000000-0000-4000-8000-000000000002',
        name: 'photo.jpg',
        size: 1024,
        mimeType: 'image/jpeg',
      }],
      totalSize: 1024,
      protocolVersion: 1,
    };
    const result = TransferMessageSchema.safeParse(msg);
    expect(result.success).toBe(true);
  });

  it('rejects filenames with path traversal', () => {
    const msg = {
      type: 'TRANSFER_REQUEST',
      transferId: 'a0000000-0000-4000-8000-000000000001',
      files: [{
        transferId: 'a0000000-0000-4000-8000-000000000001',
        fileId: 'a0000000-0000-4000-8000-000000000002',
        name: '../etc/passwd',
        size: 1024,
        mimeType: 'text/plain',
      }],
      totalSize: 1024,
      protocolVersion: 1,
    };
    const result = TransferMessageSchema.safeParse(msg);
    // The schema rejects / in filenames
    expect(result.success).toBe(false);
  });

  it('rejects empty file list', () => {
    const msg = {
      type: 'TRANSFER_REQUEST',
      transferId: '00000000-0000-0000-0000-000000000001',
      files: [],
      totalSize: 0,
      protocolVersion: 1,
    };
    const result = TransferMessageSchema.safeParse(msg);
    expect(result.success).toBe(false);
  });
});
