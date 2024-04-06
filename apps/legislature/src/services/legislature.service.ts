import { ServiceSchema } from 'moleculer';
import { romanize } from 'romans';

type Group = {
  listaDir: {
    descripcion: string;
    direccion: string;
    idTipo: number;
    orden: number;
    tieneImagen: boolean;
    secuencial: number;
    idGrupo: number;
  }[];
  nombreGrupo: string;
  gprDescAbr: string;
  grpDesc: string;
  codOrg: number;
  numMiembros: number;
  idLegislatura: number;
  fechaConstitucion: string;
};

type GroupResponse = {
  data: Group[];
};

const service: ServiceSchema = {
  actions: {
    get: {
      cache: true,
      async handler(context) {
        const { id = 15 } = context.params ?? {};

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
            body: new URLSearchParams({
              _grupos_idLegislatura: romanize(legislature),
            }),
            method: 'POST',
          },
        );

        const { data } = (await response.json()) as GroupResponse;

        return await Promise.all(
          data.map(async (group) => {
            const id = await context.call('group.id', { name: group.nombreGrupo });

            return {
              id,
              name: await context.call('group.name', { id }),
              description: group.grpDesc,
              links: (group.listaDir || [])?.map((link) => ({
                description: link.descripcion,
                value: link.direccion,
              })),
            };
          }),
        );
      },
      params: {
        id: 'string|optional',
      },
    },
  },

  name: 'legislature',
};

export default service;
