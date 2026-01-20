# Coding Conventions

**Analysis Date:** 2026-01-20

## Naming Patterns

**Files:**
- TypeScript source files use `.ts` extension (not `.js`)
- Module files use kebab-case: `change-detection.service.ts`, `base-detector.ts`, `person-detail.ts`
- Type definition files use kebab-case with `.types.ts` suffix: `congressional-data.types.ts`
- Barrel exports: `index.ts` for re-exporting modules
- Backup files: `.backup.ts` suffix

**Functions:**
- camelCase for regular functions: `find()`, `retrieve()`, `launch()`, `romanize()`, `shuffle()`
- Async functions explicitly return `Promise<T>`: `async function find(): Promise<Needle[]>`
- Anonymous arrow functions for callbacks: `(subscriber) => {...}`

**Variables:**
- camelCase for local variables: `sessionId`, `speakerName`, `sessionDate`
- UPPERCASE for constants from external APIs: `NOMBRE`, `CIRCUNSCRIPCION`, `FECHAALTA`
- lowercase for simple constants: `limit`, `available`

**Types:**
- PascalCase for types and interfaces: `Model`, `Finder`, `Retriever`, `Browser`, `Observable`
- Type aliases preferred over interfaces for simple types
- Generic utility types: `Promisable<T>`, `RetrieverOptions`

## Code Style

**Formatting:**
- Prettier 4.0.0-alpha.12
- Single quotes: `'string'`
- Consistent quote props
- Prose wrap: always
- Ignore unknown file types

**Linting:**
- ESLint 9.34.0
- TypeScript ESLint with strict, recommended, and stylistic configs
- Import plugin for import ordering and consistency
- Curly braces required for multi-line blocks: `['error', 'multi-line']`

**Strict Rules Enforced:**
- `@typescript-eslint/consistent-type-imports`: Must use type imports where applicable
- `@typescript-eslint/no-empty-function`: Disabled (allows empty functions)
- `@typescript-eslint/no-misused-promises`: Warning only
- `import-x/no-default-export`: Error (no default exports in src/**/*.ts)
- `import-x/extensions`: Error - must include `.ts` extensions in imports
- `import-x/exports-last`: Error - exports must be at the end

## Import Organization

**Order:**
1. Node.js built-ins: `import { Readable } from 'node:stream';`
2. External packages (alphabetically): `import oboe from 'oboe';`, `import { Observable } from 'rxjs';`, `import { z } from 'zod';`
3. Internal imports: `import { fetch, launch } from './network/index.ts';`
4. Type imports (grouped separately): `import type { Finder, Retriever } from './sources/types.ts';`

**Newlines:**
- Always include newlines between import groups
- Alphabetize within groups (case insensitive)

**Path Aliases:**
- No path aliases detected (uses relative paths with explicit `.ts` extensions)
- Always include file extensions: `'./network/index.ts'` not `'./network'`

**Example Pattern:**
```typescript
import { Readable } from 'node:stream';

import oboe from 'oboe';
import { Observable } from 'rxjs';
import { z } from 'zod';

import { fetch, launch } from './network/index.ts';

import type { Finder, Retriever } from './types.ts';
```

## Error Handling

**Patterns:**
- Try-catch blocks with async/await for asynchronous error handling
- Observable error handling via `.fail()` callbacks (oboe) or `subscriber.error()`
- Error wrapping with context: `new Error('message', { cause })`
- Defensive null checks: `if (!link) throw new Error(...)`
- Return null for graceful failures: `if (target.isClosed()) return null;`

**Error Messages:**
- Descriptive error messages with context
- Include HTTP status codes: `Failed to fetch person data: ${response.status} ${response.statusText}`
- Include URL in error messages: `Unable to parse intervention from ${url}`

**Example:**
```typescript
if (!response.ok) {
  throw new Error(
    `Failed to fetch person data: ${String(response.status)} ${response.statusText}`,
  );
}
```

## Logging

**Framework:** Native `console`

**Patterns:**
- `console.log` for standard output: `next: console.log`
- `console.error` for error output: `console.error(error)`
- `console.warn` for warnings: `console.warn(e)` in catch blocks
- Minimal logging (no debug statements in production code)

## Comments

**When to Comment:**
- Complex algorithms with explanatory comments: `// Map of values to Roman numerals in descending order`
- Intent clarification: `// Don't mutate input`
- External data structure documentation: `// Split by speaker pattern`
- TODO markers for missing implementations: `// TODO: Implement actual storage`

**JSDoc/TSDoc:**
- Full JSDoc blocks for interface definitions in type files
- Property descriptions in interfaces: `/** Full name (surname, given name format) */`
- Inline comments for complex code blocks
- No JSDoc for simple, self-explanatory functions

**Example:**
```typescript
/**
 * Comprehensive TypeScript interfaces for Spanish Congressional data models
 * Based on analysis of examples/ data files
 */
export interface CongressMember extends BaseEntity {
  /** Full name (surname, given name format) */
  NOMBRE: string;
  /** Electoral district/constituency */
  CIRCUNSCRIPCION: string;
}
```

## Function Design

**Size:**
- Small focused functions preferred
- Average function size: 10-50 lines
- Largest functions are specialized parsers (100+ lines acceptable for complex parsing logic)

**Parameters:**
- Options objects for multiple parameters: `(options: FinderOptions)`
- Spread parameters for proxied calls: `(...argv: Parameters<typeof target.newPage>)`
- Destructuring in function signatures: `({ browser, fetch })`

**Return Values:**
- Explicit return types using TypeScript: `Promise<Needle[]>`, `Observable<T>`
- Generic return types for flexibility: `ReturnType<typeof target.newPage>`
- Use `void` for no return value: `async function sleep(ms: number): Promise<void>`

## Module Design

**Exports:**
- Named exports only (no default exports in src/ files)
- Export types and values separately: `export type { Model };` followed by `export { Schema, finder, retriever };`
- Exports always at the end of file (enforced by linting)
- Re-export from barrel files: `export { launch } from './browser.ts';`

**Barrel Files:**
- Used for clean module boundaries: `network/index.ts`
- Re-export specific named exports, not `export *`

**Example:**
```typescript
// At end of file
export type { Model };
export { Schema, finder, retriever };
```

## TypeScript Usage

**Compiler Options:**
- Strict mode enabled (`"strict": true`)
- `noUncheckedIndexedAccess`: true (array access returns `T | undefined`)
- `noImplicitOverride`: true
- `verbatimModuleSyntax`: true (explicit type imports)
- `allowImportingTsExtensions`: true (import `.ts` files directly)
- ESNext target for modern JavaScript features

**Type Assertions:**
- Minimize use of `as` assertions
- Use when interfacing with untyped libraries: `item as Model`
- Non-null assertions only with eslint-disable comment: `// eslint-disable-next-line @typescript-eslint/no-non-null-assertion`

**Zod for Runtime Validation:**
- Define schemas with Zod: `const Schema = z.object({...})`
- Infer types from schemas: `type Model = z.infer<typeof Schema>`
- Export both schema and inferred type

## Pre-commit Hooks

**Tools:**
- Husky for git hooks
- lint-staged for staged file processing

**Pre-commit Actions:**
1. Prettier format: `prettier --ignore-unknown --write`
2. ESLint fix: `eslint --fix --max-warnings 0`

---

*Convention analysis: 2026-01-20*
