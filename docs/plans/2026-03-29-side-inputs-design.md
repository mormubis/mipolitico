# Side Inputs: Stream-Based Processor Enrichment

## Problem

Processors query the database for enrichment data. The intervention processor
calls `prisma.person.findMany()` and `prisma.governmentMember.findMany()`. The
bureau processor calls `prisma.person.findUnique()` per record. The declaration
processor calls `prisma.person.findFirst()` per deputy name.

This creates three problems:

1. **Empty database breakage** — from-scratch runs fail because persons don't
   exist in the database when processors try to look them up.
2. **Implicit ordering dependency** — processors assume entities were persisted
   by earlier pipelines, but the orchestrator runs pipelines concurrently.
3. **Untestable** — processors import `prisma` directly, making unit tests
   impossible without a database.

## Solution

Replace database lookups with **side inputs** — shared `Observable<Map<K, V>>`
instances built from retriever/processor output streams using RxJS `reduce` +
`shareReplay(1)`.

Processors synchronize with side inputs via `withLatestFrom`. Since `reduce`
only emits on source completion, `withLatestFrom` naturally blocks the
processor's enrichment phase until the side input's source stream finishes.

## Core Primitive

```typescript
function buildSideInput<T, K, V>(
  source$: Observable<T>,
  keyFn: (item: T) => K,
  valueFn: (item: T) => V,
): Observable<Map<K, V>> {
  return source$.pipe(
    reduce((map, item) => {
      map.set(keyFn(item), valueFn(item));
      return map;
    }, new Map<K, V>()),
    shareReplay(1),
  );
}
```

`buildSideInput` accumulates all records from a source stream into a `Map`, then
emits the complete map exactly once when the source completes. `shareReplay(1)`
caches the result for late subscribers.

## Side Inputs

| Side Input             | Source stream                    | Key                                | Value                | Consumers                         |
| ---------------------- | -------------------------------- | ---------------------------------- | -------------------- | --------------------------------- |
| `personMap$`           | deputy retriever                 | `normalizeSpanishName(name)`       | `personId`           | intervention, bureau, declaration |
| `deputyMap$`           | deputy retriever                 | `normalizeSpanishName(name)`       | `deputyId`           | declaration                       |
| `governmentMemberMap$` | government-members processor out | `personId + "::" + normalizedRole` | `governmentMemberId` | intervention                      |

## Processor Type Change

Processors change from plain `OperatorFunction` to factory functions that
receive a context with side inputs:

```typescript
// Before
type Processor<T, U> = OperatorFunction<T, U>;

// After
type Processor<T, U> = (ctx: ProcessorContext) => OperatorFunction<T, U>;

interface ProcessorContext {
  personMap$: Observable<Map<string, string>>;
  governmentMemberMap$: Observable<Map<string, string>>;
  deputyMap$: Observable<Map<string, string>>;
}
```

Processors use `withLatestFrom` to synchronize with side inputs:

```typescript
const processor: Processor<unknown, InterventionInput> = (ctx) => (source$) =>
  source$.pipe(
    // Phase 1: scan accumulation (unchanged, no side inputs needed)
    scan((acc, record) => {
      /* bulk/detail matching */
    }, initialState),
    mergeMap(({ ready }) => from(ready)),
    // Phase 2: enrich via side inputs (replaces DB queries)
    withLatestFrom(ctx.personMap$, ctx.governmentMemberMap$),
    map(([enriched, personMap, govMap]) => {
      const personId = personMap.get(
        normalizeSpanishName(enriched.speakerName),
      );
      const govKey = `${personId}::${enriched.speakerRole?.toLowerCase()}`;
      const governmentMemberId = govMap.get(govKey);
      return { ...enriched, personId, governmentMemberId };
    }),
  );
```

Processors that don't need side inputs ignore the context:

```typescript
const processor: Processor<BulkModel, PartyInput> = (_ctx) =>
  pipe(reduce(...), mergeMap(...));
```

## Upstream ID Generation

All entity IDs are generated at the point of first discovery (retriever or
processor), not at persistence time. This ensures side inputs can be built
entirely from streams without waiting for persistence.

- `personId` — already generated upstream
- `deputyId` — move generation from Prisma `@default(cuid())` to retriever
- `governmentMemberId` — move generation from Prisma to government-members
  processor

Repositories use the pre-assigned ID as the primary key. Prisma's
`@default(cuid())` becomes a fallback, not the primary path.

## Orchestrator Wiring

The orchestrator builds side inputs from shared source streams and creates the
`ProcessorContext` before wiring pipelines:

```
1. Build sources (unchanged)
2. Create per-source data streams with share() (unchanged)
3. Build side inputs from source streams          ← NEW
4. Create ProcessorContext                         ← NEW
5. Merge all into data$
6. For each pipeline: filter → processor(ctx) → sink
7. merge all pipelines → lastValueFrom
```

### Government member ordering

The government-members pipeline reads from the `intervention` source (bulk
JSON). `governmentMemberMap$` is built from the government-members processor
output. The intervention processor's enrichment phase blocks on
`withLatestFrom(ctx.governmentMemberMap$)` — this naturally resolves the
ordering:

1. `intervention` bulk JSON completes (seconds)
2. Government-members processor reduces to unique pairs, emits
3. `governmentMemberMap$` completes
4. Intervention processor enrichment phase unblocks
5. Meanwhile, `intervention-detail` HTML scraping runs concurrently

### Delta mode

For delta runs, side inputs are pre-populated from the database before live
streams augment them:

```typescript
const personMap$ = buildSideInput(
  concat(seedFromDb(), personData$),
  (p) => normalizeSpanishName(p.name),
  (p) => p.id,
);
```

For from-scratch runs, `seedFromDb()` is `EMPTY`.

### Existing `after` gates

The `after` gates control finder start ordering (when to start scraping). Side
inputs control processor enrichment ordering (when to start lookups). These are
separate concerns. Existing `after` gates are kept as belt-and-suspenders — they
can be removed later once side inputs prove reliable.

## Processor Migration

| Processor          | DB queries removed                                  | Side inputs used                     |
| ------------------ | --------------------------------------------------- | ------------------------------------ |
| intervention       | `person.findMany`, `governmentMember.findMany` (×2) | `personMap$`, `governmentMemberMap$` |
| bureau             | `person.findUnique` per record                      | `personMap$`                         |
| declaration        | `person.findFirst` per name                         | `deputyMap$`                         |
| party              | none (already pure)                                 | —                                    |
| government-members | none (already pure)                                 | —                                    |

After migration, zero processors import `prisma`.

## Error Handling

If a side input's source stream errors, `reduce` propagates the error.
`withLatestFrom` forwards it to every processor that depends on that side input.
A failed person pipeline halts dependent processors rather than silently
producing records with null IDs.

## Testing

Side inputs make processors unit-testable without a database:

```typescript
const personMap$ = of(new Map([['GARCIA LOPEZ MARIA', 'person-123']]));
const govMap$ = of(new Map());
const ctx = {
  personMap$,
  governmentMemberMap$: govMap$,
  deputyMap$: of(new Map()),
};

const result = await lastValueFrom(
  from([bulkRecord, detailRecord]).pipe(interventionProcessor(ctx)),
);
expect(result.personId).toBe('person-123');
```

## Out of Scope

- **Multi-output processors** — processors still emit one type to one sink.
  Planned as a follow-up once side inputs are stable.
- **`Party.parentId` resolution** — separate concern, not affected by this
  change.
- **Removing `after` gates** — can be done later once side inputs prove
  reliable.
