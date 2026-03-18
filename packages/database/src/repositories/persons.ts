import { prisma } from '../client.ts';
import { PersonDetailInputSchema } from '../validation/index.ts';

import type { PersonDetailInput } from '../validation/index.ts';

async function upsertPerson(name: string, biography?: string) {
  return prisma.person.upsert({
    where: { name },
    create: { name, biography },
    update: { biography },
  });
}

async function findPersonByName(name: string) {
  return prisma.person.findUnique({ where: { name } });
}

function parseOptionalDate(dateStr: string | undefined): Date | null {
  if (!dateStr || dateStr.trim() === '') return null;
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const [dd, mm, yyyy] = parts.map(Number);
    if (dd && mm && yyyy) return new Date(yyyy, mm - 1, dd);
  }
  const parsed = new Date(dateStr);
  return isNaN(parsed.getTime()) ? null : parsed;
}

async function upsertPersonDetail(record: unknown): Promise<boolean> {
  const result = PersonDetailInputSchema.safeParse(record);
  if (!result.success) {
    console.warn(`[personDetail] Invalid record: ${result.error.message}`);
    return false;
  }

  const data: PersonDetailInput = result.data;
  const person = await prisma.person.findUnique({ where: { name: data.name } });

  if (!person) {
    console.warn(
      `[personDetail] No person found for name: ${data.name} — run person scraper first`,
    );
    return false;
  }

  await prisma.person.update({
    where: { id: person.id },
    data: {
      birthDate: parseOptionalDate(data.birthDate) ?? undefined,
      photoUrl: data.photoUrl,
      email: data.email ?? undefined,
      facebook: data.facebook ?? undefined,
      instagram: data.instagram ?? undefined,
      linkedin: data.linkedin ?? undefined,
      twitter: data.twitter ?? undefined,
      web: data.web ?? undefined,
    },
  });

  return true;
}

export { findPersonByName, upsertPerson, upsertPersonDetail };
