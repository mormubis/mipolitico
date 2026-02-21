/**
 * OpenAPI schema components for API documentation
 * Used by @fastify/swagger to generate OpenAPI 3.x specification
 */

/**
 * Standard error response schema
 */
export const errorSchema = {
  type: 'object',
  properties: {
    error: { type: 'string', description: 'Error message' },
    status: { type: 'integer', description: 'HTTP status code' },
    details: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          field: { type: 'string' },
          message: { type: 'string' },
        },
      },
      description: 'Validation error details (optional)',
    },
  },
  required: ['error', 'status'],
};

/**
 * Pagination query parameters (common across list endpoints)
 */
export const paginationQuerySchema = {
  limit: {
    type: 'integer',
    minimum: 1,
    maximum: 100,
    default: 20,
    description: 'Number of items to return (max 100)',
  },
  offset: {
    type: 'integer',
    minimum: 0,
    default: 0,
    description: 'Number of items to skip',
  },
  page: {
    type: 'integer',
    minimum: 1,
    description: 'Page number (alternative to offset)',
  },
  sort: {
    type: 'string',
    description: 'Field name to sort by',
  },
  order: {
    type: 'string',
    enum: ['asc', 'desc'],
    default: 'asc',
    description: 'Sort order',
  },
};

/**
 * Deputy entity schema
 */
export const deputySchema = {
  type: 'object',
  properties: {
    id: {
      type: 'string',
      format: 'cuid',
      description: 'Unique deputy identifier',
    },
    personId: { type: 'string', description: 'Person identifier' },
    constituency: {
      type: 'string',
      description: 'Electoral constituency',
      example: 'Madrid',
    },
    startDate: {
      type: 'string',
      format: 'date-time',
      description: 'Start date of mandate',
    },
    fullConditionDate: {
      type: 'string',
      format: 'date-time',
      nullable: true,
      description: 'Date when deputy acquired full condition',
    },
    parliamentaryGroup: {
      type: 'string',
      description: 'Parliamentary group',
      example: 'PSOE',
    },
    electoralFormation: {
      type: 'string',
      description: 'Electoral formation',
      example: 'PSOE',
    },
    legislature: {
      type: 'integer',
      description: 'Legislature number',
      example: 15,
    },
    person: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Person identifier' },
        name: {
          type: 'string',
          description: 'Full name',
          example: 'Juan García López',
        },
        biography: {
          type: 'string',
          nullable: true,
          description: 'Biographical information',
        },
      },
    },
  },
};

/**
 * Voting session schema
 */
export const votingSessionSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', description: 'Unique voting session identifier' },
    legislature: {
      type: 'integer',
      description: 'Legislature number',
      example: 15,
    },
    sessionNumber: {
      type: 'integer',
      description: 'Session number',
      example: 12,
    },
    votingNumber: {
      type: 'integer',
      description: 'Voting number within session',
      example: 3,
    },
    votingDate: {
      type: 'string',
      format: 'date-time',
      description: 'Date and time of vote',
    },
    title: {
      type: 'string',
      description: 'Voting title',
      example: 'Budget approval',
    },
    description: {
      type: 'string',
      description: 'Detailed description of what was voted on',
    },
    byAssent: { type: 'boolean', description: 'Whether vote was by assent' },
    totalPresent: {
      type: 'integer',
      description: 'Total deputies present',
      example: 340,
    },
    totalFor: {
      type: 'integer',
      description: 'Total votes in favor',
      example: 180,
    },
    totalAgainst: {
      type: 'integer',
      description: 'Total votes against',
      example: 140,
    },
    totalAbstention: {
      type: 'integer',
      description: 'Total abstentions',
      example: 20,
    },
    totalNoVote: {
      type: 'integer',
      description: 'Total deputies who did not vote',
      example: 0,
    },
    sourceUrl: {
      type: 'string',
      format: 'uri',
      description: 'Source URL on congreso.es',
    },
    votes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          deputySeat: {
            type: 'string',
            description: 'Deputy seat number',
            example: '123',
          },
          deputyName: {
            type: 'string',
            description: 'Deputy name',
            example: 'García López, Juan',
          },
          deputyGroup: {
            type: 'string',
            description: 'Parliamentary group',
            example: 'PSOE',
          },
          vote: {
            type: 'string',
            description: 'Vote cast',
            example: 'Sí',
            enum: ['Sí', 'No', 'Abstención', 'No Vota'],
          },
        },
      },
      description: 'Individual deputy votes',
    },
  },
};

/**
 * Speech entity schema
 */
export const speechSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', description: 'Unique speech identifier' },
    personId: {
      type: 'string',
      nullable: true,
      description: 'Person identifier (null for unidentified speakers)',
    },
    sessionId: { type: 'string', description: 'Plenary session identifier' },
    sessionDate: {
      type: 'string',
      format: 'date-time',
      description: 'Session date',
    },
    sessionTitle: {
      type: 'string',
      description: 'Session title',
      example: 'Debate de investidura',
    },
    speakerName: {
      type: 'string',
      description: 'Name of speaker',
      example: 'Pedro Sánchez',
    },
    speakerRole: {
      type: 'string',
      nullable: true,
      description: 'Role of speaker',
      example: 'Presidente del Gobierno',
    },
    text: {
      type: 'string',
      description: 'Full text of speech or intervention',
    },
    orderInSession: {
      type: 'integer',
      description: 'Order within session',
      example: 12,
    },
  },
};

/**
 * Initiative entity schema
 */
export const initiativeSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', description: 'Unique initiative identifier' },
    legislature: {
      type: 'integer',
      description: 'Legislature number',
      example: 15,
    },
    tipo: {
      type: 'string',
      description: 'Initiative type',
      example: 'Proyecto de Ley',
    },
    number: {
      type: 'string',
      nullable: true,
      description: 'Law number (null if not enacted)',
    },
    title: { type: 'string', description: 'Full title of the initiative' },
    bulletinNumber: {
      type: 'string',
      nullable: true,
      description: 'Official gazette bulletin number',
    },
    bulletinDate: {
      type: 'string',
      format: 'date-time',
      nullable: true,
      description: 'Gazette publication date',
    },
    enactedDate: {
      type: 'string',
      format: 'date-time',
      nullable: true,
      description: 'Date enacted into law (null if pending)',
    },
    pdfUrl: {
      type: 'string',
      format: 'uri',
      nullable: true,
      description: 'URL to official PDF',
    },
  },
};

/**
 * Organ member schema
 */
export const organMemberSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', description: 'Unique organ member identifier' },
    personId: {
      type: 'string',
      nullable: true,
      description: 'Person identifier (null if not linked)',
    },
    name: {
      type: 'string',
      description: 'Full name',
      example: 'Francina Armengol',
    },
    position: {
      type: 'string',
      description: 'Position held',
      example: 'Presidenta',
    },
    organ: {
      type: 'string',
      description: 'Congressional organ',
      example: 'Mesa del Congreso',
    },
    organType: {
      type: 'string',
      enum: [
        'MESA',
        'COMISION',
        'JUNTA_PORTAVOCES',
        'DIPUTACION_PERMANENTE',
        'OTHER',
      ],
      description: 'Type of congressional organ',
    },
    partyGroup: {
      type: 'string',
      description: 'Party/parliamentary group',
      example: 'PSOE',
    },
    startDate: {
      type: 'string',
      format: 'date-time',
      description: 'Start date of position',
    },
    endDate: {
      type: 'string',
      format: 'date-time',
      nullable: true,
      description: 'End date (null if current)',
    },
  },
};
