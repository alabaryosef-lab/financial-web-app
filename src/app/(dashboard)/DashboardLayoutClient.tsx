'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLocale } from '@/contexts/LocaleContext';
import { NotificationProvider } from '@/contexts/NotificationContext';
import { WebSocketProvider } from '@/contexts/WebSocketContext';
import { Header } from '@/components/layout/Header';
import { Sidebar } from '@/components/layout/Sidebar';
import { Loader } from '@/components/ui/Loader';

export default function DashboardLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isAuthenticated } = useAuth();
  const { locale } = useLocale();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      const schedule = (fn: () => void) =>
        typeof queueMicrotask !== 'undefined' ? queueMicrotask(fn) : setTimeout(fn, 0);
      schedule(() => router.push('/login'));
    }
  }, [isAuthenticated, router]);

  if (!isAuthenticated || !user) {
    return (
      <div className="min-h-screen min-h-[100dvh] bg-page flex items-center justify-center">
        <Loader size="large" />
      </div>
    );
  }

  return (
    <WebSocketProvider userId={user.id}>
      <NotificationProvider userId={user.id} locale={locale}>
        <div className="min-h-screen min-h-[100dvh] bg-page flex flex-col">
          <Header onMenuClick={() => setSidebarOpen(!sidebarOpen)} />
          <div className="flex flex-1 min-h-0">
            <Sidebar />
            {sidebarOpen && (
              <div
                className="fixed inset-0 bg-black/50 z-[1040] lg:hidden animate-fade-in"
                onClick={() => setSidebarOpen(false)}
                aria-hidden="true"
              >
                <div
                  className="absolute inset-y-0 left-0 rtl:left-auto rtl:right-0 w-[min(280px,85vw)] max-w-[280px] bg-white h-full shadow-xl animate-slide-in flex flex-col"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Sidebar inDrawer onItemClick={() => setSidebarOpen(false)} />
                </div>
              </div>
            )}
            <main className="flex-1 min-w-0 p-4 sm:p-6 md:p-8 lg:p-10 overflow-auto">
              {children}
            </main>
          </div>
        </div>
      </NotificationProvider>
    </WebSocketProvider>
  );
}
