import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import Fastify from 'fastify';

import { config } from './config.ts';

import type { FastifyInstance } from 'fastify';

/**
 * Build and configure the Fastify application
 */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.logLevel,
    },
  });

  // Register security plugins
  await app.register(helmet, {
    contentSecurityPolicy: false, // Allow for API usage
  });

  await app.register(cors, {
    origin: true, // Permissive CORS for public API
  });

  return app;
}
