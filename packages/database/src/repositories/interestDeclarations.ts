import { prisma } from '../client.ts';
import { InterestDeclarationInputSchema } from '../validation/index.ts';
import { logValidationError } from '../validation/logger.ts';

import type { InterestDeclarationInput } from '../validation/index.ts';

function parseOptionalDate(dateStr: string | undefined): Date | null {
  if (!dateStr || dateStr.trim() === '') return null;
  const parsed = new Date(dateStr);
  return isNaN(parsed.getTime()) ? null : parsed;
}

export async function upsertInterestDeclaration(
  record: unknown,
): Promise<boolean> {
  const result = InterestDeclarationInputSchema.safeParse(record);
  if (!result.success) {
    logValidationError('interestDeclarations', record, result.error);
    return false;
  }

  const data: InterestDeclarationInput = result.data;

  await prisma.$transaction(async (tx) => {
    const declaration = await tx.interestDeclaration.upsert({
      where: { deputyId_year: { deputyId: data.DEPUTY_ID, year: data.YEAR } },
      create: {
        deputyId: data.DEPUTY_ID,
        pdfUrl: data.PDF_URL ?? null,
        year: data.YEAR,
      },
      update: { pdfUrl: data.PDF_URL ?? null },
    });

    const id = declaration.id;

    // Delete existing child records and re-insert (replace strategy)
    await tx.bankAccount.deleteMany({ where: { declarationId: id } });
    await tx.incomeSource.deleteMany({ where: { declarationId: id } });
    await tx.movableAsset.deleteMany({ where: { declarationId: id } });
    await tx.professionalActivity.deleteMany({ where: { declarationId: id } });
    await tx.realEstateAsset.deleteMany({ where: { declarationId: id } });
    await tx.security.deleteMany({ where: { declarationId: id } });

    if (data.BANK_ACCOUNTS?.length) {
      await tx.bankAccount.createMany({
        data: data.BANK_ACCOUNTS.map((r) => ({ declarationId: id, ...r })),
      });
    }
    if (data.INCOME_SOURCES?.length) {
      await tx.incomeSource.createMany({
        data: data.INCOME_SOURCES.map((r) => ({ declarationId: id, ...r })),
      });
    }
    if (data.MOVABLE_ASSETS?.length) {
      await tx.movableAsset.createMany({
        data: data.MOVABLE_ASSETS.map((r) => ({ declarationId: id, ...r })),
      });
    }
    if (data.PROFESSIONAL_ACTIVITIES?.length) {
      await tx.professionalActivity.createMany({
        data: data.PROFESSIONAL_ACTIVITIES.map((r) => ({
          declarationId: id,
          endDate: parseOptionalDate(r.endDate),
          entity: r.entity,
          position: r.position,
          remunerated: r.remunerated,
          startDate: parseOptionalDate(r.startDate),
        })),
      });
    }
    if (data.REAL_ESTATE?.length) {
      await tx.realEstateAsset.createMany({
        data: data.REAL_ESTATE.map((r) => ({ declarationId: id, ...r })),
      });
    }
    if (data.SECURITIES?.length) {
      await tx.security.createMany({
        data: data.SECURITIES.map((r) => ({ declarationId: id, ...r })),
      });
    }
  });

  return true;
}
