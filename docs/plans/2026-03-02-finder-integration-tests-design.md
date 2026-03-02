# Finder Integration Tests — Design

**Date**: 2026-03-02

## Goal

Verify that all 7 finders in `apps/ingestion` work correctly against the live
congress.es website by running them end-to-end with a real Playwright browser.

## Approach

Manual runner script (no test framework), consistent with the existing
`packages/database/src/test/integration.test.ts` pattern. No new dependencies.

## File

`apps/ingestion/src/test/finders.test.ts`

Run with:

```bash
node --import tsx/esm src/test/finders.test.ts
```

New npm script added to `apps/ingestion/package.json`:

```json
"test:integration": "node --import tsx/esm src/test/finders.test.ts"
```

## Structure

One top-level `async function main()` wrapped in `void main()`. Steps:

1. Launch one shared `chromium` browser (`playwright` — already a dependency).
2. Run each finder in sequence, passing `{ browser, fetch: globalThis.fetch }`.
3. After each finder, assert the output shape with a small set of checks.
4. Log `PASS` / `FAIL` per finder with timing.
5. Print a summary. Set `process.exitCode = 1` if any assertion failed.
6. Close browser in `finally`.

## Assertions Per Finder

| Finder                  | Checks                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------- |
| `person`                | Returns a string starting with `https://`, contains `.json`                                 |
| `person-detail`         | Array length > 0; each needle has `url` (string) and `extra.codParlamentario`               |
| `voting`                | Array length > 0; each needle has `url` ending `.json`; `extra.legislature` is a number     |
| `intervention`          | Array length >= 0; each needle `url` is a non-empty string                                  |
| `bureau`                | Returns a string starting with `https://`                                                   |
| `initiatives`           | Array length 1–4; each `url` contains `.json`; `extra.category` is a string                 |
| `interest-declarations` | Array length > 0; each needle has `extra.codParlamentario` and `extra.declarations` (array) |

## Finder Modifications

### `intervention.ts`

`getLastSuccessfulRun` is called inside the finder body (not injected). To avoid
a DB dependency in tests, extend `FinderOptions` with an optional
`dateFrom?: Date` field. The finder uses `dateFrom` directly when provided,
falling back to the DB call otherwise.

This is a backward-compatible change: existing callers that do not pass
`dateFrom` are unaffected.

## What Is Not Tested

- Correctness of scraped data values (only shape is checked).
- Retrievers (out of scope).
- Error/retry paths.
