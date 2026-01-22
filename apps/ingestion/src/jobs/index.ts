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
}

/**
 * Registry of all available jobs
 *
 * Jobs are defined here but implemented in separate files in the jobs/ directory.
 * When a job is enabled, Bree will load and schedule it according to its configuration.
 *
 * Note: Jobs are currently disabled until Plan 03-02 creates the job files.
 */
export const JOBS: JobMetadata[] = [
  {
    name: 'deputies',
    path: './deputies.ts',
    enabled: false, // Will be enabled in Plan 03-02
  },
  {
    name: 'voting',
    path: './voting.ts',
    enabled: false, // Will be enabled in Plan 03-02
  },
];

/**
 * Maximum number of concurrent jobs
 *
 * Set to 1 to avoid database contention and ensure sequential execution.
 * Multiple concurrent scrapers could cause SQLite write conflicts.
 */
export const MAX_CONCURRENT_JOBS = 1;
