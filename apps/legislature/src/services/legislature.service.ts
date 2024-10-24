import crawler, { type CrawlerRequestHandler } from '@congress/crawler';
import db from 'moleculer-db';
import SequelizeAdapter from 'moleculer-db-adapter-sequelize';
import { romanize } from 'romans';
import { DataTypes } from 'sequelize';

import type { ServiceSchema } from 'moleculer';

const service = {
  actions: {
    count: {
      visibility: 'protected',
    },
    create: {
      visibility: 'protected',
    },
    do() {
      return this.fetch();
    },
    find: {
      visibility: 'protected',
    },
    get: {
      async handler() {
        return this.actions.crawl?.({
          url: 'https://www.congreso.es/es/cem/historia',
        });
      },
      params: {
        id: 'number|optional',
      },
    },
    insert: {
      visibility: 'protected',
    },
    list: {
      visibility: 'protected',
    },
    remove: {
      visibility: 'protected',
    },
    update: {
      visibility: 'protected',
    },
  },

  adapter: new SequelizeAdapter('sqlite://legislature.sqlite'),

  crawler: {
    async default({ enqueueLinks }) {
      await enqueueLinks({
        label: 'legislature',
        globs: ['https://www.congreso.es/es/cem/*leg'],
      });
    },
    async legislature({ enqueueLinks, pushData, query, page }) {
      console.log('>>> legislature:page.url()', page.url());

      const title = await query.$textContent('.inplacedisplayid1siteid73');

      await pushData({ title });

      await enqueueLinks({
        label: 'president',
        globs: ['*/web/guest/presidentes-del-congreso-de-los-diputados*'],
      });
    },
    president({ page }) {
      console.log('>>> president:page.url()', page.url());
    },
  } satisfies Record<string, CrawlerRequestHandler>,

  methods: {
    fetch() {
      return this.actions.crawl?.(
        {
          url: 'https://www.congreso.es/es/cem/historia',
        },
        { timeout: 0 },
      );
    },
  },

  mixins: [crawler, db],

  model: {
    name: 'legislature',
    define: {
      id: { defaultValue: DataTypes.UUIDV4, primaryKey: true, type: DataTypes.UUID },
      url: DataTypes.TEXT,
      president: DataTypes.TEXT,
    },
    options: {
      paranoid: true,
      // Options from https://sequelize.org/docs/v6/moved/models-definition/
    },
  },

  name: 'legislature',

  settings: {
    crawler: {
      maxConcurrency: 1,
      sameDomainDelaySecs: 2,
    },
  },

  started() {
    // return this.fetch();
  },
} satisfies ServiceSchema;

export default service;
