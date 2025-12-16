# Tasks: Azure Updates MCP Server

**Input**: Design documents from `/specs/001-azure-updates-mcp/`
**Prerequisites**: plan.md (✅), spec.md (✅), research.md (✅), data-model.md (✅), contracts/ (✅)

**Tests**: Tests are OPTIONAL for this feature - no explicit test requirements in specification. Focus on implementation.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

**Constitution Compliance**: All tasks must align with code quality, testing standards, maintainability, and cost-efficiency principles.

## Format: `- [ ] [ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic TypeScript/Node.js structure

- [X] T001 Create project structure with src/, tests/, and data/ directories
- [X] T002 Initialize Node.js project with package.json (TypeScript 5.x, Node 18+ runtime)
- [X] T003 [P] Install core dependencies: @modelcontextprotocol/sdk, better-sqlite3, turndown
- [X] T004 [P] Install dev dependencies: typescript, vitest, tsx, eslint, @types/better-sqlite3, @types/turndown
- [X] T005 [P] Configure TypeScript with strict mode in tsconfig.json
- [X] T006 [P] Configure ESLint with TypeScript rules in .eslintrc.json
- [X] T007 [P] Setup Vitest test framework in vitest.config.ts
- [X] T008 [P] Add npm scripts: build, dev, test, lint in package.json
- [X] T009 Create .gitignore with node_modules, dist, data/*.db, .env

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T010 Create SQLite schema in src/database/schema.sql with all 7 tables (azure_updates, update_tags, update_categories, update_products, update_availabilities, updates_fts, sync_checkpoints)
- [X] T011 Implement database initialization in src/database/database.ts with better-sqlite3, WAL mode, and schema versioning
- [X] T012 [P] Create TypeScript interfaces for AzureUpdate in src/models/azure-update.ts
- [X] T013 [P] Create TypeScript interfaces for SyncCheckpoint in src/models/sync-checkpoint.ts
- [X] T014 [P] Create TypeScript interfaces for SearchQuery in src/models/search-query.ts
- [X] T015 Implement prepared statements in src/database/queries.ts for all CRUD operations
- [X] T016 [P] Implement logger utility with structured logging in src/utils/logger.ts
- [X] T017 [P] Implement retry utility with exponential backoff in src/utils/retry.ts
- [X] T018 [P] Implement staleness checker in src/utils/staleness.ts
- [X] T019 Create MCP server skeleton in src/server.ts with tool registration structure
- [X] T020 Create MCP server entry point in src/index.ts with stdio transport setup

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Natural Language Search for Azure Updates (Priority: P1) 🎯 MVP

**Goal**: Enable natural language queries like "Show me all security-related retirements happening in 2026" with keyword search across title and description fields

**Independent Test**: Send natural language query through MCP tool and verify relevant Azure updates are returned with accurate filtering

### Implementation for User Story 1 ✅

- [ ] T021 [P] [US1] Implement HTML-to-Markdown converter service in src/services/html-converter.service.ts with Turndown library and custom rules for data URLs
- [ ] T022 [P] [US1] Implement FTS5 query builder for keyword search in src/services/search.service.ts
- [ ] T023 [US1] Implement search method with BM25 relevance ranking in src/services/search.service.ts (depends on T022)
- [ ] T024 [US1] Add filter application for tags in src/services/search.service.ts using EXISTS subqueries
- [ ] T025 [US1] Add filter application for product categories in src/services/search.service.ts
- [ ] T026 [US1] Add filter application for products in src/services/search.service.ts
- [ ] T027 [US1] Implement search_azure_updates MCP tool handler in src/tools/search-azure-updates.tool.ts with query parameter support
- [ ] T028 [US1] Add input validation and error handling with descriptive error messages in src/tools/search-azure-updates.tool.ts
- [ ] T029 [US1] Register search_azure_updates tool with MCP SDK in src/server.ts
- [ ] T030 [US1] Add structured logging for all search operations in src/tools/search-azure-updates.tool.ts

**Checkpoint**: At this point, User Story 1 should be fully functional - natural language keyword search with basic filters works

---

## Phase 4: User Story 2 - Simplified Filtering Without OData Knowledge (Priority: P1)

**Goal**: Enable filtering by categories, tags, date ranges, and status without requiring OData syntax

**Independent Test**: Send filter requests with simple JSON parameters and verify correct results without OData syntax

### Implementation for User Story 2 ✅

- [ ] T031 [P] [US2] Add status filter support in src/services/search.service.ts
- [ ] T032 [P] [US2] Add availability ring filter support in src/services/search.service.ts with join to update_availabilities table
- [ ] T033 [US2] Add date range filtering (dateFrom/dateTo) in src/services/search.service.ts for modified and availability dates
- [ ] T034 [US2] Implement filter combination with AND logic in src/services/search.service.ts
- [ ] T035 [US2] Add filter validation in src/tools/search-azure-updates.tool.ts to ensure valid values
- [ ] T036 [US2] Update search_azure_updates tool handler to support all filter parameters
- [ ] T037 [US2] Add filter examples in src/tools/search-azure-updates.tool.ts JSDoc comments

**Checkpoint**: At this point, User Stories 1 AND 2 work - comprehensive filtering without OData syntax

---

## Phase 5: User Story 3 - Keyword Search Across Title and Description (Priority: P2)

**Goal**: Enable keyword search across title and description content with relevance ranking

**Independent Test**: Submit keyword queries and verify results include all updates with keywords in title or description, ranked by relevance

### Implementation for User Story 3 ✅

- [ ] T038 [US3] Enhance FTS5 query to include both title and description_md columns in src/services/search.service.ts
- [ ] T039 [US3] Implement BM25 relevance scoring with title boosting in src/services/search.service.ts
- [ ] T040 [US3] Add relevance score to response objects in src/services/search.service.ts
- [ ] T041 [US3] Implement case-insensitive multi-word keyword matching in src/services/search.service.ts
- [ ] T042 [US3] Add pagination support (limit and offset parameters) in src/services/search.service.ts
- [ ] T043 [US3] Update search_azure_updates tool to return relevance scores in response
- [ ] T044 [US3] Add hasMore pagination indicator in tool response

**Checkpoint**: All search and filter capabilities complete - keyword search with relevance ranking works

---

## Phase 6: User Story 4 - Automatic Data Synchronization (Priority: P2)

**Goal**: Automatically keep Azure Updates data current by periodically syncing with Azure Updates API using differential updates

**Independent Test**: Run initial sync, trigger differential sync, verify new/updated records appear in local storage

### Implementation for User Story 4 ✅

- [ ] T045 [P] [US4] Implement Azure Updates API HTTP client in src/services/azure-api.service.ts with fetch and error handling
- [ ] T046 [P] [US4] Implement checkpoint read/write methods in src/database/queries.ts for sync_checkpoints table
- [ ] T047 [US4] Implement full sync logic in src/services/sync.service.ts for initial data load
- [ ] T048 [US4] Implement differential sync with modified timestamp filtering in src/services/sync.service.ts
- [ ] T049 [US4] Implement UPSERT operations for azure_updates table in src/database/queries.ts
- [ ] T050 [US4] Implement batch insert for tags, categories, products, availabilities in src/database/queries.ts
- [ ] T051 [US4] Add transaction wrapping for sync operations in src/services/sync.service.ts
- [ ] T052 [US4] Implement retry logic with exponential backoff for API calls in src/services/azure-api.service.ts
- [ ] T053 [US4] Add HTML-to-Markdown conversion during sync in src/services/sync.service.ts
- [ ] T054 [US4] Implement checkpoint update after successful sync in src/services/sync.service.ts
- [ ] T055 [US4] Add error handling and checkpoint rollback on sync failure in src/services/sync.service.ts
- [ ] T056 [US4] Implement startup sync trigger in src/index.ts with staleness check (default 24h threshold)
- [ ] T057 [US4] Make startup sync non-blocking with immediate MCP tool availability in src/index.ts
- [ ] T058 [US4] Add structured logging for all sync operations (start, progress, completion, errors)

**Checkpoint**: Automatic sync complete - data stays fresh without manual intervention

---

## Phase 7: User Story 5 - Fast Response with Local Data Replication (Priority: P3)

**Goal**: Achieve sub-second response times by querying local SQLite data instead of Azure API

**Independent Test**: Measure query response times and verify <500ms for typical queries

### Implementation for User Story 5 ✅

- [ ] T059 [P] [US5] Enable SQLite performance optimizations (WAL mode, cache size, temp store) in src/database/database.ts
- [ ] T060 [P] [US5] Add database indices for all filter columns per data-model.md in src/database/schema.sql
- [ ] T061 [US5] Implement prepared statement caching in src/database/queries.ts
- [ ] T062 [US5] Add query performance logging with timing metrics in src/services/search.service.ts
- [ ] T063 [US5] Optimize FTS5 queries with covering indices in src/database/schema.sql
- [ ] T064 [US5] Add connection pooling considerations (better-sqlite3 is synchronous, document limitations) in src/database/database.ts

**Checkpoint**: Performance optimization complete - queries respond in <500ms

---

## Phase 8: User Story 6 - Rich Metadata Exposure for AI Context (Priority: P3)

**Goal**: Expose structured metadata optimized for LLM consumption through MCP resource

**Independent Test**: Retrieve guide resource and verify all metadata fields are properly structured

### Implementation for User Story 6 ✅

- [ ] T065 [P] [US6] Implement metadata extraction queries (distinct tags, categories, products) in src/database/queries.ts
- [ ] T066 [P] [US6] Implement guide resource handler in src/resources/guide.resource.ts
- [ ] T067 [US6] Calculate data freshness (hours since last sync) in src/resources/guide.resource.ts
- [ ] T068 [US6] Register azure-updates://guide resource with MCP SDK in src/server.ts
- [ ] T069 [US6] Add get-by-ID functionality to search_azure_updates tool in src/tools/search-azure-updates.tool.ts
- [ ] T070 [US6] Format dates in human-readable format in response objects
- [ ] T071 [US6] Handle null/missing fields gracefully in response formatting

**Checkpoint**: Rich metadata exposure complete - LLMs have full context for query construction

---

## Phase 9: Pre-populated Database Snapshot

**Purpose**: Include pre-populated SQLite database in npm package for instant startup

- [ ] T072 Create build script in scripts/generate-snapshot.sh to fetch full Azure Updates dataset
- [ ] T073 Implement snapshot database population script in scripts/populate-snapshot.ts with full sync
- [ ] T074 Add snapshot generation to npm build workflow in package.json
- [ ] T075 [P] Document snapshot refresh cadence in README.md (weekly/monthly recommended)
- [ ] T076 [P] Add snapshot file (~70MB) to package distribution with .npmignore configuration
- [ ] T077 Configure startup behavior to load snapshot immediately if database doesn't exist in src/index.ts

**Checkpoint**: Snapshot generation complete - instant startup with cached data

---

## Phase 10: Configuration and Documentation

**Purpose**: Environment configuration and user documentation

- [ ] T078 [P] Create .env.example with all configuration variables (DATABASE_PATH, SYNC_STALENESS_HOURS, LOG_LEVEL, etc.)
- [ ] T079 [P] Implement environment variable loading in src/index.ts with defaults
- [ ] T080 [P] Add configuration validation at startup in src/index.ts
- [ ] T081 [P] Create README.md with installation, configuration, and usage instructions
- [ ] T082 [P] Document MCP client setup for Claude Desktop, Continue.dev, Cline in README.md
- [ ] T083 [P] Add JSDoc comments to all public APIs and exported functions
- [ ] T084 Create CHANGELOG.md with version history
- [ ] T085 [P] Add LICENSE file (MIT recommended)

**Checkpoint**: Documentation complete - users can install and configure the server

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: Final quality checks and cross-cutting improvements

**Constitution Compliance Checks**:

- [ ] T086 [P] Run ESLint and fix all warnings/errors
- [ ] T087 [P] Verify TypeScript strict mode compliance (no any types, proper null checks)
- [ ] T088 [P] Review cyclomatic complexity - ensure ≤10 per function
- [ ] T089 [P] Audit all dependencies for licenses and security vulnerabilities
- [ ] T090 [P] Review logging for cost efficiency (structured JSON, appropriate levels)
- [ ] T091 Code cleanup - remove console.log statements, unused imports, commented code
- [ ] T092 Performance profiling - verify query performance targets (<500ms p95)
- [ ] T093 Security review - input validation, SQL injection prevention, error message sanitization
- [ ] T094 [P] Add package.json bin configuration for npx execution
- [ ] T095 Test quickstart.md instructions end-to-end with fresh installation

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-8)**: All depend on Foundational phase completion
  - US1 (Natural Language Search) - Can start after Phase 2
  - US2 (Simplified Filtering) - Can start after Phase 2, integrates with US1
  - US3 (Keyword Search) - Can start after Phase 2, extends US1 and US2
  - US4 (Automatic Sync) - Can start after Phase 2, independent of search functionality
  - US5 (Fast Response) - Can start after Phase 2, optimizes existing queries
  - US6 (Rich Metadata) - Can start after Phase 2, adds guide resource
- **Snapshot (Phase 9)**: Depends on US4 (sync service) completion
- **Configuration (Phase 10)**: Can proceed in parallel with user stories
- **Polish (Phase 11)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: No dependencies on other stories - implements core search
- **User Story 2 (P1)**: Extends US1 with additional filters - can be done together
- **User Story 3 (P2)**: Extends US1 and US2 with enhanced keyword search
- **User Story 4 (P2)**: Independent of search stories - can proceed in parallel
- **User Story 5 (P3)**: Optimizes all previous stories - should be done after US1-4
- **User Story 6 (P3)**: Independent feature - can proceed after Phase 2

### Within Each User Story

- Models and utilities before services
- Services before tools
- Tools before MCP server registration
- Core implementation before enhancements

### Parallel Opportunities

**Phase 1 (Setup)**: T003, T004, T005, T006, T007 can all run in parallel

**Phase 2 (Foundational)**: T012, T013, T014, T016, T017, T018 can run in parallel

**Phase 3 (US1)**: T021, T022 can run in parallel initially

**Phase 4 (US2)**: T031, T032 can run in parallel

**Phase 5 (US3)**: Most tasks are sequential due to dependencies on search service

**Phase 6 (US4)**: T045, T046 can run in parallel initially

**Phase 7 (US5)**: T059, T060 can run in parallel

**Phase 8 (US6)**: T065, T066 can run in parallel

**Phase 10 (Configuration)**: T078, T079, T080, T081, T082, T083, T084, T085 can all run in parallel

**Phase 11 (Polish)**: T086, T087, T088, T089, T090 can all run in parallel

---

## Parallel Example: User Story 1

```bash
# Launch parallel tasks for User Story 1:
# - HTML converter service (T021)
# - FTS5 query builder (T022)

# Then continue with search service implementation (T023-T026)
```

---

## Implementation Strategy

### MVP First (User Stories 1 & 2 + Sync)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1 (Natural Language Search)
4. Complete Phase 4: User Story 2 (Simplified Filtering)
5. Complete Phase 6: User Story 4 (Automatic Sync) - required for data population
6. **STOP and VALIDATE**: Test search and sync independently
7. Add snapshot generation (Phase 9)
8. Add documentation (Phase 10)
9. Polish and deploy (Phase 11)

**This delivers the core value: natural language search with auto-sync, no OData required**

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Stories 1 & 2 → Core search and filtering → Deploy MVP
3. Add User Story 3 → Enhanced keyword search → Deploy v1.1
4. Add User Story 4 → Auto-sync → Deploy v1.2
5. Add User Story 5 → Performance optimization → Deploy v1.3
6. Add User Story 6 → Rich metadata → Deploy v1.4

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Stories 1, 2, 3 (search features)
   - Developer B: User Story 4 (sync features)
   - Developer C: User Stories 5, 6 (optimization + metadata)
3. Stories complete and integrate independently

---

## Summary Statistics

- **Total Tasks**: 95
- **Setup Phase**: 9 tasks
- **Foundational Phase**: 11 tasks
- **User Story 1 (P1)**: 10 tasks
- **User Story 2 (P1)**: 7 tasks
- **User Story 3 (P2)**: 7 tasks
- **User Story 4 (P2)**: 14 tasks
- **User Story 5 (P3)**: 6 tasks
- **User Story 6 (P3)**: 7 tasks
- **Snapshot Generation**: 6 tasks
- **Configuration & Docs**: 8 tasks
- **Polish & Quality**: 10 tasks

**Parallel Opportunities**: 35 tasks marked [P] can run in parallel with other tasks in same phase

**MVP Scope (Recommended)**: Phase 1 + Phase 2 + US1 + US2 + US4 + Phase 9 + Phase 10 (subset) = ~50 tasks

---

## Notes

- All tasks follow strict checklist format: `- [ ] [ID] [P?] [Story?] Description with file path`
- Each user story can be independently implemented and tested
- [P] marker indicates tasks that can run in parallel (different files, no blocking dependencies)
- File paths are exact and follow the structure in plan.md
- Tests are optional - no TDD requirement in this specification
- Focus on implementation quality with TypeScript strict mode and ESLint
- Constitution compliance enforced through Phase 11 quality checks
