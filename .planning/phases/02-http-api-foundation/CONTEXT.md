# Phase 2 Context: HTTP API Foundation

**Date**: 2026-01-21 **Status**: Context gathering complete via
`/gsd:discuss-phase 2` **Participants**: User decisions through interactive
questioning

## 1. Phase Overview

Phase 2 implements a public REST API serving all congressional data (deputies,
votes, speeches, bureau members) with filtering, pagination, caching, and
OpenAPI documentation.

## 2. Framework & Technology Stack

### Framework Decision

- **Selected**: Fastify
- **Rationale**: High-performance Node.js framework with strong validation
  support and schema integration
- **Key Capabilities**: Built-in request validation, JSON schema support,
  comprehensive error handling

### API Foundation Stack

- **Web Framework**: Fastify v4+
- **Database Client**: Prisma (already established in Phase 1)
- **Validation**: Zod schemas (already established in Phase 1)
- **Documentation**: OpenAPI 3.0 / Swagger
- **Caching**: HTTP cache headers (Cache-Control, ETag)

## 3. API Design Decisions

### 3.1 Versioning Strategy

- **Selected**: Version in path
- **Format**: `/api/v1/resource`
- **Examples**:
  - `GET /api/v1/deputies`
  - `GET /api/v1/votes`
  - `GET /api/v1/speeches`
  - `GET /api/v1/bureaus`

### 3.2 Response Structure

- **Selected**: Direct data
- **Pattern for lists**: Return array directly
  ```json
  [
    {id: 1, name: "Deputy Name", ...},
    {id: 2, name: "Deputy Name 2", ...}
  ]
  ```
- **Pattern for single items**: Return object directly
  ```json
  {id: 1, name: "Deputy Name", ...}
  ```

### 3.3 Endpoint Naming

- **Selected**: RESTful collections pattern
- **Conventions**:
  - List: `GET /api/v1/deputies`
  - Get single: `GET /api/v1/deputies/{id}`
  - Collections by entity type: `deputies`, `votes`, `speeches`, `bureaus`

### 3.4 Content Negotiation

- **Selected**: JSON only
- **Supported Format**: application/json
- **Accept Header**: Not required; all responses are JSON
- **Implication**: No CSV export or format negotiation initially

### 3.5 Authentication

- **Selected**: Public API
- **Access Level**: No authentication required
- **Implication**: Rate limiting may be applied at infrastructure level, not
  application level

## 4. Filtering & Search Strategy

### 4.1 Filtering Implementation

- **Selected**: Query parameters
- **Format**: `?fieldName=value&otherField=value`
- **Examples**:
  - `GET /api/v1/deputies?partyGroup=PP`
  - `GET /api/v1/deputies?lastName=Pérez&legislature=14`
  - `GET /api/v1/votes?legislature=14&votingDate=2024-01-15`

### 4.2 Search Capability

- **Selected**: No search capability
- **Approach**: Support structured filtering only
- **Future**: Can add full-text search via dedicated endpoint if needed
- **Implication**: Users filter by known fields (partyGroup, lastName,
  legislature, etc.)

### 4.3 Complex Filter Logic

- **Selected**: AND logic only
- **Behavior**: All provided filters must match simultaneously
- **Example**: `?partyGroup=PP&legislature=14` returns deputies where BOTH
  conditions are true
- **Future**: OR logic can be added in future versions if needed

### 4.4 Filter Discovery

- **Selected**: Schema endpoint
- **Endpoint**: `GET /api/v1/schema/{entity}` returns available fields and
  filter options
- **Examples**:
  - `GET /api/v1/schema/deputies` → lists available fields, types, filterable
    fields
  - `GET /api/v1/schema/votes` → voting-specific schema information
- **Response Structure**:
  ```json
  {
    "entity": "deputies",
    "fields": [
      {
        "name": "id",
        "type": "number",
        "filterable": true,
        "sortable": true
      },
      {
        "name": "partyGroup",
        "type": "string",
        "filterable": true,
        "sortable": true,
        "values": ["PP", "PSOE", "Vox", ...]
      }
    ]
  }
  ```

## 5. Pagination Strategy

### 5.1 Pagination Type

- **Selected**: Offset-based
- **Format**: `?page=1&limit=50` or `?offset=0&limit=50`
- **Examples**:
  - `GET /api/v1/deputies?page=2&limit=50`
  - `GET /api/v1/votes?offset=100&limit=25`

### 5.2 Page Size Limits

- **Default Page Size**: 20 items
- **Maximum Page Size**: 100 items
- **Rationale**: Conservative defaults to prevent server overload
- **Behavior**:
  - If `limit` not specified: defaults to 20
  - If `limit > 100`: capped at 100
  - If `limit < 1`: returns error

### 5.3 Pagination Metadata

- **Selected**: Response headers
- **Headers to Include**:
  - `X-Total-Count`: Total number of items in dataset
  - `X-Page`: Current page number
  - `X-Per-Page`: Items per page
  - `Link`: Standard link header for navigation (optional)
- **Example Headers**:
  ```
  X-Total-Count: 350
  X-Page: 2
  X-Per-Page: 50
  Link: <http://api.example.com/api/v1/deputies?page=3&limit=50>; rel="next", <http://api.example.com/api/v1/deputies?page=1&limit=50>; rel="first"
  ```

### 5.4 Sorting

- **Selected**: Yes, with default sort
- **Format**: `?sort=fieldName&order=asc|desc`
- **Default Sort**: By primary key (id), ascending
- **Examples**:
  - `GET /api/v1/deputies?sort=lastName&order=asc`
  - `GET /api/v1/votes?sort=votingDate&order=desc`
- **Sortable Fields**: Indexed fields (id, legislature, sessionNumber,
  votingDate, etc.)
- **Multiple Sort Fields** (future): Can extend to support
  `?sort=partyGroup,name&order=asc,asc`

## 6. Error Handling & Validation

### 6.1 HTTP Status Codes

- **Selected**: Standard set + Extended set
- **Standard Codes Used**:
  - `200 OK`: Successful GET request
  - `400 Bad Request`: Invalid query parameters or malformed input
  - `404 Not Found`: Resource or endpoint does not exist
  - `500 Internal Server Error`: Unhandled server error
- **Extended Codes Used**:
  - `201 Created`: (Future) POST endpoints for data creation
  - `204 No Content`: (Future) DELETE endpoints
  - `401 Unauthorized`: (Future) If authentication is added
  - `403 Forbidden`: (Future) If authorization rules are added
  - `422 Unprocessable Entity`: Validation errors (invalid data types for known
    fields)

### 6.2 Error Response Format

- **Selected**: Simple error object
- **Structure**:
  ```json
  {
    "error": "Error message describing what went wrong",
    "status": 400
  }
  ```
- **Examples**:
  ```json
  {
    "error": "Invalid page number: must be >= 1",
    "status": 400
  }
  ```
  ```json
  {
    "error": "Unknown filter field: 'invalidField'",
    "status": 400
  }
  ```

### 6.3 Input Validation

- **Selected**: Strict validation
- **Validation Scope**:
  - **Field Names**: All filter parameters checked against known schema fields
  - **Data Types**: Type validation for numeric fields, dates, enums
  - **Enum Values**: Validate partyGroup against known values (PP, PSOE, Vox,
    etc.)
  - **Pagination Parameters**: Validate page >= 1, limit between 1-100
- **Error Response**: 400 Bad Request with error message
- **Example Validation Errors**:
  - Invalid page: "page must be >= 1"
  - Invalid limit: "limit must be between 1 and 100"
  - Invalid field: "filter field 'invalidName' does not exist"
  - Invalid enum: "partyGroup 'INVALID' is not a valid value"

### 6.4 Request Tracing

- **Selected**: X-Request-ID header
- **Behavior**:
  - **Accept incoming**: If client sends `X-Request-ID` header, use it
  - **Generate if missing**: If not provided, generate UUID for request
  - **Return in response**: Include `X-Request-ID` in all response headers
- **Use Cases**:
  - Error logging correlation
  - Support ticket reference
  - Performance tracing
- **Example**:

  ```
  Request Header:
  X-Request-ID: 550e8400-e29b-41d4-a716-446655440000

  Response Header:
  X-Request-ID: 550e8400-e29b-41d4-a716-446655440000
  ```

## 7. Endpoints Summary

### 7.1 Deputy Endpoints

- `GET /api/v1/deputies` - List all deputies with filtering, pagination, sorting
- `GET /api/v1/deputies/:id` - Get single deputy
- `GET /api/v1/schema/deputies` - Get deputy schema and filter options

### 7.2 Vote Endpoints

- `GET /api/v1/votes` - List all votes with filtering, pagination, sorting
- `GET /api/v1/votes/:id` - Get single vote
- `GET /api/v1/schema/votes` - Get vote schema and filter options

### 7.3 Speech Endpoints

- `GET /api/v1/speeches` - List all speeches with filtering, pagination, sorting
- `GET /api/v1/speeches/:id` - Get single speech
- `GET /api/v1/schema/speeches` - Get speech schema and filter options

### 7.4 Bureau Endpoints

- `GET /api/v1/bureaus` - List all bureau members with filtering, pagination,
  sorting
- `GET /api/v1/bureaus/:id` - Get single bureau member
- `GET /api/v1/schema/bureaus` - Get bureau schema and filter options

### 7.5 Documentation

- `GET /` - API root/landing page
- `GET /api/v1/openapi.json` - OpenAPI 3.0 specification
- `GET /api/v1/docs` - Swagger UI documentation

## 8. Caching Strategy

### 8.1 HTTP Cache Headers

- **Strategy**: Implement cache headers for GET requests
- **Cache-Control**: Public, reasonable TTLs
- **ETag Support**: Generate ETags for list endpoints
- **Use Cases**:
  - Static data (schema endpoints): `Cache-Control: public, max-age=3600` (1
    hour)
  - Dynamic data (votes, speeches): `Cache-Control: public, max-age=300` (5
    minutes)
  - Bureau data: `Cache-Control: public, max-age=600` (10 minutes)

### 8.2 Database-Level Optimization

- **Connection Pooling**: Leverage Prisma's connection pooling
- **Query Optimization**: Use appropriate indexes in Phase 1 schema
- **N+1 Prevention**: Use Prisma's include/select for eager loading

## 9. OpenAPI / Swagger Documentation

### 9.1 Documentation Scope

- **Format**: OpenAPI 3.0 specification
- **Coverage**: All endpoints with request/response schemas
- **Accessibility**: Swagger UI available at `/api/v1/docs`
- **Schema Definitions**: Reusable schemas for Deputy, Vote, Speech,
  BureauMember

### 9.2 Documentation Content

- Endpoint descriptions and query parameters
- Response schemas with examples
- Error scenarios and status codes
- Pagination metadata headers
- Example requests and responses

## 10. Monorepo Integration

### 10.1 Package Structure

- **API Package**: `apps/api` or `packages/api`
- **Database Package**: `packages/database` (established Phase 1)
- **Shared Types**: Types reused from `packages/database`

### 10.2 Dependencies

- Fastify, Zod, Prisma (already selected/used)
- Additional Fastify plugins:
  - `@fastify/cors` - Cross-origin support
  - `@fastify/swagger` - OpenAPI documentation
  - `@fastify/helmet` - Security headers
  - Potentially: `@fastify/rate-limit` (future)

## 11. Testing & Quality Considerations

### 11.1 Testing Strategy

- Unit tests for route handlers
- Integration tests for endpoints with real data
- Validation tests for query parameters
- Error scenario tests

### 11.2 Development Workflow

- Local development with `pnpm dev`
- TypeScript strict mode
- ESLint and formatting configured
- Git hooks for code quality

## 12. Decision Rationale Summary

| Decision Area   | Selected                           | Rationale                                                    |
| --------------- | ---------------------------------- | ------------------------------------------------------------ |
| Framework       | Fastify                            | High performance, strong validation, good TypeScript support |
| Versioning      | Path-based (`/api/v1/`)            | Industry standard, clear API evolution path                  |
| Response Format | Direct data                        | Simpler client parsing, RESTful convention                   |
| Filtering       | Query parameters + AND logic       | Simplicity, covers most use cases                            |
| Search          | None initially                     | Filtering sufficient for data exploration                    |
| Pagination      | Offset-based (20 default, 100 max) | Familiar, predictable for clients                            |
| Metadata        | Headers                            | Follows HTTP standards, keeps response body lean             |
| Sorting         | Default by ID, customizable        | Consistent ordering, client control when needed              |
| Authentication  | Public                             | Congressional data is public information                     |
| Errors          | Simple object + status codes       | Clarity without over-complication                            |
| Validation      | Strict on all inputs               | Data integrity, better error messages                        |
| Tracing         | X-Request-ID                       | Standard practice for debugging and support                  |

## 13. Next Steps

1. **Planning**: `/gsd:plan-phase 2` to create executable implementation plans
2. **Execution**: Implement Fastify server with configured routes, middleware,
   and error handling
3. **Testing**: Validate API endpoints against specifications
4. **Documentation**: Generate and verify OpenAPI spec
