/**
 * Static map of electoral formation shortNames to their canonical parent party
 * shortName. Maintained manually — update when new parties enter parliament.
 *
 * Source: DiputadosActivos opendata, XV legislature (2023–present).
 */
export const PARTY_PARENTS: Record<string, string> = {
  'PSC-PSOE': 'PSOE',
  'PSE-EE (PSOE)': 'PSOE',
  'PsdeG-PSOE': 'PSOE',
  'PSIB-PSOE': 'PSOE',
  'PSN-PSOE': 'PSOE',
};

/**
 * Static map of electoral formation shortNames to their full party names.
 * The profile page does not expose full party names so this is maintained
 * manually. Update when new parties enter parliament.
 *
 * Source: DiputadosActivos opendata, XV legislature (2023–present).
 */
export const PARTY_NAMES: Record<string, string> = {
  'BNG': 'Bloque Nacionalista Galego',
  'CCa': 'Coalición Canaria',
  'EAJ-PNV': 'Euzko Alderdi Jeltzalea - Partido Nacionalista Vasco',
  'EH Bildu': 'EH Bildu',
  'ERC': 'Esquerra Republicana de Catalunya',
  'JxCAT-JUNTS': 'Junts per Catalunya',
  'PP': 'Partido Popular',
  'PSC-PSOE': 'Partit dels Socialistes de Catalunya',
  'PSE-EE (PSOE)': 'Partido Socialista de Euskadi - Euskadiko Ezkerra',
  'PSIB-PSOE': 'Partido Socialista de las Islas Baleares',
  'PSN-PSOE': 'Partido Socialista de Navarra',
  'PSOE': 'Partido Socialista Obrero Español',
  'PsdeG-PSOE': 'Partido Socialista de Galicia',
  'SUMAR': 'Sumar',
  'UPN': 'Unión del Pueblo Navarro',
  'VOX': 'Vox',
};
