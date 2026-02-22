'use client';

import React, { useState } from 'react';
import { useParams, useRouter, usePathname } from 'next/navigation';
import { ArrowLeft, Edit, Mail, Phone, MapPin, UserCheck, FileText, UserPlus, X, Trash2, UserX } from 'lucide-react';
import { Card } from '../../../../../components/ui/Card';
import { Button } from '../../../../../components/ui/Button';
import { Badge } from '../../../../../components/ui/Badge';
import { Modal } from '../../../../../components/ui/Modal';
import { Input } from '../../../../../components/ui/Input';
import { Loader } from '../../../../../components/ui/Loader';
import { useLocale } from '../../../../../contexts/LocaleContext';
import { Customer } from '../../../../../types';
import { getLoanStatusColor, formatDate, formatDateOnly, formatCurrency, formatNumber, formatPercent } from '../../../../../lib/utils';

export function CustomerDetailClient() {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const { t, locale } = useLocale();
  const customerId = params.id as string;
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', address: '', password: '', confirmPassword: '' });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState('');
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [assignedEmployee, setAssignedEmployee] = useState<any>(null);
  const [employees, setEmployees] = useState<any[]>([]);
  const [customerLoans, setCustomerLoans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [blockConfirmOpen, setBlockConfirmOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [removeError, setRemoveError] = useState('');
  
  React.useEffect(() => {
    fetchCustomer();
    fetchEmployees();
    fetchLoans();
  }, [customerId, locale, pathname]);

  React.useEffect(() => {
    const onVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        fetchCustomer();
        fetchEmployees();
        fetchLoans();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [customerId, locale, pathname]);

  const fetchCustomer = async () => {
    try {
      const response = await fetch(`/api/customers/${customerId}`);
      const data = await response.json();
      if (data.success) {
        setCustomer(data.data);
        setFormData({
          name: data.data.name,
          email: data.data.email,
          phone: data.data.phone || '',
          address: data.data.address || '',
          password: '',
          confirmPassword: '',
        });
        if (data.data.assignedEmployeeId) {
          fetchAssignedEmployee(data.data.assignedEmployeeId);
        } else {
          setAssignedEmployee(null);
        }
      }
    } catch (error) {
      console.error('Failed to fetch customer:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAssignedEmployee = async (employeeId: string) => {
    try {
      const response = await fetch(`/api/employees/${employeeId}`);
      const data = await response.json();
      if (data.success) {
        setAssignedEmployee(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch employee:', error);
    }
  };

  const fetchEmployees = async () => {
    try {
      const response = await fetch('/api/employees');
      const data = await response.json();
      if (data.success) {
        setEmployees(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch employees:', error);
    }
  };

  const fetchLoans = async () => {
    try {
      const response = await fetch(`/api/loans?customerId=${customerId}&locale=${locale}`);
      const data = await response.json();
      if (data.success) {
        setCustomerLoans(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch loans:', error);
    }
  };

  React.useEffect(() => {
    if (customer) {
      setFormData((prev) => ({
        name: customer.name,
        email: customer.email,
        phone: customer.phone || '',
        address: customer.address || '',
        password: prev.password,
        confirmPassword: prev.confirmPassword,
      }));
    }
  }, [customer]);

  const handleEdit = () => {
    if (customer) {
      setFormData({
        name: customer.name,
        email: customer.email,
        phone: customer.phone || '',
        address: customer.address || '',
        password: '',
        confirmPassword: '',
      });
      setIsEditModalOpen(true);
    }
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    
    if (!formData.name.trim()) {
      errors.name = t('validation.nameRequired');
    }
    
    if (!formData.email.trim()) {
      errors.email = t('validation.emailRequired');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = t('validation.emailInvalid');
    }

    if (formData.password) {
      if (formData.password.length < 6) {
        errors.password = t('validation.passwordMinLength');
      } else if (formData.password !== formData.confirmPassword) {
        errors.confirmPassword = t('validation.passwordMismatch');
      }
    } else if (formData.confirmPassword) {
      errors.confirmPassword = t('validation.passwordMismatch');
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async () => {
    if (!customer) return;
    setSubmitError('');
    setFormErrors({});
    
    if (!validateForm()) {
      return;
    }
    
    try {
      const payload: { name: string; email: string; phone?: string; address?: string; password?: string } = {
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        address: formData.address,
      };
      if (formData.password) payload.password = formData.password;
      const response = await fetch(`/api/customers/${customer.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (data.success) {
        await fetchCustomer();
        setIsEditModalOpen(false);
        setFormData((prev) => ({ ...prev, password: '', confirmPassword: '' }));
        setFormErrors({});
        setSubmitError('');
      } else {
        setSubmitError(data.errorKey ? t(data.errorKey) : (data.error || t('error.internalServerError')));
      }
    } catch (error) {
      console.error('Failed to update customer:', error);
      setSubmitError(t('error.internalServerError'));
    }
  };

  const handleAssignEmployee = async (employeeId: string) => {
    if (!customer) return;
    try {
      const response = await fetch(`/api/customers/${customer.id}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId }),
      });
      const data = await response.json();
      if (data.success) {
        await fetchCustomer();
        setIsAssignModalOpen(false);
      }
    } catch (error) {
      console.error('Failed to assign employee:', error);
    }
  };

  const handleRemoveEmployee = async () => {
    if (!customer) return;
    setRemoveError('');
    try {
      const response = await fetch(`/api/customers/${customer.id}/assign`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (data.success) {
        setAssignedEmployee(null);
        setCustomer((prev) => prev ? { ...prev, assignedEmployeeId: '' } : null);
        await fetchCustomer();
      } else {
        setRemoveError(data.error || t('error.internalServerError'));
      }
    } catch (error) {
      console.error('Failed to remove employee:', error);
      setRemoveError(t('error.internalServerError'));
    }
  };

  const handleToggleBlock = async () => {
    if (!customer) return;
    setActionLoading(true);
    try {
      const response = await fetch(`/api/customers/${customer.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !customer.isActive }),
      });
      const data = await response.json();
      if (data.success) {
        await fetchCustomer();
        setBlockConfirmOpen(false);
      }
    } catch (error) {
      console.error('Failed to toggle block:', error);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!customer || customerLoans.length > 0) return;
    setDeleteError('');
    setActionLoading(true);
    try {
      const response = await fetch(`/api/customers/${customer.id}`, { method: 'DELETE' });
      const data = await response.json();
      if (data.success) {
        router.push('/admin/customers');
      } else {
        setDeleteError(data.errorKey ? t(data.errorKey) : (data.error || t('error.internalServerError')));
      }
    } catch (error) {
      console.error('Failed to delete customer:', error);
      setDeleteError(t('error.internalServerError'));
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader size="large" />
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="space-y-6">
        <Button variant="outline" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4 me-2" />
          {t('common.back')}
        </Button>
        <Card variant="elevated" padding="large">
          <p className="text-neutral-500">{t('detail.customerNotFound')}</p>
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
          <h1 className="text-3xl sm:text-4xl font-bold text-neutral-900 mb-2 text-left rtl:text-right">{customer.name}</h1>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2 text-neutral-600">
              <Mail className="w-4 h-4" />
              <span>{customer.email}</span>
            </div>
            {customer.phone && (
              <div className="flex items-center gap-2 text-neutral-600">
                <Phone className="w-4 h-4" />
                <span>{customer.phone}</span>
              </div>
            )}
            <Badge variant={customer.isActive !== false ? 'success' : 'default'}>
              {customer.isActive !== false ? t('status.active') : t('status.inactive')}
            </Badge>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" onClick={handleEdit} size="small">
            <Edit className="w-4 h-4 me-2" />
            {t('page.editCustomer')}
          </Button>
          <Button variant="outline" size="small" onClick={() => setBlockConfirmOpen(true)}>
            {customer.isActive !== false ? <UserX className="w-4 h-4 me-2" /> : <UserCheck className="w-4 h-4 me-2 text-success" />}
            {customer.isActive !== false ? t('page.blockCustomer') : t('page.unblockCustomer')}
          </Button>
          <Button
            variant="outline"
            size="small"
            onClick={() => { setDeleteError(''); setDeleteConfirmOpen(true); }}
            disabled={customerLoans.length > 0}
            className="border-error text-error hover:bg-error-light disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Trash2 className="w-4 h-4 me-2" />
            {t('page.deleteCustomer')}
          </Button>
        </div>
      </div>

      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title={t('page.editCustomer')}
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
            label={t('common.name')}
            value={formData.name}
            onChange={(e) => {
              setFormData({ ...formData, name: e.target.value });
              if (formErrors.name) setFormErrors({ ...formErrors, name: '' });
            }}
            error={formErrors.name}
            required
          />
          <Input
            label={t('common.email')}
            type="email"
            value={formData.email}
            onChange={(e) => {
              setFormData({ ...formData, email: e.target.value });
              if (formErrors.email) setFormErrors({ ...formErrors, email: '' });
            }}
            error={formErrors.email}
            required
          />
          <Input
            label={t('common.phone')}
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            error={formErrors.phone}
          />
          <Input
            label={t('common.address')}
            value={formData.address}
            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            error={formErrors.address}
          />
          <Input
            label={t('auth.newPassword')}
            type="password"
            value={formData.password}
            onChange={(e) => {
              setFormData({ ...formData, password: e.target.value });
              if (formErrors.password) setFormErrors({ ...formErrors, password: '' });
            }}
            error={formErrors.password}
            placeholder={t('form.placeholder.password')}
          />
          <Input
            label={t('auth.confirmPassword')}
            type="password"
            value={formData.confirmPassword}
            onChange={(e) => {
              setFormData({ ...formData, confirmPassword: e.target.value });
              if (formErrors.confirmPassword) setFormErrors({ ...formErrors, confirmPassword: '' });
            }}
            error={formErrors.confirmPassword}
            placeholder={t('form.placeholder.password')}
          />
        </div>
      </Modal>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card variant="elevated" padding="large">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-primary-50 rounded-xl">
              <Mail className="w-6 h-6 text-primary-500" />
            </div>
            <h2 className="text-xl font-semibold text-neutral-900">{t('detail.contactInformation')}</h2>
          </div>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-neutral-600 mb-1">{t('common.name')}</p>
              <p className="text-base font-semibold text-neutral-900">{customer.name}</p>
            </div>
            <div>
              <p className="text-sm text-neutral-600 mb-1">{t('common.email')}</p>
              <p className="text-base font-semibold text-neutral-900">{customer.email}</p>
            </div>
            {customer.phone && (
              <div>
                <p className="text-sm text-neutral-600 mb-1">{t('common.phone')}</p>
                <p className="text-base font-semibold text-neutral-900">{customer.phone}</p>
              </div>
            )}
            {customer.address && (
              <div>
                <p className="text-sm text-neutral-600 mb-1">{t('common.address')}</p>
                <p className="text-base font-semibold text-neutral-900">{customer.address}</p>
              </div>
            )}
            <div className="text-left rtl:text-right">
              <p className="text-sm text-neutral-600 mb-1">{t('form.memberSince')}</p>
              <p className="text-base font-semibold text-neutral-900">{formatDateOnly(customer.createdAt, locale)}</p>
            </div>
          </div>
        </Card>

        <Card variant="elevated" padding="large" className="overflow-visible">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-info-light rounded-xl flex-shrink-0">
              <UserCheck className="w-6 h-6 text-info" />
            </div>
            <h2 className="text-xl font-semibold text-neutral-900">{t('detail.assignedEmployee')}</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {removeError && (
              <p className="text-sm text-error w-full">{removeError}</p>
            )}
            {(assignedEmployee || customer?.assignedEmployeeId) ? (
              <Button
                variant="outline"
                size="small"
                onClick={handleRemoveEmployee}
                className="whitespace-nowrap flex-shrink-0"
              >
                <X className="w-4 h-4 me-2" />
                {t('page.removeEmployee')}
              </Button>
            ) : null}
            <Button
              variant="primary"
              size="small"
              onClick={() => setIsAssignModalOpen(true)}
              className="whitespace-nowrap flex-shrink-0"
            >
              <UserPlus className="w-4 h-4 me-2" />
              {assignedEmployee ? t('page.changeEmployee') : t('page.assignEmployee')}
            </Button>
          </div>
          {assignedEmployee ? (
            <div
              onClick={() => router.push(`/admin/employees/${assignedEmployee.id}`)}
              className="p-4 bg-neutral-50 rounded-lg hover:bg-neutral-100 cursor-pointer transition-colors border border-transparent hover:border-neutral-200 text-left rtl:text-right"
            >
              <p className="font-semibold text-neutral-900">{assignedEmployee.name}</p>
              <p className="text-sm text-neutral-600 mt-1">{assignedEmployee.email}</p>
            </div>
          ) : (
            <p className="text-neutral-500 text-sm">{t('detail.noEmployeeAssigned')}</p>
          )}
        </Card>
      </div>

      <Card variant="elevated" padding="large">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-success-light rounded-xl">
            <FileText className="w-6 h-6 text-success" />
          </div>
          <h2 className="text-xl font-semibold text-neutral-900">{t('detail.loanHistory')}</h2>
        </div>
        {customerLoans.length === 0 ? (
          <p className="text-neutral-500 text-sm">{t('detail.noLoansFound')}</p>
        ) : (
          <div className="space-y-4">
            {customerLoans.map((loan) => (
              <div
                key={loan.id}
                onClick={() => router.push(`/admin/loans/${loan.id}`)}
                className="p-4 bg-neutral-50 rounded-lg hover:bg-neutral-100 cursor-pointer transition-colors border border-transparent hover:border-neutral-200"
              >
                <div className="flex items-center justify-between">
                  <div className="text-left rtl:text-right">
                    <p className="font-semibold text-neutral-900">{formatCurrency(loan.amount, locale)}</p>
                    <p className="text-sm text-neutral-600 mt-1">
                      {formatPercent(loan.interestRate, locale)} {t('loan.interest')} • {formatNumber(loan.numberOfInstallments, locale)} {t('loan.installments')}
                    </p>
                    <p className="text-xs text-neutral-500 mt-1">
                      {t('loan.started')}: {formatDateOnly(loan.startDate, locale)}
                    </p>
                  </div>
                  <Badge variant={getLoanStatusColor(loan.status)}>
                    {t(`loan.status.${loan.status}`)}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal
        isOpen={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
        title={t('page.assignEmployee')}
        footer={
          <Button variant="outline" onClick={() => setIsAssignModalOpen(false)}>
            {t('common.cancel')}
          </Button>
        }
      >
        <div className="space-y-2">
          {employees.map((employee) => (
            <button
              key={employee.id}
              onClick={() => handleAssignEmployee(employee.id)}
              className="w-full p-4 text-left rtl:text-right hover:bg-neutral-50 rounded-lg border border-neutral-200 transition-colors"
            >
              <p className="font-semibold text-neutral-900">{employee.name}</p>
              <p className="text-sm text-neutral-600">{employee.email}</p>
            </button>
          ))}
        </div>
      </Modal>

      <Modal
        isOpen={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        title={t('page.deleteCustomer')}
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)} disabled={actionLoading}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" onClick={handleDelete} disabled={actionLoading || customerLoans.length > 0} className="bg-error hover:bg-error/90">
              {actionLoading ? t('common.loading') + '...' : t('common.delete')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {customerLoans.length > 0 && (
            <p className="text-error text-sm font-medium">{t('error.customerHasLoans')}</p>
          )}
          {deleteError && (
            <p className="text-error text-sm">{deleteError}</p>
          )}
          <p className="text-neutral-700">{t('page.deleteCustomerConfirm')}</p>
        </div>
      </Modal>

      <Modal
        isOpen={blockConfirmOpen}
        onClose={() => setBlockConfirmOpen(false)}
        title={customer?.isActive !== false ? t('page.blockCustomer') : t('page.unblockCustomer')}
        footer={
          <>
            <Button variant="outline" onClick={() => setBlockConfirmOpen(false)} disabled={actionLoading}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" onClick={handleToggleBlock} disabled={actionLoading}>
              {actionLoading ? t('common.loading') + '...' : (customer?.isActive !== false ? t('page.blockCustomer') : t('page.unblockCustomer'))}
            </Button>
          </>
        }
      >
        <p className="text-neutral-700">
          {customer?.isActive !== false ? t('page.blockCustomerConfirm') : t('page.unblockCustomerConfirm')}
        </p>
      </Modal>
    </div>
  );
}
