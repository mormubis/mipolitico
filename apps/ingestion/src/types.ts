import type { Browser } from 'playwright';
import type { Observable, OperatorFunction } from 'rxjs';

interface CommonOptions {
  browser: Browser;
  fetch: typeof fetch;
}

type FinderOptions = CommonOptions & {
  dateFrom?: Date;
};

type Finder = (
  options: FinderOptions,
) => Promisable<string | string[] | Needle[]>;

interface Needle {
  url: string;
  extra?: unknown;
}

type Promisable<T> = T | Promise<T>;

type RetrieverOptions = CommonOptions & Needle;

type Retriever<T> = (options: RetrieverOptions) => Observable<T>;

type Processor<T, U = T> = OperatorFunction<T, U>;

export type { Finder, Needle, Processor, Retriever };
