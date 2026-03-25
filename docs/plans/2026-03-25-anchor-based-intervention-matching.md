# Anchor-Based Intervention Speaker Matching

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task.

**Goal:** Replace the fragile speaker-name regex matching in intervention-detail
with anchor-based matching using the bulk JSON `ENLACETEXTOINTEGRO` page anchors
to identify which ORADOR from the bulk JSON corresponds to each parsed speech in
the HTML transcript.

**Architecture:** The bulk JSON `ENLACETEXTOINTEGRO` field contains a URL with a
`#(PáginaX)` fragment pointing to the page where a speaker starts. By
URL-decoding the anchor and matching it to `<a name="(PáginaX)">` in the HTML,
we know which ORADOR starts speaking on that page. Since multiple speakers may
share a page and speeches carry over page boundaries, we track speakers by their
order within the session — the Nth speaker in the bulk JSON corresponds to the
Nth speaker pattern found scanning forward from their page anchor in the HTML.
The processor stream join is replaced: `intervention` retriever emits a
pre-built per-session anchor map, `intervention-detail` retriever uses that map
to produce fully-attributed `InterventionInput` records.

**Tech Stack:** Playwright, RxJS (`scan`, `mergeMap`, `EMPTY`), TypeScript, Zod.

---

## Key data facts (confirmed from live testing)

```
Bulk JSON row: {
  ORADOR: "Armengol Socias, Francina (GS)",
  ENLACETEXTOINTEGRO: "https://...#(P%C3%A1gina16)"
  // URL-decoded: #(Página16)
}

HTML anchor: <a name="(Página16)">
// → text on/after this page starts with Armengol's speech

Multiple rows can share the same anchor (multiple speakers on one page).
A speech started on page N continues until the next speaker pattern regardless of page anchors.
Procedural chair utterances (PRESIDENTA) are NOT in the bulk JSON.
```

---

## How speaker attribution works (algorithm)

For a given session:

1. Build an ordered list from bulk JSON: `[(anchor, ORADOR), ...]` sorted by
   anchor page number
2. Scan the HTML text for speaker patterns
   (`/((?:El|La) señor[a]? [A-ZÁÉÍÓÚÑ]{2}...)/g`)
3. For each found speaker pattern, determine which bulk JSON ORADOR it
   corresponds to:
   - Find which page anchor the speaker pattern falls after in the HTML
   - Among all bulk rows with that anchor, match by speaker surname (partial
     match against ORADOR)
   - If no surname match, take the next unmatched bulk row for that anchor in
     order
4. Emit `InterventionInput` with `speakerName` from `ORADOR` (canonical, full
   name) rather than the HTML-parsed form

This gives us the canonical `ORADOR` name (e.g. `"Armengol Socias, Francina"`)
even when the HTML says `PRESIDENTA`.

---

### Task 1: Add page anchor extraction to `intervention` retriever

**Files:**

- Modify: `apps/ingestion/src/retrievers/intervention.ts`

The retriever currently emits one `BulkModel` record per row. Add a new field
`pageAnchor` to the schema — extracted from `ENLACETEXTOINTEGRO` by URL-decoding
the fragment and parsing the page number.

**Step 1: Add `pageAnchor` to the Schema transform**

```typescript
// In Schema transform, add:
pageAnchor: (() => {
  const fragment = raw.ENLACETEXTOINTEGRO.split('#')[1];
  if (!fragment) return null;
  // URL-decode: (P%C3%A1gina16) → (Página16) → extract number
  const decoded = decodeURIComponent(fragment);
  const match = /\(Página(\d+)\)/.exec(decoded);
  return match ? parseInt(match[1]!, 10) : null;
})(),
```

Add `pageAnchor: z.number().nullable()` to the schema output.

**Step 2: Type-check**

```bash
pnpm tsc --noEmit -p apps/ingestion/tsconfig.json
```

**Step 3: Commit**

```bash
git add apps/ingestion/src/retrievers/intervention.ts
git commit -m "feat(ingestion): add pageAnchor extraction to intervention retriever"
```

---

### Task 2: Build per-session anchor map in `intervention` processor

**Files:**

- Modify: `apps/ingestion/src/processors/intervention.ts`

The processor currently uses `scan` to accumulate bulk rows in a
`Map<sessionUrl, BulkModel[]>`. Change the map value from `BulkModel[]` to an
ordered array of `{ pageAnchor: number | null; orador: string }` — which is what
the detail retriever needs for attribution.

**Step 1: Change the MetadataMap type**

```typescript
type AnchorEntry = { pageAnchor: number | null; orador: string };
type MetadataMap = Map<string, AnchorEntry[]>;
```

**Step 2: Update the bulk record accumulation**

In the `isBulkModel` branch:

```typescript
const existing = acc.map.get(url) ?? [];
acc.map.set(url, [
  ...existing,
  {
    pageAnchor: record.pageAnchor,
    orador: (record.ORADOR ?? '').replace(/\s*\([^)]+\)\s*$/, '').trim(),
    // Strip group code: "Armengol Socias, Francina (GS)" → "Armengol Socias, Francina"
  },
]);
```

**Step 3: Update detail record enrichment**

Instead of matching by speaker name, match by order: when a detail record
arrives, find its page anchor from the HTML, then pick the next unmatched bulk
entry for that page anchor. Add a `usedIndices` Set to track which bulk entries
have been consumed.

The full enrichment logic for the detail record branch:

```typescript
if (isDetailModel(record)) {
  const bulkEntries = acc.map.get(record.sessionUrl) ?? [];

  // Find the best matching ORADOR for this speech:
  // 1. Try to match by page anchor + surname
  // 2. Fall back to next unmatched entry in session order
  const usedKey = `${record.sessionUrl}:${record.order}`;

  // Match: find bulk entry whose ORADOR surname appears in the HTML speakerName
  const normalizedHtml = normalizeSpanishName(record.speakerName);
  const match = bulkEntries.find((entry, idx) => {
    if (acc.used.has(`${record.sessionUrl}:${idx}`)) return false;
    const normalizedOrador = normalizeSpanishName(entry.orador);
    // Check if the HTML speaker name (surnames only) matches the ORADOR
    return (
      normalizedOrador.startsWith(normalizedHtml) ||
      normalizedHtml.startsWith(normalizedOrador.split(' ')[0] ?? '')
    );
  });

  const matchIdx = match ? bulkEntries.indexOf(match) : -1;
  if (matchIdx >= 0) {
    acc.used.add(`${record.sessionUrl}:${matchIdx}`);
  }

  const canonicalName = match?.orador ?? record.speakerName;

  const enriched: InterventionInput = {
    endTime: match ? bulkEntries[matchIdx]?.endTime : undefined,
    // ... rest of fields
    speakerName: canonicalName,
    // ...
  };
  return { map: acc.map, used: acc.used, ready: [enriched] };
}
```

Note: the `acc` state needs a `used: Set<string>` alongside `map`.

**Step 4: Type-check**

```bash
pnpm tsc --noEmit -p apps/ingestion/tsconfig.json
```

**Step 5: Commit**

```bash
git add apps/ingestion/src/processors/intervention.ts
git commit -m "feat(ingestion): use anchor-based speaker attribution in intervention processor"
```

---

### Task 3: Update `InterventionInputSchema` — add `canonicalSpeakerName`

**Files:**

- Modify: `packages/database/src/validation/schemas.ts`

The current `InterventionInputSchema` has `speakerName` which comes from the
HTML regex. After this change, `speakerName` will hold the canonical ORADOR form
(full `Surname, Name` from bulk JSON) when matched, or the HTML-parsed form as
fallback.

No schema change needed — `speakerName: z.string()` already handles both. But
add a comment:

```typescript
// speakerName: canonical form from bulk JSON ORADOR when matched via anchor,
// otherwise the HTML-parsed form (surnames only, ALL-CAPS).
speakerName: z.string(),
```

**Step 1: Update comment in schema**

**Step 2: Commit**

```bash
git add packages/database/src/validation/schemas.ts
git commit -m "docs(database): clarify speakerName source in InterventionInputSchema"
```

---

### Task 4: Re-run interventions and measure improvement

**Step 1: Delete existing interventions and re-run**

```bash
sqlite3 packages/database/prisma/dev.db "DELETE FROM Intervention;"
pnpm --filter @congress/ingestion scrape --source=interventions
```

**Step 2: Check linkage improvement**

```bash
sqlite3 packages/database/prisma/dev.db "
SELECT COUNT(*) as total,
  COUNT(personId) as linked,
  ROUND(100.0 * COUNT(personId) / COUNT(*), 1) as pct
FROM Intervention;
"
```

Expected: linked should increase from 31,844 to significantly more as
PRESIDENTA, committee presidents, and formerly-unmatched deputies get their
canonical ORADOR name resolved.

**Step 3: Check PRESIDENTA specifically**

```bash
sqlite3 packages/database/prisma/dev.db "
SELECT speakerName, COUNT(*) FROM Intervention
WHERE speakerName LIKE '%PRESIDENTA%' OR speakerName LIKE '%Armengol%'
GROUP BY speakerName ORDER BY COUNT(*) DESC LIMIT 5;
"
```

Expected: `PRESIDENTA` entries now have
`speakerName = 'Armengol Socias, Francina'` and `personId` populated.

**Step 4: Commit results**

```bash
git commit --allow-empty -m "feat(ingestion): anchor-based speaker attribution complete"
```

---

## Notes

**Speaker name matching strategy (Task 2 detail):**

The matching uses a two-tier approach:

1. **Surname match**: the HTML speaker pattern `LA SEÑORA ARMENGOL:` extracts
   `"ARMENGOL"` as the speaker name. The bulk ORADOR
   `"Armengol Socias, Francina"` normalised = `"ARMENGOL SOCIAS FRANCINA"`. The
   first word matches.
2. **Order fallback**: if no name match is found (e.g. `PRESIDENTA` has no
   surname in the transcript), take the next unconsumed bulk entry for that
   session in chronological order.

**Carry-over speeches:** A speech starting on page N may span pages N, N+1, N+2.
The bulk JSON marks where a speech starts (page N), not where it ends. The HTML
text between speaker patterns is the complete speech text regardless of page
anchors. This plan does not change how speech TEXT is extracted — only how the
SPEAKER is identified.

**Procedural PRESIDENTA interventions:** These are still NOT in the bulk JSON
and will remain with `speakerName = 'PRESIDENTA'` and `personId = null`. The
order-fallback in tier 2 won't assign them to Armengol unless a bulk row happens
to exist for that session with no name match — which would be incorrect. It's
safer to leave them unmatched than to incorrectly assign them.

**Stream ordering:** The `after: ['intervention']` gate already ensures bulk
rows arrive before detail records. This plan relies on that guarantee.
