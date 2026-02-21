import { findInitiativeById, findInitiatives } from '@congress/database';

import { getCacheStrategy, setCacheHeaders } from '../middleware/cache.ts';
import { setPaginationHeaders } from '../middleware/pagination.ts';
import {
  errorSchema,
  initiativeSchema,
  paginationQuerySchema,
} from '../schemas/openapi.ts';
import { initiativeQuerySchema } from '../schemas/query.ts';

import type { FastifyInstance } from 'fastify';

/**
 * Register initiative routes
 */
export function registerInitiativeRoutes(app: FastifyInstance): void {
  // GET /api/v1/initiatives - List initiatives with filtering, pagination, sorting
  app.get(
    '/api/v1/initiatives',
    {
      schema: {
        tags: ['initiatives'],
        summary: 'List legislative initiatives',
        description:
          'Returns a paginated list of legislative initiatives with optional filtering by legislature, tipo, title, or enacted status.',
        querystring: {
          type: 'object',
          properties: {
            ...paginationQuerySchema,
            legislature: {
              type: 'integer',
              description: 'Filter by legislature number',
            },
            tipo: {
              type: 'string',
              description: 'Filter by initiative type',
            },
            title: {
              type: 'string',
              description: 'Filter by title (partial match)',
            },
            enacted: {
              type: 'string',
              enum: ['true', 'false'],
              description: 'Filter by enacted status',
            },
          },
        },
        response: {
          200: {
            type: 'array',
            items: initiativeSchema,
            description:
              'List of initiatives. Check X-Total-Count, X-Page, and X-Per-Page headers for pagination info.',
          },
          400: errorSchema,
        },
      },
    },
    async (request, reply) => {
      // Parse and validate query parameters
      const query = initiativeQuerySchema.parse(request.query);

      // Extract filters, pagination, and sorting
      const filters = {
        enacted: query.enacted,
        legislature: query.legislature,
        tipo: query.tipo,
        title: query.title,
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
      const result = await findInitiatives(filters, pagination, sort);

      // Determine cache strategy based on enacted date of first result
      const cacheStrategy = getCacheStrategy(
        result.data[0]?.enactedDate ?? undefined,
      );
      setCacheHeaders(reply, cacheStrategy);

      // Set pagination headers
      setPaginationHeaders(reply, result.total, result.limit, result.offset);

      // Set request ID header if provided
      const requestId = request.headers['x-request-id'];
      if (requestId) {
        reply.header('X-Request-ID', requestId);
      }

      // Return data directly (not wrapped)
      return result.data;
    },
  );

  // GET /api/v1/initiatives/:id - Get single initiative
  app.get(
    '/api/v1/initiatives/:id',
    {
      schema: {
        tags: ['initiatives'],
        summary: 'Get initiative by ID',
        description: 'Returns a single legislative initiative.',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Initiative ID' },
          },
          required: ['id'],
        },
        response: {
          200: initiativeSchema,
          404: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      // Execute query
      const initiative = await findInitiativeById(id);

      // Handle not found
      if (!initiative) {
        reply.status(404).send({
          error: 'Initiative not found',
          status: 404,
        });
        return;
      }

      // Determine cache strategy based on enacted date
      const cacheStrategy = getCacheStrategy(
        initiative.enactedDate ?? undefined,
      );
      setCacheHeaders(reply, cacheStrategy);

      // Set request ID header if provided
      const requestId = request.headers['x-request-id'];
      if (requestId) {
        reply.header('X-Request-ID', requestId);
      }

      // Return data directly
      return initiative;
    },
  );

  // GET /api/v1/schema/initiatives - Schema endpoint
  app.get('/api/v1/schema/initiatives', async (request, reply) => {
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
          description: 'Unique initiative identifier',
        },
        {
          name: 'legislature',
          type: 'integer',
          description: 'Legislature number',
        },
        { name: 'tipo', type: 'string', description: 'Initiative type' },
        {
          name: 'title',
          type: 'string',
          description: 'Full title of the initiative',
        },
        {
          name: 'bulletinNumber',
          type: 'string',
          description: 'Official gazette bulletin number',
        },
        {
          name: 'bulletinDate',
          type: 'date',
          description: 'Gazette publication date',
        },
        {
          name: 'enactedDate',
          type: 'date',
          description: 'Date enacted into law (null if pending)',
        },
        {
          name: 'pdfUrl',
          type: 'string',
          description: 'URL to official PDF',
        },
      ],
      filters: ['legislature', 'tipo', 'title', 'enacted'],
      sortable: ['id', 'legislature', 'tipo', 'bulletinDate', 'enactedDate'],
    };
  });
}
