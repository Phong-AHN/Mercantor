'use client';

import * as React from 'react';
import { CircleCheck, CircleX, Info, TriangleAlert, X } from 'lucide-react';
import type { Tone } from '@relay/core';
import { cn } from './cn';
import { TONE_TEXT } from './tone';

export interface Toast {
  id: string;
  tone: Tone;
  title: string;
  description?: string;
  /** Milliseconds. `0` keeps it until dismissed - used for failures. */
  duration?: number;
}

interface ToastContextValue {
  toast: (toast: Omit<Toast, 'id'>) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  dismiss: (id: string) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const value = React.useContext(ToastContext);
  if (!value) throw new Error('useToast must be used inside <ToastProvider>.');
  return value;
}

const ICON: Partial<Record<Tone, React.ComponentType<{ className?: string }>>> = {
  success: CircleCheck,
  danger: CircleX,
  warning: TriangleAlert,
  info: Info,
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  const dismiss = React.useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const toast = React.useCallback(
    (input: Omit<Toast, 'id'>) => {
      const id = Math.random().toString(36).slice(2);
      const duration = input.duration ?? (input.tone === 'danger' ? 0 : 5000);
      setToasts((current) => [...current.slice(-3), { ...input, id }]);
      if (duration > 0) window.setTimeout(() => dismiss(id), duration);
    },
    [dismiss],
  );

  const value = React.useMemo<ToastContextValue>(
    () => ({
      toast,
      dismiss,
      success: (title, description) => toast({ tone: 'success', title, description }),
      error: (title, description) => toast({ tone: 'danger', title, description }),
    }),
    [toast, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:items-end"
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map((item) => {
          const Icon = ICON[item.tone] ?? Info;
          return (
            <div
              key={item.id}
              role={item.tone === 'danger' ? 'alert' : 'status'}
              className="rise border-line bg-surface-1 shadow-overlay pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-[var(--radius-lg)] border px-4 py-3"
            >
              <Icon className={cn('mt-0.5 size-4 shrink-0', TONE_TEXT[item.tone])} />
              <div className="min-w-0 flex-1">
                <p className="text-ink text-[13.5px] font-semibold leading-5">{item.title}</p>
                {item.description && (
                  <p className="text-muted mt-0.5 text-[12.5px] leading-4">{item.description}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                aria-label="Dismiss"
                className="text-faint hover:text-ink rounded p-0.5 transition-colors"
              >
                <X className="size-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
