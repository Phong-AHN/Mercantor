'use client';

import * as React from 'react';
import { X } from 'lucide-react';
import { cn } from './cn';
import { Button, IconButton, type ButtonVariant } from './button';

/**
 * Built on the native `<dialog>`: it gives focus trapping, the top layer, Esc
 * to close and inert background for free, which a hand-rolled overlay
 * reliably gets wrong.
 */
export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Blocks Esc and backdrop dismissal while a submit is in flight. */
  busy?: boolean;
}

const SIZE = {
  sm: 'max-w-md',
  md: 'max-w-xl',
  lg: 'max-w-3xl',
  xl: 'max-w-5xl',
} as const;

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  busy,
}: DialogProps) {
  const ref = React.useRef<HTMLDialogElement>(null);
  // A page can mount many `Dialog`s at once (a checklist renders one per row,
  // open or not) - a literal id here would make every closed dialog's title
  // collide with the open one's, and `aria-labelledby` would announce the
  // wrong name to a screen reader.
  const titleId = React.useId();

  React.useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (open && !node.open) node.showModal();
    if (!open && node.open) node.close();
  }, [open]);

  React.useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const handleCancel = (event: Event) => {
      event.preventDefault();
      if (!busy) onClose();
    };
    node.addEventListener('cancel', handleCancel);
    return () => node.removeEventListener('cancel', handleCancel);
  }, [busy, onClose]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClick={(event) => {
        if (busy) return;
        // Clicking the backdrop means the dialog element itself, not its card.
        if (event.target === ref.current) onClose();
      }}
      className={cn(
        // Native <dialog> centers itself via the UA stylesheet's `margin:
        // auto` on `dialog:modal` - Tailwind's preflight zeroes margin on
        // every element, which silently cancels that and leaves the dialog
        // pinned to its default top-left inset instead. `m-auto` puts it
        // back explicitly rather than depending on the browser default.
        'border-line bg-surface-1 text-ink shadow-overlay m-auto w-[calc(100vw-2rem)] rounded-[var(--radius-xl)] border p-0',
        'backdrop:bg-ink/35 backdrop:backdrop-blur-[2px]',
        'open:rise',
        SIZE[size],
      )}
    >
      <div className="border-line flex items-start justify-between gap-4 border-b px-5 py-4">
        <div className="min-w-0">
          <h2 id={titleId} className="text-[15px] font-semibold leading-5">
            {title}
          </h2>
          {description && <p className="text-muted mt-1 text-[13px] leading-5">{description}</p>}
        </div>
        <IconButton label="Close" size="sm" onClick={onClose} disabled={busy}>
          <X className="size-4" />
        </IconButton>
      </div>

      {children && (
        <div className="scrollbar-slim max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
      )}

      {footer && (
        <div className="border-line bg-surface-2/60 flex flex-wrap items-center justify-end gap-2 border-t px-5 py-3.5">
          {footer}
        </div>
      )}
    </dialog>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'primary',
  busy,
  children,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ButtonVariant;
  busy?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      busy={busy}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant={variant} size="sm" onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Dialog>
  );
}

/**
 * A dialog that owns its own open state and renders its own trigger. Most call
 * sites want this; the controlled `Dialog` is there for the ones that do not.
 */
export function DialogTrigger({
  trigger,
  children,
  ...dialog
}: Omit<DialogProps, 'open' | 'onClose'> & {
  trigger: (open: () => void) => React.ReactNode;
  children?: React.ReactNode | ((close: () => void) => React.ReactNode);
}) {
  const [open, setOpen] = React.useState(false);
  const close = React.useCallback(() => setOpen(false), []);
  return (
    <>
      {trigger(() => setOpen(true))}
      <Dialog {...dialog} open={open} onClose={close}>
        {typeof children === 'function' ? children(close) : children}
      </Dialog>
    </>
  );
}
