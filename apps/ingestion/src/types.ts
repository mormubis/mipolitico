import type { Browser } from 'playwright';
import type { Observable, OperatorFunction } from 'rxjs';

interface CommonOptions {
  browser: Browser;
  fetch: typeof fetch;
}

type Finder = (options: CommonOptions) => Observable<string>;

interface RetrieverOptions extends CommonOptions {
  url: string;
}

type Retriever<T> = (options: RetrieverOptions) => Observable<T>;

type Processor<T, U = T> = OperatorFunction<T, U>;

export type { Finder, Processor, Retriever, RetrieverOptions };
