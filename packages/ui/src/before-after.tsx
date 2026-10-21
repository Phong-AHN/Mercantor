'use client';

import * as React from 'react';
import { cn } from './cn';
import { TONE_SOLID } from './tone';

/**
 * Two captures of the same page, one wiped over the other, in one scrolling
 * window.
 *
 * Captures are full-page screenshots - thousands of pixels tall - so fitting
 * either into the frame shows nothing legible. Instead both are drawn at the
 * frame's full width and the frame scrolls: one scrollbar moves BOTH images,
 * so the wipe always compares the same part of the page.
 *
 * What it has to get right:
 *
 *   1. BOTH IMAGES ARE THE SAME WIDTH. Each is sized to the frame, never to its
 *      own natural size, so they stay in register as the wipe moves.
 *   2. ONE SCROLL, BOTH PAGES. The two pages are rarely the same height, so
 *      the scroll is shared proportionally: the taller page scrolls 1:1 and the
 *      shorter one is eased along, and both reach their top and bottom
 *      together instead of one running out halfway down.
 *   3. IT MUST WORK WITHOUT A MOUSE. The wipe is a real (visually hidden)
 *      slider, reachable by tab and moved by arrow keys; the scroll area takes
 *      focus too, so it scrolls from the keyboard.
 *   4. IT MUST SAY WHAT THE AFTER IS. A design mockup and a live page are not
 *      the same claim, so the badge text is passed in rather than assumed.
 */

export interface BeforeAfterProps {
  before: { src: string; alt: string };
  after: { src: string; alt: string };
  /** "AFTER" once live, "AFTER · DESIGN" while it is still a proposal. */
  afterLabel?: string;
  beforeLabel?: string;
  /** Where the wipe starts, 0-100. */
  initial?: number;
  /** Width ÷ height of the window. Landscape (desktop) by default. */
  aspectRatio?: number;
  className?: string;
}

export function BeforeAfter({
  before,
  after,
  afterLabel = 'AFTER',
  beforeLabel = 'BEFORE',
  initial = 50,
  aspectRatio = 16 / 10,
  className,
}: BeforeAfterProps) {
  const [position, setPosition] = React.useState(clamp(initial));
  const [focused, setFocused] = React.useState(false);
  // The width the images are drawn at: the frame minus its scrollbar. The
  // divider, the labels and the drag maths all use it, so the line sits
  // exactly on the wipe edge rather than a scrollbar's width to the right.
  const [contentWidth, setContentWidth] = React.useState<number | null>(null);
  const overlayRef = React.useRef<HTMLDivElement>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const beforeRef = React.useRef<HTMLImageElement>(null);
  const afterRef = React.useRef<HTMLImageElement>(null);

  // Eases the shorter page along so both scroll from top to bottom together.
  // Written straight to the style: this runs on every scroll frame, and a
  // React render per frame would be wasted work.
  const sync = React.useCallback(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const view = scroller.clientHeight;
    const range = scroller.scrollHeight - view;
    const progress = range > 0 ? scroller.scrollTop / range : 0;
    for (const image of [beforeRef.current, afterRef.current]) {
      if (!image) continue;
      const own = Math.max(0, image.offsetHeight - view);
      image.style.transform = `translateY(${scroller.scrollTop - progress * own}px)`;
    }
  }, []);

  React.useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      setContentWidth(scroller.clientWidth);
      sync();
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [sync]);

  // Dragging is handled on the frame rather than a handle so the whole image
  // is a drag target - at card size a handle alone is a hard thing to grab.
  const pointerTo = React.useCallback((clientX: number) => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const rect = overlay.getBoundingClientRect();
    if (rect.width === 0) return;
    setPosition(clamp(((clientX - rect.left) / rect.width) * 100));
  }, []);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    // A press on the scrollbar lands on the scroll area itself, not on an
    // image: leave it to scroll.
    if (event.target === scrollRef.current) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerTo(event.clientX);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    pointerTo(event.clientX);
  };

  return (
    <div className={cn('relative', className)}>
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        style={{ aspectRatio: String(aspectRatio) }}
        className={cn(
          'border-line bg-surface-2 relative w-full touch-pan-y select-none overflow-hidden rounded-[var(--radius-lg)] border',
          focused && 'ring-accent ring-2',
        )}
      >
        <div
          ref={scrollRef}
          onScroll={sync}
          tabIndex={0}
          aria-label="Scroll both pages"
          className="scrollbar-slim focus-visible:ring-accent absolute inset-0 overflow-y-auto overflow-x-hidden overscroll-contain focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset"
        >
          {/* Both images share one grid cell, so the scroll height is the
              taller page and neither pushes the other down. */}
          <div className="grid">
            <img
              ref={afterRef}
              src={after.src}
              alt={after.alt}
              draggable={false}
              onLoad={sync}
              className="col-start-1 row-start-1 block h-auto w-full max-w-none will-change-transform"
            />
            {/* The after page is the ground; the before is wiped over it, so
                the result of the work is what remains when the wipe is pushed
                away. */}
            <img
              ref={beforeRef}
              src={before.src}
              alt={before.alt}
              draggable={false}
              onLoad={sync}
              style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
              className="col-start-1 row-start-1 block h-auto w-full max-w-none will-change-transform"
            />
          </div>
        </div>

        <div
          ref={overlayRef}
          className="pointer-events-none absolute inset-y-0 left-0"
          style={{ width: contentWidth ?? '100%' }}
        >
          <span
            className={cn(
              'pointer-events-none absolute left-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide',
              TONE_SOLID.neutral,
            )}
          >
            {beforeLabel}
          </span>
          <span
            className={cn(
              'pointer-events-none absolute right-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide',
              TONE_SOLID.accent,
            )}
          >
            {afterLabel}
          </span>

          <div
            className="bg-canvas pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2"
            style={{ left: `${position}%` }}
            aria-hidden
          >
            <span className="bg-canvas text-ink shadow-raised absolute top-1/2 grid size-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-[13px]">
              ↔
            </span>
          </div>
        </div>
      </div>

      {/* The keyboard and screen-reader control for the wipe. Hidden from
          sight - the frame is the visible control - and outlines the frame
          while focused, so a keyboard user can see where they are. */}
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={position}
        onChange={(event) => setPosition(clamp(Number(event.target.value)))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        aria-label={`Reveal ${beforeLabel.toLowerCase()} or ${afterLabel.toLowerCase()}`}
        aria-valuetext={`${Math.round(position)}% ${beforeLabel.toLowerCase()}`}
        className="sr-only"
      />
    </div>
  );
}

function clamp(value: number): number {
  if (Number.isNaN(value)) return 50;
  return Math.min(100, Math.max(0, value));
}
