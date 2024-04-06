import { createPlaywrightRouter, Configuration, PlaywrightCrawler } from 'crawlee';

import type { BrowserErrorHandler, PlaywrightCrawlingContext, RouterHandler } from 'crawlee';
import type { ServiceSchema } from 'moleculer';

import adaptRequestHandler, { type CrawlerRequestHandler } from './adapter';

interface Query {
  $$: PlaywrightCrawlingContext['page']['$$'];
  $$eval: PlaywrightCrawlingContext['page']['$$eval'];
  $$getAttribute(selector: string, attribute: string): Promise<(string | null)[]>;
  $$textContent(selector: string): Promise<(string | null)[]>;
  $$textContentMatch(selector: string, regex: RegExp): Promise<(string[] | null)[]>;
  $: PlaywrightCrawlingContext['page']['$'];
  $eval: PlaywrightCrawlingContext['page']['$eval'];
  $getAttribute(selector: string, attribute: string): Promise<string | null>;
  $textContent(selector: string): Promise<string | null>;
  $textContentMatch(selector: string, regex: RegExp): Promise<string[] | null>;
}

interface CrawlerContext extends PlaywrightCrawlingContext {
  report: <T>(id: string, value: T) => void;
  query: Query;
}

type CrawlerOptions = {
  errorHandler: BrowserErrorHandler;
  headless: boolean;
  maxRequestsPerMinute: number;
};

type RequestHandler = RouterHandler<CrawlerContext>;

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
            maxRequestsPerMinute: options.maxRequestsPerMinute,
            requestHandler: router,
          },
          new Configuration({ persistStorage: false }),
        );

        crawler.run([params]).then(() => {
          crawler.requestQueue?.drop();
        });
      },
      params: {
        handlers: {
          $$type: 'record',
          key: { type: 'string', alpha: true },
          value: { type: 'array', items: 'string' },
        },
        url: 'string',
      },
      visibility: 'protected',
    },
  },

  name: 'crawler',

  settings: {
    crawler: {
      headless: true,
      maxRequestsPerMinute: 30,
    },
  },
} satisfies ServiceSchema;

export type { RequestHandler };

export default mixin;
