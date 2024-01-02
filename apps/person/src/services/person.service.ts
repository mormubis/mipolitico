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
    async default({ enqueueLinks, page, query }: CrawlerContext) {
      await page.selectOption('#_diputadomodule_tipo', '2');

      await Promise.all([
        page.click('#_diputadomodule_searchButtonDiputadosForm'),
        page.waitForRequest(/busqueda-de-diputados/),
      ]);

      await enqueueLinks({
        label: 'profile',
        globs: ['https://www.congreso.es/busqueda-de-diputados*codParlamentario=*'],
      });

      const [, max] =
        (await query.$textContentMatch('#_diputadomodule_resultsShowedDiputados', /Resultados \d+ a \d+ de (\d+)/)) ??
        [];

      for (let i = 0; i < Number(max); ) {
        await page.click('#_diputadomodule_paginationLinksDiputados li:nth-of-type(8) a');

        await enqueueLinks({
          label: 'profile',
          globs: ['https://www.congreso.es/busqueda-de-diputados*codParlamentario=*'],
        });

        const [, current] =
          (await query.$textContentMatch('#_diputadomodule_resultsShowedDiputados', /Resultados \d+ a (\d+) de \d+/)) ??
          [];

        i = Number(current);
      }
    },
    async profile({ enqueueLinks, page, query, report }: CrawlerContext) {
      const url = page.url();

      // <INFORMATION>
      const depositions = await query.$$getAttribute('.declaraciones-dip a', 'href');
      const [dob] =
        (await query.$textContentMatch('.row.cuerpo-diputado-detalle:nth-child(2) .row p', /\d{2}\/\d{2}\/\d{4}/i)) ??
        [];
      const [, end] =
        (await query.$textContentMatch('.f-alta:nth-of-type(2)', /Causó baja el (\d{2}\/\d{2}\/\d{4})/i)) ?? [];
      const email = (await query.$textContent('.email-dip')) ?? null;
      const [, id] = url.match(/codParlamentario=(\d+)/i) ?? [];
      const image = await query.$getAttribute('.card-img-top', 'src');
      const legislature = await query.$eval(
        '#_diputadomodule_legislaturasDiputado',
        (element) => (element as HTMLSelectElement).value,
      );
      const [lastname, name] = (await query.$textContent('.nombre-dip'))?.split(',') ?? [];
      const party = await query.$textContent('.siglas-partido');
      const [, region] = (await query.$textContentMatch('.cargo-dip', /Diputado por (.+)/)) ?? [];
      const [, start] =
        (await query.$textContentMatch('.f-alta:nth-of-type(1)', /Condición plena: (\d{2}\/\d{2}\/\d{4})/i)) ?? [];
      const socials = await query.$$getAttribute('.rrss-dip a', 'href');

      // This modifies the page to make easier read the content
      const bio = await query.$eval('.row.cuerpo-diputado-detalle:nth-child(2) .row .col-12', (element) => {
        Array.from(element.children).forEach((child) => child.remove());

        return element.textContent?.trim();
      });
      // </INFORMATION>

      // <PREVIOUS INFORMATION>
      if (legislature === '14') {
        // Enqueue the history of the congress person
        const history = await query.$eval('#_diputadomodule_legislaturasDiputado', (element) => {
          const options = (element as HTMLSelectElement).options;
          const [, ...keys] = Array.from(options).map((option) => {
            const [key] = option.text.split(' ');

            return key;
          });

          return keys;
        });

        await enqueueLinks({
          label: 'profile',
          urls: history.map((key) => `${url}&idLegislaturaDestino=${key}`),
        });
      }
      // </PREVIOUS INFORMATION>

      // <REPORT />
      report(`${id}`, {
        bio,
        depositions,
        birthdate: moment(dob, 'DD/MM/YYYY'),
        end: end ? moment(end, 'DD/MM/YYYY') : null,
        email: email || null,
        image,
        lastname: lastname?.trim(),
        legislature: Number(legislature),
        name: name?.trim(),
        party,
        region,
        socials,
        start: moment(start, 'DD/MM/YYYY'),
      });
    },
  },

  events: {
    async 'person:crawler:entity'({ id: inputId, value }: Entity) {
      const index: Record<string, string> = await this.broker.call('person.read', { filename: 'index' });
      const isHistorical = value.legislature !== 14;

      let id = inputId;
      let previous: Partial<Person> & { history?: any } = {};

      if (isHistorical) {
        id = index[`${value.name} ${value.lastname}`] ?? '0';
      }

      if (await this.broker.call('person.exist', { filename: `${id}` })) {
        previous = await this.broker.call('person.read', { filename: `${id}` });
      }

      if (isHistorical) {
        previous.history = [...(previous.history ?? []), value].sort((a, b) => b.legislature - a.legislature);
      } else {
        previous = { ...previous, ...value };
      }

      // Store the person
      this.broker.call('person.write', { filename: `${id}`, value: previous });

      if (!isHistorical) {
        // Create an index based on name + lastname
        const { lastname, name } = value;

        index[`${name} ${lastname}`] = id;

        this.broker.call('person.write', { filename: 'index', value: index });
      }
    },

    async '$services.changed'({ localService }: { localService: boolean }) {
      if (localService && !(await this.broker.call('person.exist', { filename: 'index' }))) {
        this.broker.call('person.write', { filename: 'index', value: {} });
      }
    },
  },

  // merged(schema: ServiceSchema) {
  //   const OVERRIDE = ['crawl', 'exist', 'read', 'write'];
  //
  //   OVERRIDE.forEach((name) => {
  //     const action = schema.actions?.[name];
  //
  //     if (action && action.visiblity) {
  //       schema.actions[name] = {
  //         handler: action,
  //       };
  //       action.visibility = 'protected';
  //     }
  //   });
  // },

  methods: {
    onComplete() {
      // console.log('tock');
      // this.broker.emit('tock');
    },
    onTick() {
      // console.log('tick');
      // this.broker.emit('tick');
    },
  },

  mixins: [Crawler, File, Scheduler],

  name: 'person',

  settings: {
    crawler: {
      async errorHandler(context: CrawlerContext, error: Error) {
        this.logger.error(error);
        await context.browserController.close();
      },
      maxRequestsPerMinute: 20,
    },

    namespace: 'person',

    schedule: '0 0 * * *',
  },
};

export default service;
