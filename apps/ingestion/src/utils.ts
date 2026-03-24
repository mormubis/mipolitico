import type { z } from 'zod';

function validate<T>(
  schema: z.ZodType<T>,
  mode: 'strict' | 'soft',
): (data: unknown, context?: string) => T | undefined {
  return (data, context) => {
    const result = schema.safeParse(data);
    if (result.success) return result.data;
    if (mode === 'strict') throw result.error;
    console.warn(
      `[validate] Skipping invalid record${context ? ` from ${context}` : ''}: ${result.error.message}`,
    );
    return undefined;
  };
}

function random(min: number, max?: number): number {
  if (max === undefined) {
    max = min;
    min = 0;
  }

  return Math.floor(Math.random() * (max - min)) + min;
}

async function sleep(ms: number): Promise<void> {
  await new Promise<void>((ok) => {
    setTimeout(() => {
      ok();
    }, ms);
  });
}

function romanize(num: number): string {
  // Map of values to Roman numerals in descending order
  // Includes subtractive combinations (e.g., 900 = CM, 400 = CD)
  const valueToNumeral: [number, string][] = [
    [1000, 'M'],
    [900, 'CM'],
    [500, 'D'],
    [400, 'CD'],
    [100, 'C'],
    [90, 'XC'],
    [50, 'L'],
    [40, 'XL'],
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ];

  let result = '';
  let remaining = num;

  // For each value-numeral pair, add the numeral as many times as it fits
  for (const [value, numeral] of valueToNumeral) {
    while (remaining >= value) {
      result += numeral;
      remaining -= value;
    }
  }

  return result;
}

function shuffle<T>(array: T[]): T[] {
  const result: T[] = [];
  const copy = [...array]; // Don't mutate input

  while (copy.length > 0) {
    const index = Math.floor(Math.random() * copy.length);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    result.push(copy[index]!);
    copy.splice(index, 1); // Remove element
  }

  return result;
}

/**
 * Spanish name particles that may appear as prefixes in transcript speaker
 * names (ALL-CAPS format) but are stored as suffixes in Person.name.
 *
 * e.g. Person.name: "Olano Vela, Jaime Eduardo de"
 *      Transcript:  "DE OLANO VELA"
 *      Both normalise to: "OLANO VELA DE"
 */
const PARTICLES = new Set(['DE', 'DEL', 'DE LA', 'DE LAS', 'DE LOS', 'DE LES']);

/**
 * Catalan connectors between surnames that appear in Person.name but are
 * dropped in transcript speaker names.
 *
 * e.g. Person.name: "Ogou i Corbi, Viviane"
 *      Transcript:  "OGOU CORBI"
 */
const CATALAN_CONNECTORS = / I /g;

/**
 * Normalise a Spanish parliamentary name to a canonical key for matching
 * between Person.name (stored format) and transcript speaker names (ALL-CAPS,
 * no given name, particles may be prefixed rather than suffixed).
 *
 * Steps:
 * 1. Extract surname portion (before comma, or full string if no comma)
 * 2. Detect particles at the END of Person.name given-name section and
 *    append them to the surname
 * 3. Strip accents (NFD decomposition)
 * 4. Uppercase
 * 5. Strip hyphens
 * 6. Strip Catalan connectors (` I `)
 * 7. Move leading particle to end (e.g. "DE OLANO VELA" → "OLANO VELA DE")
 * 8. Collapse whitespace
 */
function normalizeSpanishName(name: string): string {
  // Split at comma: ["Olano Vela", "Jaime Eduardo de"] or just the full string
  const commaIdx = name.indexOf(',');
  let surnames = commaIdx >= 0 ? name.slice(0, commaIdx) : name;
  const givenPart = commaIdx >= 0 ? name.slice(commaIdx + 1).trim() : '';

  // Detect particle at the end of the given-name portion and move to surname
  // e.g. given = "Jaime Eduardo de" → particle "de"
  if (givenPart) {
    const words = givenPart.split(' ');
    const lastWord = words[words.length - 1]?.toUpperCase() ?? '';
    if (PARTICLES.has(lastWord) || ['DE', 'DEL'].includes(lastWord)) {
      surnames = `${surnames} ${words[words.length - 1] ?? ''}`;
    }
  }

  // Strip accents
  let normalized = surnames.normalize('NFD').replace(/\p{Diacritic}/gu, '');

  // Uppercase
  normalized = normalized.toUpperCase();

  // Replace hyphens with spaces (transcript drops hyphens, keeps words separate)
  normalized = normalized.replace(/-/g, ' ');

  // Strip Catalan connectors (` I ` between surnames)
  normalized = normalized.replace(CATALAN_CONNECTORS, ' ');

  // Collapse whitespace
  normalized = normalized.replace(/\s+/g, ' ').trim();

  // Move leading particle to end: "DE OLANO VELA" → "OLANO VELA DE"
  const firstWord = normalized.split(' ')[0] ?? '';
  if (PARTICLES.has(firstWord) || ['DE', 'DEL'].includes(firstWord)) {
    normalized = normalized.slice(firstWord.length).trim() + ' ' + firstWord;
  }

  return normalized;
}

export { normalizeSpanishName, random, romanize, shuffle, sleep, validate };
