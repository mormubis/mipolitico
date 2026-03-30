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

/**
 * Context holding side inputs available to processors.
 * Side inputs are Observable<Map> that emit exactly once when their
 * source stream completes, providing a complete lookup map.
 */
interface ProcessorContext {
  /** normalizeSpanishName(person.name) → person.id */
  personMap$: Observable<Map<string, string>>;
  /** normalizeSpanishName(person.name) → deputy.id (most recent for legislature) */
  deputyMap$: Observable<Map<string, string>>;
  /** "personId::normalizedRole" → governmentMember.id */
  governmentMemberMap$: Observable<Map<string, string>>;
}

/**
 * Tagged output record. Processors emit tagged records so the orchestrator
 * can route each tag to its corresponding sink.
 */
interface TaggedOutput<T = unknown> {
  tag: string;
  data: T;
}

/** Helper to create tagged output records inside processors. */
function emit<T>(tag: string, data: T): TaggedOutput<T> {
  return { tag, data };
}

type Processor<T> = (
  ctx: ProcessorContext,
) => OperatorFunction<T, TaggedOutput>;

type Sink<T, U = T> = OperatorFunction<T, U>;

interface TaggedUrl {
  source: string;
  url: string;
}

interface TaggedData<T = unknown> {
  source: string;
  data: T;
}

export { emit };
export type {
  CommonOptions,
  Finder,
  Processor,
  ProcessorContext,
  Retriever,
  RetrieverOptions,
  Sink,
  TaggedData,
  TaggedOutput,
  TaggedUrl,
};
