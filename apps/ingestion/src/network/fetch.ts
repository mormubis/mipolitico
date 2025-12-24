import { execute } from './pool.ts';

async function fetch(
  ...argv: Parameters<typeof globalThis.fetch>
): ReturnType<typeof globalThis.fetch> {
  return execute(async () => {
    return globalThis.fetch(...argv);
  });
}

export { fetch };
