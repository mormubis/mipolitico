import { config as dotenvConfig } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildApp } from './app.ts';
import { config } from './config.ts';


// Load environment variables from .env file
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenvConfig({ path: path.join(__dirname, '../.env') });

/**
 * Start the API server
 */
async function start() {
  const app = await buildApp();

  try {
    await app.listen({
      host: config.host,
      port: config.port,
    });

    app.log.info(
      `Server listening on ${config.host}:${String(config.port)} (API version: ${config.apiVersion})`,
    );

    // Graceful shutdown handlers
    const gracefulShutdown = (signal: string) => {
      app.log.info(`Received ${signal}, shutting down gracefully...`);
      void app.close().then(() => {
        process.exit(0);
      });
    };

    process.on('SIGINT', () => {
      gracefulShutdown('SIGINT');
    });
    process.on('SIGTERM', () => {
      gracefulShutdown('SIGTERM');
    });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

void start();
