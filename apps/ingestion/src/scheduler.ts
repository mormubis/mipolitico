import Bree from 'bree';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Bree Job Scheduler Instance
 *
 * Bree is a job scheduler that uses worker threads to run jobs in isolation.
 *
 * Worker Thread Model:
 * - Each job runs in its own worker thread (isolated from main process)
 * - Worker threads share memory more efficiently than child processes
 * - Jobs can be scheduled with cron expressions or intervals
 * - Workers are automatically reused by default (pooling enabled)
 *
 * Job Registration Pattern:
 * - Jobs are stored in the src/jobs/ directory
 * - Each job is a separate file that exports a function
 * - Job metadata (name, schedule, enabled status) is managed in src/jobs/index.ts
 * - Jobs are registered with Bree using the addJob() or start() method
 */

// Convert import.meta.url to file path and resolve jobs directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const jobsDirectory = path.join(__dirname, 'jobs');

/**
 * Bree scheduler instance
 * Configured with:
 * - root: Path to jobs directory (src/jobs/)
 * - Worker thread pooling enabled by default
 * - Graceful shutdown on SIGTERM/SIGINT
 */
const scheduler = new Bree({
  root: jobsDirectory,
  // Jobs will be registered from the jobs/index.ts registry
  jobs: [],
  // Default job options (can be overridden per job)
  defaultExtension: 'ts',
  // Error handling
  errorHandler: (error, workerMetadata) => {
    console.error(`[Scheduler] Job "${workerMetadata.name}" error:`, error);
  },
  workerMessageHandler: (data) => {
    console.log(`[Scheduler] Job "${data.name}" message:`, data.message);
  },
});

/**
 * Graceful Shutdown Handler
 *
 * Ensures that:
 * 1. All running jobs complete gracefully
 * 2. Worker threads are properly terminated
 * 3. No orphaned processes remain after exit
 */
function setupGracefulShutdown(): void {
  const shutdown = async (signal: string) => {
    console.log(
      `\n[Scheduler] Received ${signal}, shutting down gracefully...`,
    );

    try {
      await scheduler.stop();
      console.log('[Scheduler] All jobs stopped successfully');
      process.exit(0);
    } catch (error) {
      console.error('[Scheduler] Error during shutdown:', error);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
}

// Register shutdown handlers immediately
setupGracefulShutdown();

export { scheduler };
