import { prisma } from '@congress/database';

import type { FastifyInstance } from 'fastify';

/**
 * Register health check routes
 */
export function registerHealthRoutes(app: FastifyInstance): void {
  // Basic health check
  app.get('/health', () => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  });

  // Database health check
  app.get('/health/db', async () => {
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
  });
}
