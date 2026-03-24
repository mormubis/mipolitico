/**
 * Manual overrides for transcript speaker names that cannot be resolved
 * through normalisation alone due to transcription errors or unusual
 * formatting in the Diario de Sesiones.
 *
 * Key:   Transcript speaker name (ALL-CAPS, as it appears in the HTML)
 * Value: Canonical Person.name (as stored in the database)
 *
 * Add entries here when a deputy consistently appears under a misspelled
 * or non-standard form in session transcripts. Run the ingestion and check
 * for unmatched deputy names to identify new cases.
 *
 * Known patterns:
 * - Compound surnames with hyphen removed AND no space: ALONSOMUÑUMER
 * - Catalan names with terminal consonant added: CANTORNER (should be CANTORNE)
 * - OCR/typographical errors: spaces within words, swapped characters
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
};
