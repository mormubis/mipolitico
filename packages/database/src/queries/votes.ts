import { prisma } from '../client.ts';
import { applyPaginationDefaults } from './index.ts';

import type { PaginatedResult, PaginationInput, SortInput } from './index.ts';
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

/**
 * Returns a Set of "legislature-sessionNumber" strings for all voting sessions
 * already in the database. Used by the voting pipeline to skip re-fetching
 * already-processed sessions (watermark).
 *
 * Fetches the full table (no pagination) because the complete set is required
 * for watermark filtering. At ~365 sessions/year this is acceptable; revisit
 * if session volume grows significantly.
 */
export async function getExistingSessionKeys(): Promise<Set<string>> {
  const sessions = await prisma.votingSession.findMany({
    select: { legislature: true, sessionNumber: true },
  });

  return new Set(
    sessions.map((s) => `${String(s.legislature)}-${String(s.sessionNumber)}`),
  );
}
