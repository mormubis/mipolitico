import { findVotingSession, findVotingSessions } from '@congress/database';

import { getCacheStrategy, setCacheHeaders } from '../middleware/cache.ts';
import { setPaginationHeaders } from '../middleware/pagination.ts';
import { voteQuerySchema } from '../schemas/query.ts';

import type { FastifyInstance } from 'fastify';

/**
 * Register vote routes
 */
export function registerVoteRoutes(app: FastifyInstance): void {
  // GET /api/v1/votes - List voting sessions with filtering, pagination, sorting
  app.get('/api/v1/votes', async (request, reply) => {
    // Parse and validate query parameters
    const query = voteQuerySchema.parse(request.query);

    // Extract filters, pagination, and sorting
    const filters = {
      legislature: query.legislature,
      sessionNumber: query.sessionNumber,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    };

    // Handle page-based pagination (convert to offset)
    const offset = query.page ? (query.page - 1) * query.limit : query.offset;

    const pagination = {
      limit: query.limit,
      offset,
    };

    const sort = {
      sortBy: query.sort,
      order: query.order,
    };

    // Execute query
    const result = await findVotingSessions(filters, pagination, sort);

    // Determine cache strategy based on most recent vote date
    const mostRecentDate =
      result.data.length > 0 ? result.data[0].votingDate : undefined;
    const cacheStrategy = getCacheStrategy(mostRecentDate);
    setCacheHeaders(reply, cacheStrategy);

    // Set pagination headers
    setPaginationHeaders(reply, result.total, result.limit, result.offset);

    // Set request ID header if provided
    const requestId = request.headers['x-request-id'];
    if (requestId) {
      reply.header('X-Request-ID', requestId);
    }

    // Return data directly
    return result.data;
  });

  // GET /api/v1/votes/:legislature/:sessionNumber/:votingNumber - Get specific vote
  app.get(
    '/api/v1/votes/:legislature/:sessionNumber/:votingNumber',
    async (request, reply) => {
      const { legislature, sessionNumber, votingNumber } = request.params as {
        legislature: string;
        sessionNumber: string;
        votingNumber: string;
      };

      // Parse parameters as numbers
      const legislatureNum = parseInt(legislature, 10);
      const sessionNumberNum = parseInt(sessionNumber, 10);
      const votingNumberNum = parseInt(votingNumber, 10);

      // Execute query
      const votingSession = await findVotingSession(
        legislatureNum,
        sessionNumberNum,
        votingNumberNum,
      );

      // Handle not found
      if (!votingSession) {
        reply.status(404).send({
          error: 'Voting session not found',
          status: 404,
        });
        return;
      }

      // Determine cache strategy based on vote date
      const cacheStrategy = getCacheStrategy(votingSession.votingDate);
      setCacheHeaders(reply, cacheStrategy);

      // Set request ID header if provided
      const requestId = request.headers['x-request-id'];
      if (requestId) {
        reply.header('X-Request-ID', requestId);
      }

      // Return data directly
      return votingSession;
    },
  );

  // GET /api/v1/schema/votes - Schema endpoint
  app.get('/api/v1/schema/votes', async (request, reply) => {
    // Set cache headers (schema is static - use historical strategy)
    setCacheHeaders(reply, 'historical');

    // Set request ID header if provided
    const requestId = request.headers['x-request-id'];
    if (requestId) {
      reply.header('X-Request-ID', requestId);
    }

    // Return field metadata
    return {
      fields: [
        {
          name: 'id',
          type: 'string',
          description: 'Unique voting session identifier',
        },
        {
          name: 'legislature',
          type: 'number',
          description: 'Legislature number',
        },
        {
          name: 'sessionNumber',
          type: 'number',
          description: 'Session number',
        },
        {
          name: 'votingNumber',
          type: 'number',
          description: 'Voting number',
        },
        { name: 'votingDate', type: 'date', description: 'Date of vote' },
        { name: 'title', type: 'string', description: 'Voting title' },
        { name: 'votesFor', type: 'number', description: 'Votes in favor' },
        { name: 'votesAgainst', type: 'number', description: 'Votes against' },
        {
          name: 'abstentions',
          type: 'number',
          description: 'Number of abstentions',
        },
        { name: 'result', type: 'string', description: 'Voting result' },
        { name: 'votes', type: 'array', description: 'Individual votes' },
      ],
      filters: ['legislature', 'sessionNumber', 'dateFrom', 'dateTo'],
      sortable: ['legislature', 'sessionNumber', 'votingNumber', 'votingDate'],
    };
  });
}
