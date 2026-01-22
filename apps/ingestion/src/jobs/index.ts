/**
 * Job Registry
 *
 * Central registry for all scheduled jobs managed by Bree.
 * Each job entry defines metadata for a scraper that should run on a schedule.
 */

/**
 * Job metadata structure
 */
export interface JobMetadata {
  /** Unique job identifier (matches job file name without extension) */
  name: string;
  /** Path to job file relative to jobs directory */
  path: string;
  /** Whether this job is enabled for scheduling */
  enabled: boolean;
  /** Cron expression defining when the job runs (e.g., "0 2 * * *" for 2:00 AM UTC daily) */
  cron: string;
}

/**
 * Registry of all available jobs
 *
 * Jobs are defined here but implemented in separate files in the jobs/ directory.
 * When a job is enabled, Bree will load and schedule it according to its configuration.
 *
 * Cron schedule notes:
 * - Deputies job: "0 2 * * *" = 2:00 AM UTC daily
 * - Voting job: "0 3 * * *" = 3:00 AM UTC daily
 * - Staggered 1-hour offset prevents concurrent database writes
 */
export const JOBS: JobMetadata[] = [
  {
    name: 'deputies',
    path: './deputies.ts',
    enabled: true,
    cron: '0 2 * * *', // 2:00 AM UTC daily
  },
  {
    name: 'voting',
    path: './voting.ts',
    enabled: true,
    cron: '0 3 * * *', // 3:00 AM UTC daily (1 hour after deputies)
  },
];

/**
 * Maximum number of concurrent jobs
 *
 * Set to 1 to avoid database contention and ensure sequential execution.
 * Multiple concurrent scrapers could cause SQLite write conflicts.
 */
export const MAX_CONCURRENT_JOBS = 1;
