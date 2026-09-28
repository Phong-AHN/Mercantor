'use client';

import { Card, ErrorState } from '@relay/ui';

/**
 * A tab that fails to load keeps the project shell above it, says nothing was
 * changed, and offers a retry - rather than replacing the whole page.
 */
export default function ProjectTabError({ reset }: { error: Error; reset: () => void }) {
  return (
    <Card>
      <ErrorState
        title="This section did not load"
        description="Nothing on the project was changed. It is usually a brief connection problem - try again in a moment."
        action={{ label: 'Try again', onClick: reset }}
        className="py-12"
      />
    </Card>
  );
}
