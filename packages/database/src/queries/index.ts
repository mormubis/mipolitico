// Pagination input type
export interface PaginationInput {
  limit?: number; // Default: 20, Max: 100
  offset?: number; // Default: 0
}

// Sorting input type
export interface SortInput {
  sortBy?: string; // Field name
  order?: 'asc' | 'desc'; // Default: 'asc'
}

// Paginated result wrapper
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}

// Helper to apply pagination defaults
export function applyPaginationDefaults(
  input: PaginationInput,
): Required<PaginationInput> {
  return {
    limit: Math.min(input.limit ?? 20, 100),
    offset: input.offset ?? 0,
  };
}

// Re-export query functions from entity-specific files
export * from './deputies.ts';
export * from './votes.ts';
export * from './speeches.ts';
export * from './bureaus.ts';
