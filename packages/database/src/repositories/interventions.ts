import { prisma } from '../client.ts';
import { InterventionInputSchema } from '../validation/index.ts';
import { logValidationError } from '../validation/logger.ts';

import type { InterventionInput } from '../validation/index.ts';

function parseSpanishDate(dateStr: string): Date | null {
  const parts = dateStr.split('/').map(Number);
  const [day, month, year] = parts;
  if (!day || !month || !year || isNaN(day) || isNaN(month) || isNaN(year)) {
    return null;
  }
  return new Date(year, month - 1, day);
}

async function upsertInterventions(
  records: unknown[],
): Promise<{ success: number; skipped: number }> {
  let success = 0;
  let skipped = 0;

  const valid: InterventionInput[] = [];
  for (const record of records) {
    const result = InterventionInputSchema.safeParse(record);
    if (result.success) {
      valid.push(result.data);
    } else {
      logValidationError('interventions', record, result.error);
      skipped++;
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const data of valid) {
      const sessionDate = parseSpanishDate(data.sessionDate);
      if (!sessionDate) {
        skipped++;
        continue;
      }

      await tx.intervention.upsert({
        where: {
          sessionId_orderInSession: {
            sessionId: data.sessionId,
            orderInSession: data.order,
          },
        },
        create: {
          personId: data.personId ?? null,
          governmentMemberId: data.governmentMemberId ?? null,
          sessionId: data.sessionId,
          sessionDate,
          sessionTitle: data.sessionTitle,
          sessionUrl: data.sessionUrl,
          speakerRaw: data.speaker,
          speakerName: data.speakerName,
          speakerRole: data.speakerRole ?? null,
          text: data.text,
          orderInSession: data.order,
          organ: data.organ ?? null,
          initiativeSubject: data.initiativeSubject ?? null,
          interventionType: data.interventionType ?? null,
          startTime: data.startTime ?? null,
          endTime: data.endTime ?? null,
          videoUrl: data.videoUrl ?? null,
          videoDownloadUrl: data.videoDownloadUrl ?? null,
          procedural: data.procedural,
        },
        update: {
          personId: data.personId ?? null,
          governmentMemberId: data.governmentMemberId ?? null,
          sessionDate,
          sessionTitle: data.sessionTitle,
          speakerRaw: data.speaker,
          speakerName: data.speakerName,
          speakerRole: data.speakerRole ?? null,
          text: data.text,
          organ: data.organ ?? null,
          initiativeSubject: data.initiativeSubject ?? null,
          interventionType: data.interventionType ?? null,
          procedural: data.procedural,
          startTime: data.startTime ?? null,
          endTime: data.endTime ?? null,
          videoUrl: data.videoUrl ?? null,
          videoDownloadUrl: data.videoDownloadUrl ?? null,
        },
      });
      success++;
    }
  });

  return { success, skipped };
}

export { upsertInterventions };
