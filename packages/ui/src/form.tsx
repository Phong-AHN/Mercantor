import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from './cn';

const CONTROL = cn(
  'w-full rounded-[var(--radius-md)] border border-line bg-surface-1 px-3 text-[13.5px] text-ink',
  'placeholder:text-faint',
  'transition-[border-color,box-shadow] outline-none',
  'focus:border-accent focus:ring-2 focus:ring-accent/20 focus-visible:outline-none',
  'disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-muted',
  'aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/20',
);

export interface FieldProps {
  /** Usually a string; a row like "Password / Forgot password?" needs a node. */
  label: React.ReactNode;
  htmlFor?: string;
  hint?: React.ReactNode;
  error?: string | string[] | null;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
  /** Renders the label visually hidden but still announced. */
  hideLabel?: boolean;
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className,
  hideLabel,
}: FieldProps) {
  const messages = Array.isArray(error) ? error : error ? [error] : [];
  return (
    <div className={cn('space-y-1.5', className)}>
      <label
        htmlFor={htmlFor}
        className={cn(
          'text-ink-soft flex items-center gap-1 text-[12.5px] font-medium',
          hideLabel && 'sr-only',
        )}
      >
        {label}
        {required && (
          <span className="text-danger" aria-hidden>
            *
          </span>
        )}
      </label>
      {children}
      {messages.length > 0 ? (
        <p className="text-danger-ink text-[12px] leading-4" role="alert">
          {messages.join(' ')}
        </p>
      ) : (
        hint && <p className="text-muted text-[12px] leading-4">{hint}</p>
      )}
    </div>
  );
}

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn(CONTROL, 'h-9.5', className)} {...rest} />;
});

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, rows = 4, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(CONTROL, 'resize-y py-2 leading-5', className)}
      {...rest}
    />
  );
});

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, children, ...rest }, ref) {
  return (
    <div className="relative">
      <select
        ref={ref}
        className={cn(CONTROL, 'h-9.5 cursor-pointer appearance-none pr-9', className)}
        {...rest}
      >
        {children}
      </select>
      <ChevronDown className="text-muted pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2" />
    </div>
  );
});

export const Checkbox = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { label: React.ReactNode; hint?: React.ReactNode }
>(function Checkbox({ label, hint, className, id, ...rest }, ref) {
  return (
    <label
      htmlFor={id}
      className={cn(
        'hover:bg-surface-2 flex cursor-pointer items-start gap-2.5 rounded-[var(--radius-sm)] px-1 py-1 transition-colors',
        className,
      )}
    >
      <input
        ref={ref}
        id={id}
        type="checkbox"
        className="border-line-strong text-accent mt-0.5 size-4 shrink-0 cursor-pointer rounded-[4px] accent-[var(--accent)]"
        {...rest}
      />
      <span className="min-w-0">
        <span className="text-ink block text-[13px] leading-5">{label}</span>
        {hint && <span className="text-muted block text-[12px] leading-4">{hint}</span>}
      </span>
    </label>
  );
});

/** A radio group rendered as a segmented control - fewer clicks than a select. */
export function RadioCards<T extends string>({
  name,
  value,
  options,
  onChange,
  className,
}: {
  name: string;
  value: T;
  options: readonly { value: T; label: string; hint?: string }[];
  onChange?: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={cn('grid gap-2 sm:grid-cols-3', className)} role="radiogroup">
      {options.map((option) => {
        const checked = option.value === value;
        return (
          <label
            key={option.value}
            className={cn(
              'cursor-pointer rounded-[var(--radius-md)] border p-3 transition-colors',
              checked
                ? 'border-accent bg-accent-soft'
                : 'border-line bg-surface-1 hover:border-line-strong hover:bg-surface-2',
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              defaultChecked={checked}
              onChange={() => onChange?.(option.value)}
              className="sr-only"
            />
            <span
              className={cn(
                'block text-[13px] font-semibold',
                checked ? 'text-accent-ink' : 'text-ink',
              )}
            >
              {option.label}
            </span>
            {option.hint && (
              <span className="text-muted mt-0.5 block text-[12px] leading-4">{option.hint}</span>
            )}
          </label>
        );
      })}
    </div>
  );
}

export function FormActions({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex flex-wrap items-center justify-end gap-2 pt-1', className)}
      {...rest}
    />
  );
}

/** Groups related fields with a heading, for long forms. */
export function Fieldset({
  legend,
  description,
  children,
  className,
}: {
  legend: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <fieldset className={cn('space-y-3', className)}>
      <legend className="text-ink text-[13px] font-semibold">{legend}</legend>
      {description && <p className="text-muted -mt-1 text-[12.5px]">{description}</p>}
      {children}
    </fieldset>
  );
}
