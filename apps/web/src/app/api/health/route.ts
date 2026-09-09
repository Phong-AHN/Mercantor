import { NextResponse } from 'next/server';

/**
 * Liveness only - no database, no session, no dependency on anything that
 * could itself be down. A platform's healthcheck (Railway included) needs an
 * answer that reflects "is this process up and serving requests", not
 * "is Postgres also up" - the same distinction `apps/worker`'s `/health`
 * (liveness) vs `/health/deep` (checks the database) already draws.
 */
export function GET() {
  return NextResponse.json({ ok: true, role: 'web' });
}
