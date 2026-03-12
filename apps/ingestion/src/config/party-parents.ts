/**
 * Static map of regional electoral formation shortNames to their canonical
 * parent party shortName. Maintained manually — update when new parties
 * enter parliament after an election.
 *
 * Source: DiputadosActivos opendata, XV legislature (2023–present).
 *
 * Only PSOE regional branches appear under distinct shortNames in the current
 * dataset. Other parties (PP, VOX, etc.) use a single shortName nationwide.
 */
export const PARTY_PARENTS: Record<string, string> = {
  'PSC-PSOE': 'PSOE',
  'PSE-EE (PSOE)': 'PSOE',
  'PsdeG-PSOE': 'PSOE',
  'PSIB-PSOE': 'PSOE',
  'PSN-PSOE': 'PSOE',
};
