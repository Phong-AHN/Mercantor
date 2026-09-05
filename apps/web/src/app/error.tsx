'use client';

import { useEffect } from 'react';
import { Button, ErrorState } from '@relay/ui';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The server already logged the cause; this records that a user saw it.
    console.error('Unhandled error surfaced to the user', error.digest ?? error.message);
  }, [error]);

  return (
    <main id="main" className="grid min-h-dvh place-items-center px-6">
      <div className="w-full max-w-md text-center">
        <ErrorState description="The page could not be loaded. Trying again often works; if it does not, send the reference below to the AHN team." />
        {error.digest && (
          <p className="text-faint mb-4 font-mono text-[11px]">reference {error.digest}</p>
        )}
        <Button variant="secondary" size="sm" onClick={reset}>
          Try again
        </Button>
      </div>
    </main>
  );
}
