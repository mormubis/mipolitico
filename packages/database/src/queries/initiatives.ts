import { prisma } from '../client.ts';
import { applyPaginationDefaults } from './index.ts';

import type { PaginatedResult, PaginationInput, SortInput } from './index.ts';
import type { Initiative } from '@prisma/client';

export interface InitiativeFilters {
  enacted?: boolean;
  legislature?: number;
  tipo?: string;
  title?: string;
}

export async function findInitiatives(
  filters: InitiativeFilters = {},
  pagination: PaginationInput = {},
  sort: SortInput = {},
): Promise<PaginatedResult<Initiative>> {
  const { limit, offset } = applyPaginationDefaults(pagination);

  const where = {
    ...(filters.legislature && { legislature: filters.legislature }),
    ...(filters.tipo && { tipo: filters.tipo }),
    ...(filters.title && { title: { contains: filters.title } }),
    ...(filters.enacted !== undefined && {
      enactedDate: filters.enacted ? { not: null } : null,
    }),
  };

  const orderBy = sort.sortBy
    ? { [sort.sortBy]: sort.order ?? 'asc' }
    : { bulletinDate: 'desc' as const };

  const [data, total] = await Promise.all([
    prisma.initiative.findMany({ where, orderBy, take: limit, skip: offset }),
    prisma.initiative.count({ where }),
  ]);

  return { data, total, limit, offset };
}

export async function findInitiativeById(
  id: string,
): Promise<Initiative | null> {
  return prisma.initiative.findUnique({ where: { id } });
}
