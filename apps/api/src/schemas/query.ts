import { z } from 'zod';

/**
 * Shared pagination query parameters
 */
export const paginationSchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 20))
    .pipe(z.number().int().min(1).max(100)),
  offset: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 0))
    .pipe(z.number().int().min(0)),
  page: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : undefined))
    .pipe(z.number().int().min(1).optional()),
});

/**
 * Shared sorting query parameters
 */
export const sortSchema = z.object({
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).optional(),
});

/**
 * Deputy filter query parameters
 */
export const deputyFilterSchema = z.object({
  legislature: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : undefined))
    .pipe(z.number().int().positive().optional()),
  constituency: z.string().optional(),
  parliamentaryGroup: z.string().optional(),
  name: z.string().optional(),
});

/**
 * Vote filter query parameters
 */
export const voteFilterSchema = z.object({
  legislature: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : undefined))
    .pipe(z.number().int().positive().optional()),
  sessionNumber: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : undefined))
    .pipe(z.number().int().positive().optional()),
  dateFrom: z
    .string()
    .optional()
    .transform((val) => (val ? new Date(val) : undefined))
    .pipe(z.date().optional()),
  dateTo: z
    .string()
    .optional()
    .transform((val) => (val ? new Date(val) : undefined))
    .pipe(z.date().optional()),
});

/**
 * Speech filter query parameters
 */
export const speechFilterSchema = z.object({
  personId: z.string().optional(),
  speakerName: z.string().optional(),
  dateFrom: z
    .string()
    .optional()
    .transform((val) => (val ? new Date(val) : undefined))
    .pipe(z.date().optional()),
  dateTo: z
    .string()
    .optional()
    .transform((val) => (val ? new Date(val) : undefined))
    .pipe(z.date().optional()),
});

/**
 * Organ filter query parameters
 */
export const organFilterSchema = z.object({
  organ: z.string().optional(),
  organType: z
    .enum([
      'MESA',
      'COMISION',
      'JUNTA_PORTAVOCES',
      'DIPUTACION_PERMANENTE',
      'OTHER',
    ])
    .optional(),
  position: z.string().optional(),
  name: z.string().optional(),
});

/**
 * Initiative filter query parameters
 */
export const initiativeFilterSchema = z.object({
  enacted: z
    .string()
    .optional()
    .transform((val) => {
      if (val === 'true') return true;
      if (val === 'false') return false;
      return undefined;
    })
    .pipe(z.boolean().optional()),
  legislature: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : undefined))
    .pipe(z.number().int().positive().optional()),
  tipo: z.string().optional(),
  title: z.string().optional(),
});

/**
 * Combined query schemas for each entity
 */
export const deputyQuerySchema = deputyFilterSchema
  .merge(paginationSchema)
  .merge(sortSchema);

export const voteQuerySchema = voteFilterSchema
  .merge(paginationSchema)
  .merge(sortSchema);

export const speechQuerySchema = speechFilterSchema
  .merge(paginationSchema)
  .merge(sortSchema);

export const organQuerySchema = organFilterSchema
  .merge(paginationSchema)
  .merge(sortSchema);

export const initiativeQuerySchema = initiativeFilterSchema
  .merge(paginationSchema)
  .merge(sortSchema);
