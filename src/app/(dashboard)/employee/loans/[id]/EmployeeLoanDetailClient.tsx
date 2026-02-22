'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter, usePathname } from 'next/navigation';
import { ArrowLeft, Edit, User, Calendar, DollarSign, Percent, FileText } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Loader } from '@/components/ui/Loader';
import { useLocale } from '@/contexts/LocaleContext';
import { useAuth } from '@/contexts/AuthContext';
import { Loan, LoanStatus } from '@/types';
import { getLoanStatusColor, formatDate, formatDateOnly, formatCurrency, formatNumber, formatPercent, toDateInputValue } from '@/lib/utils';

export function EmployeeLoanDetailClient() {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const { t, locale } = useLocale();
  const { user } = useAuth();
  const loanId = params.id as string;
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [loan, setLoan] = useState<Loan | null>(null);
  const [customer, setCustomer] = useState<any>(null);
  const [customerDeleted, setCustomerDeleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    amount: '',
    interestRate: '',
    numberOfInstallments: '',
    installmentTotal: '',
    startDate: '',
    status: 'under_review' as LoanStatus,
    notes: '',
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    if (user?.id && loanId) {
      fetchLoan();
    }
  }, [user?.id, loanId, locale, pathname]);

  useEffect(() => {
    const onVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible' && user?.id && loanId) fetchLoan();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [user?.id, loanId, locale, pathname]);

  const fetchLoan = async () => {
    try {
      const response = await fetch(`/api/loans/${loanId}?locale=${locale}${user?.id ? `&userId=${encodeURIComponent(user.id)}` : ''}`);
      const data = await response.json();
      if (data.success && data.data.employeeId === user?.id) {
        setLoan(data.data);
        setFormData({
          amount: data.data.amount.toString(),
          interestRate: data.data.interestRate.toString(),
          numberOfInstallments: data.data.numberOfInstallments.toString(),
          installmentTotal: data.data.installmentTotal.toString(),
          startDate: toDateInputValue(data.data.startDate) || '',
          status: data.data.status,
          notes: data.data.notes || '',
        });
        fetchCustomer(data.data.customerId);
      }
    } catch (error) {
      console.error('Failed to fetch loan:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomer = async (customerId: string) => {
    try {
      const response = await fetch(`/api/customers/${customerId}${user?.id ? `?userId=${encodeURIComponent(user.id)}` : ''}`);
      const data = await response.json();
      if (data.success) {
        setCustomer(data.data);
        setCustomerDeleted(false);
      } else if (response.status === 404) {
        setCustomer(null);
        setCustomerDeleted(true);
      }
    } catch (error) {
      console.error('Failed to fetch customer:', error);
    }
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    
    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      errors.amount = t('validation.amountRequired');
    }
    
    if (!formData.interestRate || parseFloat(formData.interestRate) < 0) {
      errors.interestRate = t('validation.interestRateRequired');
    }
    
    if (!formData.numberOfInstallments || parseInt(formData.numberOfInstallments) <= 0) {
      errors.numberOfInstallments = t('validation.installmentsRequired');
    }
    
    if (!formData.startDate) {
      errors.startDate = t('validation.startDateRequired');
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async () => {
    if (!loan) return;
    setSubmitError('');
    setFormErrors({});
    
    if (!validateForm()) {
      return;
    }
    
    try {
      const amountNum = parseFloat(formData.amount);
      const interestRateNum = parseFloat(formData.interestRate);
      const numberOfInstallmentsNum = parseInt(formData.numberOfInstallments, 10);
      const installmentTotalNum = formData.installmentTotal ? parseFloat(formData.installmentTotal) : undefined;
      
      if (isNaN(amountNum) || isNaN(interestRateNum) || isNaN(numberOfInstallmentsNum)) {
        setSubmitError(t('validation.invalidNumber'));
        return;
      }
      
      const response = await fetch(`/api/loans/${loan.id}?locale=${locale}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: amountNum,
          interestRate: interestRateNum,
          numberOfInstallments: numberOfInstallmentsNum,
          installmentTotal: installmentTotalNum,
          startDate: formData.startDate,
          status: formData.status,
          notes: formData.notes?.trim() || null,
        }),
      });
      const data = await response.json();
      if (data.success) {
        await fetchLoan();
        setIsEditModalOpen(false);
        setFormErrors({});
        setSubmitError('');
      } else {
        setSubmitError(data.errorKey ? t(data.errorKey) : (data.error || t('error.internalServerError')));
      }
    } catch (error) {
      console.error('Failed to update loan:', error);
      setSubmitError(t('error.internalServerError'));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader size="large" />
      </div>
    );
  }

  if (!loan) {
    return (
      <div className="space-y-6">
        <Button variant="outline" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4 me-2" />
          {t('common.back')}
        </Button>
        <Card variant="elevated" padding="large">
          <p className="text-neutral-500">{t('detail.loanNotFound')}</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => router.back()} size="small">
          <ArrowLeft className="w-4 h-4 me-2" />
          {t('common.back')}
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl sm:text-4xl font-bold text-neutral-900">{t('loan.loanNumber', { number: loan.id.slice(-6) })}</h1>
            <Badge variant={getLoanStatusColor(loan.status)}>
              {t(`loan.status.${loan.status}`)}
            </Badge>
          </div>
          <p className="text-neutral-600 text-left rtl:text-right">{t('form.created')} {formatDate(loan.createdAt, locale)}</p>
        </div>
        <Button variant="primary" onClick={() => setIsEditModalOpen(true)}>
          <Edit className="w-4 h-4 me-2" />
          {t('page.editLoan')}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card variant="elevated" padding="large">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-primary-50 rounded-xl">
              <DollarSign className="w-6 h-6 text-primary-500" />
            </div>
            <h2 className="text-xl font-semibold text-neutral-900">{t('detail.loanDetails')}</h2>
          </div>
          <div className="space-y-4">
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
          </div>
        </Card>

        <Card variant="elevated" padding="large">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-info-light rounded-xl">
              <User className="w-6 h-6 text-info" />
            </div>
            <h2 className="text-xl font-semibold text-neutral-900">{t('detail.customer')}</h2>
          </div>
          {customerDeleted ? (
            <div className="p-4 bg-neutral-50 rounded-lg text-left rtl:text-right">
              <p className="font-semibold text-neutral-500">{t('detail.deletedCustomer')}</p>
            </div>
          ) : customer ? (
            <div
              onClick={() => router.push(`/employee/customers/${customer.id}`)}
              className="p-4 bg-neutral-50 rounded-lg hover:bg-neutral-100 cursor-pointer transition-colors border border-transparent hover:border-neutral-200 text-left rtl:text-right"
            >
              <p className="font-semibold text-neutral-900">{customer.name}</p>
              <p className="text-sm text-neutral-600 mt-1">{customer.email}</p>
            </div>
          ) : (
            <p className="text-neutral-500 text-sm">{t('detail.unknown')}</p>
          )}
        </Card>
      </div>

      {loan.notes && (
        <Card variant="elevated" padding="large">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-warning-light rounded-xl">
              <FileText className="w-6 h-6 text-warning" />
            </div>
            <h2 className="text-xl font-semibold text-neutral-900">{t('loan.notes')}</h2>
          </div>
          <p className="text-base text-neutral-900 text-left rtl:text-right">{loan.notesKey ? t(loan.notesKey) : loan.notes}</p>
        </Card>
      )}

      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title={t('page.editLoan')}
        footer={
          <>
            <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" onClick={handleSave}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {submitError && (
            <div className="p-3 rounded-lg bg-error-light border border-error text-error text-sm">
              {submitError}
            </div>
          )}
          <Input
            label={t('form.amount')}
            type="number"
            value={formData.amount}
            onChange={(e) => {
              setFormData({ ...formData, amount: e.target.value });
              if (formErrors.amount) setFormErrors({ ...formErrors, amount: '' });
            }}
            error={formErrors.amount}
            required
          />
          <Input
            label={t('form.interestRate')}
            type="number"
            step="0.01"
            value={formData.interestRate}
            onChange={(e) => {
              setFormData({ ...formData, interestRate: e.target.value });
              if (formErrors.interestRate) setFormErrors({ ...formErrors, interestRate: '' });
            }}
            error={formErrors.interestRate}
            required
          />
          <Input
            label={t('form.numberOfInstallments')}
            type="number"
            value={formData.numberOfInstallments}
            onChange={(e) => {
              setFormData({ ...formData, numberOfInstallments: e.target.value });
              if (formErrors.numberOfInstallments) setFormErrors({ ...formErrors, numberOfInstallments: '' });
            }}
            error={formErrors.numberOfInstallments}
            required
          />
          <Input
            label={t('form.installmentTotal')}
            type="number"
            value={formData.installmentTotal}
            onChange={(e) => {
              setFormData({ ...formData, installmentTotal: e.target.value });
              if (formErrors.installmentTotal) setFormErrors({ ...formErrors, installmentTotal: '' });
            }}
            error={formErrors.installmentTotal}
            required
          />
          <Input
            label={t('form.startDate')}
            type="date"
            value={formData.startDate}
            onChange={(e) => {
              setFormData({ ...formData, startDate: e.target.value });
              if (formErrors.startDate) setFormErrors({ ...formErrors, startDate: '' });
            }}
            error={formErrors.startDate}
            required
          />
          <div>
            <label className="block text-sm font-semibold text-neutral-900 mb-2">{t('common.status')}</label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value as LoanStatus })}
              className="w-full h-12 px-4 rounded-xl border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            >
              <option value="under_review">{t('loan.status.under_review')}</option>
              <option value="approved">{t('loan.status.approved')}</option>
              <option value="active">{t('loan.status.active')}</option>
              <option value="rejected">{t('loan.status.rejected')}</option>
              <option value="closed">{t('loan.status.closed')}</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-neutral-900 mb-2">{t('loan.notes')}</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="w-full h-24 px-4 py-3 rounded-xl border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
