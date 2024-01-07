import { createPlaywrightRouter, Configuration, PlaywrightCrawler } from 'crawlee';
import { Errors } from 'moleculer';

import type { BrowserErrorHandler, PlaywrightCrawlingContext, RouterHandler } from 'crawlee';
import type { ServiceSchema } from 'moleculer';
import type { ElementHandle } from 'playwright-core';
import type { PageFunctionOn, ElementHandleForTag } from 'playwright-core/types/structs';

interface Query {
  $$(selector: string): Promise<ElementHandle<SVGElement | HTMLElement>[]>;
  $$<K extends keyof HTMLElementTagNameMap>(selector: K): Promise<ElementHandleForTag<K>[]>;
  $$eval<K extends keyof HTMLElementTagNameMap, R, Arg>(
    selector: K,
    pageFunction: PageFunctionOn<HTMLElementTagNameMap[K][], Arg, R>,
    arg: Arg,
  ): Promise<R>;
  $$eval<R, Arg, E extends SVGElement | HTMLElement = SVGElement | HTMLElement>(
    selector: string,
    pageFunction: PageFunctionOn<E[], Arg, R>,
    arg: Arg,
  ): Promise<R>;
  $$eval<K extends keyof HTMLElementTagNameMap, R>(
    selector: K,
    pageFunction: PageFunctionOn<HTMLElementTagNameMap[K][], void, R>,
    arg?: any,
  ): Promise<R>;
  $$eval<R, E extends SVGElement | HTMLElement = SVGElement | HTMLElement>(
    selector: string,
    pageFunction: PageFunctionOn<E[], void, R>,
    arg?: any,
  ): Promise<R>;
  $$getAttribute(selector: string, attribute: string): Promise<(string | null)[]>;
  $$textContent(selector: string): Promise<(string | null)[]>;
  $$textContentMatch(selector: string, regex: RegExp): Promise<(string[] | null)[]>;
  $(
    selector: string,
    options?: { strict: boolean },
  ): Promise<ElementHandle<SVGElement | HTMLElement> | null>;
  $<K extends keyof HTMLElementTagNameMap>(
    selector: K,
    options?: { strict: boolean },
  ): Promise<ElementHandleForTag<K> | null>;
  $eval<K extends keyof HTMLElementTagNameMap, R, Arg>(
    selector: K,
    pageFunction: PageFunctionOn<HTMLElementTagNameMap[K], Arg, R>,
    arg: Arg,
  ): Promise<R>;
  $eval<R, Arg, E extends SVGElement | HTMLElement = SVGElement | HTMLElement>(
    selector: string,
    pageFunction: PageFunctionOn<E, Arg, R>,
    arg: Arg,
  ): Promise<R>;
  $eval<K extends keyof HTMLElementTagNameMap, R>(
    selector: K,
    pageFunction: PageFunctionOn<HTMLElementTagNameMap[K], void, R>,
    arg?: any,
  ): Promise<R>;
  $eval<R, E extends SVGElement | HTMLElement = SVGElement | HTMLElement>(
    selector: string,
    pageFunction: PageFunctionOn<E, void, R>,
    arg?: any,
  ): Promise<R>;
  $getAttribute(selector: string, attribute: string): Promise<string | null>;
  $textContent(selector: string): Promise<string | null>;
  $textContentMatch(selector: string, regex: RegExp): Promise<string[] | null>;
}

interface CrawlerContext extends PlaywrightCrawlingContext {
  report: <T>(id: string, value: T) => void;
  query: Query;
}

type AdaptHandlerOptions = {
  report: <T>(id: string, value: T) => void;
};

type CrawlerOptions = {
  errorHandler: BrowserErrorHandler;
  headless: boolean;
  maxRequestsPerMinute: number;
};

type RequestHandler = RouterHandler<CrawlerContext>;

const mixin: ServiceSchema = {
  actions: {
    crawl: {
      async handler({ params }) {
        const { name: serviceName, settings } = this;
        const options: CrawlerOptions = settings.crawler;

        if (!this.$running) {
          this.$url = params.url;
          const crawler = new PlaywrightCrawler(
            {
              launchContext: {
                launchOptions: {
                  headless: options.headless,
                },
              },

              errorHandler: options.errorHandler.bind(this),

              maxRequestsPerMinute: options.maxRequestsPerMinute,

              requestHandler: this.$router,
            },
            this.$configuration,
          );

          this.broker.emit(`${serviceName}:crawler:start`, this.$url);

          crawler.run([params]).then(() => {
            crawler.requestQueue?.drop();
            this.__onCrawlerEnd();
            this.broker.emit(`${serviceName}:crawler:end`, this.$url);
          });
        }
      },
      params: {
        label: 'string|optional',
        url: 'string',
      },
    },
  },

  crawler: {} as Record<string, RequestHandler>,

  created() {
    const { name: serviceName } = this;
    const { crawler: routes } = this.schema;

    if (!routes) {
      throw new Errors.ServiceSchemaError(
        `[Crawler]: 'crawler' is not defined. 'crawler' defines the route handler that will be used in the crawler. Define 'crawler' in your service.`,
        routes,
      );
    }

    const report = (id: string, value: any) =>
      this.broker.emit(`${serviceName}:crawler:entity`, { id, value });

    this.$running = false;

    const router = createPlaywrightRouter();
    const entries: [string, RequestHandler][] = Object.entries(routes);
    entries.forEach(([label, handler]) => {
      if (label === 'default') {
        return router.addDefaultHandler(this.__adaptHandler(handler)({ report }).bind(this));
      }

      return router.addHandler(label, this.__adaptHandler(handler)({ report }).bind(this));
    });

    this.$configuration = new Configuration({ persistStorage: false });
    this.$router = router;
  },

  methods: {
    __adaptHandler(handler: RequestHandler) {
      return ({ report }: AdaptHandlerOptions) =>
        ({ page, ...ctx }: PlaywrightCrawlingContext) => {
          const { $, $$, $eval, $$eval, getAttribute } = page;

          const query: Query = {
            $$: $$.bind(page),
            $$eval: $$eval.bind(page),
            async $$getAttribute(selector, attribute) {
              return await Promise.all(
                (await query.$$(selector)).map((element) => element.getAttribute(attribute)),
              );
            },
            async $$textContent(selector: string): Promise<(string | null)[]> {
              const elements = await query.$$(selector);

              return await Promise.all(
                elements.map(async (element) => {
                  const content = await element?.textContent();

                  return content?.trim() ?? content;
                }),
              );
            },
            async $$textContentMatch(
              selector: string,
              regex: RegExp,
            ): Promise<(string[] | null)[]> {
              const textContent = await query.$$textContent(selector);

              return textContent.map((text) => text?.match(regex) ?? null);
            },
            $: $.bind(page),
            $eval: $eval.bind(page),
            $getAttribute: getAttribute.bind(page),
            async $textContent(selector: string): Promise<string | null> {
              const content = await page.textContent(selector);

              return content?.trim() ?? content;
            },
            async $textContentMatch(selector: string, regex: RegExp): Promise<string[] | null> {
              const textContent = await query.$textContent(selector);

              return textContent?.match(regex) ?? null;
            },
          };

          return handler({ ...ctx, page, query, report });
        };
    },
    __onCrawlerEnd() {
      this.$running = false;
      this.$url = '';
    },
  },

  name: 'crawler',

  settings: {
    crawler: {
      headless: true,
      maxRequestsPerMinute: 30,
    },
  },
};

export type { CrawlerContext, RequestHandler };

export default mixin;
