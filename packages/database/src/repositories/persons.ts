import { prisma } from '../client.ts';

export async function upsertPerson(name: string, biography?: string) {
  return prisma.person.upsert({
    where: { name },
    create: { name, biography },
    update: { biography },
  });
}

export async function findPersonByName(name: string) {
  return prisma.person.findUnique({ where: { name } });
}
