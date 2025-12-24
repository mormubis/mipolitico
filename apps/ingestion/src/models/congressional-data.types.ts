/**
 * Comprehensive TypeScript interfaces for Spanish Congressional data models
 * Based on analysis of examples/ data files
 */

// Base interface for all entities
export interface BaseEntity {
  id?: string;
  createdAt?: Date;
  updatedAt?: Date;
  dataHash?: string;  // SHA256 hash for change detection
}

// ============================================================================
// 1. CONGRESS MEMBERS MODEL
// ============================================================================
export interface CongressMember extends BaseEntity {
  /** Full name (surname, given name format) */
  NOMBRE: string;
  /** Electoral district/constituency */
  CIRCUNSCRIPCION: string;
  /** Political party/electoral formation */
  FORMACIONELECTORAL: string;
  /** Date of full condition in Congress */
  FECHACONDICIONPLENA: string;
  /** Registration/entry date */
  FECHAALTA: string;
  /** Parliamentary group name */
  GRUPOPARLAMENTARIO: string;
  /** Date joined parliamentary group */
  FECHAALTAENGRUPOPARLAMENTARIO: string;
  /** Detailed biographical information */
  BIOGRAFIA: string;
}

// ============================================================================
// 2. FINANCIAL DISCLOSURES MODEL
// ============================================================================
export interface FinancialDisclosure extends BaseEntity {
  /** Member name */
  NOMBRE: string;
  /** Registration date */
  FECHAREGISTRO: string;
  /** Declaration type */
  DECLARACION: string;
  /** Type of disclosure (ACTIVIDAD, BIENES, etc.) */
  TIPO: string;
  /** Time period covered */
  PERIODO: string;
  /** Employer (for activities) */
  EMPLEADOR?: string;
  /** Sector (PÚBLICO, PRIVADO) */
  SECTOR?: string;
  /** Description of activity or asset */
  DESCRIPCION: string;
}

// ============================================================================
// 3. RESIGNED MEMBERS MODEL
// ============================================================================
export interface ResignedMember extends CongressMember {
  /** Resignation/exit date */
  FECHABAJA: string;
  /** Date left parliamentary group */
  FECHABAJAENGRUPOPARLAMENTARIO: string;
}

// ============================================================================
// 4. PARLIAMENTARY SPEECHES MODEL
// ============================================================================
export interface Speech extends BaseEntity {
  /** Legislature identifier */
  LEGISLATURA: string;
  /** Initiative object/subject */
  OBJETOINICIATIVA: string;
  /** Session date */
  SESION: string;
  /** Parliamentary body (Pleno, Comisión) */
  ORGANO: string;
  /** Procedure phase */
  FASE: string;
  /** Type of intervention */
  TIPOINTERVENCION: string;
  /** Speaker name */
  ORADOR: string;
  /** Speaker's role/position */
  CARGOORADOR: string;
  /** Intervention start time */
  INICIOINTERVENCION: string;
  /** Intervention end time */
  FININTERVENCION: string;
  /** Deferred viewing link */
  ENLACEDIFERIDO: string;
  /** Direct download link */
  ENLACEDESCARGADIRECTA: string;
  /** Full text link */
  ENLACETEXTOINTEGRO: string;
}

// ============================================================================
// 5. VOTING RECORDS MODEL
// ============================================================================
export interface VoteInformation {
  /** Session number */
  sesion: number;
  /** Vote number within session */
  numeroVotacion: number;
  /** Vote date */
  fecha: string;
  /** Vote title/subject */
  titulo: string;
  /** Expedient text */
  textoExpediente: string;
  /** Subgroup title (optional) */
  tituloSubGrupo?: string;
  /** Subgroup text (optional) */
  textoSubGrupo?: string;
  /** Joint votes array */
  votacionesConjuntas: any[];
}

export interface VoteTotals {
  /** Whether passed by assent */
  asentimiento: "Sí" | "No";
  /** Total present members */
  presentes: number;
  /** Votes in favor */
  afavor: number;
  /** Votes against */
  encontra: number;
  /** Abstentions */
  abstenciones: number;
  /** Members who did not vote */
  novovtan: number;
}

export interface VoteDetail {
  /** Member name */
  diputado: string;
  /** Parliamentary group */
  grupo: string;
  /** Vote choice */
  voto: "Sí" | "No" | "Abstención" | "No vota";
}

export interface Vote extends BaseEntity {
  /** Vote information */
  informacion: VoteInformation;
  /** Vote totals */
  totales: VoteTotals;
  /** Individual member votes */
  votaciones: VoteDetail[];
}

// ============================================================================
// 6. GOVERNMENT BILLS MODEL
// ============================================================================
export interface GovernmentBill extends BaseEntity {
  /** Legislature identifier */
  LEGISLATURA: string;
  /** Super type classification */
  SUPERTIPO: string;
  /** Grouping category */
  AGRUPACION: string;
  /** Bill type (Proyecto de ley) */
  TIPO: string;
  /** Bill object/subject */
  OBJETO: string;
  /** Expedient number */
  NUMEXPEDIENTE: string;
  /** Presentation date */
  FECHAPRESENTACION: string;
  /** Qualification date */
  FECHACALIFICACION: string;
  /** Author (Government) */
  AUTOR: string;
  /** Processing type (Urgente, Normal) */
  TIPOTRAMITACION: string;
  /** Processing result */
  RESULTADOTRAMITACION: string;
  /** Current situation */
  SITUACIONACTUAL: string;
  /** Competent commission */
  COMISIONCOMPETENTE: string;
}

// ============================================================================
// 7. MEMBER BILLS MODEL
// ============================================================================
export interface MemberBill extends BaseEntity {
  /** Legislature identifier */
  LEGISLATURA: string;
  /** Super type classification */
  SUPERTIPO: string;
  /** Grouping category */
  AGRUPACION: string;
  /** Bill type (Proposición de ley) */
  TIPO: string;
  /** Bill object/subject */
  OBJETO: string;
  /** Expedient number */
  NUMEXPEDIENTE: string;
  /** Presentation date */
  FECHAPRESENTACION: string;
  /** Qualification date */
  FECHACALIFICACION: string;
  /** Author (Parliamentary group) */
  AUTOR: string;
  /** Processing type */
  TIPOTRAMITACION: string;
  /** Processing result */
  RESULTADOTRAMITACION: string;
  /** Current situation */
  SITUACIONACTUAL: string;
  /** Competent commission */
  COMISIONCOMPETENTE: string;
}

// ============================================================================
// 8. APPROVED LAWS MODEL
// ============================================================================
export interface ApprovedLaw extends BaseEntity {
  /** Type (Leyes) */
  TIPO: string;
  /** Law number */
  NUMERO_LEY: string;
  /** Law title */
  TITULO_LEY: string;
  /** Official bulletin number */
  NUMERO_BOLETIN: string;
  /** Bulletin publication date */
  FECHA_BOLETIN: string;
  /** Law enactment date */
  FECHA_LEY: string;
  /** PDF document link */
  PDF: string;
}

// ============================================================================
// 9. AMENDMENT BILLS MODEL
// ============================================================================
export interface AmendmentBill extends BaseEntity {
  /** Legislature identifier */
  LEGISLATURA: string;
  /** Super type classification */
  SUPERTIPO: string;
  /** Grouping category */
  AGRUPACION: string;
  /** Amendment type */
  TIPO: string;
  /** Amendment object/subject */
  OBJETO: string;
  /** Expedient number */
  NUMEXPEDIENTE: string;
  /** Presentation date */
  FECHAPRESENTACION: string;
  /** Qualification date */
  FECHACALIFICACION: string;
  /** Author */
  AUTOR: string;
  /** Processing type */
  TIPOTRAMITACION: string;
  /** Processing result */
  RESULTADOTRAMITACION: string;
  /** Current situation */
  SITUACIONACTUAL: string;
  /** Competent commission */
  COMISIONCOMPETENTE: string;
}

// ============================================================================
// NORMALIZED/PROCESSED MODELS
// ============================================================================

/**
 * Normalized person model (transformed from raw CongressMember)
 */
export interface NormalizedPerson extends BaseEntity {
  externalId: string;
  firstName: string;
  lastName: string;
  fullName: string;
  district: string;
  party: string;
  parliamentaryGroup: string;
  entryDate: Date;
  fullConditionDate: Date;
  groupJoinDate: Date;
  exitDate?: Date;
  biography: string;
  isActive: boolean;
}

/**
 * Change detection result
 */
export interface ChangeSet<T = any> {
  added: T[];
  modified: Array<{
    current: T;
    previous: T;
    changedFields: string[];
  }>;
  deleted: string[]; // IDs of deleted entities
}

/**
 * Ingestion job result
 */
export interface IngestionResult {
  sourceId: string;
  entityType: string;
  recordsProcessed: number;
  recordsAdded: number;
  recordsModified: number;
  recordsDeleted: number;
  processingTimeMs: number;
  timestamp: Date;
  errors?: string[];
}

/**
 * Fingerprinted entity for change detection
 */
export interface FingerprintedEntity<T = any> extends BaseEntity {
  entity: T;
  fingerprint: string;
  lastSeen: Date;
}

/**
 * Data source configuration
 */
export interface DataSourceConfig {
  id: string;
  name: string;
  type: 'api' | 'scraper' | 'feed' | 'file';
  endpoint?: string;
  schedule: string; // cron expression
  enabled: boolean;
  retryAttempts: number;
  timeout: number;
  rateLimit?: {
    requests: number;
    window: number; // milliseconds
  };
  headers?: Record<string, string>;
  selectors?: Record<string, string>; // for scrapers
}

// Union types for all entities
export type CongressionalEntity = 
  | CongressMember
  | FinancialDisclosure
  | ResignedMember
  | Speech
  | Vote
  | GovernmentBill
  | MemberBill
  | ApprovedLaw
  | AmendmentBill;

export type EntityType = 
  | 'congress-member'
  | 'financial-disclosure'
  | 'resignation'
  | 'speech'
  | 'vote'
  | 'government-bill'
  | 'member-bill'
  | 'approved-law'
  | 'amendment-bill';