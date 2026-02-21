import { prisma } from '../client.ts';
import { PersonInputSchema } from '../validation/index.ts';
import { logValidationError } from '../validation/logger.ts';

import type { PersonInput } from '../validation/index.ts';

function parseSpanishDate(dateStr: string): Date | null {
  // Format: "DD/MM/YYYY" -> Date
  const parts = dateStr.split('/').map(Number);
  const day = parts[0];
  const month = parts[1];
  const year = parts[2];
  if (day === undefined || month === undefined || year === undefined)
    {return null;}
  return new Date(year, month - 1, day);
}

export async function upsertDeputies(
  records: unknown[],
  options: { legislature?: number } = {},
): Promise<{ success: number; skipped: number }> {
  const legislature = options.legislature ?? 15;
  let success = 0;
  let skipped = 0;

  // Validate and filter records
  const validRecords: PersonInput[] = [];
  for (const record of records) {
    const result = PersonInputSchema.safeParse(record);
    if (result.success) {
      validRecords.push(result.data);
    } else {
      logValidationError('deputies', record, result.error);
      skipped++;
    }
  }

  // Batch UPSERT in transaction
  await prisma.$transaction(async (tx) => {
    for (const data of validRecords) {
      // Upsert person first
      const person = await tx.person.upsert({
        where: { name: data.NOMBRE },
        create: { name: data.NOMBRE, biography: data.BIOGRAFIA },
        update: { biography: data.BIOGRAFIA },
      });

      // Upsert deputy record
      const startDate = parseSpanishDate(data.FECHAALTA);
      if (!startDate) {
        skipped++;
        continue;
      }
      await tx.deputy.upsert({
        where: {
          personId_legislature_startDate: {
            personId: person.id,
            legislature,
            startDate,
          },
        },
        create: {
          personId: person.id,
          constituency: data.CIRCUNSCRIPCION,
          startDate,
          fullConditionDate: data.FECHACONDICIONPLENA
            ? parseSpanishDate(data.FECHACONDICIONPLENA)
            : null,
          parliamentaryGroup: data.GRUPOPARLAMENTARIO,
          electoralFormation: data.FORMACIONELECTORAL,
          legislature,
        },
        update: {
          constituency: data.CIRCUNSCRIPCION,
          fullConditionDate: data.FECHACONDICIONPLENA
            ? parseSpanishDate(data.FECHACONDICIONPLENA)
            : null,
          parliamentaryGroup: data.GRUPOPARLAMENTARIO,
          electoralFormation: data.FORMACIONELECTORAL,
        },
      });

      success++;
    }
  });

  return { success, skipped };
}
