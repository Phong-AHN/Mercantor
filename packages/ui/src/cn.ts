import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge class lists so a caller's override always wins over a default. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
