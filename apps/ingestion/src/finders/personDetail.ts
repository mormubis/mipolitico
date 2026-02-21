import { romanize } from '../utils.ts';

import type { Finder } from '../types.ts';

interface APIDeputyItem {
  apellidos: string;
  apellidosNombre: string;
  codParlamentario: number;
  fchAlta: string;
  fchBaja: string;
  formacion: string;
  genero: number;
  grupo: string;
  idCircunscripcion: number;
  idLegislatura: number;
  nombre: string;
  nombreCircunscripcion: string;
}

const finder: Finder = async ({ fetch }) => {
  const params = new URLSearchParams();
  params.append('_diputadomodule_idLegislatura', '15');
  params.append('_diputadomodule_filtroProvincias', '[]');

  const response = await fetch(
    'https://www.congreso.es/es/busqueda-de-diputados?p_p_id=diputadomodule&p_p_lifecycle=2&p_p_state=normal&p_p_mode=view&p_p_resource_id=searchDiputados&p_p_cacheability=cacheLevelPage',
    {
      headers: {
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      },
      body: params.toString(),
      method: 'POST',
    },
  );

  const { data } = (await response.json()) as { data: APIDeputyItem[] };

  return data.map((item) => ({
    url: `https://www.congreso.es/es/busqueda-de-diputados?p_p_id=diputadomodule&p_p_lifecycle=0&p_p_state=normal&p_p_mode=view&_diputadomodule_mostrarFicha=true&codParlamentario=${item.codParlamentario.toString()}&idLegislatura=${romanize(item.idLegislatura)}&mostrarAgenda=false`,
    extra: item,
  }));
};

export type { APIDeputyItem };
export { finder };
