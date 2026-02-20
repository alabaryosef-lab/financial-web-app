'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Users, FileText } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Loader } from '@/components/ui/Loader';
import { useLocale } from '@/contexts/LocaleContext';
import { useAuth } from '@/contexts/AuthContext';
import { getLoanStatusColor, formatCurrency, formatNumber } from '@/lib/utils';

export default function EmployeeDashboard() {
  const router = useRouter();
  const pathname = usePathname();
  const { t, locale } = useLocale();
  const { user } = useAuth();
  const [assignedCustomers, setAssignedCustomers] = useState<any[]>([]);
  const [assignedLoans, setAssignedLoans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.id) {
      fetchData();
    }
  }, [user?.id, locale, pathname]);

  useEffect(() => {
    const onVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible' && user?.id) fetchData();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [user?.id, locale, pathname]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [customersRes, loansRes] = await Promise.all([
        fetch(`/api/employees/${user?.id}/customers`),
        fetch(`/api/loans?employeeId=${user?.id}&locale=${locale}`),
      ]);

      const customersData = await customersRes.json();
      const loansData = await loansRes.json();

      if (customersData.success) {
        setAssignedCustomers(customersData.data);
      }
      if (loansData.success) {
        setAssignedLoans(loansData.data);
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
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

  const stats = [
    {
      label: t('dashboard.assignedCustomers'),
      value: assignedCustomers.length,
      icon: Users,
      color: 'text-primary-500',
      bgColor: 'bg-primary-50',
      href: '/employee/customers',
    },
    {
      label: t('dashboard.activeLoansCount'),
      value: assignedLoans.filter(l => l.status === 'active').length,
      icon: FileText,
      color: 'text-success',
      bgColor: 'bg-success-light',
      href: '/employee/loans',
    },
    {
      label: t('dashboard.pendingReviewsCount'),
      value: assignedLoans.filter(l => l.status === 'under_review').length,
      icon: FileText,
      color: 'text-info',
      bgColor: 'bg-info-light',
      href: '/employee/loans',
    },
  ];

  return (
    <div className="space-y-8">
      <div className="text-left rtl:text-right">
        <h1 className="text-4xl font-bold text-neutral-900 mb-2">{t('common.dashboard')}</h1>
        <p className="text-neutral-600">{t('dashboard.welcomeEmployee', { name: user?.name || '' })}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card
              key={stat.label}
              variant="elevated"
              padding="medium"
              className="cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => router.push(stat.href)}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-neutral-600 mb-1">{stat.label}</p>
                  <p className="text-3xl font-bold text-neutral-900">{formatNumber(stat.value, locale)}</p>
                </div>
                <div className={`p-3 rounded-lg ${stat.bgColor}`}>
                  <Icon className={`w-6 h-6 ${stat.color}`} />
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card variant="elevated" padding="medium">
          <h3 className="text-xl font-semibold text-neutral-900 mb-4">{t('dashboard.assignedCustomers')}</h3>
          <div className="space-y-3">
            {assignedCustomers.length === 0 ? (
              <p className="text-neutral-500">{t('dashboard.noAssignedCustomers')}</p>
            ) : (
              assignedCustomers.slice(0, 5).map((customer) => (
                <div
                  key={customer.id}
                  onClick={() => router.push(`/employee/customers/${customer.id}`)}
                  className="p-4 bg-neutral-50 rounded-lg hover:bg-neutral-100 cursor-pointer transition-colors border border-transparent hover:border-neutral-200"
                >
                  <p className="font-semibold text-neutral-900">{customer.name}</p>
                  <p className="text-sm text-neutral-600">{customer.email}</p>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card variant="elevated" padding="medium">
          <h3 className="text-xl font-semibold text-neutral-900 mb-4">{t('dashboard.recentLoans')}</h3>
          <div className="space-y-3">
            {assignedLoans.length === 0 ? (
              <p className="text-neutral-500">{t('dashboard.noLoansFound')}</p>
            ) : (
              assignedLoans.slice(0, 5).map((loan) => {
                const customer = assignedCustomers.find(c => c.id === loan.customerId);
                return (
                  <div
                    key={loan.id}
                    onClick={() => router.push(`/employee/loans/${loan.id}`)}
                    className="p-4 bg-neutral-50 rounded-lg hover:bg-neutral-100 cursor-pointer transition-colors border border-transparent hover:border-neutral-200"
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-left rtl:text-right">
                        <p className="font-semibold text-neutral-900">{customer?.name || t('detail.unknown')}</p>
                        <p className="text-sm text-neutral-600">{formatCurrency(loan.amount, locale)}</p>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                        loan.status === 'active' ? 'bg-success-light text-success' :
                        loan.status === 'approved' ? 'bg-info-light text-info' :
                        'bg-neutral-200 text-neutral-600'
                      }`}>
                        {t(`loan.status.${loan.status}`)}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
