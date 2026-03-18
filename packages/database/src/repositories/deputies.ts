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
  if (
    day === undefined ||
    month === undefined ||
    year === undefined ||
    isNaN(day) ||
    isNaN(month) ||
    isNaN(year)
  ) {
    return null;
  }
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
      // Upsert person first.
      // Known limitation: two deputies with identical names will collide into
      // one Person record. Warn if a collision is detected so it can be handled
      // manually. A proper fix requires using codParlamentario as the natural key.
      const existing = await tx.person.findUnique({
        where: { name: data.name },
      });
      if (existing) {
        const existingDeputy = await tx.deputy.findFirst({
          where: { personId: existing.id, legislature },
        });
        if (existingDeputy) {
          const startDate = parseSpanishDate(data.startDate);
          if (
            startDate &&
            existingDeputy.startDate.getTime() !== startDate.getTime()
          ) {
            console.warn(
              `[deputies] Name collision detected: "${data.name}" already has a deputy record for legislature ${String(legislature)} — two different people may share this name`,
            );
          }
        }
      }

      const person = await tx.person.upsert({
        where: { name: data.name },
        create: { name: data.name, biography: data.biography },
        update: { biography: data.biography },
      });

      // Upsert deputy record
      const startDate = parseSpanishDate(data.startDate);
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
          constituency: data.constituency,
          startDate,
          fullConditionDate: data.fullConditionDate
            ? parseSpanishDate(data.fullConditionDate)
            : null,
          parliamentaryGroup: data.parliamentaryGroup,
          electoralFormation: data.electoralFormation,
          legislature,
        },
        update: {
          constituency: data.constituency,
          fullConditionDate: data.fullConditionDate
            ? parseSpanishDate(data.fullConditionDate)
            : null,
          parliamentaryGroup: data.parliamentaryGroup,
          electoralFormation: data.electoralFormation,
        },
      });

      success++;
    }
  });

  return { success, skipped };
}
