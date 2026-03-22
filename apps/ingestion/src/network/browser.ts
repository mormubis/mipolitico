import pDefer from 'p-defer';
import { chromium, firefox, webkit } from 'playwright';

import { execute } from './pool.ts';
import { random, sleep } from '../utils.ts';

import type { Browser, BrowserType, LaunchOptions, Page } from 'playwright';

let available: BrowserType[] = [chromium, firefox, webkit];
// let available: BrowserType[] = [firefox];

async function launch(options?: LaunchOptions): Promise<Browser> {
  if (available.length === 0) {
    throw new Error(`There are no browsers available`);
  }

  const index = random(available.length - 1);
  const type = available[index];

  if (!type) {
    throw new Error(`There are no browsers available`);
  }

  try {
    // Use the system Chrome binary to avoid Akamai WAF TLS fingerprint detection.
    // Playwright's bundled Chromium has a different TLS fingerprint than real Chrome,
    // which congreso.es's Akamai WAF detects and blocks.
    const executablePath =
      type === chromium
        ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
        : undefined;

    const browser = await type.launch({ ...options, executablePath });

    return new Proxy(browser, {
      get(target: Browser, p: keyof Browser): unknown {
        if (p === 'newPage') {
          return async function limitedNewPage(
            ...argv: Parameters<typeof target.newPage>
          ): ReturnType<typeof target.newPage> {
            const deferred =
              pDefer<Awaited<ReturnType<typeof target.newPage>>>();

            void execute(
              () =>
                // eslint-disable-next-line @typescript-eslint/no-misused-promises
                new Promise<void>(async (ok) => {
                  const page = await target.newPage.call(target, ...argv);

                  if (!target.isConnected()) {
                    throw new Error(`Browser is closed`);
                  }

                  deferred.resolve(
                    new Proxy(page, {
                      get(target: Page, p: keyof Page): unknown {
                        if (p === 'goto') {
                          return async function delayedGoTo(
                            ...argv: Parameters<typeof target.goto>
                          ): ReturnType<typeof target.goto> {
                            await sleep(random(1000, 3000));

                            if (target.isClosed()) return null;

                            return target.goto.call(target, ...argv);
                          }.bind(target);
                        } else if (p === 'close') {
                          return function spyClosed(
                            ...argv: Parameters<typeof target.close>
                          ): ReturnType<typeof target.close> {
                            ok();

                            return target.close(...argv);
                          };
                        } else {
                          return target[p];
                        }
                      },
                    }),
                  );
                }),
            );

            return deferred.promise;
          };
        } else {
          return target[p];
        }
      },
    });
  } catch (e) {
    console.warn(e);
    available = available.filter((_, i) => i !== index);

    return launch(options);
  }
}

export { launch };
