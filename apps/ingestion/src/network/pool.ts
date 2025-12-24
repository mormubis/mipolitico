import pLimit from 'p-limit';

import { random, sleep } from '../utils.ts';

const limit = pLimit(5);

function execute<T>(callback: () => T) {
  return limit(async () => {
    await sleep(random(1000, 5000));
    return callback();
  });
}

export { execute };
