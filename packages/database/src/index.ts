// Client
export { prisma } from './client.ts';

// Re-export Prisma types (exclude PrismaClient to avoid duplicate export)
export type { PrismaClient } from './client.ts';

// Repositories
export * from './repositories/index.ts';

// Validation
export * from './validation/index.ts';

// Queries
export * from './queries/index.ts';
