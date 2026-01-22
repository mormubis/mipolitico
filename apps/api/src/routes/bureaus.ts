import { findBureauMemberById, findBureauMembers } from '@congress/database';

import { getCacheStrategy, setCacheHeaders } from '../middleware/cache.ts';
import { setPaginationHeaders } from '../middleware/pagination.ts';
import {
  bureauMemberSchema,
  errorSchema,
  paginationQuerySchema,
} from '../schemas/openapi.ts';
import { bureauQuerySchema } from '../schemas/query.ts';

import type { FastifyInstance } from 'fastify';

/**
 * Register bureau routes
 */
export function registerBureauRoutes(app: FastifyInstance): void {
  // GET /api/v1/bureaus - List bureau members with filtering, pagination, sorting
  app.get(
    '/api/v1/bureaus',
    {
      schema: {
        tags: ['bureaus'],
        summary: 'List bureau members',
        description:
          'Returns congressional bureau/leadership members with optional filtering by organ, position, or name.',
        querystring: {
          type: 'object',
          properties: {
            ...paginationQuerySchema,
            organ: {
              type: 'string',
              description: 'Filter by organ (e.g., Mesa del Congreso)',
            },
            position: { type: 'string', description: 'Filter by position' },
            name: {
              type: 'string',
              description: 'Filter by name (partial match)',
            },
          },
        },
        response: {
          200: {
            type: 'array',
            items: bureauMemberSchema,
            description:
              'List of bureau members. Check X-Total-Count, X-Page, and X-Per-Page headers for pagination info.',
          },
          400: errorSchema,
        },
      },
    },
    async (request, reply) => {
      // Parse and validate query parameters
      const query = bureauQuerySchema.parse(request.query);

      // Extract filters, pagination, and sorting
      const filters = {
        organ: query.organ,
        position: query.position,
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
      const result = await findBureauMembers(filters, pagination, sort);

      // Determine cache strategy based on most recent start date
      const mostRecentDate =
        result.data.length > 0 ? result.data[0].startDate : undefined;
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
    },
  );

  // GET /api/v1/bureaus/:id - Get single bureau member
  app.get(
    '/api/v1/bureaus/:id',
    {
      schema: {
        tags: ['bureaus'],
        summary: 'Get bureau member by ID',
        description: 'Returns a single bureau member with position details.',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Bureau member ID' },
          },
          required: ['id'],
        },
        response: {
          200: bureauMemberSchema,
          404: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      // Execute query
      const bureauMember = await findBureauMemberById(id);

      // Handle not found
      if (!bureauMember) {
        reply.status(404).send({
          error: 'Bureau member not found',
          status: 404,
        });
        return;
      }

      // Determine cache strategy based on start date
      const cacheStrategy = getCacheStrategy(bureauMember.startDate);
      setCacheHeaders(reply, cacheStrategy);

      // Set request ID header if provided
      const requestId = request.headers['x-request-id'];
      if (requestId) {
        reply.header('X-Request-ID', requestId);
      }

      // Return data directly
      return bureauMember;
    },
  );

  // GET /api/v1/schema/bureaus - Schema endpoint
  app.get('/api/v1/schema/bureaus', async (request, reply) => {
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
          description: 'Unique bureau member identifier',
        },
        { name: 'organ', type: 'string', description: 'Organ name' },
        { name: 'position', type: 'string', description: 'Position title' },
        { name: 'name', type: 'string', description: 'Member name' },
        { name: 'startDate', type: 'date', description: 'Start date' },
        { name: 'endDate', type: 'date', description: 'End date (nullable)' },
      ],
      filters: ['organ', 'position', 'name'],
      sortable: ['id', 'organ', 'position', 'name', 'startDate'],
    };
  });
}
