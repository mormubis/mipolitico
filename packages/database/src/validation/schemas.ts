import { z } from 'zod';

// Input schema for person.ts scraper output
export const PersonInputSchema = z.object({
  BIOGRAFIA: z.string(),
  CIRCUNSCRIPCION: z.string(),
  FECHAALTA: z.string(),
  FECHAALTAENGRUPOPARLAMENTARIO: z.string(),
  FECHACONDICIONPLENA: z.string(),
  FORMACIONELECTORAL: z.string(),
  GRUPOPARLAMENTARIO: z.string(),
  NOMBRE: z.string(),
});
export type PersonInput = z.infer<typeof PersonInputSchema>;

// Input schema for voting.ts scraper output
export const VotingInputSchema = z.object({
  LEGISLATURE: z.number(),
  SESSION_NUMBER: z.number(),
  VOTING_NUMBER: z.number(),
  VOTING_DATE: z.string(),
  VOTING_TITLE: z.string(),
  VOTING_DESCRIPTION: z.string(),
  BY_ASSENT: z.boolean(),
  TOTAL_PRESENT: z.number(),
  TOTAL_FOR: z.number(),
  TOTAL_AGAINST: z.number(),
  TOTAL_ABSTENTION: z.number(),
  TOTAL_NO_VOTE: z.number(),
  DEPUTY_SEAT: z.string(),
  DEPUTY_NAME: z.string(),
  DEPUTY_GROUP: z.string(),
  VOTE: z.string(),
  JSON_URL: z.string(),
});
export type VotingInput = z.infer<typeof VotingInputSchema>;

// Input schema for intervention.ts scraper output
export const SpeechInputSchema = z.object({
  ORDER: z.number(),
  SESSION_DATE: z.string(),
  SESSION_ID: z.string(),
  SESSION_TITLE: z.string(),
  SESSION_URL: z.string(),
  SPEAKER: z.string(),
  SPEAKER_NAME: z.string(),
  SPEAKER_ROLE: z.string().optional(),
  TEXT: z.string(),
});
export type SpeechInput = z.infer<typeof SpeechInputSchema>;

// Input schema for bureau.ts scraper output
export const BureauInputSchema = z.object({
  Cargo: z.string(),
  FechaAlta: z.string(),
  FechaBaja: z.string(),
  Grupo: z.string(),
  Nombre: z.string(),
  NombreOrgano: z.string(),
});
export type BureauInput = z.infer<typeof BureauInputSchema>;
