'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker and requests notification permission.
 * Shows browser notifications for trade events when the tab is in the background.
 */
export function useNotifications(userId: string | null) {
  useEffect(() => {
    if (!userId) return;
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    if (!('Notification' in window)) return;

    // Register service worker
    navigator.serviceWorker.register('/sw.js').catch(() => {});

    // Request permission if not yet decided
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, [userId]);
}

/**
 * Show a browser notification (call this from realtime subscription handlers).
 */
export function showBrowserNotification(title: string, body: string, url?: string) {
  if (typeof window === 'undefined') return;
  if (Notification.permission !== 'granted') return;
  if (document.visibilityState === 'visible') return; // Only notify when tab is hidden

  const notification = new Notification(title, {
    body,
    icon: '/favicon.ico',
  });

  if (url) {
    notification.onclick = () => {
      window.focus();
      window.location.href = url;
    };
  }
}
