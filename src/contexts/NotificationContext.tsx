'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import type { Notification as AppNotification } from '@/types';

interface NotificationContextType {
  notifications: AppNotification[];
  unreadCount: number;
  addNotification: (notification: Omit<AppNotification, 'id' | 'createdAt'>) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  removeNotification: (id: string) => void;
  refreshNotifications: () => Promise<void>;
  /** Call after user gesture to request notification permission (for background/system notifications) */
  requestNotificationPermission: () => Promise<NotificationPermission>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

const NOTIFICATION_SOUND_PATH = '/notification-beep.wav';

export function NotificationProvider({ children, userId, locale }: { children: ReactNode; userId?: string; locale?: string }) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const prevUnreadIdsRef = React.useRef<Set<string>>(new Set());
  const audioUnlockedRef = React.useRef<boolean>(false);
  const audioContextRef = React.useRef<AudioContext | null>(null);
  const notificationAudioRef = React.useRef<HTMLAudioElement | null>(null);
  const permissionRequestedRef = React.useRef<boolean>(false);

  // Unlock audio and request notification permission on first user interaction (browser requirement)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const unlockAudioAndPermission = () => {
      try {
        if (audioUnlockedRef.current) return;
        // 2. Unlock AudioContext
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        audioContextRef.current = ctx;
        if (ctx.state === 'suspended') ctx.resume();
        // 3. Create and "unlock" one Audio element by playing it once (then pause) so future plays work
        const audio = new Audio(NOTIFICATION_SOUND_PATH);
        audio.volume = 0.5;
        notificationAudioRef.current = audio;
        audio.play().then(() => {
          audio.pause();
          audio.currentTime = 0;
        }).catch(() => {});
        audioUnlockedRef.current = true;
      } catch (e) {
        console.warn('Failed to unlock audio:', e);
      }
    };
    document.addEventListener('click', unlockAudioAndPermission, { once: true });
    document.addEventListener('keydown', unlockAudioAndPermission, { once: true });
    return () => {
      document.removeEventListener('click', unlockAudioAndPermission);
      document.removeEventListener('keydown', unlockAudioAndPermission);
    };
  }, []);

  const playBeepSound = useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      const ctx = audioContextRef.current;
      if (ctx) {
        if (ctx.state === 'suspended') ctx.resume();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 800;
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.15);
        return;
      }
      const audio = notificationAudioRef.current;
      if (audio) {
        audio.currentTime = 0;
        audio.volume = 0.5;
        audio.play().catch(() => {});
      } else {
        const fallback = new Audio(NOTIFICATION_SOUND_PATH);
        fallback.volume = 0.5;
        fallback.play().catch(() => {});
      }
    } catch (error) {
      console.warn('Failed to play notification sound:', error);
    }
  }, []);

  const showSystemNotification = useCallback((title: string, body: string) => {
    if (typeof window === 'undefined' || !('Notification' in window) || window.Notification.permission !== 'granted') return;
    try {
      const n = new window.Notification(title, { body });
      n.onclick = () => {
        window.focus();
        n.close();
      };
      setTimeout(() => n.close(), 8000);
    } catch (e) {
      console.warn('Failed to show system notification:', e);
    }
  }, []);

  const fetchNotifications = useCallback(async () => {
    if (!userId) return;
    try {
      setLoading(true);
      const params = new URLSearchParams({ userId });
      if (locale) params.set('locale', locale);
      const response = await fetch(`/api/notifications?${params.toString()}`);
      const data = await response.json();
      if (data.success) {
        const newNotifications = data.data;
        const newUnreadIds = new Set(
          newNotifications
            .filter((n: AppNotification) => !n.isRead)
            .map((n: AppNotification) => n.id)
        );
        const prevUnreadIds = prevUnreadIdsRef.current;
        const hasNewUnread = Array.from(newUnreadIds).some(id => !prevUnreadIds.has(id));

        if (hasNewUnread) {
          const latestNew = newNotifications.find((n: AppNotification) => !n.isRead && !prevUnreadIds.has(n.id));
          if (latestNew && typeof window !== 'undefined' && 'Notification' in window && window.Notification.permission === 'granted') {
            showSystemNotification(
              latestNew.title || 'Notification',
              latestNew.message || ''
            );
          }
          setTimeout(() => playBeepSound(), 100);
        }

        prevUnreadIdsRef.current = newUnreadIds;
        setNotifications(newNotifications);
      }
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    } finally {
      setLoading(false);
    }
  }, [userId, locale, playBeepSound, showSystemNotification]);

  useEffect(() => {
    if (userId) {
      fetchNotifications();
    }
  }, [userId, fetchNotifications]);

  useEffect(() => {
    if (!userId) return;
    const onFocus = () => fetchNotifications();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [userId, fetchNotifications]);

  // Realtime: poll every 5s so sound plays soon after notification is received
  useEffect(() => {
    if (!userId) return;
    const interval = setInterval(() => fetchNotifications(), 5000);
    return () => clearInterval(interval);
  }, [userId, fetchNotifications]);

  const addNotification = async (notification: Omit<AppNotification, 'id' | 'createdAt'>) => {
    try {
      const response = await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...notification,
          userId: userId || notification.userId,
        }),
      });
      const data = await response.json();
      if (data.success) {
        await fetchNotifications();
      }
    } catch (error) {
      console.error('Failed to add notification:', error);
    }
  };

  const markAsRead = async (id: string) => {
    try {
      const response = await fetch(`/api/notifications/${id}/read`, {
        method: 'POST',
      });
      const data = await response.json();
      if (data.success) {
        setNotifications(prev =>
          prev.map(n => (n.id === id ? { ...n, isRead: true } : n))
        );
      }
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      await Promise.all(
        notifications.filter(n => !n.isRead).map(n => markAsRead(n.id))
      );
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  };

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const requestNotificationPermission = useCallback(async (): Promise<NotificationPermission> => {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'denied';
    if (window.Notification.permission !== 'default') return window.Notification.permission;
    permissionRequestedRef.current = true;
    return window.Notification.requestPermission();
  }, []);

  const unreadCount = notifications.filter(n => !n.isRead).length;

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        addNotification,
        markAsRead,
        markAllAsRead,
        removeNotification,
        refreshNotifications: fetchNotifications,
        requestNotificationPermission,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}
