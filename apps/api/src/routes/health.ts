import { getScraperMetadata, prisma } from '@congress/database';

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

  // Data freshness monitoring
  app.get(
    '/health/data-freshness',
    {
      schema: {
        tags: ['health'],
        summary: 'Data freshness check',
        description: 'Checks scraper data freshness and alerts on stale data',
        response: {
          200: {
            type: 'object',
            properties: {
              overall: { type: 'string', enum: ['fresh', 'degraded', 'stale'] },
              scrapers: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    type: { type: 'string' },
                    status: {
                      type: 'string',
                      enum: ['fresh', 'stale', 'never_run'],
                    },
                    lastSuccessfulRun: { type: 'string', nullable: true },
                    hoursSinceUpdate: { type: 'number', nullable: true },
                    lastError: { type: 'string', nullable: true },
                  },
                },
              },
            },
          },
          503: {
            type: 'object',
            properties: {
              overall: { type: 'string', enum: ['stale'] },
              scrapers: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    type: { type: 'string' },
                    status: {
                      type: 'string',
                      enum: ['fresh', 'stale', 'never_run'],
                    },
                    lastSuccessfulRun: { type: 'string', nullable: true },
                    hoursSinceUpdate: { type: 'number', nullable: true },
                    lastError: { type: 'string', nullable: true },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const metadata = await getScraperMetadata();
      const now = new Date();

      // Calculate freshness for each scraper
      const scrapers = metadata.map((scraper) => {
        let status: 'fresh' | 'stale' | 'never_run';
        let hoursSinceUpdate: number | null = null;

        if (!scraper.lastSuccessfulRun) {
          status = 'never_run';
        } else {
          const lastRun = new Date(scraper.lastSuccessfulRun);
          const hoursDiff =
            (now.getTime() - lastRun.getTime()) / (1000 * 60 * 60);
          hoursSinceUpdate = Math.round(hoursDiff * 10) / 10; // Round to 1 decimal

          if (hoursDiff <= 24) {
            status = 'fresh';
          } else {
            status = 'stale';
          }
        }

        return {
          type: scraper.scraperType,
          status,
          lastSuccessfulRun: scraper.lastSuccessfulRun
            ? scraper.lastSuccessfulRun.toISOString()
            : null,
          hoursSinceUpdate,
          lastError: scraper.lastError,
        };
      });

      // Determine overall status
      let overall: 'fresh' | 'degraded' | 'stale';
      const staleCount = scrapers.filter((s) => s.status === 'stale').length;
      const neverRunCount = scrapers.filter(
        (s) => s.status === 'never_run',
      ).length;

      if (staleCount === 0 && neverRunCount === 0) {
        overall = 'fresh';
      } else if (staleCount > 0) {
        overall = 'stale';
      } else {
        overall = 'degraded'; // Some never run, but none stale
      }

      const response = {
        overall,
        scrapers,
      };

      // Return 503 if data is stale (monitoring alerts should trigger)
      if (overall === 'stale') {
        reply.code(503);
      }

      return response;
    },
  );
}
