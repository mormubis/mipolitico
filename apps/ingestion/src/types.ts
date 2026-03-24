import type { Browser } from 'playwright';
import type { Observable, OperatorFunction } from 'rxjs';

interface CommonOptions {
  browser: Browser;
  fetch: typeof fetch;
}

type Finder = (options: CommonOptions) => Observable<string>;

/**
 * Sources listed in `after` must fully complete their retriever phase
 * before this source's finder begins emitting URLs.
 * Used to enforce ordering when a processor joins two streams and needs
 * one side to be fully accumulated before the other starts (e.g.
 * intervention bulk metadata must complete before intervention-detail
 * HTML scraping begins so the stream join processor can enrich records).
 */

interface RetrieverOptions extends CommonOptions {
  sourceName: string;
  url: string;
  validationMode: 'strict' | 'soft';
}

type Retriever<T> = (options: RetrieverOptions) => Observable<T>;

type Processor<T, U = T> = OperatorFunction<T, U>;

type Sink<T, U = T> = OperatorFunction<T, U>;

interface TaggedUrl {
  source: string;
  url: string;
}

interface TaggedData<T = unknown> {
  source: string;
  data: T;
}

export type {
  CommonOptions,
  Finder,
  Processor,
  Retriever,
  RetrieverOptions,
  Sink,
  TaggedData,
  TaggedUrl,
};
