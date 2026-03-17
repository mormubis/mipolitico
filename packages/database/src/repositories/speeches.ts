import { prisma } from '../client.ts';
import { SpeechInputSchema } from '../validation/index.ts';
import { logValidationError } from '../validation/logger.ts';

import type { SpeechInput } from '../validation/index.ts';

function parseSpanishDate(dateStr: string): Date | null {
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

export async function upsertSpeeches(
  records: unknown[],
): Promise<{ success: number; skipped: number }> {
  let success = 0;
  let skipped = 0;

  const validRecords: SpeechInput[] = [];
  for (const record of records) {
    const result = SpeechInputSchema.safeParse(record);
    if (result.success) {
      validRecords.push(result.data);
    } else {
      logValidationError('speeches', record, result.error);
      skipped++;
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const data of validRecords) {
      const sessionDate = parseSpanishDate(data.sessionDate);
      if (!sessionDate) {
        skipped++;
        continue;
      }

      // Try to link to person by name
      const person = await tx.person.findFirst({
        where: {
          name: {
            contains: data.speakerName,
          },
        },
      });

      await tx.speech.upsert({
        where: {
          sessionId_orderInSession: {
            sessionId: data.sessionId,
            orderInSession: data.order,
          },
        },
        create: {
          personId: person?.id ?? null,
          sessionId: data.sessionId,
          sessionDate,
          sessionTitle: data.sessionTitle,
          sessionUrl: data.sessionUrl,
          speakerRaw: data.speaker,
          speakerName: data.speakerName,
          speakerRole: data.speakerRole ?? null,
          text: data.text,
          orderInSession: data.order,
        },
        update: {
          personId: person?.id ?? null,
          sessionDate,
          sessionTitle: data.sessionTitle,
          speakerRaw: data.speaker,
          speakerName: data.speakerName,
          speakerRole: data.speakerRole ?? null,
          text: data.text,
        },
      });

      success++;
    }
  });

  return { success, skipped };
}
