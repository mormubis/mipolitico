import { prisma } from '@congress/database';

import type { FastifyInstance } from 'fastify';

/**
 * Register health check routes
 */
export function registerHealthRoutes(app: FastifyInstance): void {
  // Basic health check
  app.get(
    '/health',
    {
      schema: {
        tags: ['health'],
        summary: 'Health check',
        description: 'Basic server health check endpoint',
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['ok'] },
              timestamp: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
    () => {
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
      };
    },
  );

  // Database health check
  app.get(
    '/health/db',
    {
      schema: {
        tags: ['health'],
        summary: 'Database health check',
        description: 'Checks database connection status',
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['ok', 'error'] },
              database: { type: 'string', enum: ['connected', 'disconnected'] },
            },
          },
        },
      },
    },
    async () => {
      try {
        // Test database connection with a simple query
        await prisma.$queryRaw`SELECT 1`;
        return {
          status: 'ok',
          database: 'connected',
        };
      } catch {
        return {
          status: 'error',
          database: 'disconnected',
        };
      }
    },
  );
}
