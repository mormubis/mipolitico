import type { Browser } from 'playwright';
import type { Observable } from 'rxjs';

interface CommonOptions {
  browser: Browser;
  fetch: typeof fetch;
}

type FinderOptions = CommonOptions;

type Finder = (options: FinderOptions) => Promise<string | string[] | Needle[]>;

interface Needle {
  url: string;
  extra?: unknown;
}

type RetrieverOptions = CommonOptions & Needle;

type Retriever<T> = (options: RetrieverOptions) => Observable<T>;

type SourceOptions = CommonOptions;

type Source<T> = (options: SourceOptions) => Observable<T>;

export type { Finder, Needle, Retriever, Source };
