import type { FastifyReply } from 'fastify';

/**
 * Set pagination headers on response
 */
export function setPaginationHeaders(
  reply: FastifyReply,
  total: number,
  limit: number,
  offset: number,
): void {
  // Calculate page number (1-indexed)
  const page = Math.floor(offset / limit) + 1;

  // Set headers
  reply.header('X-Total-Count', total.toString());
  reply.header('X-Page', page.toString());
  reply.header('X-Per-Page', limit.toString());
}
