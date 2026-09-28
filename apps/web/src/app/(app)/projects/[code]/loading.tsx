import { Card, CardBody, Skeleton, SkeletonRows } from '@relay/ui';

/**
 * Shown inside the project shell while a tab loads. The header, status band
 * and tabs stay put; only the tab body is replaced, in roughly its own shape,
 * so switching tabs does not blank the page or jump the layout.
 */
export default function ProjectTabLoading() {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]" aria-busy="true">
      <span className="sr-only" role="status">
        Loading this section
      </span>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} className="h-[92px] rounded-[var(--radius-lg)]" />
          ))}
        </div>
        <Card>
          <CardBody>
            <SkeletonRows rows={6} />
          </CardBody>
        </Card>
      </div>
      <Card>
        <CardBody>
          <SkeletonRows rows={5} />
        </CardBody>
      </Card>
    </div>
  );
}
