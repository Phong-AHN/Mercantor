'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { IconButton } from '@relay/ui';

/**
 * The applied theme is already correct before React hydrates - the inline
 * script in the root layout saw to that. This control only reads the attribute
 * back and flips it, which is why there is no flash and no `mounted` guard
 * around the whole component.
 */
export function ThemeToggle() {
  const [dark, setDark] = useState<boolean | null>(null);

  useEffect(() => {
    setDark(document.documentElement.dataset.theme === 'dark');
  }, []);

  const toggle = () => {
    const next = document.documentElement.dataset.theme !== 'dark';
    document.documentElement.dataset.theme = next ? 'dark' : 'light';
    try {
      localStorage.setItem('relay-theme', next ? 'dark' : 'light');
    } catch {
      // A blocked localStorage is not a reason to refuse to change the theme.
    }
    setDark(next);
  };

  return (
    <IconButton
      label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      size="sm"
      onClick={toggle}
    >
      {dark === null ? (
        <span className="size-4" />
      ) : dark ? (
        <Sun className="size-4" />
      ) : (
        <Moon className="size-4" />
      )}
    </IconButton>
  );
}
