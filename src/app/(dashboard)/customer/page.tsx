'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { FileText, MessageSquare } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Loader } from '@/components/ui/Loader';
import { useLocale } from '@/contexts/LocaleContext';
import { useAuth } from '@/contexts/AuthContext';
import { getLoanStatusColor, formatCurrency, formatDateOnly, formatNumber, formatPercent } from '@/lib/utils';
import Link from 'next/link';

export default function CustomerDashboard() {
  const router = useRouter();
  const pathname = usePathname();
  const { t, locale } = useLocale();
  const { user } = useAuth();
  const [customerLoans, setCustomerLoans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.id) {
      fetchLoans();
    }
  }, [user?.id, locale, pathname]);

  useEffect(() => {
    const onVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible' && user?.id) fetchLoans();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [user?.id, locale, pathname]);

  const fetchLoans = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/loans?customerId=${user?.id}&locale=${locale}`);
      const data = await response.json();
      if (data.success) {
        setCustomerLoans(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch loans:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader size="large" />
      </div>
    );
  }

  const activeLoan = customerLoans.find(l => l.status === 'active');

  return (
    <div className="space-y-8">
      <div className="text-left rtl:text-right">
        <h1 className="text-4xl font-bold text-neutral-900 mb-2">{t('common.dashboard')}</h1>
        <p className="text-neutral-600">{t('dashboard.welcomeCustomer', { name: user?.name || '' })}</p>
      </div>

      {activeLoan ? (
        <Card
          variant="elevated"
          padding="large"
          className="cursor-pointer hover:shadow-xl transition-shadow"
          onClick={() => router.push('/customer/loan')}
        >
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-neutral-900 mb-2">{t('dashboard.activeLoans')}</h2>
              <p className="text-neutral-600">{t('dashboard.activeLoanDescription')}</p>
            </div>
            <Badge variant={getLoanStatusColor(activeLoan.status)}>
              {t(`loan.status.${activeLoan.status}`)}
            </Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="text-left rtl:text-right">
              <p className="text-sm text-neutral-600 mb-1">{t('detail.loanAmount')}</p>
              <p className="text-2xl font-bold text-neutral-900">{formatCurrency(activeLoan.amount, locale)}</p>
            </div>
            <div className="text-left rtl:text-right">
              <p className="text-sm text-neutral-600 mb-1">{t('detail.interestRate')}</p>
              <p className="text-2xl font-bold text-neutral-900">{formatPercent(activeLoan.interestRate, locale)}</p>
            </div>
            <div className="text-left rtl:text-right">
              <p className="text-sm text-neutral-600 mb-1">{t('detail.numberOfInstallments')}</p>
              <p className="text-2xl font-bold text-neutral-900">{formatNumber(activeLoan.numberOfInstallments, locale)}</p>
            </div>
            <div className="text-left rtl:text-right">
              <p className="text-sm text-neutral-600 mb-1">{t('detail.installmentAmount')}</p>
              <p className="text-2xl font-bold text-neutral-900">{formatCurrency(activeLoan.installmentTotal, locale)}</p>
            </div>
            <div className="text-left rtl:text-right">
              <p className="text-sm text-neutral-600 mb-1">{t('detail.startDate')}</p>
              <p className="text-lg font-semibold text-neutral-900">{formatDateOnly(activeLoan.startDate, locale)}</p>
            </div>
            {activeLoan.notes && (
              <div className="text-left rtl:text-right">
                <p className="text-sm text-neutral-600 mb-1">{t('form.notes')}</p>
                <p className="text-base text-neutral-900">{activeLoan.notesKey ? t(activeLoan.notesKey) : activeLoan.notes}</p>
              </div>
            )}
          </div>
        </Card>
      ) : (
        <Card variant="elevated" padding="large">
          <div className="text-center py-12">
            <FileText className="w-16 h-16 text-neutral-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-neutral-900 mb-2">{t('dashboard.noActiveLoan')}</h3>
            <p className="text-neutral-600">{t('dashboard.noActiveLoanDescription')}</p>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Link href="/customer/loan">
          <Card variant="elevated" padding="medium" className="hover:shadow-xl transition-shadow cursor-pointer h-full">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary-50 rounded-lg">
                <FileText className="w-6 h-6 text-primary-500" />
              </div>
              <div>
                <h3 className="font-semibold text-neutral-900 mb-1">{t('dashboard.viewAllLoans')}</h3>
                <p className="text-sm text-neutral-600">{t('dashboard.seeAllLoanDetails')}</p>
              </div>
            </div>
          </Card>
        </Link>

        <Link href="/customer/chat">
          <Card variant="elevated" padding="medium" className="hover:shadow-xl transition-shadow cursor-pointer h-full">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-info-light rounded-lg">
                <MessageSquare className="w-6 h-6 text-info" />
              </div>
              <div>
                <h3 className="font-semibold text-neutral-900 mb-1">{t('dashboard.chatWithEmployee')}</h3>
                <p className="text-sm text-neutral-600">{t('dashboard.contactAssignedEmployee')}</p>
              </div>
            </div>
          </Card>
        </Link>
      </div>
    </div>
  );
}
