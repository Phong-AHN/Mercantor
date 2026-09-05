import type { Tone } from '@relay/core';
import { cn } from './cn';
import { TONE_DOT, TONE_FILL, TONE_BAR, TONE_STROKE } from './tone';

/**
 * Minimal, dependency-free trend charts: a handful of months on the x-axis,
 * a handful of series assigned fixed tones (never cycled, never re-painted
 * when a filter changes what is visible). The hover layer is a native
 * `title` attribute on each mark - the same minimal approach `SegmentedBar`
 * already uses elsewhere in this design system, so neither chart needs
 * client-side state.
 */

export interface ChartSeries {
  key: string;
  label: string;
  tone: Tone;
}

export interface ChartPoint {
  key: string;
  label: string;
  /** `null` means no data for this series in this bucket - shown as nothing, never a false zero. */
  values: Record<string, number | null>;
}

function ChartLegend({ series }: { series: readonly ChartSeries[] }) {
  if (series.length < 2) return null;
  return (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
      {series.map((s) => (
        <li key={s.key} className="text-muted flex items-center gap-1.5 text-[12px]">
          <span className={cn('size-2 rounded-full', TONE_DOT[s.tone])} />
          <span className="text-ink-soft">{s.label}</span>
        </li>
      ))}
    </ul>
  );
}

/** A grouped bar chart. One column of bars per point, one bar per series. */
export function TrendBarChart({
  points,
  series,
  format = (value) => String(value),
  height = 160,
  className,
}: {
  points: readonly ChartPoint[];
  series: readonly ChartSeries[];
  format?: (value: number) => string;
  height?: number;
  className?: string;
}) {
  const max = Math.max(
    1,
    ...points.flatMap((point) => series.map((s) => point.values[s.key] ?? 0)),
  );

  return (
    <div className={className}>
      <div className="flex items-stretch gap-3" style={{ height }}>
        {points.map((point) => (
          <div key={point.key} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
            <div className="flex w-full flex-1 items-end justify-center gap-1">
              {series.map((s) => {
                const value = point.values[s.key] ?? null;
                // Capped below 100% so the value label above the tallest bar has headroom.
                const pct = value === null ? 0 : Math.max(value > 0 ? 3 : 0, (value / max) * 85);
                return (
                  <div
                    key={s.key}
                    className="h-full min-w-0 flex-1"
                    title={
                      value === null ? undefined : `${point.label} · ${s.label}: ${format(value)}`
                    }
                  >
                    <div className="flex h-full flex-col items-center justify-end">
                      {/* A direct value label, in a text token rather than the series
                          colour, is the relief a WARN-contrast tone (e.g. amber on a
                          light surface) needs - never color alone to carry the value. */}
                      {value !== null && value > 0 && (
                        <span className="tabular text-ink-soft mb-1 text-[10.5px] font-medium">
                          {format(value)}
                        </span>
                      )}
                      <div
                        className={cn(
                          'w-full rounded-t-[4px] transition-[height] duration-500',
                          TONE_BAR[s.tone],
                        )}
                        style={{ height: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <span className="text-faint text-[11px]">{point.label}</span>
          </div>
        ))}
      </div>
      <ChartLegend series={series} />
    </div>
  );
}

/** A line chart. Missing values break the line rather than drawing a false zero. */
export function TrendLineChart({
  points,
  series,
  format = (value) => String(value),
  height = 160,
  className,
}: {
  points: readonly ChartPoint[];
  series: readonly ChartSeries[];
  format?: (value: number) => string;
  height?: number;
  className?: string;
}) {
  const viewWidth = 100;
  const values = points.flatMap((point) =>
    series
      .map((s) => point.values[s.key] ?? null)
      .filter((value): value is number => value !== null),
  );
  const max = Math.max(1, ...values);
  const stepX = points.length > 1 ? viewWidth / (points.length - 1) : 0;
  const toY = (value: number) => 92 - (value / max) * 82; // headroom top and baseline gap

  return (
    <div className={className}>
      <svg
        viewBox={`0 0 ${viewWidth} 100`}
        preserveAspectRatio="none"
        style={{ height }}
        className="w-full overflow-visible"
      >
        {series.map((s) => {
          const coords = points.map((point, index) => {
            const value = point.values[s.key] ?? null;
            return value === null
              ? null
              : { x: index * stepX, y: toY(value), value, label: point.label };
          });

          // Break the polyline wherever a bucket has no value.
          const segments: { x: number; y: number }[][] = [];
          let current: { x: number; y: number }[] = [];
          for (const c of coords) {
            if (c === null) {
              if (current.length > 0) segments.push(current);
              current = [];
            } else {
              current.push({ x: c.x, y: c.y });
            }
          }
          if (current.length > 0) segments.push(current);

          return (
            <g key={s.key}>
              {segments.map((segment, index) => (
                <polyline
                  key={index}
                  points={segment.map((p) => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                  className={TONE_STROKE[s.tone]}
                  strokeWidth={0.6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {coords.map((c, index) =>
                c === null ? null : (
                  <circle key={index} cx={c.x} cy={c.y} r={1.6} className={TONE_FILL[s.tone]}>
                    <title>{`${c.label} · ${s.label}: ${format(c.value)}`}</title>
                  </circle>
                ),
              )}
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex justify-between">
        {points.map((point) => (
          <span key={point.key} className="text-faint text-[11px]">
            {point.label}
          </span>
        ))}
      </div>
      <ChartLegend series={series} />
    </div>
  );
}
