import { clsx } from 'clsx';

export function cn(...inputs: (string | undefined | null | boolean)[]) {
  return clsx(inputs);
}

const localeForNumbers = (locale: string) => (locale === 'ar' ? 'ar-SA' : 'en-US');

export function formatCurrency(amount: number, locale: string = 'en'): string {
  return new Intl.NumberFormat(localeForNumbers(locale), {
    style: 'currency',
    currency: 'SAR',
  }).format(amount);
}

/** Format integers/decimals with locale-appropriate digits (e.g. Arabic ٠١٢٣ in ar) */
export function formatNumber(value: number, locale: string = 'en'): string {
  return new Intl.NumberFormat(localeForNumbers(locale)).format(value);
}

/** Format a percentage with locale-appropriate digits */
export function formatPercent(value: number, locale: string = 'en'): string {
  const formatted = new Intl.NumberFormat(localeForNumbers(locale), {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
  return `${formatted}%`;
}

export function formatDate(date: string | undefined | null, locale: string = 'en'): string {
  if (date == null || date === '') return '';
  try {
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-SA' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return '';
  }
}

export function formatDateOnly(date: string, locale: string = 'en'): string {
  try {
    return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-SA' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(new Date(date));
  } catch {
    return new Date(date).toLocaleDateString();
  }
}

/** For <input type="date"> value: always yyyy-MM-dd */
export function toDateInputValue(date: string | undefined | null): string {
  if (date == null || date === '') return '';
  try {
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  } catch {
    return '';
  }
}

export function getLoanStatusColor(status: string): 'default' | 'success' | 'warning' | 'error' | 'info' {
  switch (status) {
    case 'approved':
    case 'active':
      return 'success';
    case 'under_review':
      return 'info';
    case 'rejected':
      return 'error';
    case 'closed':
      return 'default';
    default:
      return 'default';
  }
}
