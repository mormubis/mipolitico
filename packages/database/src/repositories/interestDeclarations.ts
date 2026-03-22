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
      where: { deputyId_year: { deputyId: data.deputyId, year: data.year } },
      create: {
        deputyId: data.deputyId,
        pdfUrl: data.pdfUrl ?? null,
        year: data.year,
      },
      update: { pdfUrl: data.pdfUrl ?? null },
    });

    const id = declaration.id;

    // Delete existing child records and re-insert (replace strategy)
    await tx.bankAccount.deleteMany({ where: { declarationId: id } });
    await tx.incomeSource.deleteMany({ where: { declarationId: id } });
    await tx.movableAsset.deleteMany({ where: { declarationId: id } });
    await tx.professionalActivity.deleteMany({ where: { declarationId: id } });
    await tx.realEstateAsset.deleteMany({ where: { declarationId: id } });
    await tx.security.deleteMany({ where: { declarationId: id } });
    await tx.donation.deleteMany({ where: { declarationId: id } });
    await tx.foundation.deleteMany({ where: { declarationId: id } });
    await tx.observation.deleteMany({ where: { declarationId: id } });

    if (data.bankAccounts?.length) {
      await tx.bankAccount.createMany({
        data: data.bankAccounts.map((r) => ({ declarationId: id, ...r })),
      });
    }
    if (data.incomeSources?.length) {
      await tx.incomeSource.createMany({
        data: data.incomeSources.map((r) => ({ declarationId: id, ...r })),
      });
    }
    if (data.movableAssets?.length) {
      await tx.movableAsset.createMany({
        data: data.movableAssets.map((r) => ({ declarationId: id, ...r })),
      });
    }
    if (data.professionalActivities?.length) {
      await tx.professionalActivity.createMany({
        data: data.professionalActivities.map((r) => ({
          declarationId: id,
          endDate: parseOptionalDate(r.endDate),
          entity: r.entity,
          position: r.position,
          remunerated: r.remunerated,
          startDate: parseOptionalDate(r.startDate),
        })),
      });
    }
    if (data.realEstate?.length) {
      await tx.realEstateAsset.createMany({
        data: data.realEstate.map((r) => ({ declarationId: id, ...r })),
      });
    }
    if (data.securities?.length) {
      await tx.security.createMany({
        data: data.securities.map((r) => ({ declarationId: id, ...r })),
      });
    }
    if (data.donations?.length) {
      await tx.donation.createMany({
        data: data.donations.map((r) => ({ declarationId: id, ...r })),
      });
    }
    if (data.foundations?.length) {
      await tx.foundation.createMany({
        data: data.foundations.map((r) => ({ declarationId: id, ...r })),
      });
    }
    if (data.observations?.length) {
      await tx.observation.createMany({
        data: data.observations.map((r) => ({ declarationId: id, ...r })),
      });
    }
  });

  return true;
}
