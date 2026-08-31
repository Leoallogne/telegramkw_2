import { useCallback, useRef, useState } from 'react';

/**
 * Hook untuk mengelola notification permissions, throttling, dan push notifications.
 * Mencegah notification spam dengan throttling mechanism.
 */
export function useNotification() {
  const [notificationStatus, setNotificationStatus] = useState('unknown');
  
  // Throttle refs untuk mencegah notification spam
  const notificationThrottleRef = useRef(new Map());
  const lastToneAtRef = useRef(0);

  /**
   * Request notification permission dari browser.
   */
  const requestNotificationPermission = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setNotificationStatus('unsupported');
      return 'unsupported';
    }

    const permission = Notification.permission === 'default'
      ? await Notification.requestPermission()
      : Notification.permission;

    setNotificationStatus(permission);
    return permission;
  }, []);

  /**
   * Show web notification dengan throttling untuk mencegah spam.
   * Tag dan content digunakan sebagai deduplication key.
   */
  const showWebNotification = useCallback(async ({ title, body, tag = 'chat-message' }) => {
    if (typeof window === 'undefined' || !('Notification' in window)) return false;

    const key = `${tag}:${title}:${(body || '').slice(0, 80)}`;
    const now = Date.now();
    const lastAt = notificationThrottleRef.current.get(key) || 0;

    // Skip jika notification sudah ditampilkan dalam 4 detik terakhir
    if (now - lastAt < 4000) {
      return false;
    }

    notificationThrottleRef.current.set(key, now);

    if (Notification.permission !== 'granted') {
      return false;
    }

    try {
      const registration = await navigator.serviceWorker?.ready;
      if (registration) {
        await registration.showNotification(title, {
          body,
          tag,
          badge: '/sw.js',
          requireInteraction: false,
        });
        return true;
      }
    } catch (err) {
      console.error('Error showing notification:', err);
    }

    return false;
  }, []);

  /**
   * Play notification chime sound dengan cooldown.
   * Mencegah notification sound spam.
   */
  const playNotificationChime = useCallback((soundFile = '/notification.mp3') => {
    const now = Date.now();
    const lastTone = lastToneAtRef.current;

    // Hanya mainkan tone jika 1 detik sudah berlalu sejak tone terakhir
    if (now - lastTone >= 1000) {
      lastToneAtRef.current = now;
      try {
        const audio = new Audio(soundFile);
        audio.play().catch((err) => console.error('Audio play failed:', err));
      } catch (err) {
        console.error('Error creating audio element:', err);
      }
      return true;
    }

    return false;
  }, []);

  /**
   * Clear notification throttle cache untuk testing purposes.
   */
  const clearNotificationThrottle = useCallback(() => {
    notificationThrottleRef.current.clear();
    lastToneAtRef.current = 0;
  }, []);

  /**
   * Cleanup notification resources saat component unmount.
   */
  const cleanupNotifications = useCallback(() => {
    notificationThrottleRef.current.clear();
  }, []);

  return {
    // State
    notificationStatus,
    notificationThrottleRef,
    lastToneAtRef,
    
    // Methods
    setNotificationStatus,
    requestNotificationPermission,
    showWebNotification,
    playNotificationChime,
    clearNotificationThrottle,
    cleanupNotifications,
  };
}
