import { prisma } from '../client.ts';
import { PartyInputSchema } from '../validation/index.ts';
import { logValidationError } from '../validation/logger.ts';

import type { PartyInput } from '../validation/index.ts';

export async function upsertParties(
  records: unknown[],
): Promise<{ success: number; skipped: number }> {
  let success = 0;
  let skipped = 0;

  const validRecords: PartyInput[] = [];
  for (const record of records) {
    const result = PartyInputSchema.safeParse(record);
    if (result.success) {
      validRecords.push(result.data);
    } else {
      logValidationError('parties', record, result.error);
      skipped++;
    }
  }

  // First pass: upsert all parties without parentId
  await prisma.$transaction(async (tx) => {
    for (const data of validRecords) {
      await tx.party.upsert({
        where: { shortName: data.shortName },
        create: { shortName: data.shortName, name: data.name },
        update: { name: data.name },
      });
      success++;
    }
  });

  // Second pass: resolve parentId links
  await prisma.$transaction(async (tx) => {
    for (const data of validRecords) {
      if (!data.parentShortName) continue;
      const parent = await tx.party.findUnique({
        where: { shortName: data.parentShortName },
      });
      if (!parent) {
        console.warn(
          `[parties] Could not resolve parentShortName "${data.parentShortName}" for "${data.shortName}" — parent not found in DB`,
        );
        continue;
      }
      await tx.party.update({
        where: { shortName: data.shortName },
        data: { parentId: parent.id },
      });
    }

    // After all party upserts, link deputies to their party by electoralFormation → shortName
    const parties = await tx.party.findMany({
      select: { id: true, shortName: true },
    });

    for (const party of parties) {
      await tx.deputy.updateMany({
        where: {
          electoralFormation: party.shortName,
          partyId: null,
        },
        data: { partyId: party.id },
      });
    }
  });

  return { success, skipped };
}
