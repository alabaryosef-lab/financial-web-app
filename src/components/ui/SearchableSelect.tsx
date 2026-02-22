'use client';

import React, { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';

export interface SearchableSelectOption {
  id: string;
  label: string;
  sublabel?: string;
}

interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder: string;
  className?: string;
  error?: boolean;
  disabled?: boolean;
  required?: boolean;
  'aria-label'?: string;
}

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder,
  className,
  error,
  disabled,
  required,
  'aria-label': ariaLabel,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((o) => o.id === value);
  const searchLower = query.trim().toLowerCase();
  const filtered =
    searchLower === ''
      ? options
      : options.filter(
          (o) =>
            o.label.toLowerCase().includes(searchLower) ||
            (o.sublabel && o.sublabel.toLowerCase().includes(searchLower)) ||
            o.id.toLowerCase().includes(searchLower)
        );

  useEffect(() => {
    if (!open) return;
    setHighlightIndex(0);
  }, [open, query]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (id: string) => {
    onChange(id);
    setQuery('');
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex((i) => (i < filtered.length - 1 ? i + 1 : i));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex((i) => (i > 0 ? i - 1 : 0));
      return;
    }
    if (e.key === 'Enter' && filtered[highlightIndex]) {
      e.preventDefault();
      handleSelect(filtered[highlightIndex].id);
    }
  };

  const displayLabel = open && query !== '' ? undefined : selectedOption?.label;

  return (
    <div ref={containerRef} className="relative w-full">
      <div
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        aria-required={required}
      >
        <input
          type="text"
          value={open ? query : (displayLabel ?? '')}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={selectedOption ? undefined : placeholder}
          disabled={disabled}
          className={cn(
            'w-full h-12 px-4 rounded-xl border focus:outline-none focus:ring-2 focus:ring-primary-500/20',
            error ? 'border-error' : 'border-neutral-200',
            'bg-white text-neutral-900 placeholder:text-neutral-400'
          )}
        />
      </div>
      {open && (
        <ul
          role="listbox"
          className="absolute z-50 mt-1 w-full max-h-60 overflow-auto rounded-xl border border-neutral-200 bg-white shadow-lg py-1"
        >
          {filtered.length === 0 ? (
            <li className="px-4 py-3 text-sm text-neutral-500" role="option">
              No matches
            </li>
          ) : (
            filtered.map((opt, i) => (
              <li
                key={opt.id}
                role="option"
                aria-selected={opt.id === value}
                className={cn(
                  'px-4 py-3 text-sm cursor-pointer',
                  i === highlightIndex ? 'bg-primary-50 text-primary-900' : 'text-neutral-900 hover:bg-neutral-50',
                  opt.id === value && 'font-medium'
                )}
                onMouseEnter={() => setHighlightIndex(i)}
                onClick={() => handleSelect(opt.id)}
              >
                <span className="block truncate">{opt.label}</span>
                {opt.sublabel && (
                  <span className="block truncate text-xs text-neutral-500 mt-0.5">{opt.sublabel}</span>
                )}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
