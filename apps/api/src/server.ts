import { buildApp } from './app.ts';
import { config } from './config.ts';

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
