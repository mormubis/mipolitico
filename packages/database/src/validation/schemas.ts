import { z } from 'zod';

// Input schema for person.ts scraper output
export const PersonInputSchema = z.object({
  biography: z.string(),
  constituency: z.string(),
  electoralFormation: z.string(),
  fullConditionDate: z.string(),
  groupStartDate: z.string(),
  name: z.string(),
  parliamentaryGroup: z.string(),
  startDate: z.string(),
});
export type PersonInput = z.infer<typeof PersonInputSchema>;

// Input schema for voting.ts scraper output
export const VotingInputSchema = z.object({
  byAssent: z.boolean(),
  deputyGroup: z.string(),
  deputyName: z.string(),
  deputySeat: z.string(),
  jsonUrl: z.string(),
  legislature: z.number(),
  sessionNumber: z.number(),
  totalAbstention: z.number(),
  totalAgainst: z.number(),
  totalFor: z.number(),
  totalNoVote: z.number(),
  totalPresent: z.number(),
  vote: z.string(),
  votingDate: z.string(),
  votingDescription: z.string(),
  votingNumber: z.number(),
  votingTitle: z.string(),
});
export type VotingInput = z.infer<typeof VotingInputSchema>;

// Input schema for intervention.ts scraper output
export const SpeechInputSchema = z.object({
  order: z.number(),
  sessionDate: z.string(),
  sessionId: z.string(),
  sessionTitle: z.string(),
  sessionUrl: z.string(),
  speaker: z.string(),
  speakerName: z.string(),
  speakerRole: z.string().optional(),
  text: z.string(),
});
export type SpeechInput = z.infer<typeof SpeechInputSchema>;

// Input schema for bureau.ts scraper output
export const BureauInputSchema = z.object({
  endDate: z.string(),
  group: z.string(),
  name: z.string(),
  organName: z.string(),
  position: z.string(),
  startDate: z.string(),
});
export type BureauInput = z.infer<typeof BureauInputSchema>;

// Parliamentary bill (ProyectosDeLey, ProposicionesDeLey, PropuestasDeReforma)
export const ParliamentaryInitiativeSchema = z.object({
  // presentationDate is validated but not stored — the Initiative model does
  // not have a presentedDate field. Add one if parliamentary submission dates
  // become relevant for analytics.
  currentStatus: z.string().optional(),
  fileNumber: z.string().min(1),
  legislature: z.number().int(),
  presentationDate: z.string().optional(),
  processingResult: z.string().optional(),
  subject: z.string(),
  type: z.string(),
});
export type ParliamentaryInitiativeInput = z.infer<
  typeof ParliamentaryInitiativeSchema
>;

// Approved law / Real decreto (IniciativasLegislativasAprobadas)
export const ApprovedLawSchema = z.object({
  bulletinDate: z.string().optional(),
  bulletinNumber: z.string().min(1),
  lawDate: z.string().optional(),
  lawNumber: z.string().optional(),
  lawTitle: z.string(),
  legislature: z.number().int(),
  pdf: z.string().optional(),
  type: z.string(),
});
export type ApprovedLawInput = z.infer<typeof ApprovedLawSchema>;

export const InitiativeInputSchema = z.union([
  ParliamentaryInitiativeSchema,
  ApprovedLawSchema,
]);
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
  bankAccounts: z.array(BankAccountInputSchema).optional(),
  deputyId: z.string(),
  incomeSources: z.array(IncomeSourceInputSchema).optional(),
  movableAssets: z.array(MovableAssetInputSchema).optional(),
  pdfUrl: z.string().optional(),
  professionalActivities: z.array(ProfessionalActivityInputSchema).optional(),
  realEstate: z.array(RealEstateAssetInputSchema).optional(),
  securities: z.array(SecurityInputSchema).optional(),
  year: z.number().int(),
});
export type InterestDeclarationInput = z.infer<
  typeof InterestDeclarationInputSchema
>;

// Input schema for interest-declarations-detail retriever output.
// Contains raw scraped data before entity resolution.
// A processor resolves name → Deputy.id to produce InterestDeclarationInput.
export const InterestDeclarationDetailInputSchema = z.object({
  codParlamentario: z.number(),
  name: z.string().min(1),
  pdfActividades: z.string().optional(),
  pdfBienesRentas: z.string().optional(),
  pdfInteresesEconomicos: z.string().optional(),
});
export type InterestDeclarationDetailInput = z.infer<
  typeof InterestDeclarationDetailInputSchema
>;

// Input schema for person-detail retriever output.
// Contains raw scraped data before entity resolution.
// A processor resolves name → Person.id to persist enriched person data.
export const PersonDetailInputSchema = z.object({
  birthDate: z.string().optional(),
  codParlamentario: z.number(),
  electoralFormation: z.string().min(1),
  email: z.string().optional(),
  facebook: z.string().optional(),
  instagram: z.string().optional(),
  linkedin: z.string().optional(),
  name: z.string().min(1),
  parliamentaryGroup: z.string(),
  partyName: z.string().optional(),
  photoUrl: z.string(),
  twitter: z.string().optional(),
  web: z.string().optional(),
});
export type PersonDetailInput = z.infer<typeof PersonDetailInputSchema>;

// Input schema for party scraper output
export const PartyInputSchema = z.object({
  name: z.string().min(1),
  shortName: z.string().min(1),
  parentShortName: z.string().optional(),
});
export type PartyInput = z.infer<typeof PartyInputSchema>;
