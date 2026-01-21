import { prisma } from '../client.ts';
import {
  
  
  
  applyPaginationDefaults
} from './index.ts';

import type {PaginatedResult, PaginationInput, SortInput} from './index.ts';
import type { BureauMember } from '@prisma/client';

export interface BureauFilters {
  organ?: string;
  position?: string;
  name?: string; // Partial match
}

export async function findBureauMembers(
  filters: BureauFilters = {},
  pagination: PaginationInput = {},
  sort: SortInput = {},
): Promise<PaginatedResult<BureauMember>> {
  const { limit, offset } = applyPaginationDefaults(pagination);

  const where = {
    ...(filters.organ && { organ: filters.organ }),
    ...(filters.position && { position: filters.position }),
    ...(filters.name && { name: { contains: filters.name } }),
  };

  const orderBy = sort.sortBy
    ? { [sort.sortBy]: sort.order ?? 'asc' }
    : { startDate: 'desc' as const };

  const [data, total] = await Promise.all([
    prisma.bureauMember.findMany({
      where,
      orderBy,
      take: limit,
      skip: offset,
    }),
    prisma.bureauMember.count({ where }),
  ]);

  return { data, total, limit, offset };
}

export async function findBureauMemberById(
  id: string,
): Promise<BureauMember | null> {
  return prisma.bureauMember.findUnique({
    where: { id },
  });
}
