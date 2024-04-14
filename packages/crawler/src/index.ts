import { createPlaywrightRouter, Configuration, PlaywrightCrawler } from 'crawlee';

import type { ServiceSchema } from 'moleculer';

import adaptRequestHandler, { type CrawlerRequestHandler } from './adapter';

type CrawlerOptions = {
  headless: boolean;
  maxConcurrency: number;
  maxRequestsPerMinute: number;
  sameDomainDelaySecs: number;
};

const mixin = {
  actions: {
    crawl: {
      async handler({ params }) {
        const { settings } = this;
        const options: CrawlerOptions = settings.crawler;
        const entries = Object.entries(params.handlers as Record<string, CrawlerRequestHandler>);

        const router = createPlaywrightRouter();

        entries.forEach(([label, handler]) => {
          if (label === 'default') {
            return router.addDefaultHandler(adaptRequestHandler(handler));
          }

          return router.addHandler(label, adaptRequestHandler(handler));
        });

        const crawler = new PlaywrightCrawler(
          {
            headless: options.headless,
            maxConcurrency: options.maxConcurrency,
            maxRequestsPerMinute: options.maxRequestsPerMinute,
            requestHandler: router,
            sameDomainDelaySecs: options.sameDomainDelaySecs,
          },
          new Configuration({ persistStorage: false }),
        );

        await crawler.run([params]);
        crawler.requestQueue?.drop();

        const dataset = await crawler.getDataset();
        return await dataset.getData();
      },
      params: {
        handlers: {
          $$type: 'record',
          key: { type: 'string', alpha: true },
          value: { type: 'array', items: 'string' },
        },
        url: 'string',
      },
      visibility: 'private',
    },
  },

  name: 'crawler',

  settings: {
    crawler: {
      headless: true,
      maxConcurrency: 4,
      maxRequestsPerMinute: Infinity,
      sameDomainDelaySecs: 0.5,
    },
  },
} satisfies ServiceSchema;

export type { CrawlerRequestHandler };

export default mixin;
