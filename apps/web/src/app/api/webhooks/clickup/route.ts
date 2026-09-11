import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { clock } from '@relay/core';
import { db } from '@relay/db';
import { findClickUpWebhookSecret, stageForClickUpStatus } from '@relay/integrations';
import { logger } from '@relay/observability';
import { applyClickUpStatusSync } from '@/features/projects/mutations';

/**
 * The reverse direction of the whole ClickUp integration: this app pushes
 * stage changes at a linked task one-way (`fanOut` in
 * `features/projects/mutations.ts`), and this is the one place a manual move
 * on the ClickUp side finds its way back - registered per organization by
 * `setOrganizationIntegration` (`packages/integrations/src/registry.ts`)
 * whenever a ClickUp team id is configured.
 *
 * Always answers 200, even on a signature failure or a status this app
 * cannot match - ClickUp retries a non-2xx delivery on a schedule this app
 * has no say over, and a signature failure is not a delivery that would
 * eventually resolve itself by being retried.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();

  let payload: {
    webhook_id?: string;
    event?: string;
    task_id?: string;
    history_items?: { field?: string; after?: { status?: string } }[];
  };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON.' }, { status: 200 });
  }

  if (!payload.webhook_id) {
    return NextResponse.json({ ok: false, error: 'Missing webhook_id.' }, { status: 200 });
  }

  const webhookAuth = await findClickUpWebhookSecret(payload.webhook_id);
  if (!webhookAuth) {
    // Not necessarily an attack - also what a webhook ClickUp still has
    // registered for a since-disconnected organization looks like.
    return NextResponse.json({ ok: false, error: 'Unknown webhook.' }, { status: 200 });
  }

  const signature = request.headers.get('x-signature');
  if (!signature || !verifySignature(rawBody, webhookAuth.secret, signature)) {
    logger.warn({ webhookId: payload.webhook_id }, 'clickup webhook: signature did not match');
    return NextResponse.json({ ok: false, error: 'Bad signature.' }, { status: 200 });
  }

  if (payload.event !== 'taskStatusUpdated' || !payload.task_id) {
    return NextResponse.json({ ok: true, skipped: 'not a status update' }, { status: 200 });
  }

  const newStatus = payload.history_items?.find((item) => item.field === 'status')?.after?.status;
  if (!newStatus) {
    return NextResponse.json({ ok: true, skipped: 'no status in payload' }, { status: 200 });
  }

  const link = await db.integrationLink.findFirst({
    where: { provider: 'CLICKUP', externalId: payload.task_id, isActive: true },
    select: { id: true, projectId: true, project: { select: { clickUpTrackedStages: true } } },
  });
  if (!link) {
    return NextResponse.json(
      { ok: true, skipped: 'task is not linked to a project' },
      { status: 200 },
    );
  }

  const stage = stageForClickUpStatus(newStatus, link.project.clickUpTrackedStages);
  if (!stage) {
    await db.integrationLink.update({
      where: { id: link.id },
      data: {
        lastError: `ClickUp status "${newStatus}" does not match any stage this project tracks. Check the project's tracked stages or the status name on the ClickUp list.`,
      },
    });
    return NextResponse.json(
      { ok: true, skipped: 'status not tracked by this project' },
      { status: 200 },
    );
  }

  const outcome = await applyClickUpStatusSync({ projectId: link.projectId, to: stage });

  await db.integrationLink.update({
    where: { id: link.id },
    data: outcome.applied
      ? { lastSyncAt: clock.now(), lastError: null }
      : { lastError: outcome.reason },
  });

  return NextResponse.json({ ok: true, applied: outcome.applied }, { status: 200 });
}

function verifySignature(rawBody: string, secret: string, signatureHeader: string): boolean {
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const provided = Buffer.from(signatureHeader);
  const expectedBuf = Buffer.from(expected);
  if (provided.length !== expectedBuf.length) return false;
  return timingSafeEqual(provided, expectedBuf);
}
