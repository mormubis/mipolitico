import moment from 'moment';

import Crawler from '../mixins/crawler.mixin';
import File from '../mixins/file.mixin';
import Scheduler from '../mixins/scheduler.mixin';

import type { CrawlerContext } from '../mixins/crawler.mixin';
import type { ServiceSchema } from 'moleculer';
import type { Moment } from 'moment';

type ID = {
  id: string;
};

type Person = {
  bio: string;
  depositions: string[];
  birthdate: Moment;
  end: Moment | null;
  email: string | null;
  image: string;
  lastname: string;
  legislature: number;
  name: string;
  party: string;
  region: string;
  socials: string[];
  start: Moment;
};

type Entity = ID & { value: Person };

const service: ServiceSchema = {
  actions: {
    getById: {
      async handler({ call, params }) {
        const { id } = params;

        return call('person.read', { id });
      },
      params: {
        id: 'string',
      },
    },

    getByName: {
      async handler({ call, params }) {
        const { name: needle } = params;

        const index: Record<string, string> = await call('person.read', { filename: 'index' });

        return Promise.all(
          Object.entries(index)
            .filter(([name]) => name.includes(needle))
            .map(([, id]) => id)
            .map((id) => call('person.read', { id })),
        );
      },
      params: {
        name: 'string',
      },
    },
  },

  crawler: {
    async default({ enqueueLinks, query }: CrawlerContext) {
      const links: string[] = (await query.$$getAttribute('table a', 'href')).filter(Boolean) as string[];

      await enqueueLinks({ label: 'details', urls: links });
    },
    async details({ enqueueLinks, query, report }: CrawlerContext) {},
  },

  events: {
    async 'person:crawler:entity'({ id: inputId, value }: Entity) {},
  },

  methods: {
    onComplete() {
      // console.log('tock');
      // this.broker.emit('tock');
    },
    onTick() {
      this.broker.call('legislature.crawl', { url: 'https://www.congreso.es/cem/historia' });
    },
  },

  mixins: [Crawler, File, Scheduler],

  name: 'legislature',

  settings: {
    crawler: {
      async errorHandler(context: CrawlerContext, error: Error) {
        this.logger.error(error);
        await context.browserController.close();
      },
      maxRequestsPerMinute: 20,
    },

    namespace: 'legislature',

    schedule: '0 0 * * *',
  },
};

export default service;
