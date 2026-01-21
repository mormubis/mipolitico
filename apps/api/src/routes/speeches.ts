import { findSpeechById, findSpeeches } from '@congress/database';

import { getCacheStrategy, setCacheHeaders } from '../middleware/cache.ts';
import { setPaginationHeaders } from '../middleware/pagination.ts';
import { speechQuerySchema } from '../schemas/query.ts';

import type { FastifyInstance } from 'fastify';

/**
 * Register speech routes
 */
export function registerSpeechRoutes(app: FastifyInstance): void {
  // GET /api/v1/speeches - List speeches with filtering, pagination, sorting
  app.get('/api/v1/speeches', async (request, reply) => {
    // Parse and validate query parameters
    const query = speechQuerySchema.parse(request.query);

    // Extract filters, pagination, and sorting
    const filters = {
      personId: query.personId,
      speakerName: query.speakerName,
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
    const result = await findSpeeches(filters, pagination, sort);

    // Determine cache strategy based on most recent speech date
    const mostRecentDate =
      result.data.length > 0 ? result.data[0].sessionDate : undefined;
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

  // GET /api/v1/speeches/:id - Get single speech
  app.get('/api/v1/speeches/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    // Execute query
    const speech = await findSpeechById(id);

    // Handle not found
    if (!speech) {
      reply.status(404).send({
        error: 'Speech not found',
        status: 404,
      });
      return;
    }

    // Determine cache strategy based on speech date
    const cacheStrategy = getCacheStrategy(speech.sessionDate);
    setCacheHeaders(reply, cacheStrategy);

    // Set request ID header if provided
    const requestId = request.headers['x-request-id'];
    if (requestId) {
      reply.header('X-Request-ID', requestId);
    }

    // Return data directly
    return speech;
  });

  // GET /api/v1/schema/speeches - Schema endpoint
  app.get('/api/v1/schema/speeches', async (request, reply) => {
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
        { name: 'id', type: 'string', description: 'Unique speech identifier' },
        {
          name: 'personId',
          type: 'string',
          description: 'Person identifier',
        },
        { name: 'speakerName', type: 'string', description: 'Speaker name' },
        { name: 'sessionDate', type: 'date', description: 'Session date' },
        {
          name: 'sessionNumber',
          type: 'number',
          description: 'Session number',
        },
        { name: 'content', type: 'string', description: 'Speech content' },
      ],
      filters: ['personId', 'speakerName', 'dateFrom', 'dateTo'],
      sortable: ['id', 'sessionDate', 'sessionNumber', 'speakerName'],
    };
  });
}
