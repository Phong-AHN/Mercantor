'use client';

import * as React from 'react';
import { cn } from './cn';

export interface MenuItem {
  key: string;
  label: React.ReactNode;
  /** A link item. Rendered with `linkAs` so apps can pass their router's Link. */
  href?: string;
  onSelect?: () => void;
  /** Still focusable and announced, so the reason it is unavailable can be read. */
  disabled?: boolean;
  /** One line under the label - for a disabled item, say why. */
  description?: React.ReactNode;
  /** Marks the page the reader is on (`aria-current="page"`). */
  current?: boolean;
  /** Trailing content, e.g. a count or an attention dot. */
  trailing?: React.ReactNode;
}

export interface MenuButtonProps {
  /** Visible trigger content. */
  children: React.ReactNode;
  /** Accessible name when the trigger has no visible text. */
  label?: string;
  items: readonly MenuItem[];
  align?: 'start' | 'end';
  linkAs?: React.ElementType;
  triggerClassName?: string;
  className?: string;
}

/**
 * A button that opens a short list of links or actions - the one menu the
 * design system has, so overflow tabs and secondary header actions behave the
 * same way.
 *
 * Keyboard: Enter, Space or ArrowDown opens and focuses the first item;
 * ArrowUp/ArrowDown/Home/End move; Escape closes and returns focus to the
 * trigger; Tab closes and moves on. A click outside closes it.
 */
export function MenuButton({
  children,
  label,
  items,
  align = 'end',
  linkAs: LinkComponent = 'a',
  triggerClassName,
  className,
}: MenuButtonProps) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const itemRefs = React.useRef<Array<HTMLElement | null>>([]);
  const menuId = React.useId();

  const focusItem = React.useCallback((index: number) => {
    const count = itemRefs.current.length;
    if (count === 0) return;
    itemRefs.current[((index % count) + count) % count]?.focus();
  }, []);

  const close = React.useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);

  const pendingFocus = React.useRef<'first' | 'last' | null>(null);
  React.useEffect(() => {
    if (open && pendingFocus.current) {
      focusItem(pendingFocus.current === 'first' ? 0 : -1);
      pendingFocus.current = null;
    }
  }, [open, focusItem]);

  function openWith(target: 'first' | 'last') {
    pendingFocus.current = target;
    setOpen(true);
  }

  function onTriggerKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openWith('first');
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      openWith('last');
    }
  }

  function onMenuKeyDown(event: React.KeyboardEvent) {
    const index = itemRefs.current.findIndex((element) => element === document.activeElement);
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        focusItem(index + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        focusItem(index - 1);
        break;
      case 'Home':
        event.preventDefault();
        focusItem(0);
        break;
      case 'End':
        event.preventDefault();
        focusItem(-1);
        break;
      case 'Escape':
        event.preventDefault();
        close(true);
        break;
      case 'Tab':
        close(false);
        break;
    }
  }

  itemRefs.current = [];

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={label}
        onClick={() => (open ? setOpen(false) : openWith('first'))}
        onKeyDown={onTriggerKeyDown}
        className={triggerClassName}
      >
        {children}
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
          className={cn(
            'border-line bg-surface-1 shadow-raised absolute top-full z-40 mt-1 w-64 overflow-hidden rounded-[var(--radius-md)] border py-1',
            align === 'end' ? 'right-0' : 'left-0',
          )}
        >
          {items.map((item) => {
            const inner = (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium leading-5">{item.label}</span>
                  {item.description && (
                    <span className="text-muted block text-[12px] leading-4">
                      {item.description}
                    </span>
                  )}
                </span>
                {item.trailing && <span className="shrink-0">{item.trailing}</span>}
              </>
            );
            const itemClass = cn(
              'flex w-full items-start gap-2 px-3 py-2 text-left outline-none transition-colors',
              'hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:ring-accent focus-visible:ring-2 focus-visible:ring-inset',
              // A disabled item dims its label only; the description under it
              // is the reason it is unavailable and has to stay readable.
              item.disabled
                ? 'text-muted cursor-not-allowed hover:bg-transparent'
                : item.current
                  ? 'text-accent-ink'
                  : 'text-ink',
            );
            const ref = (element: HTMLElement | null) => {
              if (element) itemRefs.current.push(element);
            };

            if (item.href && !item.disabled) {
              return (
                <LinkComponent
                  key={item.key}
                  ref={ref}
                  href={item.href}
                  role="menuitem"
                  tabIndex={-1}
                  aria-current={item.current ? 'page' : undefined}
                  onClick={() => setOpen(false)}
                  className={itemClass}
                >
                  {inner}
                </LinkComponent>
              );
            }
            return (
              <button
                key={item.key}
                ref={ref}
                type="button"
                role="menuitem"
                tabIndex={-1}
                aria-disabled={item.disabled || undefined}
                onClick={() => {
                  if (item.disabled) return;
                  setOpen(false);
                  item.onSelect?.();
                }}
                className={itemClass}
              >
                {inner}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
