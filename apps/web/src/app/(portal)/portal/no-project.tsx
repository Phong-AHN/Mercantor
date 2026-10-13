import { NotFoundState } from '@relay/ui';

/**
 * What every portal page shows to a merchant who is signed in but not yet
 * attached to a project. One component, so no page can forget the case.
 */
export function NoPortalProject() {
  return (
    <NotFoundState
      title="No migration project yet"
      description="Your account is ready, but it has not been linked to a migration project. Once your AHN project manager adds you, everything about your move to SHOPLINE will appear here."
    />
  );
}
