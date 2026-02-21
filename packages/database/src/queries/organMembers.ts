import { prisma } from '../client.ts';
import { applyPaginationDefaults } from './index.ts';

import type { PaginatedResult, PaginationInput, SortInput } from './index.ts';
import type { OrganMember } from '@prisma/client';

export interface OrganMemberFilters {
  organ?: string;
  organType?: string;
  position?: string;
  name?: string;
}

export async function findOrganMembers(
  filters: OrganMemberFilters = {},
  pagination: PaginationInput = {},
  sort: SortInput = {},
): Promise<PaginatedResult<OrganMember>> {
  const { limit, offset } = applyPaginationDefaults(pagination);

  const where = {
    ...(filters.organ && { organ: filters.organ }),
    ...(filters.organType && { organType: filters.organType }),
    ...(filters.position && { position: filters.position }),
    ...(filters.name && { name: { contains: filters.name } }),
  };

  const orderBy = sort.sortBy
    ? { [sort.sortBy]: sort.order ?? 'asc' }
    : { startDate: 'desc' as const };

  const [data, total] = await Promise.all([
    prisma.organMember.findMany({ where, orderBy, take: limit, skip: offset }),
    prisma.organMember.count({ where }),
  ]);

  return { data, total, limit, offset };
}

export async function findOrganMemberById(
  id: string,
): Promise<OrganMember | null> {
  return prisma.organMember.findUnique({ where: { id } });
}
