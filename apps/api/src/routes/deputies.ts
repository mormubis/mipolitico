import { findDeputies, findDeputyById } from '@congress/database';

import { setCacheHeaders } from '../middleware/cache.ts';
import { setPaginationHeaders } from '../middleware/pagination.ts';
import { deputyQuerySchema } from '../schemas/query.ts';

import type { FastifyInstance } from 'fastify';

/**
 * Register deputy routes
 */
export function registerDeputyRoutes(app: FastifyInstance): void {
  // GET /api/v1/deputies - List deputies with filtering, pagination, sorting
  app.get('/api/v1/deputies', async (request, reply) => {
    // Parse and validate query parameters
    const query = deputyQuerySchema.parse(request.query);

    // Extract filters, pagination, and sorting
    const filters = {
      legislature: query.legislature,
      constituency: query.constituency,
      parliamentaryGroup: query.parliamentaryGroup,
      name: query.name,
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
    const result = await findDeputies(filters, pagination, sort);

    // Set cache headers (deputies are relatively stable - use historical strategy)
    setCacheHeaders(reply, 'historical');

    // Set pagination headers
    setPaginationHeaders(reply, result.total, result.limit, result.offset);

    // Set request ID header if provided
    const requestId = request.headers['x-request-id'];
    if (requestId) {
      reply.header('X-Request-ID', requestId);
    }

    // Return data directly (not wrapped)
    return result.data;
  });

  // GET /api/v1/deputies/:id - Get single deputy
  app.get('/api/v1/deputies/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    // Execute query
    const deputy = await findDeputyById(id);

    // Handle not found
    if (!deputy) {
      reply.status(404).send({
        error: 'Deputy not found',
        status: 404,
      });
      return;
    }

    // Set cache headers (deputies are relatively stable - use historical strategy)
    setCacheHeaders(reply, 'historical');

    // Set request ID header if provided
    const requestId = request.headers['x-request-id'];
    if (requestId) {
      reply.header('X-Request-ID', requestId);
    }

    // Return data directly
    return deputy;
  });

  // GET /api/v1/schema/deputies - Schema endpoint
  app.get('/api/v1/schema/deputies', async (request, reply) => {
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
        { name: 'id', type: 'string', description: 'Unique deputy identifier' },
        {
          name: 'legislature',
          type: 'number',
          description: 'Legislature number',
        },
        {
          name: 'constituency',
          type: 'string',
          description: 'Electoral constituency',
        },
        {
          name: 'parliamentaryGroup',
          type: 'string',
          description: 'Parliamentary group',
        },
        { name: 'person', type: 'object', description: 'Person information' },
      ],
      filters: ['legislature', 'constituency', 'parliamentaryGroup', 'name'],
      sortable: [
        'id',
        'legislature',
        'constituency',
        'parliamentaryGroup',
        'person.name',
      ],
    };
  });
}
