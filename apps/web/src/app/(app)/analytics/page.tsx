import type { Metadata } from 'next';
import { CalendarClock, Clock, Rocket, TriangleAlert } from 'lucide-react';
import { can } from '@relay/rbac';
import {
  Card,
  CardBody,
  CardHeader,
  Empty,
  PageHeader,
  PermissionDenied,
  Stat,
  TrendBarChart,
  TrendLineChart,
  type ChartPoint,
} from '@relay/ui';
import { getAnalyticsTrends } from '@/features/analytics/queries';
import { requirePrincipalOrRedirect } from '@/server/session';

export const metadata: Metadata = { title: 'Analytics' };
export const dynamic = 'force-dynamic';

const formatDays = (value: number) => `${value.toFixed(1)}d`;
const formatCount = (value: number) => String(Math.round(value));

/**
 * Trends, not a snapshot - the dashboard already answers where the portfolio
 * stands right now; this answers whether it is getting better or worse.
 * Every figure here is derived from columns and rows the rest of the product
 * already writes (`Project.startDate`/`actualLaunchDate`/`completedAt`,
 * `SlaBreach`), the same "one source of truth" reasoning the dashboard's own
 * numbers already follow.
 */
export default async function AnalyticsPage() {
  const principal = await requirePrincipalOrRedirect('/analytics');

  if (!can(principal, 'portfolio:read')) {
    return (
      <PermissionDenied
        title="Analytics is not part of your role"
        description="You can still open the projects you are assigned to."
      />
    );
  }

  const trends = await getAnalyticsTrends(principal);

  if (trends.totalStarted === 0 && trends.totalLaunched === 0 && trends.totalBreaches === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Trends"
          description={`The last ${trends.monthsCount} months, across the whole portfolio.`}
        />
        <Card>
          <Empty
            title="Nothing in this window yet"
            description="Once projects start, launch, or run over target, the trend appears here."
          />
        </Card>
      </div>
    );
  }

  const throughputPoints: ChartPoint[] = trends.months.map((month) => ({
    key: month.key,
    label: month.label,
    values: { started: month.started, launched: month.launched },
  }));

  const cycleTimePoints: ChartPoint[] = trends.months.map((month) => ({
    key: month.key,
    label: month.label,
    values: { cycleTime: month.avgCycleTimeDays },
  }));

  const breachPoints: ChartPoint[] = trends.months.map((month) => ({
    key: month.key,
    label: month.label,
    values: { stage: month.stageBreaches, launch: month.launchBreaches },
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trends"
        description={`The last ${trends.monthsCount} months, across the whole portfolio.`}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Started"
          value={trends.totalStarted}
          detail={`Over ${trends.monthsCount} months`}
          tone="accent"
          icon={<CalendarClock className="size-3.5" />}
        />
        <Stat
          label="Launched"
          value={trends.totalLaunched}
          detail={`Over ${trends.monthsCount} months`}
          tone="success"
          icon={<Rocket className="size-3.5" />}
        />
        <Stat
          label="Avg cycle time"
          value={trends.avgCycleTimeDays === null ? '-' : formatDays(trends.avgCycleTimeDays)}
          detail="Start to launch, launched projects only"
          tone="neutral"
          icon={<Clock className="size-3.5" />}
        />
        <Stat
          label="SLA breaches"
          value={trends.totalBreaches}
          detail={`Opened in the last ${trends.monthsCount} months`}
          tone={trends.totalBreaches > 0 ? 'warning' : 'success'}
          icon={<TriangleAlert className="size-3.5" />}
        />
      </div>

      <Card>
        <CardHeader
          title="Throughput"
          description="Projects started versus projects that actually launched, by month."
        />
        <CardBody>
          <TrendBarChart
            points={throughputPoints}
            series={[
              { key: 'started', label: 'Started', tone: 'accent' },
              { key: 'launched', label: 'Launched', tone: 'success' },
            ]}
            format={formatCount}
          />
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Cycle time"
            description="Average days from start to launch, for projects that launched that month."
          />
          <CardBody>
            <TrendLineChart
              points={cycleTimePoints}
              series={[{ key: 'cycleTime', label: 'Avg cycle time', tone: 'accent' }]}
              format={formatDays}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="SLA breaches"
            description="Formal breach records opened each month, by kind (D-041)."
          />
          <CardBody>
            <TrendBarChart
              points={breachPoints}
              series={[
                { key: 'stage', label: 'Stage overrun', tone: 'warning' },
                { key: 'launch', label: 'Launch overrun', tone: 'danger' },
              ]}
              format={formatCount}
            />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
