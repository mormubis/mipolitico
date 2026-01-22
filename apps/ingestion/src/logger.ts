import * as path from 'node:path';
import { createLogger, format, transports } from 'winston';
import * as DailyRotateFile from 'winston-daily-rotate-file';

/**
 * Logger for scraper job failures
 *
 * Configuration:
 * - File-based logging to logs/scraper-jobs/ directory
 * - Daily rotation with 7-day retention
 * - Format: timestamp, level, scraper type, error message, stack trace
 *
 * Success runs are not logged (only tracked via database.last_successful_run)
 */

// Create logs directory structure
const logsDir = path.join(process.cwd(), 'logs', 'scraper-jobs');

// Custom format for failure logs
const failureLogFormat = format.combine(
  format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss[Z]' }),
  format.errors({ stack: true }),
  format.printf((info) => {
    const timestamp = info.timestamp as string;
    const level = info.level;
    const scraperType = (info.scraperType as string | undefined) ?? 'unknown';
    const message = info.message as string;
    const stack = info.stack as string | undefined;
    const duration = info.duration as number | undefined;
    const recordsProcessed = info.recordsProcessed as string | undefined;

    let logMessage = `[${timestamp}] ${level.toUpperCase()} | ${scraperType} | ${message}`;

    if (stack) {
      logMessage += `\nStack: ${stack}`;
    }

    if (duration !== undefined) {
      logMessage += `\nDuration: ${String(duration)}s`;
    }

    if (recordsProcessed !== undefined) {
      logMessage += `\nRecords processed: ${recordsProcessed}`;
    }

    return logMessage;
  }),
);

// Transport for rotating failure logs
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const failureLogTransport = new DailyRotateFile({
  filename: path.join(logsDir, '%DATE%-failures.log'),
  datePattern: 'YYYY-MM-DD',
  maxFiles: '7d', // Keep logs for 7 days
  level: 'error',
  format: failureLogFormat,
  createSymlink: true,
  symlinkName: 'current-failures.log',
});

// Create logger instance
export const logger = createLogger({
  level: 'error',
  transports: [
    failureLogTransport,
    // Also log to console for debugging
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.timestamp({ format: 'HH:mm:ss' }),
        format.printf((info) => {
          const timestamp = info.timestamp as string;
          const level = info.level;
          const scraperType =
            (info.scraperType as string | undefined) ?? 'unknown';
          const message = info.message as string;
          return `${timestamp} [${scraperType}] ${level}: ${message}`;
        }),
      ),
    }),
  ],
});

/**
 * Log a scraper failure with context
 */
export function logScraperFailure(
  scraperType: 'deputies' | 'voting',
  error: Error,
  context?: {
    duration?: number;
    recordsProcessed?: string;
    attemptNumber?: number;
  },
): void {
  logger.error(error.message, {
    scraperType,
    stack: error.stack,
    duration: context?.duration,
    recordsProcessed: context?.recordsProcessed,
    attemptNumber: context?.attemptNumber,
  });
}

/**
 * Log a scraper retry attempt
 */
export function logScraperRetry(
  scraperType: 'deputies' | 'voting',
  attemptNumber: number,
  nextRetryIn: number,
): void {
  logger.warn(
    `Retry attempt ${String(attemptNumber)} scheduled in ${String(nextRetryIn)}s`,
    {
      scraperType,
      attemptNumber,
      nextRetryIn,
    },
  );
}
