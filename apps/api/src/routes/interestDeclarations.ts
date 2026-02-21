import {
  findInterestDeclarationById,
  findInterestDeclarations,
} from '@congress/database';

import { setCacheHeaders } from '../middleware/cache.ts';
import { setPaginationHeaders } from '../middleware/pagination.ts';
import {
  errorSchema,
  interestDeclarationSchema,
  paginationQuerySchema,
} from '../schemas/openapi.ts';
import { interestDeclarationQuerySchema } from '../schemas/query.ts';

import type { FastifyInstance } from 'fastify';

/**
 * Register interest declaration routes
 */
export function registerInterestDeclarationRoutes(app: FastifyInstance): void {
  // GET /api/v1/interest-declarations - List interest declarations with filtering and pagination
  app.get(
    '/api/v1/interest-declarations',
    {
      schema: {
        tags: ['interest-declarations'],
        summary: 'List interest declarations',
        description:
          'Returns deputy financial interest declarations with nested asset details.',
        querystring: {
          type: 'object',
          properties: {
            deputyId: { type: 'string', description: 'Filter by deputy ID' },
            year: { type: 'integer', description: 'Filter by year' },
            ...paginationQuerySchema,
          },
        },
        response: {
          200: {
            type: 'array',
            items: interestDeclarationSchema,
            description:
              'List of interest declarations. Check X-Total-Count, X-Page, and X-Per-Page headers for pagination info.',
          },
          400: errorSchema,
        },
      },
    },
    async (request, reply) => {
      // Parse and validate query parameters
      const query = interestDeclarationQuerySchema.parse(request.query);

      // Extract filters, pagination, and sorting
      const filters = {
        deputyId: query.deputyId,
        year: query.year,
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
      const result = await findInterestDeclarations(filters, pagination, sort);

      // Declarations are immutable historical records
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
    },
  );

  // GET /api/v1/interest-declarations/:id - Get single interest declaration
  app.get(
    '/api/v1/interest-declarations/:id',
    {
      schema: {
        tags: ['interest-declarations'],
        summary: 'Get interest declaration by ID',
        description: 'Returns a single deputy financial interest declaration.',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Interest declaration ID' },
          },
          required: ['id'],
        },
        response: {
          200: interestDeclarationSchema,
          404: errorSchema,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      // Execute query
      const declaration = await findInterestDeclarationById(id);

      // Handle not found
      if (!declaration) {
        reply.status(404).send({
          error: 'Interest declaration not found',
          status: 404,
        });
        return;
      }

      // Declarations are immutable historical records
      setCacheHeaders(reply, 'historical');

      // Set request ID header if provided
      const requestId = request.headers['x-request-id'];
      if (requestId) {
        reply.header('X-Request-ID', requestId);
      }

      // Return data directly
      return declaration;
    },
  );
}
