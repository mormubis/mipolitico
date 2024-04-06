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

const ALIASES = {
  'CC': [
    'Coalición Canaria',
    'Coalición Canaria-Nueva Canarias',
    'Grupo Parlamentario de Coalición Canaria',
  ],
  'CDS': ['Grupo Parlamentario CDS', 'Grupo Parlamentario de CDS'],
  'CiU': [
    'Catalán  (CiU)',
    'Catalán (CiU)',
    'Grupo Parlamentario Catalán (Convergencia i Unió)',
    'Grupo Parlamentario Catalán (Convergència i Unió)',
  ],
  'EAJ-PNV': [
    'Grupo Parlamentario Vasco (EAJ-PNV)',
    'Grupo Parlamentario Vasco (P.N.V.)',
    'Grupo Parlamentario Vasco (PNV)',
    'Grupo Vasco (PNV)',
    'Vasco (EAJ-PNV)',
  ],
  'ERC': [
    'Esquerra Republicana (ERC)',
    'Esquerra Republicana - Izquierda Unida-ICV',
    'Esquerra Republicana',
    'Republicano',
  ],
  'IU': [
    'Federal Izquierda Unida',
    'Grupo Parlamentario Federal Izquierda Unida-Iniciativa per Catalunya',
    'Grupo Parlamentario Federal de Izquierda Unida',
    'Grupo Parlamentario Mixto - Agrupación IU - IC',
    'Grupo Parlamentario de Izquierda Unida-Iniciativa per Catalunya',
    'Izquierda Unida - ICV',
    'La Izquierda Plural',
  ],
  'JxCat': ['Junts per Catalunya'],
  'Mixto': ['Grupo Parlamentario Mixto'],
  'PP': [
    'Grupo Parlamentario Coalición Popular',
    'Grupo Parlamentario Popular del Congreso',
    'Grupo Parlamentario Popular en el Congreso',
    'Grupo Parlamentario de Coalición Popular',
    'Popular en el Congreso',
    'Popular',
  ],
  'PSOE': [
    'Grupo Parlamentario Socialista del Congreso',
    'Grupo Parlamentario Socialista',
    'Grupo Socialista del Congreso',
    'Partido Socialista Obrero Español',
    'Socialista',
  ],
  'Podemos': ['Podemos-En Comú Podem-En Marea'],
  'SUMAR': ['Plurinacional SUMAR'],
  'UPyD': ['Unión Progreso y Democracia'],
  'Unidas Podemos': [
    'Confederal de Unidas Podemos-En Comú Podem-Galicia en Común',
    'Podemos-En Comú Podem-En Marea',
  ],
  'Unidos Podemos': ['Confederal de Unidos Podemos-En Comú Podem-En Marea'],
};

const NAMES = {
  'CC': 'Coalición Canaria',
  'CDS': 'Centro Democrático y Social',
  'CiU': 'Convergència i Unió',
  'EAJ-PNV': 'Partido Nacionalista Vasco',
  'ERC': 'Esquerra Republicana de Catalunya',
  'IU': 'Izquierda Unida',
  'JxCat': 'Junts per Catalunya',
  'Mixto': 'Mixto',
  'PP': 'Partido Popular',
  'PSOE': 'Partido Socialista Obrero Español',
  'SUMAR': 'SUMAR',
  'UPyD': 'Unión Progreso y Democracia',
  'Unidas Podemos': 'Unidas Podemos',
  'Unidos Podemos': 'Unidos Podemos',
};

const MAPPER = Object.entries(ALIASES).reduce(
  (acc, [id, names]) => {
    names.forEach((name) => {
      acc[name] = id;
    });

    return acc;
  },
  {} as Record<string, string>,
);

function hasName(name: string): name is keyof typeof NAMES {
  return name in NAMES;
}

const service = {
  actions: {
    get: {
      cache: true,
      async handler(context) {
        const { id, legislature = 15 } = context.params ?? {};

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

        const groups = await Promise.all(
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

        if (id) {
          return groups.find((group) => group.id === id);
        }

        return groups;
      },
      params: {
        id: 'string|optional',
        legislature: 'number|optional',
      },
    },

    id: {
      cache: true,
      handler(context) {
        const { name } = context.params;

        return MAPPER[name] ?? name;
      },
      params: {
        name: 'string',
      },
    },

    name: {
      cache: true,
      handler(context) {
        const { id } = context.params;

        return hasName(id) ? NAMES[id] : id;
      },
      params: {
        id: 'string',
      },
    },
  },

  name: 'group',
} satisfies ServiceSchema;

export default service;

type X = (typeof service)['actions']['get']['handler'];
