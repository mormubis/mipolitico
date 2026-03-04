# Design: Observable Pipeline with Shared Finder Fan-out

**Date:** 2026-03-04 **Status:** Approved

## Problem

The current ingestion pipeline has two limitations:

1. **One finder → one retriever.** There is no way for a single finder's output
   to feed multiple retrievers concurrently without running the finder multiple
   times.
2. **One retriever → one processor.** There is no way to apply multiple
   processor stages to a retriever's output stream without ad-hoc nesting in
   `main.ts`.
3. **Finders carry data that belongs in retrievers.** The `extra` field on
   `Needle` is used to pass bulk-fetched data (e.g. `BulkDeclarationRow[]`,
   `BulkInterventionRow`) from the finder into the retriever, blurring
   responsibility.

## Decision

Migrate the pipeline to a fully Observable-based model using RxJS `share()` for
multicast fan-out.

## Type System

Remove `Needle`, `Promisable`, and the `extra` field entirely. Replace with:

```ts
interface CommonOptions {
  browser: Browser;
  fetch: typeof fetch;
}

// Finder: emits URL strings as an Observable
type Finder = (options: CommonOptions) => Observable<string>;

// Retriever: receives a URL, emits domain records
type RetrieverOptions = CommonOptions & { url: string };
type Retriever<T> = (options: RetrieverOptions) => Observable<T>;

// Processor: unchanged
type Processor<T, U = T> = OperatorFunction<T, U>;
```

## Fan-out Pattern

The runner calls a finder once and applies `share()` so subscriptions do not
restart the source. Each branch subscribes to the shared Observable and fans out
independently via `mergeMap`:

```ts
const urls$ = finder(options).pipe(share());

const stream = merge(
  urls$.pipe(
    mergeMap(url => retrieverA({ url, ...options }).pipe(retry(...))),
    processorA1,
    processorA2,
    sinkA(),
  ),
  urls$.pipe(
    mergeMap(url => retrieverB({ url, ...options }).pipe(retry(...))),
    processorB1,
    sinkB(),
  ),
);

await lastValueFrom(stream);
```

Multiple processors per retriever are additional `.pipe()` arguments — no new
abstraction required.

## Impact on Finders

All 7 finders change their return type from
`Promisable<string | string[] | Needle[]>` to `Observable<string>`.

| Current pattern          | New pattern                              |
| ------------------------ | ---------------------------------------- |
| `return url`             | `return of(url)`                         |
| `return [url1, url2]`    | `return from([url1, url2])`              |
| Loop building `Needle[]` | `return from(urls)` emitting each string |

### Data previously in `extra`

Extra payloads move to the retrievers that need them:

- **`intervention` finder** — currently passes `BulkInterventionRow` as `extra`
  for watermark filtering in `main.ts`. The finder already downloads the bulk
  JSON; it applies the date filter itself before emitting URLs.
- **`voting` finder** — `extra: { legislature, session }` was redundant;
  `main.ts` re-derived it from the URL via regex anyway. Watermark filter stays
  in `main.ts`, applied to the URL string directly.
- **`interest-declarations` finder** — drops the active-deputy join entirely.
  Becomes a single-URL finder emitting the `docacteco` JSON URL. The retriever
  owns all grouping, name normalisation, and PDF scraping.

## `main.ts` Structure

Replace the six `run*Pipeline()` functions with a declarative graph and a single
generic runner:

```ts
type Branch<T> = [Retriever<T>, ...OperatorFunction<any, any>[]];

interface PipelineEntry {
  name: string;
  finder: Finder;
  branches: Branch<unknown>[];
}

const graph: PipelineEntry[] = [
  {
    name: 'person',
    finder: personFinder,
    branches: [
      [personRetriever, persistDeputies()],
    ],
  },
  {
    name: 'voting',
    finder: votingFinder,
    branches: [
      [votingRetriever, persistVotes()],
    ],
  },
  // multi-branch example (future):
  // {
  //   name: 'person',
  //   finder: personFinder,
  //   branches: [
  //     [personRetriever,       persistDeputies()],
  //     [personDetailRetriever, persistDeputyDetails()],
  //   ],
  // },
];

async function runPipeline(entry: PipelineEntry, options: CommonOptions) {
  const urls$ = entry.finder(options).pipe(share());
  const stream = merge(
    ...entry.branches.map(([retriever, ...ops]) =>
      urls$.pipe(
        mergeMap(url => retriever({ url, ...options }).pipe(retry(...))),
        ...ops,
      ),
    ),
  );
  await lastValueFrom(stream);
  await updateScraperMetadata(entry.name, true);
}
```

## Watermarking

Watermark filters that currently live in `main.ts` move to the appropriate
place:

- **voting** — filter applied in `main.ts` as a `.pipe(filter(...))` on the
  `urls$` Observable before it is shared, keeping the logic close to the graph
  declaration.
- **intervention** — filter moves into the finder itself, which already
  downloads the bulk JSON and can skip URLs whose `SESION` date is before the
  last successful run.

## Error Handling

Unchanged from current behaviour: each retriever Observable is wrapped with
`retry({ delay: 15_000, count: 1 })`. The outer `runPipeline` catches unhandled
errors and calls `updateScraperMetadata(name, false, message)`.

## Migration Notes

- All existing retrievers, processors, and sinks are **unchanged**.
- All 7 finders require mechanical updates (return type + `of`/`from` wrapping).
- `interest-declarations` finder requires a substantive simplification (drop the
  deputy join).
- `interest-declarations` retriever requires updates to own the deputy name
  lookup and grouping logic previously done in the finder.
- Integration tests in `test/finders.test.ts` and `test/retrievers.test.ts`
  require updates to match the new `Observable<string>` finder interface.
