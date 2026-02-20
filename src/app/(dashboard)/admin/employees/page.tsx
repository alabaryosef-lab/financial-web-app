'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Plus, Edit, UserX, Search, Trash2, UserCheck } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Loader } from '@/components/ui/Loader';
import { useLocale } from '@/contexts/LocaleContext';
import { Employee } from '@/types';
import { formatNumber } from '@/lib/utils';

export default function EmployeesPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { t, locale } = useLocale();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [formData, setFormData] = useState({ name: '', email: '', password: '' });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteConfirmEmployee, setDeleteConfirmEmployee] = useState<Employee | null>(null);
  const [blockConfirmEmployee, setBlockConfirmEmployee] = useState<{ employee: Employee; block: boolean } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    fetchEmployees();
  }, [pathname]);

  useEffect(() => {
    const onVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') fetchEmployees();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [pathname]);

  const fetchEmployees = async () => {
    try {
      const response = await fetch('/api/employees');
      const data = await response.json();
      if (data.success) {
        setEmployees(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch employees:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingEmployee(null);
    setFormData({ name: '', email: '', password: '' });
    setFormErrors({});
    setSubmitError('');
    setIsModalOpen(true);
  };

  const handleEdit = (employee: Employee) => {
    setEditingEmployee(employee);
    setFormData({ name: employee.name, email: employee.email, password: '' });
    setIsModalOpen(true);
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
    
    if (!editingEmployee) {
      if (!formData.password) {
        errors.password = t('validation.passwordRequired');
      } else if (formData.password.length < 6) {
        errors.password = t('validation.passwordMinLength');
      }
    } else if (formData.password && formData.password.length < 6) {
      errors.password = t('validation.passwordMinLength');
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
    
    setSubmitting(true);
    try {
      if (editingEmployee) {
        const response = await fetch(`/api/employees/${editingEmployee.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: formData.name,
            email: formData.email,
            ...(formData.password && { password: formData.password }),
          }),
        });
        const data = await response.json();
        if (data.success) {
          await fetchEmployees();
          setIsModalOpen(false);
          setFormErrors({});
          setSubmitError('');
        } else {
          setSubmitError(data.errorKey ? t(data.errorKey) : (data.error || t('error.internalServerError')));
        }
      } else {
        const response = await fetch('/api/employees', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        });
        const data = await response.json();
        if (data.success) {
          await fetchEmployees();
          setIsModalOpen(false);
          setFormErrors({});
          setSubmitError('');
        } else {
          setSubmitError(data.errorKey ? t(data.errorKey) : (data.error || t('error.internalServerError')));
        }
      }
    } catch (error) {
      console.error('Failed to save employee:', error);
      setSubmitError(t('error.internalServerError'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleBlock = async () => {
    if (!blockConfirmEmployee) return;
    setActionLoading(true);
    try {
      const response = await fetch(`/api/employees/${blockConfirmEmployee.employee.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !blockConfirmEmployee.block }),
      });
      const data = await response.json();
      if (data.success) {
        await fetchEmployees();
        setBlockConfirmEmployee(null);
      }
    } catch (error) {
      console.error('Failed to toggle block:', error);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirmEmployee) return;
    const count = deleteConfirmEmployee.assignedCustomerIds?.length ?? 0;
    if (count > 0) {
      setDeleteConfirmEmployee(null);
      return;
    }
    setDeleteError('');
    setActionLoading(true);
    try {
      const response = await fetch(`/api/employees/${deleteConfirmEmployee.id}`, { method: 'DELETE' });
      const data = await response.json();
      if (data.success) {
        await fetchEmployees();
        setDeleteConfirmEmployee(null);
      } else {
        setDeleteError(data.errorKey ? t(data.errorKey) : (data.error || t('error.internalServerError')));
      }
    } catch (error) {
      console.error('Failed to delete employee:', error);
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

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-neutral-900 mb-2">{t('common.employees')}</h1>
          <p className="text-sm text-neutral-600">{t('page.manageEmployees')}</p>
        </div>
        <Button type="button" onClick={handleCreate} variant="primary" size="medium" className="w-full sm:w-auto whitespace-nowrap">
            <Plus className="w-4 h-4 me-2" />
            {t('page.createEmployee')}
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
              placeholder={t('common.search') + ' ' + t('table.name') + ', ' + t('table.email')}
              className="pl-10 rtl:pl-3 rtl:pr-10"
            />
          </div>
        </div>
      </Card>

      <Card variant="elevated" padding="none">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead className="bg-neutral-50 border-b border-neutral-100">
              <tr>
                <th className="px-6 py-4 text-left rtl:text-right text-sm font-semibold text-neutral-900">{t('table.name')}</th>
                <th className="px-6 py-4 text-left rtl:text-right text-sm font-semibold text-neutral-900">{t('table.email')}</th>
                <th className="px-6 py-4 text-left rtl:text-right text-sm font-semibold text-neutral-900">{t('form.assigned')}</th>
                <th className="px-6 py-4 text-left rtl:text-right text-sm font-semibold text-neutral-900">{t('table.status')}</th>
                <th className="px-6 py-4 text-right rtl:text-left text-sm font-semibold text-neutral-900 bg-neutral-50 sticky right-0 shadow-[-4px_0_8px_rgba(0,0,0,0.04)] rtl:shadow-[4px_0_8px_rgba(0,0,0,0.04)]">{t('table.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {employees.filter((employee) => {
                if (!searchQuery.trim()) return true;
                const query = searchQuery.toLowerCase();
                return employee.name.toLowerCase().includes(query) || employee.email.toLowerCase().includes(query);
              }).map((employee) => (
                <tr
                  key={employee.id}
                  onClick={() => router.push(`/admin/employees/${employee.id}`)}
                  className="hover:bg-neutral-50 cursor-pointer transition-colors"
                >
                  <td className="px-6 py-4 text-left rtl:text-right text-sm text-neutral-900 font-medium">{employee.name}</td>
                  <td className="px-6 py-4 text-left rtl:text-right text-sm text-neutral-600">{employee.email}</td>
                  <td className="px-6 py-4 text-left rtl:text-right text-sm text-neutral-600">
                    {formatNumber(employee.assignedCustomerIds.length, locale)}
                  </td>
                  <td className="px-6 py-4 text-left rtl:text-right">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      employee.isActive 
                        ? 'bg-success-light text-success' 
                        : 'bg-neutral-200 text-neutral-600'
                    }`}>
                      {employee.isActive ? t('status.active') : t('status.inactive')}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right rtl:text-left bg-white sticky right-0 shadow-[-4px_0_8px_rgba(0,0,0,0.04)] rtl:shadow-[4px_0_8px_rgba(0,0,0,0.04)]" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end rtl:flex-row-reverse gap-2">
                      <button
                        onClick={() => handleEdit(employee)}
                        className="p-2 hover:bg-neutral-50 rounded-xl transition-colors"
                        title={t('common.edit')}
                      >
                        <Edit className="w-4 h-4 text-neutral-600" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setBlockConfirmEmployee({ employee, block: employee.isActive }); }}
                        className="p-2 hover:bg-neutral-50 rounded-xl transition-colors"
                        title={employee.isActive ? t('page.blockEmployee') : t('page.unblockEmployee')}
                      >
                        {employee.isActive ? <UserX className="w-4 h-4 text-neutral-600" /> : <UserCheck className="w-4 h-4 text-success" />}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteError(''); setDeleteConfirmEmployee(employee); }}
                        className="p-2 hover:bg-error-light rounded-xl transition-colors"
                        title={t('page.deleteEmployee')}
                      >
                        <Trash2 className="w-4 h-4 text-error" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingEmployee ? t('page.editEmployee') : t('page.createEmployee')}
        footer={
          <>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" onClick={handleSave} disabled={submitting}>
              {submitting ? t('common.loading') + '...' : t('common.save')}
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
          {!editingEmployee ? (
            <Input
              label={t('common.password')}
              type="password"
              value={formData.password}
              onChange={(e) => {
                setFormData({ ...formData, password: e.target.value });
                if (formErrors.password) setFormErrors({ ...formErrors, password: '' });
              }}
              error={formErrors.password}
              placeholder={t('form.placeholder.password')}
              required
              minLength={6}
            />
          ) : (
            <Input
              label={t('common.password')}
              type="password"
              value={formData.password}
              onChange={(e) => {
                setFormData({ ...formData, password: e.target.value });
                if (formErrors.password) setFormErrors({ ...formErrors, password: '' });
              }}
              error={formErrors.password}
              placeholder={t('form.placeholder.passwordOptional')}
              minLength={6}
            />
          )}
        </div>
      </Modal>

      {/* Delete confirmation modal */}
      <Modal
        isOpen={deleteConfirmEmployee !== null}
        onClose={() => setDeleteConfirmEmployee(null)}
        title={t('page.deleteEmployee')}
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleteConfirmEmployee(null)} disabled={actionLoading}>
              {t('common.cancel')}
            </Button>
            {(deleteConfirmEmployee?.assignedCustomerIds?.length ?? 0) > 0 ? (
              <Button variant="primary" onClick={() => setDeleteConfirmEmployee(null)}>
                {t('common.close')}
              </Button>
            ) : (
              <Button variant="primary" onClick={handleDelete} disabled={actionLoading} className="bg-error hover:bg-error/90">
                {actionLoading ? t('common.loading') + '...' : t('common.delete')}
              </Button>
            )}
          </>
        }
      >
        {deleteConfirmEmployee && (
          <>
            {(deleteConfirmEmployee.assignedCustomerIds?.length ?? 0) > 0 ? (
              <p className="text-neutral-700">
                {t('page.cannotDeleteEmployee', { count: String(deleteConfirmEmployee.assignedCustomerIds!.length) })}
              </p>
            ) : (
              <p className="text-neutral-700">{t('page.deleteEmployeeConfirm')}</p>
            )}
            {deleteError && (
              <div className="mt-3 p-3 rounded-lg bg-error-light border border-error text-error text-sm">
                {deleteError}
              </div>
            )}
          </>
        )}
      </Modal>

      {/* Block/Unblock confirmation modal */}
      <Modal
        isOpen={blockConfirmEmployee !== null}
        onClose={() => setBlockConfirmEmployee(null)}
        title={blockConfirmEmployee?.block ? t('page.blockEmployee') : t('page.unblockEmployee')}
        footer={
          <>
            <Button variant="outline" onClick={() => setBlockConfirmEmployee(null)} disabled={actionLoading}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" onClick={handleToggleBlock} disabled={actionLoading}>
              {actionLoading ? t('common.loading') + '...' : (blockConfirmEmployee?.block ? t('page.blockEmployee') : t('page.unblockEmployee'))}
            </Button>
          </>
        }
      >
        {blockConfirmEmployee && (
          <p className="text-neutral-700">
            {blockConfirmEmployee.block ? t('page.blockEmployeeConfirm') : t('page.unblockEmployeeConfirm')}
          </p>
        )}
      </Modal>
    </div>
  );
}
