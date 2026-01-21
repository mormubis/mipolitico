import type { FastifyReply } from 'fastify';

/**
 * Cache strategy types
 */
export type CacheStrategy = 'historical' | 'recent' | 'error' | 'none';

/**
 * Set Cache-Control header based on strategy
 */
export function setCacheHeaders(
  reply: FastifyReply,
  strategy: CacheStrategy,
): void {
  switch (strategy) {
    case 'historical':
      // Historical data (older than 30 days) - cache for 1 hour
      reply.header('Cache-Control', 'public, max-age=3600');
      break;
    case 'recent':
      // Recent data (last 30 days) - cache for 5 minutes
      reply.header('Cache-Control', 'public, max-age=300');
      break;
    case 'error':
      // Errors should not be cached
      reply.header('Cache-Control', 'no-cache, no-store, must-revalidate');
      break;
    case 'none':
      // No caching
      reply.header('Cache-Control', 'no-cache');
      break;
  }
}

/**
 * Determine cache strategy based on date
 * For time-based data (votes, speeches), use date to decide caching
 */
export function getCacheStrategy(date?: Date): CacheStrategy {
  if (!date) {
    return 'recent';
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  return date < thirtyDaysAgo ? 'historical' : 'recent';
}
