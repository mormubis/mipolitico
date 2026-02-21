import { prisma } from '../client.ts';
import { InitiativeInputSchema } from '../validation/index.ts';
import { logValidationError } from '../validation/logger.ts';

import type { InitiativeInput } from '../validation/index.ts';

function parseDate(dateStr: string | undefined): Date | null {
  if (!dateStr || dateStr.trim() === '') return null;
  const parsed = new Date(dateStr);
  return isNaN(parsed.getTime()) ? null : parsed;
}

export async function upsertInitiatives(
  records: unknown[],
): Promise<{ success: number; skipped: number }> {
  let success = 0;
  let skipped = 0;

  const validRecords: InitiativeInput[] = [];
  for (const record of records) {
    const result = InitiativeInputSchema.safeParse(record);
    if (result.success) {
      validRecords.push(result.data);
    } else {
      logValidationError('initiatives', record, result.error);
      skipped++;
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const data of validRecords) {
      // Skip if no bulletin number (cannot deduplicate)
      if (!data.NUMERO_BOLETIN) {
        skipped++;
        continue;
      }

      await tx.initiative.upsert({
        where: {
          legislature_bulletinNumber: {
            legislature: data.LEGISLATURE,
            bulletinNumber: data.NUMERO_BOLETIN,
          },
        },
        create: {
          legislature: data.LEGISLATURE,
          tipo: data.TIPO,
          number: data.NUMERO_LEY ?? null,
          title: data.TITULO_LEY,
          bulletinNumber: data.NUMERO_BOLETIN,
          bulletinDate: parseDate(data.FECHA_BOLETIN),
          enactedDate: parseDate(data.FECHA_LEY),
          pdfUrl: data.PDF ?? null,
        },
        update: {
          tipo: data.TIPO,
          number: data.NUMERO_LEY ?? null,
          title: data.TITULO_LEY,
          bulletinDate: parseDate(data.FECHA_BOLETIN),
          enactedDate: parseDate(data.FECHA_LEY),
          pdfUrl: data.PDF ?? null,
        },
      });

      success++;
    }
  });

  return { success, skipped };
}
