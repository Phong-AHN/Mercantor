import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { db, transaction } from './index.js';

/**
 * The whole outbox pattern (D-013) rests on one guarantee: a mutation, its
 * activity row, its audit row and its outbox row commit together or not at
 * all. That guarantee is Postgres transaction rollback via Prisma's
 * `$transaction`, and this is the one place it is proven directly rather than
 * inferred from a passing feature test.
 *
 * `PortalSetting` is used as the throwaway row because it has no foreign
 * keys - the point here is the transaction boundary itself, not any one
 * table's cascades.
 */
describe('transaction()', () => {
  const keys: string[] = [];
  const key = () => {
    const value = `it-transaction-${randomUUID()}`;
    keys.push(value);
    return value;
  };

  afterEach(async () => {
    if (keys.length > 0) {
      await db.portalSetting.deleteMany({ where: { key: { in: keys } } });
      keys.length = 0;
    }
  });

  it('commits every write when the callback resolves', async () => {
    const a = key();
    const b = key();

    await transaction(async (tx) => {
      await tx.portalSetting.create({ data: { key: a, value: { n: 1 } } });
      await tx.portalSetting.create({ data: { key: b, value: { n: 2 } } });
    });

    const rows = await db.portalSetting.findMany({ where: { key: { in: [a, b] } } });
    expect(rows).toHaveLength(2);
  });

  it('rolls back every write when the callback throws, even after earlier writes succeeded', async () => {
    const a = key();
    const b = key();

    await expect(
      transaction(async (tx) => {
        // The first write genuinely reaches Postgres before the failure -
        // this is what distinguishes "rolls back" from "never attempted".
        await tx.portalSetting.create({ data: { key: a, value: { n: 1 } } });
        await tx.portalSetting.create({ data: { key: b, value: { n: 2 } } });
        throw new Error('boom - simulating a failure after the first write landed');
      }),
    ).rejects.toThrow('boom');

    const rows = await db.portalSetting.findMany({ where: { key: { in: [a, b] } } });
    expect(rows).toHaveLength(0);
  });

  it('rolls back on a constraint violation, not only on a thrown Error', async () => {
    const a = key();

    await expect(
      transaction(async (tx) => {
        await tx.portalSetting.create({ data: { key: a, value: { n: 1 } } });
        // Same primary key twice inside one transaction - Postgres itself
        // refuses the second write.
        await tx.portalSetting.create({ data: { key: a, value: { n: 2 } } });
      }),
    ).rejects.toThrow();

    const rows = await db.portalSetting.findMany({ where: { key: a } });
    expect(rows).toHaveLength(0);
  });
});
