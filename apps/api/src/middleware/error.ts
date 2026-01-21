import { ZodError } from 'zod';

import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';

/**
 * Global error handler for Fastify
 * Handles Zod validation errors and other errors
 */
export function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  // Handle Zod validation errors
  if (error instanceof ZodError) {
    const messages = error.errors.map((err) => {
      const path = err.path.join('.');
      return `${path}: ${err.message}`;
    });

    reply.status(400).send({
      error: `Validation error: ${messages.join(', ')}`,
      status: 400,
    });
    return;
  }

  // Handle Fastify validation errors (if any)
  if (error.validation) {
    reply.status(400).send({
      error: `Validation error: ${error.message}`,
      status: 400,
    });
    return;
  }

  // Handle 404 errors
  if (error.statusCode === 404) {
    reply.status(404).send({
      error: 'Resource not found',
      status: 404,
    });
    return;
  }

  // Log unexpected errors
  request.log.error(error);

  // Generic error response
  reply.status(error.statusCode ?? 500).send({
    error: error.message || 'Internal server error',
    status: error.statusCode ?? 500,
  });
}
