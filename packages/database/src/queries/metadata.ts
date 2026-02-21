import { prisma } from '../client.ts';

export type ScraperType = 'deputies' | 'voting' | 'bureau' | 'intervention';

export async function getLastSuccessfulRun(
  scraperType: ScraperType,
): Promise<Date | null> {
  const record = await prisma.scraperMetadata.findUnique({
    where: { scraperType },
    select: { lastSuccessfulRun: true },
  });

  return record?.lastSuccessfulRun ?? null;
}
