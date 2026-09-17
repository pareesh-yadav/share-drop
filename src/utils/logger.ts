// Structured development-only logger. Never logs sensitive data.

const isDev = import.meta.env.DEV;

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  namespace: string;
  message: string;
  data?: unknown;
}

// In-memory log buffer for the debug panel (max 200 entries)
const logBuffer: LogEntry[] = [];
const MAX_LOG_ENTRIES = 200;

const LOG_COLORS: Record<LogLevel, string> = {
  debug: '#6B7280',
  info: '#60A5FA',
  warn: '#FBBF24',
  error: '#F87171',
};

function createLogger(namespace: string) {
  function log(level: LogLevel, message: string, data?: unknown) {
    const timestamp = new Date().toISOString().slice(11, 19); // HH:MM:SS
    const entry: LogEntry = { timestamp, level, namespace, message };

    if (isDev) {
      // eslint-disable-next-line no-console
      console[level === 'debug' ? 'log' : level](
        `%c[${timestamp}] [${namespace}] ${message}`,
        `color: ${LOG_COLORS[level]}; font-size: 11px`,
        data ?? ''
      );
    }

    // Store in buffer (no sensitive data)
    logBuffer.push(entry);
    if (logBuffer.length > MAX_LOG_ENTRIES) {
      logBuffer.shift();
    }
  }

  return {
    debug: (msg: string, data?: unknown) => log('debug', msg, data),
    info: (msg: string, data?: unknown) => log('info', msg, data),
    warn: (msg: string, data?: unknown) => log('warn', msg, data),
    error: (msg: string, data?: unknown) => log('error', msg, data),
  };
}

export const logger = {
  signaling: createLogger('Signaling'),
  webrtc: createLogger('WebRTC'),
  transfer: createLogger('Transfer'),
  room: createLogger('Room'),
  app: createLogger('App'),
};

/**
 * Get the log buffer for the debug panel.
 * Returns safe entries only (no file content, no credentials).
 */
export function getLogBuffer(): ReadonlyArray<LogEntry> {
  return logBuffer;
}

export function clearLogBuffer() {
  logBuffer.splice(0, logBuffer.length);
}

export type { LogEntry };
