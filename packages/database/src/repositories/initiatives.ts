import { prisma } from '../client.ts';
import {
  InitiativeInputSchema,
  ParliamentaryInitiativeSchema,
} from '../validation/index.ts';
import { logValidationError } from '../validation/logger.ts';

import type {
  ApprovedLawInput,
  InitiativeInput,
  ParliamentaryInitiativeInput,
} from '../validation/index.ts';

function parseDate(dateStr: string | undefined): Date | null {
  if (!dateStr || dateStr.trim() === '') return null;
  const parts = dateStr.trim().split('/');
  if (parts.length === 3) {
    // DD/MM/YYYY
    const [day, month, year] = parts.map(Number);
    if (day && month && year) return new Date(year, month - 1, day);
  }
  const parsed = new Date(dateStr);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function isParliamentaryBill(
  r: InitiativeInput,
): r is ParliamentaryInitiativeInput {
  return ParliamentaryInitiativeSchema.safeParse(r).success;
}

/**
 * Normalize an approved law title for matching against parliamentary bill titles.
 * Strips the "Ley X/YYYY, de DD de mes de YYYY, " prefix.
 */
function normalizeApprovedTitle(title: string): string {
  return title
    .replace(
      /^(Ley Orgánica|Ley|Real Decreto-ley|Real Decreto Legislativo|Resolución)\s+[\d/]+(?:,\s+de\s+\d+\s+de\s+\w+(?:\s+de\s+\d+)?)?,\s*/i,
      '',
    )
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalize a parliamentary bill title for matching against approved law titles.
 * Strips the "Proyecto de Ley", "Proposición de Ley", etc. prefix.
 */
function normalizeParliamentaryTitle(title: string): string {
  return title
    .replace(
      /^(Proyecto de Ley Orgánica|Proyecto de Ley|Proposición de Ley Orgánica|Proposición de Ley|Propuesta de Reforma de Estatuto de Autonomía|Propuesta de reforma)\s*/i,
      '',
    )
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Jaccard similarity: word overlap over word union.
 * Only words longer than 3 characters are considered.
 */
function jaccard(a: string, b: string): number {
  const setA = new Set(a.split(' ').filter((w) => w.length > 3));
  const setB = new Set(b.split(' ').filter((w) => w.length > 3));
  const intersection = [...setA].filter((w) => setB.has(w)).length;
  const union = new Set([...setA, ...setB]).size;
  return union > 0 ? intersection / union : 0;
}

const ENRICHMENT_THRESHOLD = 0.6;

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

  const parliamentary = validRecords.filter(isParliamentaryBill);
  const approved = validRecords.filter(
    (r): r is ApprovedLawInput => !isParliamentaryBill(r),
  );

  // First pass: upsert parliamentary bills by expedienteNumero
  await prisma.$transaction(async (tx) => {
    for (const data of parliamentary) {
      await tx.initiative.upsert({
        where: {
          legislature_expedienteNumero: {
            legislature: data.LEGISLATURE,
            expedienteNumero: data.NUMEXPEDIENTE,
          },
        },
        create: {
          legislature: data.LEGISLATURE,
          tipo: data.TIPO,
          title: data.OBJETO,
          expedienteNumero: data.NUMEXPEDIENTE,
          situacion: data.SITUACIONACTUAL ?? null,
          resultadoTramitacion: data.RESULTADOTRAMITACION ?? null,
        },
        update: {
          tipo: data.TIPO,
          title: data.OBJETO,
          situacion: data.SITUACIONACTUAL ?? null,
          resultadoTramitacion: data.RESULTADOTRAMITACION ?? null,
        },
      });
      success++;
    }
  });

  // Second pass: upsert approved laws / Reales decretos by bulletinNumber
  await prisma.$transaction(async (tx) => {
    for (const data of approved) {
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
          title: data.TITULO_LEY,
          bulletinNumber: data.NUMERO_BOLETIN,
          number: data.NUMERO_LEY ?? null,
          bulletinDate: parseDate(data.FECHA_BOLETIN),
          enactedDate: parseDate(data.FECHA_LEY),
          pdfUrl: data.PDF ?? null,
        },
        update: {
          tipo: data.TIPO,
          title: data.TITULO_LEY,
          number: data.NUMERO_LEY ?? null,
          bulletinDate: parseDate(data.FECHA_BOLETIN),
          enactedDate: parseDate(data.FECHA_LEY),
          pdfUrl: data.PDF ?? null,
        },
      });
      success++;
    }
  });

  // Enrichment pass: title-match approved Leyes/Leyes orgánicas against
  // parliamentary bills to populate bulletinNumber, number, enactedDate, pdfUrl.
  // Reales decretos are skipped — they have no parliamentary counterpart.
  const enrichable = approved.filter(
    (a) => a.TIPO === 'Leyes' || a.TIPO === 'Leyes organicas',
  );

  if (enrichable.length > 0) {
    // All enrichable records share the same legislature (same ingestion batch).
    // Safe to use at(0) here — we are inside the enrichable.length > 0 guard.
    const legislature = enrichable.at(0)?.LEGISLATURE ?? 0;
    // Fetch all closed parliamentary bills without bulletinNumber for this legislature
    const closedBills = await prisma.initiative.findMany({
      where: {
        legislature,
        bulletinNumber: null,
        situacion: { contains: 'Cerrado' },
        expedienteNumero: { not: null },
      },
      select: { id: true, title: true, expedienteNumero: true },
    });

    await prisma.$transaction(async (tx) => {
      for (const approvedLaw of enrichable) {
        const normApproved = normalizeApprovedTitle(approvedLaw.TITULO_LEY);

        let bestId: string | null = null;
        let bestScore = 0;

        for (const bill of closedBills) {
          const normBill = normalizeParliamentaryTitle(bill.title);
          const score = jaccard(normApproved, normBill);
          if (score > bestScore) {
            bestScore = score;
            bestId = bill.id;
          }
        }

        if (bestId && bestScore >= ENRICHMENT_THRESHOLD) {
          await tx.initiative.update({
            where: { id: bestId },
            data: {
              bulletinNumber: approvedLaw.NUMERO_BOLETIN,
              number: approvedLaw.NUMERO_LEY ?? null,
              bulletinDate: parseDate(approvedLaw.FECHA_BOLETIN),
              enactedDate: parseDate(approvedLaw.FECHA_LEY),
              pdfUrl: approvedLaw.PDF ?? null,
            },
          });
        } else {
          console.warn(
            `[initiatives] Could not enrich "${approvedLaw.TITULO_LEY.substring(0, 60)}" — best score: ${String(Math.round(bestScore * 100))}%`,
          );
        }
      }
    });
  }

  return { success, skipped };
}
