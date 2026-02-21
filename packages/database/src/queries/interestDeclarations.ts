import { prisma } from '../client.ts';
import { applyPaginationDefaults } from './index.ts';

import type { PaginatedResult, PaginationInput, SortInput } from './index.ts';
import type {
  BankAccount,
  IncomeSource,
  InterestDeclaration,
  MovableAsset,
  ProfessionalActivity,
  RealEstateAsset,
  Security,
} from '@prisma/client';

type DeclarationWithChildren = InterestDeclaration & {
  bankAccounts: BankAccount[];
  incomeSources: IncomeSource[];
  movableAssets: MovableAsset[];
  professionalActivities: ProfessionalActivity[];
  realEstateAssets: RealEstateAsset[];
  securities: Security[];
};

const INCLUDE_CHILDREN = {
  bankAccounts: true,
  incomeSources: true,
  movableAssets: true,
  professionalActivities: true,
  realEstateAssets: true,
  securities: true,
} as const;

async function findInterestDeclarations(
  filters: InterestDeclarationFilters = {},
  pagination: PaginationInput = {},
  sort: SortInput = {},
): Promise<PaginatedResult<DeclarationWithChildren>> {
  const { limit, offset } = applyPaginationDefaults(pagination);

  const where = {
    ...(filters.deputyId && { deputyId: filters.deputyId }),
    ...(filters.year && { year: filters.year }),
  };

  const orderBy = sort.sortBy
    ? { [sort.sortBy]: sort.order ?? 'asc' }
    : { year: 'desc' as const };

  const [data, total] = await Promise.all([
    prisma.interestDeclaration.findMany({
      include: INCLUDE_CHILDREN,
      orderBy,
      skip: offset,
      take: limit,
      where,
    }),
    prisma.interestDeclaration.count({ where }),
  ]);

  return { data, total, limit, offset };
}

async function findInterestDeclarationById(
  id: string,
): Promise<DeclarationWithChildren | null> {
  return prisma.interestDeclaration.findUnique({
    include: INCLUDE_CHILDREN,
    where: { id },
  });
}

export interface InterestDeclarationFilters {
  deputyId?: string;
  year?: number;
}

export { findInterestDeclarationById, findInterestDeclarations };
