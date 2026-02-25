import type { Metadata } from 'next';
import React, { Suspense } from 'react';
import { Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';
import { ClientRoot } from '@/components/ClientRoot';

export const dynamic = 'force-dynamic';

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Alkhalij for Finance',
  description: 'Professional loan management platform',
  icons: { icon: '/icon.png', apple: '/icon.png' },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50" aria-hidden="true">
      <div className="w-10 h-10 rounded-full border-2 border-primary-200 border-t-primary-500 animate-spin" />
    </div>
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <body className={`${plusJakarta.className} antialiased`}>
        <Suspense fallback={<LoadingFallback />}>
          <ClientRoot>{children}</ClientRoot>
        </Suspense>
      </body>
    </html>
  );
}
