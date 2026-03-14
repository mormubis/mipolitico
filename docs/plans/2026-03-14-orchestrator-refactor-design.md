# Orchestrator Refactor — Design

**Date:** 2026-03-14

---

## Problem

The current `main.ts` uses a vertical pipeline model — each scraper is a
separate `runXxxPipeline()` function that owns its own browser, finder,
retriever, and sink. Pipelines run sequentially and are fully isolated from each
other.

This works for simple cases but breaks down when:

- A processor needs data from multiple retrievers (e.g. `partyProcessor` already
  manually merges `person` and `person-detail` streams — a special case
  hardcoded outside `runPipeline()`)
- A processor needs FK data from another entity (e.g. `Deputy.partyId` requires
  `Party` rows to already exist)
- A new cross-cutting concern is added (e.g. `Vote → Person` reconciliation)

The root cause is that the current model makes each pipeline opaque — there is
no shared URL pool or data pool for cross-pipeline composition.

---

## Goals

1. All finders run logically together, producing a single shared tagged URL pool
2. All retrievers consume from the URL pool by tag, producing a single shared
   tagged data pool
3. Processors can consume from any combination of tagged data streams
4. Sinks consume from processor output as before
5. Debug mode: `--source=name` activates only entries matching the given name
6. Finders, retrievers, processors, and sinks remain pure — no changes to their
   contracts

---

## Non-Goals

- True parallelism / concurrent browser sessions (out of scope)
- Dynamic pipeline registration at runtime
- Removing the `--source` debug flag

---

## Type Changes (`types.ts`)

Two new types added for the orchestrator layer. Existing types unchanged.

```ts
// Emitted by the orchestrator after tagging a finder's output
type TaggedUrl = {
  source: string;
  url: string;
};

// Emitted by the orchestrator after tagging a retriever's output
type TaggedData<T = unknown> = {
  source: string;
  data: T;
};
```

`Finder`, `Retriever`, `Processor`, `RetrieverOptions`, `CommonOptions` — **all
unchanged**. Finders still return `Observable<string>`. Retrievers still take
`RetrieverOptions`. The tagging is purely an orchestrator concern.

---

## Orchestrator Architecture (`main.ts`)

### Registry entries

Two kinds of entries replace the per-pipeline functions:

**`SourceEntry<T>`** — one per finder/retriever pair:

```ts
interface SourceEntry<T> {
  name: string; // tag applied to URLs and data
  finder: Finder;
  retriever: Retriever<T>;
  urlFilter?: (url: string) => boolean; // optional pre-filter on URLs (e.g. voting watermark)
}
```

**`PipelineEntry<T, U>`** — one per processor+sink combination:

```ts
interface PipelineEntry<T, U> {
  sources: string[]; // which SourceEntry names to consume from
  processor?: OperatorFunction<T, U>; // optional — omit for identity pass-through
  sink: OperatorFunction<U, PersistResult>;
}
```

### Graph construction

```
Step 1 — Build URL pool:
  urls$ = merge(
    ...sources.map(entry =>
      entry.finder(options).pipe(
        map(url => ({ source: entry.name, url }))
      )
    )
  ).pipe(share())

Step 2 — Build data pool:
  data$ = merge(
    ...sources.map(entry =>
      urls$.pipe(
        filter(({ source }) => source === entry.name),
        mergeMap(({ url }) => entry.retriever({ url, ...options }).pipe(
          retry({ delay: 15_000, count: 1 }),
          map(data => ({ source: entry.name, data })),
        )),
      )
    )
  ).pipe(share())

Step 3 — Build pipeline streams:
  pipelineStreams = pipelines.map(entry =>
    data$.pipe(
      filter(({ source }) => entry.sources.includes(source)),
      map(({ data }) => data),
      entry.processor ?? identity,
      entry.sink,
    )
  )

Step 4 — Run:
  await lastValueFrom(merge(...pipelineStreams))
```

### Registry definition

```ts
const SOURCES: SourceEntry<unknown>[] = [
  { name: 'person', finder: personFinder, retriever: personRetriever },
  {
    name: 'person-detail',
    finder: personDetailFinder,
    retriever: personDetailRetriever,
  },
  {
    name: 'voting',
    finder: votingFinder,
    retriever: votingRetriever,
    urlFilter: votingFilter,
  },
  { name: 'bureau', finder: bureauFinder, retriever: bureauRetriever },
  {
    name: 'intervention',
    finder: interventionFinder,
    retriever: interventionRetriever,
  },
  {
    name: 'initiatives',
    finder: initiativesFinder,
    retriever: initiativesRetriever,
  },
  {
    name: 'interest-declarations',
    finder: interestDeclarationsFinder,
    retriever: interestDeclarationsRetriever,
  },
];

const PIPELINES: PipelineEntry<unknown, unknown>[] = [
  { sources: ['person'], sink: persistDeputies() },
  {
    sources: ['person', 'person-detail'],
    processor: partyProcessor,
    sink: persistParties(),
  },
  { sources: ['voting'], sink: persistVotes() },
  { sources: ['bureau'], sink: persistOrganMembers() },
  { sources: ['intervention'], sink: persistSpeeches() },
  { sources: ['initiatives'], sink: persistInitiatives() },
  {
    sources: ['interest-declarations'],
    processor: interestDeclarationsProcessor,
    sink: persistInterestDeclarations(),
  },
];
```

### Debug mode

When `--source=person` is passed, the orchestrator filters `SOURCES` and
`PIPELINES` to only include entries where `name === 'person'` or
`sources.includes('person')`. The URL pool and data pool only contain tagged
records for the requested source.

---

## What Changes

| File                          | Change                                                                                                          |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `apps/ingestion/src/types.ts` | Add `TaggedUrl`, `TaggedData` types                                                                             |
| `apps/ingestion/src/main.ts`  | Replace all `runXxxPipeline()` functions with `SOURCES` + `PIPELINES` registry and a single `runAll()` function |

## What Does Not Change

- All finders (`finders/`)
- All retrievers (`retrievers/`)
- All processors (`processors/`)
- All sinks (`sinks/`)
- `types.ts` existing types (`Finder`, `Retriever`, `Processor`, etc.)
- `packages/database/` — no changes

---

## Error Handling

Each source entry wraps its retriever stream with
`retry({ delay: 15_000, count: 1 })` as today. If a retriever errors after
retry, the error propagates to `merge(...)` and terminates the run.
`ScraperMetadata` is updated on success or failure at the top level rather than
per-pipeline.

---

## Migration Notes

- The per-pipeline `updateScraperMetadata` calls move to a single top-level
  try/catch. This means partial success (some sources complete, others fail) is
  recorded as a single failure rather than per-source. This is acceptable for
  now — per-source metadata can be added later if needed.
- `runPipeline()` helper is removed entirely.
- All `runXxxPipeline()` exports are removed. The entry point is
  `runAll(source?: string)`.
