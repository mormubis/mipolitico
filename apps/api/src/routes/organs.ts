import { findOrganMemberById, findOrganMembers } from '@congress/database';

import { getCacheStrategy, setCacheHeaders } from '../middleware/cache.ts';
import { setPaginationHeaders } from '../middleware/pagination.ts';
import {
  errorSchema,
  organMemberSchema,
  paginationQuerySchema,
} from '../schemas/openapi.ts';
import { organQuerySchema } from '../schemas/query.ts';

import type { FastifyInstance } from 'fastify';

/**
 * Register organ routes
 */
export function registerOrganRoutes(app: FastifyInstance): void {
  // GET /api/v1/organs - List organ members with filtering, pagination, sorting
  app.get(
    '/api/v1/organs',
    {
      schema: {
        tags: ['organs'],
        summary: 'List organ members',
        description:
          'Returns congressional organ members with optional filtering by organ, organType, position, or name.',
        querystring: {
          type: 'object',
          properties: {
            ...paginationQuerySchema,
            organ: {
              type: 'string',
              description: 'Filter by organ (e.g., Mesa del Congreso)',
            },
            organType: {
              type: 'string',
              enum: [
                'MESA',
                'COMISION',
                'JUNTA_PORTAVOCES',
                'DIPUTACION_PERMANENTE',
                'OTHER',
              ],
              description: 'Filter by organ type',
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
            items: organMemberSchema,
            description:
              'List of organ members. Check X-Total-Count, X-Page, and X-Per-Page headers for pagination info.',
          },
          400: errorSchema,
        },
      },
    },
    async (request, reply) => {
      // Parse and validate query parameters
      const query = organQuerySchema.parse(request.query);

      // Extract filters, pagination, and sorting
      const filters = {
        organ: query.organ,
        organType: query.organType,
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
      const result = await findOrganMembers(filters, pagination, sort);

      // Determine cache strategy based on most recent start date
      const firstItem = result.data[0];
      const mostRecentDate =
        result.data.length > 0 && firstItem ? firstItem.startDate : undefined;
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

  // GET /api/v1/organs/:id - Get single organ member
  app.get(
    '/api/v1/organs/:id',
    {
      schema: {
        tags: ['organs'],
        summary: 'Get organ member by ID',
        description: 'Returns a single organ member with position details.',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Organ member ID' },
          },
          required: ['id'],
        },
        response: {
          200: organMemberSchema,
          404: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      // Execute query
      const organMember = await findOrganMemberById(id);

      // Handle not found
      if (!organMember) {
        reply.status(404).send({
          error: 'Organ member not found',
          status: 404,
        });
        return;
      }

      // Determine cache strategy based on start date
      const cacheStrategy = getCacheStrategy(organMember.startDate);
      setCacheHeaders(reply, cacheStrategy);

      // Set request ID header if provided
      const requestId = request.headers['x-request-id'];
      if (requestId) {
        reply.header('X-Request-ID', requestId);
      }

      // Return data directly
      return organMember;
    },
  );

  // GET /api/v1/schema/organs - Schema endpoint
  app.get('/api/v1/schema/organs', async (request, reply) => {
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
          description: 'Unique organ member identifier',
        },
        { name: 'organ', type: 'string', description: 'Organ name' },
        { name: 'organType', type: 'string', description: 'Organ type' },
        { name: 'position', type: 'string', description: 'Position title' },
        { name: 'name', type: 'string', description: 'Member name' },
        { name: 'startDate', type: 'date', description: 'Start date' },
        { name: 'endDate', type: 'date', description: 'End date (nullable)' },
      ],
      filters: ['organ', 'organType', 'position', 'name'],
      sortable: ['id', 'organ', 'organType', 'position', 'name', 'startDate'],
    };
  });
}
