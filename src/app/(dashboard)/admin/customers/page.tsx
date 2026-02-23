'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Plus, Edit, UserPlus, Search, Trash2, UserX, UserCheck, X } from 'lucide-react';
import { Card } from '../../../../components/ui/Card';
import { Button } from '../../../../components/ui/Button';
import { Modal } from '../../../../components/ui/Modal';
import { Input } from '../../../../components/ui/Input';
import { PasswordInput } from '../../../../components/ui/PasswordInput';
import { Loader } from '../../../../components/ui/Loader';
import { useLocale } from '../../../../contexts/LocaleContext';
import { Customer } from '../../../../types';

export default function CustomersPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useLocale();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', address: '', password: '', assignedEmployeeIds: [] as string[] });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteConfirmCustomer, setDeleteConfirmCustomer] = useState<Customer | null>(null);
  const [blockConfirmCustomer, setBlockConfirmCustomer] = useState<{ customer: Customer; block: boolean } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    fetchCustomers();
    fetchEmployees();
  }, [pathname]);

  useEffect(() => {
    const onVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        fetchCustomers();
        fetchEmployees();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [pathname]);

  const fetchCustomers = async () => {
    try {
      const response = await fetch('/api/customers');
      const data = await response.json();
      if (data.success) {
        setCustomers(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch customers:', error);
    } finally {
      setLoading(false);
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

  const handleCreate = () => {
    setEditingCustomer(null);
    setFormData({ name: '', email: '', phone: '', address: '', password: '', assignedEmployeeIds: [] });
    setFormErrors({});
    setSubmitError('');
    setIsModalOpen(true);
  };

  const handleEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    setFormData({ 
      name: customer.name, 
      email: customer.email,
      phone: customer.phone || '',
      address: customer.address || '',
      password: '',
    });
    setFormErrors({});
    setSubmitError('');
    setIsModalOpen(true);
  };

  const handleAssign = (customer: Customer) => {
    setSelectedCustomer(customer);
    setIsAssignModalOpen(true);
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
    
    if (!editingCustomer) {
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
      if (editingCustomer) {
        const response = await fetch(`/api/customers/${editingCustomer.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: formData.name,
            email: formData.email,
            phone: formData.phone,
            address: formData.address,
            ...(formData.password && { password: formData.password }),
          }),
        });
        const data = await response.json();
        if (data.success) {
          await fetchCustomers();
          setIsModalOpen(false);
          setFormErrors({});
          setSubmitError('');
        } else {
          setSubmitError(data.errorKey ? t(data.errorKey) : (data.error || t('error.internalServerError')));
        }
      } else {
        const { assignedEmployeeIds, ...createPayload } = formData;
        const response = await fetch('/api/customers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(createPayload),
        });
        const data = await response.json();
        if (data.success) {
          const newId = data.data?.id;
          if (newId && Array.isArray(assignedEmployeeIds) && assignedEmployeeIds.length > 0) {
            try {
              const assignRes = await fetch(`/api/customers/${newId}/assign`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ employeeIds: assignedEmployeeIds }),
              });
              await assignRes.json();
            } catch (_) {
              // Customer created; assign best-effort
            }
          }
          await fetchCustomers();
          setIsModalOpen(false);
          setFormErrors({});
          setSubmitError('');
        } else {
          setSubmitError(data.errorKey ? t(data.errorKey) : (data.error || t('error.internalServerError')));
        }
      }
    } catch (error) {
      console.error('Failed to save customer:', error);
      setSubmitError(t('error.internalServerError'));
    } finally {
      setSubmitting(false);
    }
  };

  const currentAssignedIds = (selectedCustomer?.assignedEmployeeIds && selectedCustomer.assignedEmployeeIds.length > 0)
    ? selectedCustomer.assignedEmployeeIds
    : (selectedCustomer?.assignedEmployeeId ? [selectedCustomer.assignedEmployeeId] : []);

  const handleAssignEmployee = async (employeeId: string) => {
    if (!selectedCustomer) return;
    const nextIds = [...currentAssignedIds, employeeId];
    try {
      const response = await fetch(`/api/customers/${selectedCustomer.id}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeIds: nextIds }),
      });
      const data = await response.json();
      if (data.success) {
        const list = await fetch('/api/customers').then(r => r.json());
        if (list.success && list.data) {
          setCustomers(list.data);
          const updated = list.data.find((c: Customer) => c.id === selectedCustomer.id);
          if (updated) setSelectedCustomer(updated);
        }
      }
    } catch (error) {
      console.error('Failed to assign employee:', error);
    }
  };

  const handleRemoveAssignedEmployee = async (employeeId: string) => {
    if (!selectedCustomer) return;
    try {
      const response = await fetch(`/api/customers/${selectedCustomer.id}/assign?employeeId=${encodeURIComponent(employeeId)}`, { method: 'DELETE' });
      const data = await response.json();
      if (data.success) {
        const list = await fetch('/api/customers').then(r => r.json());
        if (list.success && list.data) {
          setCustomers(list.data);
          const updated = list.data.find((c: Customer) => c.id === selectedCustomer.id);
          if (updated) setSelectedCustomer(updated);
        }
      }
    } catch (error) {
      console.error('Failed to remove employee:', error);
    }
  };

  const handleToggleBlock = async () => {
    if (!blockConfirmCustomer) return;
    setActionLoading(true);
    try {
      const response = await fetch(`/api/customers/${blockConfirmCustomer.customer.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !blockConfirmCustomer.block }),
      });
      const data = await response.json();
      if (data.success) {
        await fetchCustomers();
        setBlockConfirmCustomer(null);
      }
    } catch (error) {
      console.error('Failed to toggle block:', error);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirmCustomer) return;
    setActionLoading(true);
    try {
      const response = await fetch(`/api/customers/${deleteConfirmCustomer.id}`, { method: 'DELETE' });
      const data = await response.json();
      if (data.success) {
        await fetchCustomers();
        setDeleteConfirmCustomer(null);
        setSubmitError('');
      } else {
        setSubmitError(data.errorKey ? t(data.errorKey) : (data.error || t('error.internalServerError')));
      }
    } catch (error) {
      console.error('Failed to delete customer:', error);
      setSubmitError(t('error.internalServerError'));
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
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-neutral-900 mb-2">{t('common.customers')}</h1>
          <p className="text-sm sm:text-base text-neutral-600">{t('page.manageCustomers')}</p>
        </div>
        <Button onClick={handleCreate} variant="primary" className="w-full sm:w-auto whitespace-nowrap">
          <Plus className="w-4 h-4 me-2" />
          {t('page.createCustomer')}
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
              placeholder={t('common.search') + ' ' + t('table.name') + ', ' + t('table.email') + ', ' + t('table.phone') + ', ID'}
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
                <th className="px-6 py-4 text-left rtl:text-right text-sm font-semibold text-neutral-900">{t('table.name')}</th>
                <th className="px-6 py-4 text-left rtl:text-right text-sm font-semibold text-neutral-900">{t('table.email')}</th>
                <th className="px-6 py-4 text-left rtl:text-right text-sm font-semibold text-neutral-900">{t('table.phone')}</th>
                <th className="px-6 py-4 text-left rtl:text-right text-sm font-semibold text-neutral-900">{t('form.assignedEmployee')}</th>
                <th className="px-6 py-4 text-left rtl:text-right text-sm font-semibold text-neutral-900">{t('table.status')}</th>
                <th className="px-6 py-4 text-right rtl:text-left text-sm font-semibold text-neutral-900 bg-neutral-50 sticky right-0 shadow-[-4px_0_8px_rgba(0,0,0,0.04)] rtl:shadow-[4px_0_8px_rgba(0,0,0,0.04)]">{t('table.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {customers.filter((customer) => {
                if (!searchQuery.trim()) return true;
                const query = searchQuery.toLowerCase();
                return customer.name.toLowerCase().includes(query) ||
                       customer.email.toLowerCase().includes(query) ||
                       (customer.phone && customer.phone.toLowerCase().includes(query)) ||
                       customer.id.toLowerCase().includes(query);
              }).map((customer) => {
                const assignedEmployee = employees.find(e => e.id === customer.assignedEmployeeId);
                return (
                  <tr
                    key={customer.id}
                    onClick={() => router.push(`/admin/customers/${customer.id}`)}
                    className="hover:bg-neutral-50 cursor-pointer transition-colors"
                  >
                    <td className="px-6 py-4 text-left rtl:text-right text-sm text-neutral-900 font-medium">{customer.name}</td>
                    <td className="px-6 py-4 text-left rtl:text-right text-sm text-neutral-600">{customer.email}</td>
                    <td className="px-6 py-4 text-left rtl:text-right text-sm text-neutral-600">{customer.phone || '-'}</td>
                    <td className="px-6 py-4 text-left rtl:text-right text-sm text-neutral-600">
                      {assignedEmployee ? assignedEmployee.name : t('detail.unassigned')}
                    </td>
                    <td className="px-6 py-4 text-left rtl:text-right">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                        customer.isActive !== false ? 'bg-success-light text-success' : 'bg-neutral-200 text-neutral-600'
                      }`}>
                        {customer.isActive !== false ? t('status.active') : t('status.inactive')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right rtl:text-left bg-white sticky right-0 shadow-[-4px_0_8px_rgba(0,0,0,0.04)] rtl:shadow-[4px_0_8px_rgba(0,0,0,0.04)]" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end rtl:flex-row-reverse gap-2">
                        <button
                          onClick={() => handleAssign(customer)}
                          className="p-2 hover:bg-neutral-50 rounded-xl transition-colors"
                          title={t('page.assignEmployee')}
                        >
                          <UserPlus className="w-4 h-4 text-neutral-600" />
                        </button>
                        <button
                          onClick={() => handleEdit(customer)}
                          className="p-2 hover:bg-neutral-50 rounded-xl transition-colors"
                          title={t('common.edit')}
                        >
                          <Edit className="w-4 h-4 text-neutral-600" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setBlockConfirmCustomer({ customer, block: customer.isActive !== false }); }}
                          className="p-2 hover:bg-neutral-50 rounded-xl transition-colors"
                          title={customer.isActive !== false ? t('page.blockCustomer') : t('page.unblockCustomer')}
                        >
                          {customer.isActive !== false ? <UserX className="w-4 h-4 text-neutral-600" /> : <UserCheck className="w-4 h-4 text-success" />}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setSubmitError(''); setDeleteConfirmCustomer(customer); }}
                          className="p-2 hover:bg-error-light rounded-xl transition-colors"
                          title={t('page.deleteCustomer')}
                        >
                          <Trash2 className="w-4 h-4 text-error" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingCustomer ? t('page.editCustomer') : t('page.createCustomer')}
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
          <Input
            label={t('common.name')}
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
          />
          <Input
            label={t('common.email')}
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            required
          />
          <Input
            label={t('common.phone')}
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          />
          <Input
            label={t('common.address')}
            value={formData.address}
            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
          />
          {!editingCustomer ? (
            <PasswordInput
              label={t('common.password')}
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              placeholder={t('form.placeholder.password')}
              required
              minLength={6}
            />
          ) : (
            <PasswordInput
              label={t('common.password')}
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              placeholder={t('form.placeholder.passwordOptional')}
              minLength={6}
            />
          )}
          {!editingCustomer && employees.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">{t('form.assignedEmployee')} (optional)</label>
              <div className="max-h-40 overflow-y-auto space-y-2 border border-neutral-200 rounded-lg p-3">
                {employees.map((emp) => (
                  <label key={emp.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.assignedEmployeeIds.includes(emp.id)}
                      onChange={(e) => {
                        const ids = e.target.checked
                          ? [...formData.assignedEmployeeIds, emp.id]
                          : formData.assignedEmployeeIds.filter((id) => id !== emp.id);
                        setFormData({ ...formData, assignedEmployeeIds: ids });
                      }}
                      className="rounded border-neutral-300"
                    />
                    <span className="text-sm text-neutral-900">{emp.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </Modal>

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
        <div className="space-y-4">
          {currentAssignedIds.length > 0 && (
            <div>
              <p className="text-sm font-medium text-neutral-700 mb-2">{t('detail.assignedEmployee')}</p>
              <ul className="space-y-1 mb-3">
                {currentAssignedIds.map((eid) => {
                  const emp = employees.find(e => e.id === eid);
                  return emp ? (
                    <li key={eid} className="flex items-center justify-between p-2 rounded-lg bg-neutral-50">
                      <span className="text-neutral-900">{emp.name}</span>
                      <button type="button" onClick={() => handleRemoveAssignedEmployee(eid)} className="p-1 hover:bg-neutral-200 rounded" title={t('common.remove')}>
                        <X className="w-4 h-4 text-neutral-500" />
                      </button>
                    </li>
                  ) : null;
                })}
              </ul>
            </div>
          )}
          <div>
            <p className="text-sm font-medium text-neutral-700 mb-2">Add employee</p>
            {employees.filter((e) => !currentAssignedIds.includes(e.id)).length === 0 ? (
              <p className="text-neutral-500 text-sm">All employees are already assigned.</p>
            ) : (
              <div className="space-y-1">
                {employees.filter((e) => !currentAssignedIds.includes(e.id)).map((employee) => (
                  <button
                    key={employee.id}
                    type="button"
                    onClick={() => handleAssignEmployee(employee.id)}
                    className="w-full p-3 text-left rtl:text-right hover:bg-neutral-50 rounded-lg border border-neutral-200 transition-colors"
                  >
                    <p className="font-semibold text-neutral-900">{employee.name}</p>
                    <p className="text-sm text-neutral-600">{employee.email}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={deleteConfirmCustomer !== null}
        onClose={() => { setDeleteConfirmCustomer(null); setSubmitError(''); }}
        title={t('page.deleteCustomer')}
        footer={
          <>
            <Button variant="outline" onClick={() => { setDeleteConfirmCustomer(null); setSubmitError(''); }} disabled={actionLoading}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" onClick={handleDelete} disabled={actionLoading} className="bg-error hover:bg-error/90">
              {actionLoading ? t('common.loading') + '...' : t('common.delete')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {submitError && <p className="text-error text-sm">{submitError}</p>}
          <p className="text-neutral-700">{t('page.deleteCustomerConfirm')}</p>
          <p className="text-neutral-600 text-sm">{t('page.deleteCustomerUnassignAndDelete')}</p>
        </div>
      </Modal>

      <Modal
        isOpen={blockConfirmCustomer !== null}
        onClose={() => setBlockConfirmCustomer(null)}
        title={blockConfirmCustomer?.block ? t('page.blockCustomer') : t('page.unblockCustomer')}
        footer={
          <>
            <Button variant="outline" onClick={() => setBlockConfirmCustomer(null)} disabled={actionLoading}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" onClick={handleToggleBlock} disabled={actionLoading}>
              {actionLoading ? t('common.loading') + '...' : (blockConfirmCustomer?.block ? t('page.blockCustomer') : t('page.unblockCustomer'))}
            </Button>
          </>
        }
      >
        {blockConfirmCustomer && (
          <p className="text-neutral-700">
            {blockConfirmCustomer.block ? t('page.blockCustomerConfirm') : t('page.unblockCustomerConfirm')}
          </p>
        )}
      </Modal>
    </div>
  );
}
