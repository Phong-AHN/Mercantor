import { cn } from '@relay/ui';

/** The product mark and name for the signed-out pages, on the dark panel or on the canvas. */
export function AuthMark({ tone }: { tone: 'onDark' | 'onCanvas' }) {
  const onDark = tone === 'onDark';
  return (
    <a href="/sign-in" className="inline-flex items-center gap-2.5">
      <span
        className={cn(
          'grid size-8 place-items-center rounded-[var(--radius-sm)]',
          onDark ? 'bg-white text-[oklch(0.205_0.01_260)]' : 'bg-primary text-on-primary',
        )}
        aria-hidden
      >
        <svg viewBox="0 0 24 24" className="size-4.5" fill="none">
          <path
            d="M5 17V9.5A4.5 4.5 0 0 1 9.5 5H12"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          <path
            d="M19 7v7.5a4.5 4.5 0 0 1-4.5 4.5H12"
            stroke="currentColor"
            strokeOpacity="0.55"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </svg>
      </span>
      <span>
        <span
          className={cn(
            'block text-[15px] font-semibold leading-5 tracking-[-0.02em]',
            onDark ? 'text-white' : 'text-ink',
          )}
        >
          Mercantor
        </span>
        <span
          className={cn('block text-[12px] leading-4', onDark ? 'text-white/55' : 'text-muted')}
        >
          AHN &times; SHOPLINE
        </span>
      </span>
    </a>
  );
}
