'use client';

import React, { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Loader } from '@/components/ui/Loader';
import { Input } from '@/components/ui/Input';
import { useLocale } from '@/contexts/LocaleContext';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import { Customer } from '@/types';
import { Search } from 'lucide-react';

export default function EmployeeCustomersPage() {
  const pathname = usePathname();
  const { t } = useLocale();
  const { user } = useAuth();
  const [assignedCustomers, setAssignedCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (user?.id) {
      fetchCustomers();
    }
  }, [user?.id, pathname]);

  useEffect(() => {
    const onVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible' && user?.id) fetchCustomers();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [user?.id, pathname]);

  const fetchCustomers = async () => {
    try {
      const response = await fetch(`/api/employees/${user?.id}/customers`);
      const data = await response.json();
      if (data.success) {
        setAssignedCustomers(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch customers:', error);
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
        <h1 className="text-4xl font-bold text-neutral-900 mb-2 text-left rtl:text-right">{t('dashboard.assignedCustomers')}</h1>
        <p className="text-neutral-600 text-left rtl:text-right">{t('page.viewAssignedCustomers')}</p>
      </div>

      <Card variant="elevated" padding="large">
        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 rtl:left-auto rtl:right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-neutral-400" />
            <Input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('common.search') + ' ' + t('table.name') + ', ' + t('table.email') + ', ' + t('table.phone') + ', ID'}
              className="pl-10 rtl:pl-3 rtl:pr-10"
            />
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {assignedCustomers.filter((customer) => {
          if (!searchQuery.trim()) return true;
          const query = searchQuery.toLowerCase();
          return customer.name.toLowerCase().includes(query) ||
                 customer.email.toLowerCase().includes(query) ||
                 (customer.phone && customer.phone.toLowerCase().includes(query)) ||
                 customer.id.toLowerCase().includes(query);
        }).length === 0 ? (
          <Card variant="elevated" padding="large" className="col-span-full">
            <p className="text-center text-neutral-500">{searchQuery ? t('common.noResults') : t('dashboard.noAssignedCustomers')}</p>
          </Card>
        ) : (
          assignedCustomers.filter((customer) => {
            if (!searchQuery.trim()) return true;
            const query = searchQuery.toLowerCase();
            return customer.name.toLowerCase().includes(query) ||
                   customer.email.toLowerCase().includes(query) ||
                   (customer.phone && customer.phone.toLowerCase().includes(query)) ||
                   customer.id.toLowerCase().includes(query);
          }).map((customer) => (
            <Link key={customer.id} href={`/employee/customers/${customer.id}`}>
              <Card variant="elevated" padding="medium" className="hover:shadow-xl transition-shadow cursor-pointer text-left rtl:text-right">
                <div>
                  <h3 className="text-lg font-semibold text-neutral-900 mb-2">{customer.name}</h3>
                  <p className="text-sm text-neutral-600 mb-1">{customer.email}</p>
                  {customer.phone && (
                    <p className="text-sm text-neutral-600">{customer.phone}</p>
                  )}
                </div>
              </Card>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
