'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { Notification } from '@/types';

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  addNotification: (notification: Omit<Notification, 'id' | 'createdAt'>) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  removeNotification: (id: string) => void;
  refreshNotifications: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children, userId, locale }: { children: ReactNode; userId?: string; locale?: string }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const prevUnreadIdsRef = React.useRef<Set<string>>(new Set());
  const audioUnlockedRef = React.useRef<boolean>(false);
  const audioContextRef = React.useRef<AudioContext | null>(null);

  // Unlock audio on first user interaction (browser requirement)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const unlockAudio = () => {
      if (audioUnlockedRef.current) return;
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        audioContextRef.current = ctx;
        if (ctx.state === 'suspended') {
          ctx.resume();
        }
        audioUnlockedRef.current = true;
      } catch (e) {
        console.warn('Failed to unlock audio:', e);
      }
    };
    document.addEventListener('click', unlockAudio, { once: true });
    document.addEventListener('keydown', unlockAudio, { once: true });
    return () => {
      document.removeEventListener('click', unlockAudio);
      document.removeEventListener('keydown', unlockAudio);
    };
  }, []);

  const playBeepSound = useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      const audio = new Audio('/notification-beep.wav');
      audio.volume = 0.5;
      // Unlock audio context if needed
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume();
      }
      audio.play().catch((err) => {
        console.warn('Failed to play notification sound:', err);
      });
    } catch (error) {
      console.warn('Failed to create audio for notification sound:', error);
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
        // Check for new unread notifications
        const newUnreadIds = new Set(
          newNotifications
            .filter((n: Notification) => !n.isRead)
            .map((n: Notification) => n.id)
        );
        const prevUnreadIds = prevUnreadIdsRef.current;
        
        // Play beep if there are new unread notifications that weren't in previous set
        // Skip on initial load (when prevUnreadIds is empty and this is the first fetch)
        if (prevUnreadIds.size >= 0 && prevUnreadIds.size !== newUnreadIds.size) {
          const hasNewUnread = Array.from(newUnreadIds).some(id => !prevUnreadIds.has(id));
          if (hasNewUnread) {
            playBeepSound();
          }
        }
        
        prevUnreadIdsRef.current = newUnreadIds;
        setNotifications(newNotifications);
      }
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    } finally {
      setLoading(false);
    }
  }, [userId, locale, playBeepSound]);

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

  // Realtime: poll for new notifications every 15s
  useEffect(() => {
    if (!userId) return;
    const interval = setInterval(() => fetchNotifications(), 15000);
    return () => clearInterval(interval);
  }, [userId, fetchNotifications]);

  const addNotification = async (notification: Omit<Notification, 'id' | 'createdAt'>) => {
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
