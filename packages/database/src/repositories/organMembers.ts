import { prisma } from '../client.ts';
import { BureauInputSchema } from '../validation/index.ts';
import { logValidationError } from '../validation/logger.ts';

import type { BureauInput } from '../validation/index.ts';

function parseSpanishDate(dateStr: string): Date | null {
  if (!dateStr || dateStr.trim() === '') return null;
  const parts = dateStr.split('/').map(Number);
  const [day, month, year] = parts;
  if (day === undefined || month === undefined || year === undefined)
    {return null;}
  return new Date(year, month - 1, day);
}

function deriveOrganType(organName: string): string {
  const name = organName.toLowerCase();
  if (name.includes('mesa')) return 'MESA';
  if (name.includes('comisión') || name.includes('comision')) return 'COMISION';
  if (name.includes('junta de portavoces')) return 'JUNTA_PORTAVOCES';
  if (
    name.includes('diputación permanente') ||
    name.includes('diputacion permanente')
  )
    {return 'DIPUTACION_PERMANENTE';}
  return 'OTHER';
}

export async function upsertOrganMembers(
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
      logValidationError('organMembers', record, result.error);
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

      const person = await tx.person.findUnique({
        where: { name: data.Nombre },
      });

      const organType = deriveOrganType(data.NombreOrgano);

      await tx.organMember.upsert({
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
          organType,
          partyGroup: data.Grupo,
          startDate,
          endDate: parseSpanishDate(data.FechaBaja),
        },
        update: {
          personId: person?.id ?? null,
          organType,
          partyGroup: data.Grupo,
          endDate: parseSpanishDate(data.FechaBaja),
        },
      });

      success++;
    }
  });

  return { success, skipped };
}
