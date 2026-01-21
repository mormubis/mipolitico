import { prisma } from '../client.ts';
import {
  
  
  
  applyPaginationDefaults
} from './index.ts';

import type {PaginatedResult, PaginationInput, SortInput} from './index.ts';
import type { Vote, VotingSession } from '@prisma/client';

export interface VoteFilters {
  legislature?: number;
  sessionNumber?: number;
  dateFrom?: Date;
  dateTo?: Date;
}

export type VotingSessionWithVotes = VotingSession & { votes: Vote[] };

export async function findVotingSessions(
  filters: VoteFilters = {},
  pagination: PaginationInput = {},
  sort: SortInput = {},
): Promise<PaginatedResult<VotingSession>> {
  const { limit, offset } = applyPaginationDefaults(pagination);

  const where = {
    ...(filters.legislature && { legislature: filters.legislature }),
    ...(filters.sessionNumber && { sessionNumber: filters.sessionNumber }),
    ...((filters.dateFrom ?? filters.dateTo) && {
      votingDate: {
        ...(filters.dateFrom && { gte: filters.dateFrom }),
        ...(filters.dateTo && { lte: filters.dateTo }),
      },
    }),
  };

  const orderBy = sort.sortBy
    ? { [sort.sortBy]: sort.order ?? 'asc' }
    : { votingDate: 'desc' as const };

  const [data, total] = await Promise.all([
    prisma.votingSession.findMany({
      where,
      orderBy,
      take: limit,
      skip: offset,
    }),
    prisma.votingSession.count({ where }),
  ]);

  return { data, total, limit, offset };
}

export async function findVotingSession(
  legislature: number,
  sessionNumber: number,
  votingNumber: number,
): Promise<VotingSessionWithVotes | null> {
  return prisma.votingSession.findUnique({
    where: {
      legislature_sessionNumber_votingNumber: {
        legislature,
        sessionNumber,
        votingNumber,
      },
    },
    include: { votes: true },
  });
}
