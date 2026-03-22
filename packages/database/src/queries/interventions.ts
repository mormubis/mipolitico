import { prisma } from '../client.ts';
import { applyPaginationDefaults } from './index.ts';

import type { PaginatedResult, PaginationInput, SortInput } from './index.ts';
import type { Intervention } from '@prisma/client';

export interface InterventionFilters {
  personId?: string;
  speakerName?: string; // Partial match
  dateFrom?: Date;
  dateTo?: Date;
}

export async function findInterventions(
  filters: InterventionFilters = {},
  pagination: PaginationInput = {},
  sort: SortInput = {},
): Promise<PaginatedResult<Intervention>> {
  const { limit, offset } = applyPaginationDefaults(pagination);

  const where = {
    ...(filters.personId && { personId: filters.personId }),
    ...(filters.speakerName && {
      speakerName: { contains: filters.speakerName },
    }),
    ...((filters.dateFrom ?? filters.dateTo) && {
      sessionDate: {
        ...(filters.dateFrom && { gte: filters.dateFrom }),
        ...(filters.dateTo && { lte: filters.dateTo }),
      },
    }),
  };

  const orderBy = sort.sortBy
    ? { [sort.sortBy]: sort.order ?? 'asc' }
    : { sessionDate: 'desc' as const };

  const [data, total] = await Promise.all([
    prisma.intervention.findMany({
      where,
      orderBy,
      take: limit,
      skip: offset,
    }),
    prisma.intervention.count({ where }),
  ]);

  return { data, total, limit, offset };
}

export async function findInterventionById(
  id: string,
): Promise<Intervention | null> {
  return prisma.intervention.findUnique({
    where: { id },
  });
}
