import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
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

  // Register OpenAPI documentation
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Spanish Congress Open Data API',
        description:
          'Public API for accessing Spanish Congress data including deputies, votes, speeches, and bureau members.',
        version: '1.0.0',
        contact: {
          name: 'API Support',
          email: 'support@example.com',
        },
        license: {
          name: 'MIT',
        },
      },
      servers: [
        { url: 'http://localhost:3000', description: 'Development server' },
      ],
      tags: [
        {
          name: 'deputies',
          description: 'Deputy (member of congress) endpoints',
        },
        {
          name: 'votes',
          description: 'Voting session and individual vote endpoints',
        },
        {
          name: 'speeches',
          description: 'Congressional speech/intervention endpoints',
        },
        { name: 'bureaus', description: 'Bureau member endpoints' },
        { name: 'health', description: 'Health check endpoints' },
      ],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
    },
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
