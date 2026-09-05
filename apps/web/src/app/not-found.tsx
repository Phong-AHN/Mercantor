import Link from 'next/link';
import { buttonStyles, NotFoundState } from '@relay/ui';

export default function NotFound() {
  return (
    <main id="main" className="grid min-h-dvh place-items-center px-6">
      <div className="w-full max-w-md text-center">
        <NotFoundState
          title="That page does not exist"
          description="The link may be out of date, or the record may not be one your role can see."
        />
        <Link href="/" className={buttonStyles('secondary', 'sm')}>
          Back to the portal
        </Link>
      </div>
    </main>
  );
}
