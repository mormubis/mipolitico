import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import Fastify from 'fastify';

import { config } from './config.ts';
import { errorHandler } from './middleware/error.ts';
import { registerBureauRoutes } from './routes/bureaus.ts';
import { registerDeputyRoutes } from './routes/deputies.ts';
import { registerHealthRoutes } from './routes/health.ts';
import { registerSpeechRoutes } from './routes/speeches.ts';
import { registerVoteRoutes } from './routes/votes.ts';

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

  // Register error handler (must be registered first to catch all errors)
  app.setErrorHandler(errorHandler);

  // Register health routes (not under /api/v1)
  registerHealthRoutes(app);

  // Register entity routes (all under /api/v1)
  registerDeputyRoutes(app);
  registerVoteRoutes(app);
  registerSpeechRoutes(app);
  registerBureauRoutes(app);

  return app;
}
