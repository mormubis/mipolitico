import { createPlaywrightRouter, Configuration, PlaywrightCrawler } from 'crawlee';
import { Errors, type ServiceSchema } from 'moleculer';

import adaptRequestHandler, { type CrawlerRequestHandler } from './adapter';

interface CrawlerOptions {
  headless: boolean;
  maxConcurrency: number;
  maxRequestsPerMinute: number;
  sameDomainDelaySecs: number;
}

const mixin = {
  actions: {
    crawl: {
      async handler({ params }) {
        const { settings } = this;
        const { crawler: handlers } = this.schema;

        const options: CrawlerOptions = settings.crawler ?? {};
        const entries = Object.entries(handlers as Record<string, CrawlerRequestHandler>);

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
        await crawler.requestQueue?.drop();

        const dataset = await crawler.getDataset();
        return await dataset.getData();
      },
      params: {
        label: 'string|optional',
        url: 'string',
      },
    },
  },

  created() {
    const { crawler: handlers } = this.schema;

    if (!handlers) {
      throw new Errors.ServiceSchemaError(
        `[Crawler]: 'crawler' is not defined. 'crawler' defines the route handler that will be used in the crawler. Define 'crawler' in your service.`,
        handlers,
      );
    }
  },

  crawler: {},

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
