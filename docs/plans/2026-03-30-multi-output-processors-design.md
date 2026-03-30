# Multi-Output Processors

## Problem

Each processor emits one entity type to one sink. The intervention bulk JSON is
processed twice — once by the intervention processor (for interventions) and
once by the government-members processor (for government members). The deputy
data is processed twice — once for deputies (pass-through) and once by the party
processor.

This creates two problems:

1. **Redundant processing** — the same source stream is scanned multiple times
   by different processors extracting different entities.
2. **No derived entity emission** — the intervention processor discovers
   external witnesses (journalists, former politicians) not in the person side
   input but cannot emit `Person` records for them. They get `personId: null`.

## Solution

Processors emit `TaggedOutput` records — each record carries a `tag` string
identifying which sink should receive it. The orchestrator splits the processor
output by tag and routes each stream to its corresponding sink.

## Core Types

```typescript
interface TaggedOutput<T = unknown> {
  tag: string;
  data: T;
}

function emit<T>(tag: string, data: T): TaggedOutput<T> {
  return { tag, data };
}
```

All processors emit `TaggedOutput`:

```typescript
type Processor<T> = (
  ctx: ProcessorContext,
) => OperatorFunction<T, TaggedOutput>;
```

Pipeline entries declare a sink map:

```typescript
interface PipelineEntry {
  sources: string[];
  processor?: OperatorFunction<unknown, TaggedOutput>;
  sinks: Record<string, Sink<unknown, unknown>>;
}
```

A "single-output" processor is one that emits a single tag. A "multi-output"
processor emits multiple tags. The orchestrator treats both the same.

## Orchestrator Routing

```typescript
const processed$ = entry.processor
  ? filtered$.pipe(entry.processor)
  : filtered$.pipe(map((data) => emit(Object.keys(entry.sinks)[0]!, data)));

const shared$ = processed$.pipe(share());

const sinkStreams = Object.entries(entry.sinks).map(([tag, sink]) =>
  shared$.pipe(
    filter((output: TaggedOutput) => output.tag === tag),
    map((output: TaggedOutput) => output.data),
    sink,
  ),
);

return merge(...sinkStreams);
```

`share()` on the processed stream prevents re-executing the processor for each
sink subscriber. Pipelines without a processor auto-tag records with the first
(only) sink key.

## Processor Consolidation

### Intervention processor (multi-output)

Absorbs the government-members processor logic. Emits three tags:

| Tag                | Type                    | Source                                            |
| ------------------ | ----------------------- | ------------------------------------------------- |
| `intervention`     | `InterventionInput`     | Bulk/detail stream join (existing logic)          |
| `governmentMember` | `GovernmentMemberInput` | Bulk JSON rows matching `GOVERNMENT_ROLE_PATTERN` |
| `person`           | `PersonInput`           | Newly discovered speakers not in `personMap$`     |

The scan accumulator gains a
`governmentMembers: Map<string, GovernmentMemberInput>` field. During bulk
record accumulation, rows matching the government role pattern are added to this
map (same dedup logic currently in the government-members processor). Government
member records are emitted during the enrichment phase.

For the `person` output: when a speaker is not found in `personMap$` or the
local `discoveredPersons` map, the processor generates a new person ID, stores
it in `discoveredPersons`, and emits both the person record and the intervention
record with the new ID.

The standalone government-members pipeline is removed.

Pipeline entry:

```typescript
{
  sources: ['intervention', 'intervention-detail'],
  processor: interventionProcessor(ctx),
  sinks: {
    intervention: persistInterventions(),
    governmentMember: persistGovernmentMembers(),
    person: persistDeputies(),
  },
}
```

### Deputy processor (multi-output)

Replaces the current pass-through (no processor) for deputies and the standalone
party processor. Emits two tags:

| Tag      | Type          | Source                                         |
| -------- | ------------- | ---------------------------------------------- |
| `deputy` | `PersonInput` | Each deputy record passed through              |
| `party`  | `PartyInput`  | Accumulated unique `electoralFormation` values |

Uses `concat` to emit deputy records as they arrive, then parties on completion:

```typescript
const processor: Processor<DeputyModel> = (ctx) => (source$) => {
  const parties = new Map<string, PartyInput>();
  return concat(
    source$.pipe(
      tap((record) => {
        /* accumulate electoralFormation into parties map */
      }),
      map((record) => emit('deputy', record)),
    ),
    defer(() =>
      from(
        [...parties.values()]
          .filter((p) => p.name != null)
          .map((p) => emit('party', p)),
      ),
    ),
  );
};
```

The standalone party processor and its pipeline are removed.

Pipeline entry:

```typescript
{
  sources: ['deputy'],
  processor: deputyProcessor(ctx),
  sinks: {
    deputy: persistDeputies(),
    party: persistParties(),
  },
}
```

### Single-output processors (trivial change)

Bureau, declaration, declaration-detail — wrap the existing output in `emit()`:

```typescript
// Bureau
map(([record, personMap]) => emit('organMember', { ... } satisfies BureauInput))
```

### Pipelines without processors

Voting, deputy-detail, initiative — no processor. The orchestrator auto-tags
with the single sink key.

## Government Member Side Input

Currently built by tapping the government-members pipeline output via a
`ReplaySubject`. With the merged processor, the tap moves into the
orchestrator's tag routing for the intervention pipeline:

```typescript
// In the sink routing loop for the intervention pipeline
if (tag === 'governmentMember') {
  shared$.pipe(
    filter((output) => output.tag === 'governmentMember'),
    tap((output) => govMemberRecords$.next(output.data)),
    tap({ complete: () => govMemberRecords$.complete() }),
    map((output) => output.data),
    sink,
  );
}
```

The intervention processor's enrichment phase still uses
`withLatestFrom(ctx.governmentMemberMap$)` — this blocks until the government
member records complete, which happens when the bulk JSON source finishes.

## Local Person Discovery (No Side Input Feedback)

The intervention processor maintains a `discoveredPersons: Map<string, string>`
inside the scan accumulator. When a speaker is not found in `personMap$`, the
processor:

1. Checks `discoveredPersons` — if found, reuses the existing ID
2. If not found, generates a new ID via `createId()`, stores in
   `discoveredPersons`
3. Emits `emit('person', { name, id })` for persistence
4. Uses the ID for the intervention record

The `personMap$` side input stays immutable. The local map provides within-run
deduplication for the intervention processor. Other processors (bureau,
declaration) don't encounter the same speakers — their data sources don't
overlap.

## Pipeline Registry (Before → After)

### Before (10 pipelines)

```
deputy         → persistDeputies()
deputy-detail  → persistPersonDetail()
deputy         → partyProcessor → persistParties()
voting         → persistVotes()
bureau         → bureauProcessor → persistOrganMembers()
intervention+detail → interventionProcessor → persistInterventions()
intervention   → govMembersProcessor → persistGovernmentMembers()
initiative     → persistInitiatives()
declaration    → declarationProcessor → persistInterestDeclarations()
declaration-detail → declarationDetailProcessor → persistInterestDeclarations()
```

### After (8 pipelines)

```
deputy         → deputyProcessor → { deputy: persistDeputies(), party: persistParties() }
deputy-detail  → { deputyDetail: persistPersonDetail() }
voting         → { vote: persistVotes() }
bureau         → bureauProcessor → { organMember: persistOrganMembers() }
intervention+detail → interventionProcessor → { intervention: persistInterventions(), governmentMember: persistGovernmentMembers(), person: persistDeputies() }
initiative     → { initiative: persistInitiatives() }
declaration    → declarationProcessor → { declaration: persistInterestDeclarations() }
declaration-detail → declarationDetailProcessor → { declaration: persistInterestDeclarations() }
```

Two pipelines eliminated. Redundant processing of intervention and deputy
streams removed.

## Out of Scope

- **Multi-input processors** — processors still receive one merged source
  stream. The side input mechanism handles cross-stream data.
- **Dynamic tag discovery** — the orchestrator requires all tags to be declared
  in `sinks`. A processor emitting an undeclared tag silently drops the record.
