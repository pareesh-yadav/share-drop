import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Ensure standard Web Crypto is available (Node 19+ has globalThis.crypto natively)
if (!globalThis.crypto) {
  const { webcrypto } = await import('node:crypto');
  // @ts-expect-error webcrypto typing
  globalThis.crypto = webcrypto;
}

// Mock import.meta.env
vi.stubEnv('VITE_USE_LOCAL_SIGNALING', 'true');

// Suppress console.error in tests (uncomment to see errors)
// vi.spyOn(console, 'error').mockImplementation(() => {});
