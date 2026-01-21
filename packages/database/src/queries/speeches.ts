import { prisma } from '../client.ts';
import {
  
  
  
  applyPaginationDefaults
} from './index.ts';

import type {PaginatedResult, PaginationInput, SortInput} from './index.ts';
import type { Speech } from '@prisma/client';

export interface SpeechFilters {
  personId?: string;
  speakerName?: string; // Partial match
  dateFrom?: Date;
  dateTo?: Date;
}

export async function findSpeeches(
  filters: SpeechFilters = {},
  pagination: PaginationInput = {},
  sort: SortInput = {},
): Promise<PaginatedResult<Speech>> {
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
    prisma.speech.findMany({
      where,
      orderBy,
      take: limit,
      skip: offset,
    }),
    prisma.speech.count({ where }),
  ]);

  return { data, total, limit, offset };
}

export async function findSpeechById(id: string): Promise<Speech | null> {
  return prisma.speech.findUnique({
    where: { id },
  });
}
