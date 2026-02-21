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

// Input schema for initiatives.ts scraper output
export const InitiativeInputSchema = z.object({
  LEGISLATURE: z.number().int(),
  TIPO: z.string(),
  NUMERO_LEY: z.string().optional(),
  TITULO_LEY: z.string(),
  NUMERO_BOLETIN: z.string().optional(),
  FECHA_BOLETIN: z.string().optional(),
  FECHA_LEY: z.string().optional(),
  PDF: z.string().optional(),
});
export type InitiativeInput = z.infer<typeof InitiativeInputSchema>;

// Input schemas for interestDeclarations.ts scraper output
export const BankAccountInputSchema = z.object({
  accountType: z.string(),
  balanceRange: z.string().optional(),
  institution: z.string(),
});

export const IncomeSourceInputSchema = z.object({
  amountRange: z.string().optional(),
  concept: z.string(),
  source: z.string(),
});

export const MovableAssetInputSchema = z.object({
  acquisitionYear: z.number().int().optional(),
  assetType: z.string(),
  description: z.string().optional(),
  value: z.number().optional(),
});

export const ProfessionalActivityInputSchema = z.object({
  endDate: z.string().optional(),
  entity: z.string(),
  position: z.string(),
  remunerated: z.boolean(),
  startDate: z.string().optional(),
});

export const RealEstateAssetInputSchema = z.object({
  acquisitionValue: z.number().optional(),
  acquisitionYear: z.number().int().optional(),
  address: z.string().optional(),
  currentValue: z.number().optional(),
  mortgage: z.number().optional(),
  propertyType: z.string(),
  surface: z.number().optional(),
});

export const SecurityInputSchema = z.object({
  acquisitionYear: z.number().int().optional(),
  issuer: z.string(),
  marketValue: z.number().optional(),
  nominalValue: z.number().optional(),
  securityType: z.string(),
});

export const InterestDeclarationInputSchema = z.object({
  BANK_ACCOUNTS: z.array(BankAccountInputSchema).optional(),
  DEPUTY_ID: z.string(),
  INCOME_SOURCES: z.array(IncomeSourceInputSchema).optional(),
  MOVABLE_ASSETS: z.array(MovableAssetInputSchema).optional(),
  PDF_URL: z.string().optional(),
  PROFESSIONAL_ACTIVITIES: z.array(ProfessionalActivityInputSchema).optional(),
  REAL_ESTATE: z.array(RealEstateAssetInputSchema).optional(),
  SECURITIES: z.array(SecurityInputSchema).optional(),
  YEAR: z.number().int(),
});
export type InterestDeclarationInput = z.infer<
  typeof InterestDeclarationInputSchema
>;
