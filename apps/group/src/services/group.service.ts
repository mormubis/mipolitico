import { ServiceSchema } from 'moleculer';

const service: ServiceSchema = {
  actions: {
    get: {
      async handler({ params }) {
        const { id, legislature, name } = params ?? {};

        const response = await fetch(
          'https://www.congreso.es/es/grupos/composicion-en-la-legislatura?p_p_id=grupos&p_p_lifecycle=2&p_p_state=normal&p_p_mode=view&p_p_resource_id=gruposSearch&p_p_cacheability=cacheLevelPage',
          {
            headers: {
              'accept': 'application/json, text/javascript, */*; q=0.01',
              'accept-language': 'en-US,en;q=0.6',
              'cache-control': 'no-cache',
              'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
              'x-requested-with': 'XMLHttpRequest',
            },
            body: '_grupos_currentLegislatura=15&_grupos_idLegislatura=XV',
            method: 'POST',
          },
        );

        const data = await response.json();

        return data;
      },
      params: {
        id: 'string|optional',
        legislature: 'number|optional',
        name: 'string|optional',
      },
    },
  },

  name: 'group',
};

export default service;
