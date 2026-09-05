'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@relay/ui';

/**
 * Development affordance: the seeded accounts, one click away. It renders only
 * outside production, so a real deployment never advertises credentials.
 */
const ACCOUNTS = [
  { email: 'linh.tran@ahnmedia.example', label: 'AHN - Project Manager', team: 'AHN' },
  { email: 'marcus.hale@ahnmedia.example', label: 'AHN - Developer', team: 'AHN' },
  { email: 'admin@ahnmedia.example', label: 'AHN - Admin', team: 'AHN' },
  { email: 'priya.raman@shopline.example', label: 'SHOPLINE - Account Manager', team: 'SHOPLINE' },
  {
    email: 'dan.okafor@shopline.example',
    label: 'SHOPLINE - Solutions Engineer',
    team: 'SHOPLINE',
  },
  { email: 'owner@sunrisecoffee.example', label: 'Merchant - Sunrise Coffee', team: 'MERCHANT' },
] as const;

const PASSWORD = 'relay-demo-password';

const TEAM_DOT: Record<string, string> = {
  AHN: 'bg-team-ahn',
  SHOPLINE: 'bg-team-shopline',
  MERCHANT: 'bg-team-merchant',
};

export function DemoAccounts() {
  const [open, setOpen] = useState(false);

  if (process.env.NODE_ENV === 'production') return null;

  const fill = (email: string) => {
    const emailInput = document.getElementById('email') as HTMLInputElement | null;
    const passwordInput = document.getElementById('password') as HTMLInputElement | null;
    if (emailInput) {
      emailInput.value = email;
      emailInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (passwordInput) {
      passwordInput.value = PASSWORD;
      passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    emailInput?.form?.querySelector<HTMLButtonElement>('button[type="submit"]')?.focus();
  };

  return (
    <div className="border-line bg-surface-2/50 mt-8 rounded-[var(--radius-md)] border border-dashed">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <span>
          <span className="text-ink-soft block text-[12.5px] font-semibold">
            Demo accounts (development only)
          </span>
          <span className="text-muted block text-[11.5px]">
            Seeded users for walking through the portal.
          </span>
        </span>
        <ChevronDown
          className={cn('text-muted size-4 shrink-0 transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <ul className="border-line border-t px-2 py-2">
          {ACCOUNTS.map((account) => (
            <li key={account.email}>
              <button
                type="button"
                onClick={() => fill(account.email)}
                className="hover:bg-surface-1 flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-2 py-2 text-left transition-colors"
              >
                <span className={cn('size-1.5 shrink-0 rounded-full', TEAM_DOT[account.team])} />
                <span className="min-w-0 flex-1">
                  <span className="text-ink block truncate text-[12.5px] font-medium">
                    {account.label}
                  </span>
                  <span className="text-muted block truncate font-mono text-[11px]">
                    {account.email}
                  </span>
                </span>
              </button>
            </li>
          ))}
          <li className="text-faint px-2 pt-2 text-[11px]">
            Password for all seeded accounts: <span className="font-mono">{PASSWORD}</span>
          </li>
        </ul>
      )}
    </div>
  );
}
