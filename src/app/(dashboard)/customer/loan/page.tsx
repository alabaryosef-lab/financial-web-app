'use client';

import React, { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Loader } from '@/components/ui/Loader';
import { useLocale } from '@/contexts/LocaleContext';
import { useAuth } from '@/contexts/AuthContext';
import { getLoanStatusColor, formatDateOnly, formatCurrency, formatNumber, formatPercent } from '@/lib/utils';

export default function CustomerLoanPage() {
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-bold text-neutral-900 mb-2">{t('customer.myLoans')}</h1>
        <p className="text-neutral-600">{t('customer.viewAllLoans')}</p>
      </div>

      {customerLoans.length === 0 ? (
        <Card variant="elevated" padding="large">
          <div className="text-center py-12">
            <p className="text-neutral-500">{t('detail.noLoansFound')}</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-6">
          {customerLoans.map((loan) => (
            <Card key={loan.id} variant="elevated" padding="large">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-neutral-900">{t('loan.loanNumber', { number: loan.id.slice(-6) })}</h2>
                <Badge variant={getLoanStatusColor(loan.status)}>
                  {t(`loan.status.${loan.status}`)}
                </Badge>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="text-left rtl:text-right">
                  <p className="text-sm text-neutral-600 mb-1">{t('detail.loanAmount')}</p>
                  <p className="text-xl font-bold text-neutral-900">{formatCurrency(loan.amount, locale)}</p>
                </div>
                <div className="text-left rtl:text-right">
                  <p className="text-sm text-neutral-600 mb-1">{t('detail.interestRate')}</p>
                  <p className="text-xl font-bold text-neutral-900">{formatPercent(loan.interestRate, locale)}</p>
                </div>
                <div className="text-left rtl:text-right">
                  <p className="text-sm text-neutral-600 mb-1">{t('detail.numberOfInstallments')}</p>
                  <p className="text-xl font-bold text-neutral-900">{formatNumber(loan.numberOfInstallments, locale)}</p>
                </div>
                <div className="text-left rtl:text-right">
                  <p className="text-sm text-neutral-600 mb-1">{t('detail.installmentAmount')}</p>
                  <p className="text-xl font-bold text-neutral-900">{formatCurrency(loan.installmentTotal, locale)}</p>
                </div>
                <div className="text-left rtl:text-right">
                  <p className="text-sm text-neutral-600 mb-1">{t('detail.startDate')}</p>
                  <p className="text-lg font-semibold text-neutral-900">{formatDateOnly(loan.startDate, locale)}</p>
                </div>
                <div className="text-left rtl:text-right">
                  <p className="text-sm text-neutral-600 mb-1">{t('customer.lastUpdated')}</p>
                  <p className="text-lg font-semibold text-neutral-900">{formatDateOnly(loan.updatedAt, locale)}</p>
                </div>
              </div>

              {loan.notes && (
                <div className="mt-6 pt-6 border-t border-neutral-200 text-left rtl:text-right">
                  <p className="text-sm text-neutral-600 mb-2">{t('loan.notes')}</p>
                  <p className="text-base text-neutral-900">{loan.notesKey ? t(loan.notesKey) : loan.notes}</p>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
