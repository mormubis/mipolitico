import { prisma } from '../client.ts';
import {
  
  
  
  applyPaginationDefaults
} from './index.ts';

import type {PaginatedResult, PaginationInput, SortInput} from './index.ts';
import type { Deputy, Person } from '@prisma/client';

export interface DeputyFilters {
  legislature?: number;
  constituency?: string;
  parliamentaryGroup?: string;
  name?: string; // Partial match on person name
}

export type DeputyWithPerson = Deputy & { person: Person };

export async function findDeputies(
  filters: DeputyFilters = {},
  pagination: PaginationInput = {},
  sort: SortInput = {},
): Promise<PaginatedResult<DeputyWithPerson>> {
  const { limit, offset } = applyPaginationDefaults(pagination);

  const where = {
    ...(filters.legislature && { legislature: filters.legislature }),
    ...(filters.constituency && { constituency: filters.constituency }),
    ...(filters.parliamentaryGroup && {
      parliamentaryGroup: filters.parliamentaryGroup,
    }),
    ...(filters.name && { person: { name: { contains: filters.name } } }),
  };

  const orderBy = sort.sortBy
    ? { [sort.sortBy]: sort.order ?? 'asc' }
    : { id: 'asc' as const };

  const [data, total] = await Promise.all([
    prisma.deputy.findMany({
      where,
      include: { person: true },
      orderBy,
      take: limit,
      skip: offset,
    }),
    prisma.deputy.count({ where }),
  ]);

  return { data, total, limit, offset };
}

export async function findDeputyById(
  id: string,
): Promise<DeputyWithPerson | null> {
  return prisma.deputy.findUnique({
    where: { id },
    include: { person: true },
  });
}
