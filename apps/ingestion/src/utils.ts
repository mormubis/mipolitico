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

export { random, romanize, shuffle, sleep, validate };
