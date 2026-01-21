// Client
export { prisma, type PrismaClient } from './client.ts';

// Re-export Prisma types
export * from '@prisma/client';

// Repositories
export * from './repositories/index.ts';

// Validation
export * from './validation/index.ts';
