// Shared UI primitives

import React from 'react';
import { cn } from '../../utils/cn';

// ─── Button ──────────────────────────────────────────────────────────────────

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  const base = 'inline-flex items-center justify-center gap-2 font-medium rounded-xl transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-400)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-surface-0)] disabled:opacity-40 disabled:cursor-not-allowed select-none';

  const variants = {
    primary: 'bg-[var(--color-brand-500)] text-white hover:bg-[var(--color-brand-400)] active:scale-[0.97] shadow-lg shadow-[var(--color-brand-500)]/20',
    secondary: 'bg-[var(--color-surface-2)] text-[var(--color-text-main)] hover:bg-[var(--color-surface-3)] active:scale-[0.97] border border-[var(--color-surface-3)]',
    ghost: 'bg-transparent text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-main)] active:scale-[0.97]',
    danger: 'bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30 hover:bg-red-500/25 active:scale-[0.97]',
    outline: 'bg-transparent border border-[var(--color-surface-3)] text-[var(--color-text-main)] hover:bg-[var(--color-surface-2)] hover:border-[var(--color-brand-500)]/50 active:scale-[0.97]',
  };

  const sizes = {
    sm: 'text-xs px-3 py-1.5 h-7',
    md: 'text-sm px-4 py-2 h-9',
    lg: 'text-base px-6 py-3 h-12',
  };

  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={cn(base, variants[variant], sizes[size], className)}
    >
      {loading && (
        <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" aria-hidden />
      )}
      {children}
    </button>
  );
}

// ─── Input ───────────────────────────────────────────────────────────────────

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export function Input({ label, error, hint, className, id, ...props }: InputProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={inputId} className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
          {label}
        </label>
      )}
      <input
        id={inputId}
        {...props}
        className={cn(
          'px-3 py-2 rounded-xl text-sm bg-[var(--color-surface-2)] border border-[var(--color-surface-3)]',
          'text-[var(--color-text-main)] placeholder:text-[var(--color-text-faint)]',
          'focus:outline-none focus:border-[var(--color-brand-500)]/70 focus:ring-1 focus:ring-[var(--color-brand-500)]/30',
          'transition-colors duration-150',
          error && 'border-red-500/50 focus:border-red-500/70',
          className
        )}
      />
      {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}
      {hint && !error && <p className="text-xs text-[var(--color-text-dim)]">{hint}</p>}
    </div>
  );
}

// ─── Badge ───────────────────────────────────────────────────────────────────

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  className?: string;
}

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  const variants = {
    default: 'bg-[var(--color-surface-2)] text-[var(--color-text-muted)] border border-[var(--color-surface-3)]',
    success: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    warning: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
    danger: 'bg-red-500/15 text-red-600 dark:text-red-400',
    info: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  };

  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full', variants[variant], className)}>
      {children}
    </span>
  );
}

// ─── Card ────────────────────────────────────────────────────────────────────

interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  hoverable?: boolean;
}

export function Card({ children, className, onClick, hoverable }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'rounded-2xl border border-[var(--color-surface-3)]/90 bg-[var(--color-surface-1)] card-shadow transition-colors',
        hoverable && 'cursor-pointer hover:border-[var(--color-brand-500)]/40 hover:bg-[var(--color-surface-2)] transition-all duration-200',
        onClick && 'cursor-pointer',
        className
      )}
    >
      {children}
    </div>
  );
}

// ─── Divider ─────────────────────────────────────────────────────────────────

export function Divider({ label }: { label?: string }) {
  if (!label) {
    return <hr className="border-[var(--color-surface-3)]" />;
  }
  return (
    <div className="flex items-center gap-3">
      <hr className="flex-1 border-[var(--color-surface-3)]" />
      <span className="text-xs text-[var(--color-text-dim)] font-medium uppercase tracking-wider">{label}</span>
      <hr className="flex-1 border-[var(--color-surface-3)]" />
    </div>
  );
}

// ─── Progress Bar ────────────────────────────────────────────────────────────

interface ProgressBarProps {
  value: number; // 0-100
  className?: string;
  animate?: boolean;
  label?: string;
}

export function ProgressBar({ value, className, animate = true, label }: ProgressBarProps) {
  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? `${value}% complete`}
      className={cn('h-1.5 bg-[var(--color-surface-3)] rounded-full overflow-hidden', className)}
    >
      <div
        className={cn(
          'h-full rounded-full bg-gradient-to-r from-[var(--color-brand-400)] to-[var(--color-brand-500)] relative',
          animate && value < 100 && 'shimmer'
        )}
        style={{ width: `${Math.min(100, Math.max(0, value))}%`, transition: 'width 0.2s ease' }}
      />
    </div>
  );
}

// ─── Spinner ─────────────────────────────────────────────────────────────────

export function Spinner({ className }: { className?: string }) {
  return (
    <div
      className={cn('w-5 h-5 border-2 border-[var(--color-brand-500)] border-t-transparent rounded-full animate-spin', className)}
      aria-label="Loading"
      role="status"
    />
  );
}

// ─── Empty State ─────────────────────────────────────────────────────────────

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 px-4 text-center">
      {icon && (
        <div className="w-16 h-16 rounded-2xl bg-[var(--color-surface-2)] flex items-center justify-center text-[var(--color-text-faint)]">
          {icon}
        </div>
      )}
      <div>
        <p className="text-base font-semibold text-[var(--color-text-main)]">{title}</p>
        {description && <p className="text-sm text-[var(--color-text-muted)] mt-1 max-w-xs">{description}</p>}
      </div>
      {action}
    </div>
  );
}
