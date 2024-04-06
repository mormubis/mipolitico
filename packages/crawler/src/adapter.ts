import { PlaywrightCrawlingContext, RequestHandler, RouterHandler } from 'crawlee';

interface CrawlerQuery {
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
  query: CrawlerQuery;
}

type CrawlerRequestHandler = RequestHandler<CrawlerContext>;

function adaptRequestHandler(
  handler: CrawlerRequestHandler,
): RequestHandler<PlaywrightCrawlingContext> {
  return ({ page, ...ctx }) => {
    const { $, $$, $eval, $$eval, getAttribute } = page;

    const query: CrawlerQuery = {
      $$: $$.bind,
      $$eval: $$eval.bind,
      async $$getAttribute(selector: string, attribute: string) {
        return Promise.all(
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
      async $$textContentMatch(selector: string, regex: RegExp): Promise<(string[] | null)[]> {
        const textContent = await query.$$textContent(selector);

        return textContent.map((text) => text?.match(regex) ?? null);
      },
      $: $.bind,
      $eval: $eval.bind,
      $getAttribute: getAttribute.bind,
      async $textContent(selector: string): Promise<string | null> {
        const content = await page.textContent(selector);

        return content?.trim() ?? content;
      },
      async $textContentMatch(selector: string, regex: RegExp): Promise<string[] | null> {
        const textContent = await query.$textContent(selector);

        return textContent?.match(regex) ?? null;
      },
    };

    return handler({ ...ctx, page, query });
  };
}

export type { CrawlerRequestHandler };

export default adaptRequestHandler;
