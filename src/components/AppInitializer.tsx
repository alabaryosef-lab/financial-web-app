'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useLocale } from '@/contexts/LocaleContext';
import { Loader } from '@/components/ui/Loader';
// Firebase analytics disabled
// import { getFirebaseAnalytics } from '@/lib/firebase';

export function AppInitializer({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, isVerifying } = useAuth();
  const { isInitialized, t } = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [isChecking, setIsChecking] = useState(true);

  // Firebase analytics disabled
  // useEffect(() => {
  //   try {
  //     getFirebaseAnalytics();
  //   } catch {
  //     // ignore
  //   }
  // }, []);

  // Always exit loading after 1.2s so app never stays stuck
  useEffect(() => {
    const t = setTimeout(() => setIsChecking(false), 1200);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!isInitialized) return;

    const schedule = (fn: () => void) => {
      if (typeof queueMicrotask !== 'undefined') queueMicrotask(fn);
      else setTimeout(fn, 0);
    };

    const done = () => {
      React.startTransition(() => setIsChecking(false));
    };

    done();
  }, [isInitialized]);

  useEffect(() => {
    if (!isInitialized) return;

    const schedule = (fn: () => void) => {
      if (typeof queueMicrotask !== 'undefined') queueMicrotask(fn);
      else setTimeout(fn, 0);
    };

    const done = () => {
      React.startTransition(() => setIsChecking(false));
    };

    if (isAuthenticated && user) {
      const p = pathname || '';
      const isOnDashboard =
        p.startsWith('/admin') ||
        p.startsWith('/employee') ||
        p.startsWith('/customer');
      if (!isOnDashboard) {
        schedule(() => {
          if (user.role === 'admin') router.push('/admin');
          else if (user.role === 'employee') router.push('/employee');
          else if (user.role === 'customer') router.push('/customer');
        });
      }
      done();
      return;
    }

    if (
      !isAuthenticated &&
      pathname &&
      (pathname.startsWith('/admin') ||
        pathname.startsWith('/employee') ||
        pathname.startsWith('/customer'))
    ) {
      schedule(() => router.push('/login'));
      done();
      return;
    }

    // Password reset pages disabled - redirect to login
    if (pathname === '/forgot-password' || pathname === '/reset-password') {
      schedule(() => router.push('/login'));
      done();
      return;
    }

    if (
      !isAuthenticated &&
      pathname === '/login'
    ) {
      done();
      return;
    }

    if (pathname === '/signup') {
      schedule(() => router.push('/login'));
      done();
      return;
    }

    if (
      !isAuthenticated &&
      pathname !== '/login'
    ) {
      schedule(() => router.push('/login'));
      done();
      return;
    }

    done();
  }, [isInitialized, isAuthenticated, user, router, pathname]);

  if (isVerifying || !isInitialized || isChecking) {
    return <Loader fullScreen text={t('common.loading')} />;
  }

  return <>{children}</>;
}
