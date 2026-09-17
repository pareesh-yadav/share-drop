// Device detection utilities

import type { DeviceType } from '../types';

/**
 * Detect current device type from user agent.
 */
export function detectDeviceType(): DeviceType {
  const ua = navigator.userAgent.toLowerCase();
  if (/tablet|ipad/.test(ua)) return 'tablet';
  if (/mobile|android|iphone|ipod|blackberry|opera mini|iemobile/.test(ua)) return 'mobile';
  return 'desktop';
}

/**
 * Get a device emoji for the given device type.
 */
export function getDeviceEmoji(deviceType: DeviceType): string {
  switch (deviceType) {
    case 'desktop': return '💻';
    case 'mobile': return '📱';
    case 'tablet': return '📟';
    default: return '🖥️';
  }
}

/**
 * Feature detection helpers.
 */
export const features = {
  webRTC: () => typeof RTCPeerConnection !== 'undefined',
  dataChannel: () => {
    try {
      const pc = new RTCPeerConnection();
      const supported = typeof pc.createDataChannel === 'function';
      pc.close();
      return supported;
    } catch {
      return false;
    }
  },
  fileSystemAccess: () => 'showSaveFilePicker' in window,
  webShare: () => 'share' in navigator,
  clipboard: () => 'clipboard' in navigator,
  notifications: () => 'Notification' in window,
  serviceWorker: () => 'serviceWorker' in navigator,
  broadcastChannel: () => typeof BroadcastChannel !== 'undefined',
};

/**
 * Check whether a URL is safe to use as an object URL origin.
 */
export function isObjectUrl(url: string): boolean {
  return url.startsWith('blob:');
}
