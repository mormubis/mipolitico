import { prisma } from '../client.ts';
import { BureauInputSchema } from '../validation/index.ts';
import { logValidationError } from '../validation/logger.ts';

import type { BureauInput } from '../validation/index.ts';

function parseSpanishDate(dateStr: string): Date | null {
  if (!dateStr || dateStr.trim() === '') return null;
  const [day, month, year] = dateStr.split('/').map(Number);
  return new Date(year, month - 1, day);
}

export async function upsertBureauMembers(
  records: unknown[],
): Promise<{ success: number; skipped: number }> {
  let success = 0;
  let skipped = 0;

  const validRecords: BureauInput[] = [];
  for (const record of records) {
    const result = BureauInputSchema.safeParse(record);
    if (result.success) {
      validRecords.push(result.data);
    } else {
      logValidationError('bureaus', record, result.error);
      skipped++;
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const data of validRecords) {
      const startDate = parseSpanishDate(data.FechaAlta);
      if (!startDate) {
        skipped++;
        continue;
      }

      // Try to link to person
      const person = await tx.person.findUnique({
        where: { name: data.Nombre },
      });

      await tx.bureauMember.upsert({
        where: {
          name_organ_position_startDate: {
            name: data.Nombre,
            organ: data.NombreOrgano,
            position: data.Cargo,
            startDate,
          },
        },
        create: {
          personId: person?.id ?? null,
          name: data.Nombre,
          position: data.Cargo,
          organ: data.NombreOrgano,
          partyGroup: data.Grupo,
          startDate,
          endDate: parseSpanishDate(data.FechaBaja),
        },
        update: {
          personId: person?.id ?? null,
          partyGroup: data.Grupo,
          endDate: parseSpanishDate(data.FechaBaja),
        },
      });

      success++;
    }
  });

  return { success, skipped };
}
