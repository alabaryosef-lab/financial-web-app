'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, LogOut, Globe, Menu } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useLocale } from '@/contexts/LocaleContext';
import { useNotifications } from '@/contexts/NotificationContext';
import { formatDate } from '@/lib/utils';

interface HeaderProps {
  onMenuClick?: () => void;
}

// Fallback: map known English title/message to i18n keys (for notifications loaded from localStorage without keys)
const NOTIFICATION_TITLE_KEYS: Record<string, string> = {
  'New Customer Assigned': 'notification.newCustomerAssigned',
  'Loan Status Updated': 'notification.loanStatusUpdated',
};
const NOTIFICATION_MESSAGE_KEYS: Record<string, string> = {
  'Ahmed Customer has been assigned to you': 'notification.ahmedAssignedToYou',
  'Your loan status has been updated to Active': 'notification.loanUpdatedToActive',
};

export function Header({ onMenuClick }: HeaderProps) {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { locale, setLocale, t } = useLocale();
  const { notifications, unreadCount, markAsRead, markAllAsRead, requestNotificationPermission } = useNotifications();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);
  const langRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (langRef.current && !langRef.current.contains(target)) setShowLanguageMenu(false);
      if (notifRef.current && !notifRef.current.contains(target)) setShowNotifications(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getNotificationRoute = (notif: { title?: string }): string => {
    const role = user?.role;
    const title = (notif.title || '').toLowerCase();
    if (role === 'employee' && (title.includes('customer assigned') || title.includes('عميل'))) return '/employee/customers';
    if (role === 'customer' && (title.includes('employee assigned') || title.includes('موظف'))) return '/customer';
    if (title.includes('loan') || title.includes('قرض')) {
      if (role === 'customer') return '/customer/loan';
      if (role === 'employee') return '/employee/loans';
      if (role === 'admin') return '/admin/loans';
    }
    if (title.includes('message') || title.includes('رسالة')) return role === 'admin' ? '/admin/chat' : role === 'employee' ? '/employee/chat' : '/customer/chat';
    if (role === 'admin') return '/admin';
    if (role === 'employee') return '/employee';
    return '/customer';
  };

  const getNotificationTitle = (notif: { title?: string }) =>
    (notif.title && NOTIFICATION_TITLE_KEYS[notif.title]) ? t(NOTIFICATION_TITLE_KEYS[notif.title]) : (notif.title ?? '');
  const getNotificationMessage = (notif: { message?: string }) =>
    (notif.message && NOTIFICATION_MESSAGE_KEYS[notif.message]) ? t(NOTIFICATION_MESSAGE_KEYS[notif.message]) : (notif.message ?? '');

  const handleLogout = () => {
    logout();
    window.location.href = '/login';
  };

  return (
    <header className="sticky top-0 z-[1020] bg-white/90 backdrop-blur-md border-b border-neutral-100 shadow-soft">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 md:px-8 lg:px-12 xl:px-16 2xl:px-20">
        <div className="flex items-center justify-between h-16 sm:h-[64px] md:h-[72px]">
          {/* Left: Menu & Logo */}
          <div className="flex items-center gap-3 sm:gap-4 md:gap-5 min-w-0 flex-1">
            {onMenuClick && (
              <button
                onClick={onMenuClick}
                className="lg:hidden flex items-center justify-center min-w-[44px] min-h-[44px] -ml-1 mr-1 hover:bg-neutral-100 rounded-lg transition-colors"
                aria-label={t('common.openMenu')}
              >
                <Menu className="w-5 h-5 sm:w-6 sm:h-6 text-neutral-700" />
              </button>
            )}
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div className="hidden sm:flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 md:w-10 md:h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 shadow-soft">
                <span className="text-sm sm:text-base md:text-lg font-bold text-white">LM</span>
              </div>
              <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-primary-600 truncate tracking-tight">{t('app.loanManager')}</h1>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2 sm:gap-3 md:gap-4 flex-shrink-0">
            {/* Language Toggle */}
            <div className="relative" ref={langRef}>
              <button
                type="button"
                onClick={() => { setShowLanguageMenu((v) => !v); setShowNotifications(false); }}
                className="flex items-center justify-center min-w-[44px] min-h-[44px] sm:min-w-[48px] sm:min-h-[48px] hover:bg-neutral-100 rounded-lg transition-colors"
                aria-label={t('common.changeLanguage')}
              >
                <Globe className="w-5 h-5 sm:w-[18px] sm:h-[18px] text-neutral-600" />
              </button>
              {showLanguageMenu && (
                <div className="absolute right-0 rtl:right-auto rtl:left-0 top-full mt-2 bg-white rounded-2xl shadow-soft-lg border border-neutral-100 py-2 min-w-[160px] z-[1000] animate-fade-in">
                  <button
                    onClick={() => {
                      setLocale('en');
                      setShowLanguageMenu(false);
                    }}
                    className={`w-full px-4 py-2.5 text-left text-sm hover:bg-neutral-50 transition-colors ${
                      locale === 'en' ? 'bg-primary-50 text-primary-700 font-medium' : 'text-neutral-700'
                    }`}
                  >
                    {t('common.english')}
                  </button>
                  <button
                    onClick={() => {
                      setLocale('ar');
                      setShowLanguageMenu(false);
                    }}
                    className={`w-full px-4 py-2.5 text-left text-sm hover:bg-neutral-50 transition-colors ${
                      locale === 'ar' ? 'bg-primary-50 text-primary-700 font-medium' : 'text-neutral-700'
                    }`}
                  >
                    {t('common.arabic')}
                  </button>
                </div>
              )}
            </div>

            {/* Notifications */}
            <div className="relative" ref={notifRef}>
              <button
                type="button"
                onClick={() => {
                  setShowNotifications((v) => !v);
                  setShowLanguageMenu(false);
                  if ('Notification' in window && Notification.permission === 'default') {
                    requestNotificationPermission();
                  }
                }}
                className="relative flex items-center justify-center min-w-[44px] min-h-[44px] sm:min-w-[48px] sm:min-h-[48px] hover:bg-neutral-100 rounded-lg transition-colors"
                aria-label={t('common.notificationsAria')}
              >
                <Bell className="w-5 h-5 sm:w-[18px] sm:h-[18px] text-neutral-600" />
                {unreadCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-error rounded-full ring-2 ring-white" />
                )}
              </button>
              {showNotifications && (
                <div className="absolute right-0 rtl:right-auto rtl:left-0 top-full mt-2 w-[calc(100vw-3rem)] sm:w-[360px] md:w-[400px] bg-white rounded-2xl shadow-soft-lg border border-neutral-100 z-[1000] animate-fade-in max-h-[80vh] flex flex-col">
                  <div className="p-4 sm:p-5 border-b border-neutral-100 flex items-center justify-between shrink-0">
                    <h3 className="font-semibold text-neutral-900 text-sm sm:text-base">{t('common.notifications')}</h3>
                    {unreadCount > 0 && (
                      <button
                        onClick={markAllAsRead}
                        className="text-xs sm:text-sm text-primary-500 hover:text-primary-600 font-medium transition-colors"
                      >
                        {t('notification.markAllRead')}
                      </button>
                    )}
                  </div>
                  <div className="overflow-y-auto flex-1">
                    {notifications.length === 0 ? (
                      <div className="p-8 sm:p-12 text-center text-neutral-500">
                        <Bell className="w-8 h-8 mx-auto mb-2 text-neutral-300" />
                        <p className="text-sm">{t('notification.noNotifications')}</p>
                      </div>
                    ) : (
                      notifications.map((notif) => (
                        <div
                          key={notif.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            markAsRead(notif.id);
                            setShowNotifications(false);
                            router.push(getNotificationRoute(notif));
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              markAsRead(notif.id);
                              setShowNotifications(false);
                              router.push(getNotificationRoute(notif));
                            }
                          }}
                          className={`p-4 sm:p-5 border-b border-neutral-100 hover:bg-neutral-50 cursor-pointer transition-colors ${
                            !notif.isRead ? 'bg-primary-50/30' : ''
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className="flex-1 min-w-0">
                              <h4 className="font-semibold text-sm text-neutral-900">
                                {getNotificationTitle(notif)}
                              </h4>
                              <p className="text-sm text-neutral-600 mt-1">{getNotificationMessage(notif)}</p>
                              <p className="text-xs text-neutral-400 mt-2">
                                {notif.createdAt ? formatDate(notif.createdAt, locale ?? 'en') : ''}
                              </p>
                            </div>
                            {!notif.isRead && (
                              <div className="w-2 h-2 bg-primary-500 rounded-full mt-2 shrink-0" />
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* User Menu */}
            <div className="flex items-center gap-2 sm:gap-3 md:gap-4">
              <div className="hidden lg:block text-right">
                <p className="text-sm font-semibold text-neutral-900 leading-tight">{user?.name}</p>
                <p className="text-xs text-neutral-500 leading-tight">{user?.email}</p>
              </div>
              <button
                onClick={handleLogout}
                className="flex items-center justify-center min-w-[44px] min-h-[44px] sm:min-w-[48px] sm:min-h-[48px] hover:bg-neutral-100 rounded-lg transition-colors"
                title={t('common.logout')}
                aria-label={t('common.logout')}
              >
                <LogOut className="w-5 h-5 sm:w-[18px] sm:h-[18px] text-neutral-600" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
