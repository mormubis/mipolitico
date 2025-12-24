const params = new URLSearchParams();
params.append('_diputadomodule_idLegislatura', '15');
// params.append('_diputadomodule_grupo', 'all');
// params.append('_diputadomodule_formacion', 'all');
params.append('_diputadomodule_filtroProvincias', '[]');

// params.append('_diputadomodule_genero', '0');
// params.append('_diputadomodule_tipo', '0');
// params.append('_diputadomodule_nombre', '');
// params.append('_diputadomodule_apellidos', '');
// params.append('_diputadomodule_nombreCircunscripcion', '');

const response = await fetch(
  'https://www.congreso.es/en/busqueda-de-diputados?p_p_id=diputadomodule&p_p_lifecycle=2&p_p_state=normal&p_p_mode=view&p_p_resource_id=searchDiputados&p_p_cacheability=cacheLevelPage',
  {
    headers: {
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
    },
    referrer: 'https://www.congreso.es/en/busqueda-de-diputados',
    body: params.toString(),
    method: 'POST',
  },
);

console.log(await response.text());
