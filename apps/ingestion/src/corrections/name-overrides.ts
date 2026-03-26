/**
 * Corrections for speaker name errors in the Diario de Sesiones transcripts.
 *
 * This is NOT configuration — these are data quality fixes for specific errors
 * found in the congress.es source. Add an entry when a deputy's name appears
 * consistently misspelled or malformed in session transcripts in a way that
 * normalizeSpanishName() cannot handle systematically.
 *
 * Key:   Speaker name exactly as it appears in the HTML transcript (ALL-CAPS)
 * Value: Canonical Person.name as stored in the database ("Apellidos, Nombre")
 *
 * How to discover new cases: after an ingestion run, query:
 *   SELECT speakerName, COUNT(*) FROM Intervention
 *   WHERE personId IS NULL AND speakerName GLOB '[A-ZÁ-Ú ]*'
 *   GROUP BY speakerName ORDER BY COUNT(*) DESC
 * then cross-reference against Person.name to find likely matches.
 */
export const NAME_OVERRIDES: Record<string, string> = {
  // Compound hyphenated surname transcribed without hyphen or space
  'SÁEZ ALONSOMUÑUMER': 'Sáez Alonso-Muñumer, Pablo',

  // Catalan terminal consonant added by transcription error
  'ALONSO CANTORNER': 'Alonso Cantorné, Fèlix',

  // OCR error: space inserted mid-word
  'ÁLV ARO VIDAL': 'Álvaro Vidal, Francesc-Marc',

  // Typo in transcript: Viedma vs Biedma
  'AGUIRRE GIL DE VIEDMA': 'Aguirre Gil de Biedma, Rocío',
  'AGUIRRE Y GIL DE BIEDMA': 'Aguirre Gil de Biedma, Rocío',

  // Former ministers appearing as ALL-CAPS surnames in committee hearings.
  // These people have no Person records since they were not XV legislature deputies.
  // Canonical names enable upsertGovernmentMembers to create Person records correctly.
  'MONTORO ROMERO': 'Montoro Romero, Cristóbal',
  'FERNÁNDEZ DÍAZ': 'Fernández Díaz, Jorge',
  'RAJOY BREY': 'Rajoy Brey, Mariano',
  'DE COSPEDAL GARCÍA': 'De Cospedal García, María Dolores',
  'SÁENZ DE SANTAMARÍA ANTÓN': 'Sáenz de Santamaría Antón, Soraya',
  'ILLA I ROCA': 'Illa Roca, Salvador',
  'MAS I GAVARRÓ': 'Mas Gavarró, Artur',
  'JUNQUERAS VIES': 'Junqueras Vies, Oriol',
};
