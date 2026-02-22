'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Plus, Edit, Search } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { Badge } from '@/components/ui/Badge';
import { Loader } from '@/components/ui/Loader';
import { useLocale } from '@/contexts/LocaleContext';
import { useAuth } from '@/contexts/AuthContext';
import { Loan, LoanStatus } from '@/types';
import { getLoanStatusColor, formatCurrency, formatNumber, formatPercent, toDateInputValue } from '@/lib/utils';

export default function EmployeeLoansPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { t, locale } = useLocale();
  const { user } = useAuth();
  const [loans, setLoans] = useState<Loan[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingLoan, setEditingLoan] = useState<Loan | null>(null);
  const [formData, setFormData] = useState({
    customerId: '',
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
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (user?.id) {
      fetchLoans();
      fetchCustomers();
    }
  }, [user?.id, locale, pathname]);

  useEffect(() => {
    const onVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible' && user?.id) {
        fetchLoans();
        fetchCustomers();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [user?.id, locale, pathname]);

  const fetchLoans = async () => {
    try {
      const response = await fetch(`/api/loans?employeeId=${user?.id}&locale=${locale}`);
      const data = await response.json();
      if (data.success) {
        setLoans(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch loans:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomers = async () => {
    try {
      const response = await fetch(`/api/employees/${user?.id}/customers`);
      const data = await response.json();
      if (data.success) {
        setCustomers(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch customers:', error);
    }
  };

  const handleCreate = () => {
    setEditingLoan(null);
    setFormData({
      customerId: '',
      amount: '',
      interestRate: '',
      numberOfInstallments: '',
      installmentTotal: '',
      startDate: '',
      status: 'under_review',
      notes: '',
    });
    setFormErrors({});
    setSubmitError('');
    setIsModalOpen(true);
  };

  const handleEdit = (loan: Loan) => {
    setEditingLoan(loan);
    setFormData({
      customerId: loan.customerId,
      amount: loan.amount.toString(),
      interestRate: loan.interestRate.toString(),
      numberOfInstallments: loan.numberOfInstallments.toString(),
      installmentTotal: loan.installmentTotal.toString(),
      startDate: toDateInputValue(loan.startDate) || '',
      status: loan.status,
      notes: loan.notes || '',
    });
    setIsModalOpen(true);
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    
    // Customer validation (only for new loans)
    if (!editingLoan) {
      if (!formData.customerId || formData.customerId.trim() === '') {
        errors.customerId = t('validation.customerRequired');
      }
    }
    
    // Amount validation
    if (!formData.amount || formData.amount.trim() === '') {
      errors.amount = t('validation.amountRequired');
    } else {
      const amountNum = parseFloat(formData.amount);
      if (isNaN(amountNum)) {
        errors.amount = t('validation.amountInvalid');
      } else if (amountNum <= 0) {
        errors.amount = t('validation.amountInvalid');
      } else if (amountNum > 999999999) {
        errors.amount = t('validation.amountInvalid');
      }
    }
    
    // Interest rate validation
    if (!formData.interestRate || formData.interestRate.trim() === '') {
      errors.interestRate = t('validation.interestRateRequired');
    } else {
      const interestRateNum = parseFloat(formData.interestRate);
      if (isNaN(interestRateNum)) {
        errors.interestRate = t('validation.interestRateInvalid');
      } else if (interestRateNum < 0) {
        errors.interestRate = t('validation.interestRateInvalid');
      } else if (interestRateNum > 100) {
        errors.interestRate = t('validation.interestRateInvalid');
      }
    }
    
    // Number of installments validation
    if (!formData.numberOfInstallments || formData.numberOfInstallments.trim() === '') {
      errors.numberOfInstallments = t('validation.installmentsRequired');
    } else {
      const installmentsNum = parseInt(formData.numberOfInstallments, 10);
      if (isNaN(installmentsNum)) {
        errors.numberOfInstallments = t('validation.installmentsInvalid');
      } else if (installmentsNum <= 0) {
        errors.numberOfInstallments = t('validation.installmentsInvalid');
      } else if (!Number.isInteger(installmentsNum)) {
        errors.numberOfInstallments = t('validation.installmentsInvalid');
      } else if (installmentsNum > 1000) {
        errors.numberOfInstallments = t('validation.installmentsInvalid');
      }
    }
    
    // Installment total validation (optional field)
    if (formData.installmentTotal && formData.installmentTotal.trim() !== '') {
      const installmentTotalNum = parseFloat(formData.installmentTotal);
      if (isNaN(installmentTotalNum)) {
        errors.installmentTotal = t('validation.amountInvalid');
      } else if (installmentTotalNum <= 0) {
        errors.installmentTotal = t('validation.amountInvalid');
      }
    }
    
    // Start date validation
    if (!formData.startDate || formData.startDate.trim() === '') {
      errors.startDate = t('validation.startDateRequired');
    } else {
      const date = new Date(formData.startDate);
      if (isNaN(date.getTime())) {
        errors.startDate = t('validation.startDateRequired');
      }
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async () => {
    setSubmitError('');
    setFormErrors({});
    
    if (!validateForm()) {
      return;
    }
    
    try {
      if (editingLoan) {
        // Additional validation before API call (should already be validated by validateForm)
        const amountNum = parseFloat(formData.amount);
        const interestRateNum = parseFloat(formData.interestRate);
        const numberOfInstallmentsNum = parseInt(formData.numberOfInstallments, 10);
        const installmentTotalNum = formData.installmentTotal && formData.installmentTotal.trim() !== '' 
          ? parseFloat(formData.installmentTotal) 
          : undefined;
        
        // Double-check numeric values (should not happen if validateForm worked correctly)
        if (isNaN(amountNum) || amountNum <= 0) {
          setSubmitError(t('validation.amountInvalid'));
          return;
        }
        if (isNaN(interestRateNum) || interestRateNum < 0 || interestRateNum > 100) {
          setSubmitError(t('validation.interestRateInvalid'));
          return;
        }
        if (isNaN(numberOfInstallmentsNum) || numberOfInstallmentsNum <= 0 || !Number.isInteger(numberOfInstallmentsNum)) {
          setSubmitError(t('validation.installmentsInvalid'));
          return;
        }
        if (installmentTotalNum !== undefined && (isNaN(installmentTotalNum) || installmentTotalNum <= 0)) {
          setSubmitError(t('validation.amountInvalid'));
          return;
        }
        
        const response = await fetch(`/api/loans/${editingLoan.id}`, {
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
          await fetchLoans();
          setIsModalOpen(false);
          setFormErrors({});
          setSubmitError('');
        } else {
          setSubmitError(data.errorKey ? t(data.errorKey) : (data.error || t('error.internalServerError')));
        }
      } else {
        // Additional validation before API call (should already be validated by validateForm)
        const amountNum = parseFloat(formData.amount);
        const interestRateNum = parseFloat(formData.interestRate);
        const numberOfInstallmentsNum = parseInt(formData.numberOfInstallments, 10);
        const installmentTotalNum = formData.installmentTotal && formData.installmentTotal.trim() !== '' 
          ? parseFloat(formData.installmentTotal) 
          : undefined;
        
        // Double-check numeric values (should not happen if validateForm worked correctly)
        if (isNaN(amountNum) || amountNum <= 0) {
          setSubmitError(t('validation.amountInvalid'));
          return;
        }
        if (isNaN(interestRateNum) || interestRateNum < 0 || interestRateNum > 100) {
          setSubmitError(t('validation.interestRateInvalid'));
          return;
        }
        if (isNaN(numberOfInstallmentsNum) || numberOfInstallmentsNum <= 0 || !Number.isInteger(numberOfInstallmentsNum)) {
          setSubmitError(t('validation.installmentsInvalid'));
          return;
        }
        if (installmentTotalNum !== undefined && (isNaN(installmentTotalNum) || installmentTotalNum <= 0)) {
          setSubmitError(t('validation.amountInvalid'));
          return;
        }
        
        const response = await fetch('/api/loans', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customerId: formData.customerId,
            employeeId: user?.id,
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
          await fetchLoans();
          setIsModalOpen(false);
          setFormErrors({});
          setSubmitError('');
        } else {
          setSubmitError(data.errorKey ? t(data.errorKey) : (data.error || t('error.internalServerError')));
        }
      }
    } catch (error) {
      console.error('Failed to save loan:', error);
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

  // Filter loans based on search query
  const filteredLoans = loans.filter((loan) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    const customer = customers.find(c => c.id === loan.customerId);
    
    // Search in customer info
    const customerMatch = customer && (
      customer.name?.toLowerCase().includes(query) ||
      customer.email?.toLowerCase().includes(query) ||
      customer.id?.toLowerCase().includes(query)
    );
    
    // Search in loan info
    const loanMatch = 
      formatCurrency(loan.amount, locale).toLowerCase().includes(query) ||
      loan.amount.toString().includes(query) ||
      formatPercent(loan.interestRate, locale).toLowerCase().includes(query) ||
      loan.interestRate.toString().includes(query) ||
      loan.numberOfInstallments.toString().includes(query) ||
      t(`loan.status.${loan.status}`).toLowerCase().includes(query) ||
      loan.status.toLowerCase().includes(query) ||
      loan.id.toLowerCase().includes(query);
    
    return customerMatch || loanMatch;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-neutral-900 mb-2">{t('common.loans')}</h1>
          <p className="text-sm sm:text-base text-neutral-600">{t('employee.manageLoans')}</p>
        </div>
        <Button onClick={handleCreate} variant="primary" className="w-full sm:w-auto whitespace-nowrap">
          <Plus className="w-4 h-4 me-2" />
          {t('page.createLoan')}
        </Button>
      </div>

      <Card variant="elevated" padding="large">
        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 rtl:left-auto rtl:right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-neutral-400" />
            <Input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('common.search') + ' ' + t('table.customer') + ', ' + t('table.amount') + ', ' + t('table.status') + '...'}
              className="pl-10 rtl:pl-3 rtl:pr-10"
            />
          </div>
        </div>
      </Card>

      <Card variant="elevated" padding="none">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-neutral-50 border-b border-neutral-100">
              <tr>
                <th className="px-6 py-4 text-left rtl:text-right text-sm font-semibold text-neutral-900">{t('table.customer')}</th>
                <th className="px-6 py-4 text-left rtl:text-right text-sm font-semibold text-neutral-900">{t('table.amount')}</th>
                <th className="px-6 py-4 text-left rtl:text-right text-sm font-semibold text-neutral-900">{t('table.interestRate')}</th>
                <th className="px-6 py-4 text-left rtl:text-right text-sm font-semibold text-neutral-900">{t('table.installments')}</th>
                <th className="px-6 py-4 text-left rtl:text-right text-sm font-semibold text-neutral-900">{t('table.status')}</th>
                <th className="px-6 py-4 text-right rtl:text-left text-sm font-semibold text-neutral-900">{t('table.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {filteredLoans.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-neutral-500">
                    {searchQuery.trim() ? t('common.noResults') : t('dashboard.noLoansFound')}
                  </td>
                </tr>
              ) : (
                filteredLoans.map((loan) => {
                const customer = customers.find(c => c.id === loan.customerId);
                return (
                  <tr
                    key={loan.id}
                    onClick={() => router.push(`/employee/loans/${loan.id}`)}
                    className="hover:bg-neutral-50 cursor-pointer transition-colors"
                  >
                    <td className="px-6 py-4 text-left rtl:text-right text-sm text-neutral-900 font-medium">
                      {customer ? customer.name : t('detail.deletedCustomer')}
                    </td>
                    <td className="px-6 py-4 text-left rtl:text-right text-sm text-neutral-900">
                      {formatCurrency(loan.amount, locale)}
                    </td>
                    <td className="px-6 py-4 text-left rtl:text-right text-sm text-neutral-600">{formatPercent(loan.interestRate, locale)}</td>
                    <td className="px-6 py-4 text-left rtl:text-right text-sm text-neutral-600">{formatNumber(loan.numberOfInstallments, locale)}</td>
                    <td className="px-6 py-4 text-left rtl:text-right">
                      <Badge variant={getLoanStatusColor(loan.status)}>
                        {t(`loan.status.${loan.status}`)}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-right rtl:text-left" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handleEdit(loan)}
                        className="p-2 hover:bg-neutral-50 rounded-xl transition-colors"
                      >
                        <Edit className="w-4 h-4 text-neutral-600" />
                      </button>
                    </td>
                  </tr>
                );
              })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingLoan ? t('page.editLoan') : t('page.createLoan')}
        size="large"
        footer={
          <>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>
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
          {!editingLoan && (
            <div>
              <label className="block text-sm font-semibold text-neutral-900 mb-2">{t('form.customer')}</label>
              <SearchableSelect
                options={customers.map((c) => ({
                  id: c.id,
                  label: c.name,
                  sublabel: c.email,
                }))}
                value={formData.customerId}
                onChange={(id) => {
                  setFormData({ ...formData, customerId: id });
                  if (formErrors.customerId) setFormErrors({ ...formErrors, customerId: '' });
                }}
                placeholder={t('form.selectCustomer')}
                error={!!formErrors.customerId}
                required
                aria-label={t('form.customer')}
              />
              {formErrors.customerId && (
                <p className="mt-2 text-sm text-error">{formErrors.customerId}</p>
              )}
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
            label={`${t('form.interestRate')} (%)`}
            type="number"
            step="0.1"
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
