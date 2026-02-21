import { prisma } from '../client.ts';
import { VotingInputSchema } from '../validation/index.ts';
import { logValidationError } from '../validation/logger.ts';

function parseVotingDate(dateStr: string): Date | null {
  // Format: "DD/MM/YYYY" -> Date
  const parts = dateStr.split('/').map(Number);
  const day = parts[0];
  const month = parts[1];
  const year = parts[2];
  if (
    day === undefined ||
    month === undefined ||
    year === undefined ||
    isNaN(day) ||
    isNaN(month) ||
    isNaN(year)
  )
    {return null;}
  return new Date(year, month - 1, day);
}

interface VotingSessionGroup {
  legislature: number;
  sessionNumber: number;
  votingNumber: number;
  votingDate: Date | null;
  title: string;
  description: string;
  byAssent: boolean;
  totalPresent: number;
  totalFor: number;
  totalAgainst: number;
  totalAbstention: number;
  totalNoVote: number;
  sourceUrl: string;
  votes: {
    deputySeat: string;
    deputyName: string;
    deputyGroup: string;
    vote: string;
  }[];
}

export async function upsertVotingRecords(
  records: unknown[],
): Promise<{ sessions: number; votes: number; skipped: number }> {
  let skipped = 0;

  // Validate and group by session
  const sessionMap = new Map<string, VotingSessionGroup>();

  for (const record of records) {
    const result = VotingInputSchema.safeParse(record);
    if (!result.success) {
      logValidationError('votes', record, result.error);
      skipped++;
      continue;
    }

    const data = result.data;
    const sessionKey = `${String(data.LEGISLATURE)}-${String(data.SESSION_NUMBER)}-${String(data.VOTING_NUMBER)}`;

    if (!sessionMap.has(sessionKey)) {
      sessionMap.set(sessionKey, {
        legislature: data.LEGISLATURE,
        sessionNumber: data.SESSION_NUMBER,
        votingNumber: data.VOTING_NUMBER,
        votingDate: parseVotingDate(data.VOTING_DATE),
        title: data.VOTING_TITLE,
        description: data.VOTING_DESCRIPTION,
        byAssent: data.BY_ASSENT,
        totalPresent: data.TOTAL_PRESENT,
        totalFor: data.TOTAL_FOR,
        totalAgainst: data.TOTAL_AGAINST,
        totalAbstention: data.TOTAL_ABSTENTION,
        totalNoVote: data.TOTAL_NO_VOTE,
        sourceUrl: data.JSON_URL,
        votes: [],
      });
    }

    const sessionGroup = sessionMap.get(sessionKey);
    if (sessionGroup) {
      sessionGroup.votes.push({
        deputySeat: data.DEPUTY_SEAT,
        deputyName: data.DEPUTY_NAME,
        deputyGroup: data.DEPUTY_GROUP,
        vote: data.VOTE,
      });
    }
  }

  let sessionsCount = 0;
  let votesCount = 0;

  // Batch UPSERT sessions and votes in transaction
  await prisma.$transaction(async (tx) => {
    for (const session of sessionMap.values()) {
      if (!session.votingDate) {
        skipped++;
        continue;
      }

      // Upsert voting session
      const dbSession = await tx.votingSession.upsert({
        where: {
          legislature_sessionNumber_votingNumber: {
            legislature: session.legislature,
            sessionNumber: session.sessionNumber,
            votingNumber: session.votingNumber,
          },
        },
        create: {
          legislature: session.legislature,
          sessionNumber: session.sessionNumber,
          votingNumber: session.votingNumber,
          votingDate: session.votingDate,
          title: session.title,
          description: session.description,
          byAssent: session.byAssent,
          totalPresent: session.totalPresent,
          totalFor: session.totalFor,
          totalAgainst: session.totalAgainst,
          totalAbstention: session.totalAbstention,
          totalNoVote: session.totalNoVote,
          sourceUrl: session.sourceUrl,
        },
        update: {
          votingDate: session.votingDate,
          title: session.title,
          description: session.description,
          byAssent: session.byAssent,
          totalPresent: session.totalPresent,
          totalFor: session.totalFor,
          totalAgainst: session.totalAgainst,
          totalAbstention: session.totalAbstention,
          totalNoVote: session.totalNoVote,
          sourceUrl: session.sourceUrl,
        },
      });

      sessionsCount++;

      // Upsert individual votes
      for (const vote of session.votes) {
        await tx.vote.upsert({
          where: {
            sessionId_deputySeat: {
              sessionId: dbSession.id,
              deputySeat: vote.deputySeat,
            },
          },
          create: {
            sessionId: dbSession.id,
            deputySeat: vote.deputySeat,
            deputyName: vote.deputyName,
            deputyGroup: vote.deputyGroup,
            vote: vote.vote,
          },
          update: {
            deputyName: vote.deputyName,
            deputyGroup: vote.deputyGroup,
            vote: vote.vote,
          },
        });
        votesCount++;
      }
    }
  });

  return { sessions: sessionsCount, votes: votesCount, skipped };
}
