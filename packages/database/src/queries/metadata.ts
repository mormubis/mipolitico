import { prisma } from '../client.ts';

export type ScraperType =
  | 'bureau'
  | 'deputies'
  | 'initiatives'
  | 'interestDeclarations'
  | 'intervention'
  | 'voting';

export async function getLastSuccessfulRun(
  scraperType: ScraperType,
): Promise<Date | null> {
  const record = await prisma.scraperMetadata.findUnique({
    where: { scraperType },
    select: { lastSuccessfulRun: true },
  });

  return record?.lastSuccessfulRun ?? null;
}
