/**
 * API Server Configuration
 */
export const config = {
  host: process.env.HOST ?? '0.0.0.0',
  port: parseInt(process.env.PORT ?? '3000', 10),
  logLevel: process.env.LOG_LEVEL ?? 'info',
  apiVersion: 'v1',
} as const;
