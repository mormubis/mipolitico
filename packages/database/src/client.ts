import { createClient } from '@libsql/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import { PrismaClient } from '@prisma/client';
import { config as dotenvConfig } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load environment variables from workspace root
const workspaceRoot = path.resolve(__dirname, '../../../');
dotenvConfig({ path: path.join(workspaceRoot, '.env') });

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Create LibSQL client with local SQLite file
// Default to workspace root dev.db if DATABASE_URL not set
const defaultDbPath = path.join(workspaceRoot, 'dev.db');
const databaseUrl = process.env.DATABASE_URL ?? `file:${defaultDbPath}`;

console.log('[Database Client] DATABASE_URL:', process.env.DATABASE_URL);
console.log('[Database Client] Using URL:', databaseUrl);
console.log('[Database Client] Workspace root:', workspaceRoot);

const libsql = createClient({
  url: databaseUrl,
});

const adapter = new PrismaLibSql(libsql);

const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export { prisma };
export type { PrismaClient };
