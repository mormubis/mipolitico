import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { ZodError } from 'zod';

const LOG_DIR = process.env.LOG_DIR ?? 'logs';
const LOG_FILE = join(LOG_DIR, 'validation-errors.log');

// Ensure log directory exists
try {
  mkdirSync(dirname(LOG_FILE), { recursive: true });
} catch {
  // Directory may already exist
}

export interface ValidationErrorEntry {
  timestamp: string;
  source: string;
  record: unknown;
  errors: { path: string; message: string }[];
}

export function logValidationError(
  source: string,
  record: unknown,
  error: ZodError,
): void {
  const entry: ValidationErrorEntry = {
    timestamp: new Date().toISOString(),
    source,
    record,
    errors: error.errors.map((e) => ({
      path: e.path.join('.'),
      message: e.message,
    })),
  };

  appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
}

export function getLogPath(): string {
  return LOG_FILE;
}
