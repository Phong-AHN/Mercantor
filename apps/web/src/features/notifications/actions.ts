'use server';

import { revalidatePath } from 'next/cache';
import { clock } from '@relay/core';
import { db } from '@relay/db';
import { requirePrincipal } from '@/server/session';

/** Marks everything currently unread for the signed-in user. Idempotent. */
export async function markNotificationsReadAction(): Promise<void> {
  const principal = await requirePrincipal();
  await db.notification.updateMany({
    where: { userId: principal.id, readAt: null },
    data: { readAt: clock.now() },
  });
  revalidatePath('/', 'layout');
}
