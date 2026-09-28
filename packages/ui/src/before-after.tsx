'use client';

import * as React from 'react';
import { cn } from './cn';
import { TONE_SOLID } from './tone';

/**
 * Two captures of the same page, one revealed over the other.
 *
 * The slider exists because side-by-side at card width shows two illegible
 * thumbnails, while a wipe keeps both images full width and lets the eye
 * compare the same region. The reference page uses exactly this.
 *
 * Three things it has to get right, and a naive version of this gets all three
 * wrong:
 *
 *   1. IT MUST WORK WITHOUT A MOUSE. The handle is a real slider input, so it
 *      is reachable by tab and moved by arrow keys, and a screen reader
 *      announces a position rather than nothing.
 *   2. IT MUST NOT LIE ABOUT SIZE. Both images are given the same aspect box.
 *      Letting each keep its own height makes the after image look longer or
 *      shorter than the before for reasons that have nothing to do with the
 *      work.
 *   3. IT MUST SAY WHAT THE AFTER IS. A design mockup and a live page are not
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
  /** Width ÷ height of the frame both images are fitted into. */
  aspectRatio?: number;
  className?: string;
}

export function BeforeAfter({
  before,
  after,
  afterLabel = 'AFTER',
  beforeLabel = 'BEFORE',
  initial = 50,
  aspectRatio = 4 / 3,
  className,
}: BeforeAfterProps) {
  const [position, setPosition] = React.useState(clamp(initial));
  const frameRef = React.useRef<HTMLDivElement>(null);

  // Dragging is handled on the frame rather than the handle so the whole image
  // is a drag target — at card size the handle alone is a hard thing to grab.
  const pointerTo = React.useCallback((clientX: number) => {
    const frame = frameRef.current;
    if (!frame) return;
    const rect = frame.getBoundingClientRect();
    if (rect.width === 0) return;
    setPosition(clamp(((clientX - rect.left) / rect.width) * 100));
  }, []);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerTo(event.clientX);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.buttons !== 1) return;
    pointerTo(event.clientX);
  };

  return (
    <div className={cn('group relative', className)}>
      <div
        ref={frameRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        style={{ aspectRatio: String(aspectRatio) }}
        className="border-line bg-surface-2 relative w-full touch-pan-y select-none overflow-hidden rounded-[var(--radius-lg)] border"
      >
        {/* The after image is the ground; the before is wiped over it, so the
            result of the work is what remains when the handle is pushed away. */}
        <img
          src={after.src}
          alt={after.alt}
          draggable={false}
          className="absolute inset-0 size-full object-cover object-top"
        />
        <div className="absolute inset-0 overflow-hidden" style={{ width: `${position}%` }}>
          <img
            src={before.src}
            alt={before.alt}
            draggable={false}
            /* Sized to the FRAME, not to this clipped box, so the two images
               stay in register as the wipe moves. */
            style={{ width: frameRef.current?.clientWidth ?? undefined }}
            className="absolute inset-y-0 left-0 h-full max-w-none object-cover object-top"
          />
        </div>

        <span
          className={cn(
            'absolute left-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide',
            TONE_SOLID.neutral,
          )}
        >
          {beforeLabel}
        </span>
        <span
          className={cn(
            'absolute right-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide',
            TONE_SOLID.accent,
          )}
        >
          {afterLabel}
        </span>

        <div
          className="bg-canvas pointer-events-none absolute inset-y-0 w-0.5"
          style={{ left: `${position}%` }}
          aria-hidden
        >
          <span className="bg-canvas text-ink shadow-raised absolute top-1/2 grid size-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-[13px]">
            ↔
          </span>
        </div>
      </div>

      {/* The real control. Visually minimal, fully operable: the frame above is
          a convenience, this is what keyboards and screen readers use. */}
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={position}
        onChange={(event) => setPosition(clamp(Number(event.target.value)))}
        aria-label={`Reveal ${beforeLabel.toLowerCase()} or ${afterLabel.toLowerCase()}`}
        aria-valuetext={`${Math.round(position)}% ${beforeLabel.toLowerCase()}`}
        className="accent-accent focus-visible:ring-accent mt-3 w-full cursor-ew-resize focus-visible:outline-none focus-visible:ring-2"
      />
    </div>
  );
}

function clamp(value: number): number {
  if (Number.isNaN(value)) return 50;
  return Math.min(100, Math.max(0, value));
}
