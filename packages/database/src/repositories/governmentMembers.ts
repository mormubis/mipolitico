import { prisma } from '../client.ts';
import { GovernmentMemberInputSchema } from '../validation/index.ts';

import type { GovernmentMemberInput } from '../validation/index.ts';

async function findOrCreatePerson(name: string): Promise<string> {
  // Try exact match
  const exact = await prisma.person.findUnique({ where: { name } });
  if (exact) return exact.id;

  // Try accent-insensitive SQL search — pick first result
  const normalized = name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
    .replace(/-/g, ' ')
    .trim();

  const firstWord = normalized.split(' ')[0] ?? '';
  if (firstWord.length >= 3) {
    const candidates = await prisma.$queryRaw<{ id: string; name: string }[]>`
      SELECT id, name FROM Person
      WHERE UPPER(
        replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(
          replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(
          name,
          'á','a'),'é','e'),'í','i'),'ó','o'),'ú','u'),
          'Á','A'),'É','E'),'Í','I'),'Ó','O'),'Ú','U'),
          'ñ','n'),'Ñ','N'),'ü','u'),'Ü','U'),
          'à','a'),'è','e'),'ï','i'),'ö','o'),'â','a'),'ê','e')
      ) LIKE ${firstWord + '%'}
      LIMIT 5
    `;

    // Find best: normalized person name includes the full normalized input
    const best = candidates.find((c) => {
      const cn = c.name
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toUpperCase()
        .replace(/-/g, ' ');
      return normalized.split(' ').every((word) => cn.includes(word));
    });
    if (best) return best.id;
  }

  // Create new Person
  const created = await prisma.person.create({ data: { name } });
  return created.id;
}

async function upsertGovernmentMembers(
  records: unknown[],
): Promise<{ success: number; skipped: number }> {
  let success = 0;
  let skipped = 0;

  for (const record of records) {
    const result = GovernmentMemberInputSchema.safeParse(record);
    if (!result.success) {
      skipped++;
      continue;
    }

    const data: GovernmentMemberInput = result.data;

    const personId = await findOrCreatePerson(data.name);

    await prisma.governmentMember.upsert({
      where: {
        personId_role_legislature: {
          personId,
          role: data.role,
          legislature: data.legislature,
        },
      },
      create: {
        personId,
        role: data.role,
        legislature: data.legislature,
      },
      update: {},
    });
    success++;
  }

  return { success, skipped };
}

export { upsertGovernmentMembers };
