# Tasks: Add Get Update Tool & Simplify Search

**Input**: Design documents from `/specs/002-add-get-update-tool/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Test-First Development is NOT required for this feature (modifying existing tested infrastructure).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

**Constitution Compliance**: TypeScript strict mode, ESLint, JSDoc documentation, <10 cyclomatic complexity.

## Format: `- [ ] [ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: User story label (US1, US2, US3) for story-specific tasks only
- Exact file paths included in descriptions

---

## Phase 1: Setup

**Purpose**: No setup required - using existing infrastructure

- [X] T001 Verify existing TypeScript project configuration and dependencies are sufficient

---

## Phase 2: Foundational

**Purpose**: Core type definitions that both user stories depend on

- [X] T002 Add `AzureUpdateSearchSummary` type to src/models/azure-update.ts using `Omit<AzureUpdate, 'description' | 'descriptionMarkdown'>`
- [X] T003 [P] Remove `id` parameter from `SearchQuery` type in src/models/search-query.ts
- [X] T004 [P] Add `SortBy` type definition to src/models/search-query.ts supporting relevance, modified:desc/asc, created:desc/asc, retirementDate:desc/asc

**Checkpoint**: Type definitions ready - user story implementation can begin

---

## Phase 3: User Story 1 - Retrieve Full Update Details (Priority: P1) 🎯 MVP

**Goal**: Enable retrieval of complete Azure update details (including description) by ID

**Independent Test**: Call `get_azure_update` with a valid ID and verify full description is returned

### Implementation for User Story 1 ✅

- [X] T005 [P] [US1] Create `get_azure_update` tool handler in src/tools/get-azure-update.tool.ts with input validation
- [X] T006 [US1] Implement tool logic in src/tools/get-azure-update.tool.ts: call database.getUpdateById(), handle not-found errors
- [X] T007 [US1] Add JSDoc documentation to src/tools/get-azure-update.tool.ts handler function
- [X] T008 [US1] Register `get_azure_update` tool in src/server.ts tools list
- [X] T009 [US1] Add tool schema definition to src/server.ts for `get_azure_update` (input: id string, required)
- [X] T010 [P] [US1] Create unit tests for get_azure_update tool in tests/unit/tools/get-azure-update.test.ts (valid ID, invalid ID, missing ID)
- [X] T011 [US1] Verify test coverage ≥80% for get_azure_update tool handler

**Checkpoint**: `get_azure_update` tool fully functional and independently testable

---

## Phase 4: User Story 2 - Lightweight Search (Priority: P1)

**Goal**: Reduce token consumption by returning only metadata (no descriptions) from search results

**Independent Test**: Call `search_azure_updates` and verify response contains no description fields, size reduced by 80%+

### Implementation for User Story 2 ✅

- [X] T012 [P] [US2] Remove `id` parameter handling from src/tools/search-azure-updates.tool.ts input validation
- [X] T013 [US2] Modify result projection in src/tools/search-azure-updates.tool.ts to return `AzureUpdateSearchSummary[]` (omit description)
- [X] T014 [US2] Update tool schema in src/server.ts for `search_azure_updates` to remove `id` parameter from input
- [X] T015 [US2] Update tool description in src/server.ts to mention two-tool pattern (search → get)
- [X] T016 [P] [US2] Update unit tests in tests/unit/tools/search-azure-updates.test.ts to expect no description fields in results
- [X] T017 [P] [US2] Add test in tests/unit/tools/search-azure-updates.test.ts to verify `id` parameter is rejected
- [X] T018 [US2] Verify test coverage ≥80% for search_azure_updates tool handler

**Checkpoint**: `search_azure_updates` returns lightweight results, `id` parameter removed

---

## Phase 5: User Story 3 - Retirement Date Filtering (Priority: P1)

**Goal**: Enable filtering and sorting by retirement dates for proactive planning

**Independent Test**: Call `search_azure_updates` with `retirementDateFrom/To` and verify results are filtered and sorted correctly

### Implementation for User Story 3 ✅

- [X] T019 [P] [US3] Add `retirementDateFrom` and `retirementDateTo` filter parameters to src/tools/search-azure-updates.tool.ts input handling
- [X] T020 [P] [US3] Add `sortBy` parameter to src/tools/search-azure-updates.tool.ts with enum validation (relevance, modified:desc/asc, created:desc/asc, retirementDate:desc/asc)
- [X] T021 [US3] Implement retirement date filtering logic in src/tools/search-azure-updates.tool.ts (filter availabilities array where ring='Retirement')
- [X] T022 [US3] Implement sortBy logic in src/tools/search-azure-updates.tool.ts with direction parsing (split on ':')
- [X] T023 [US3] Implement retirementDate sorting in src/tools/search-azure-updates.tool.ts (extract retirement date from availabilities, exclude updates without Retirement ring)
- [X] T024 [US3] Update tool schema in src/server.ts to add `retirementDateFrom/To` and `sortBy` parameters with descriptions
- [X] T025 [US3] Update default limit from 50 to 20 in src/server.ts schema
- [X] T026 [US3] Clarify offset parameter description in src/server.ts with pagination example
- [X] T027 [P] [US3] Add unit tests in tests/unit/tools/search-azure-updates.test.ts for retirement date filtering
- [X] T028 [P] [US3] Add unit tests in tests/unit/tools/search-azure-updates.test.ts for sortBy parameter (all directions)
- [X] T029 [P] [US3] Add unit tests in tests/unit/tools/search-azure-updates.test.ts for retirementDate sorting edge cases (no Retirement ring)
- [X] T030 [US3] Verify test coverage ≥80% for new filtering and sorting logic

**Checkpoint**: Retirement date filtering and sorting fully functional

---

## Phase 6: Integration & Documentation

**Purpose**: Update guide resource and integration tests for two-tool pattern

### Guide Resource Updates

- [X] T031 [P] Remove `id` parameter example from src/resources/guide.resource.ts usage examples
- [X] T032 [P] Update overview in src/resources/guide.resource.ts to mention two-tool architecture (search for discovery, get for details)
- [X] T033 [P] Add query tips in src/resources/guide.resource.ts: explain tags/categories/products are searchable via query parameter
- [X] T034 [P] Add query tips in src/resources/guide.resource.ts: explain sortBy with direction suffixes
- [X] T035 [P] Add query tips in src/resources/guide.resource.ts: explain retirementDateFrom/To filters
- [X] T036 Add query tip in src/resources/guide.resource.ts: explain two-step workflow (search → get_azure_update)
- [X] T037 Update usage examples in src/resources/guide.resource.ts to use simplified filtering (query parameter instead of individual filters)
- [X] T038 Update usage examples in src/resources/guide.resource.ts to show sortBy and retirement date filtering

### Integration Testing

- [X] T039 [P] Add integration test in tests/integration/tools-integration.test.ts for two-step workflow (search → get by ID)
- [X] T040 [P] Add integration test in tests/integration/tools-integration.test.ts to verify search response size reduction (compare with old version)
- [X] T041 Update existing integration tests in tests/integration/tools-integration.test.ts to expect no description in search results
- [X] T042 Verify guide resource tests in tests/unit/resources/guide.test.ts reflect updated examples and tips

---

## Phase 7: Polish & Cross-Cutting Concerns

**Constitution Compliance Checks**:

- [X] T043 [P] Run test coverage report and verify ≥80% coverage across modified files
- [X] T044 [P] Run ESLint on all modified files - zero warnings/errors
- [X] T045 [P] Check cyclomatic complexity ≤10 for all new/modified functions
- [X] T046 [P] Verify TypeScript strict mode compliance - no `any` types without justification
- [X] T047 [P] Verify JSDoc documentation completeness for all public APIs
- [X] T048 Code cleanup and refactoring pass (DRY violations, naming consistency)
- [X] T049 [P] Update contracts/README.md to document two-tool pattern
- [X] T050 Test quickstart.md examples manually to ensure accuracy

---

## Phase 8: User Story 4 - Phrase Search & Structured Filters (Priority: P1)

**Goal**: Implement FTS5 phrase search for exact phrase matching and add structured filters for tags/products/categories with AND semantics

**Independent Test**: Call `search_azure_updates` with phrase syntax ("exact phrase") and verify exact matching, call with filters.tags and verify AND semantics

### Implementation for User Story 4 ✅

- [X] T051 [P] [US4] Modify sanitizeFtsQuery() in src/services/search.service.ts to preserve quoted phrases and support phrase search syntax
- [X] T052 [US4] Update FTS5 query generation in src/services/search.service.ts to use phrase search for quoted text (exact matching)
- [X] T053 [P] [US4] Add tags filter to SearchFilters type in src/models/search-query.ts with string[] type
- [X] T054 [P] [US4] Add products filter to SearchFilters type in src/models/search-query.ts with string[] type
- [X] T055 [P] [US4] Add productCategories filter to SearchFilters type in src/models/search-query.ts with string[] type
- [X] T056 [US4] Implement buildFilterClauses() in src/services/search.service.ts to support tags/products/productCategories filters with AND semantics (SQL EXISTS with subquery)
- [X] T057 [US4] Update tool schema in src/server.ts to add tags, products, productCategories filter parameters with array type and AND semantics description
- [X] T058 [US4] Update tool description in src/server.ts to mention phrase search syntax ("exact phrase") and filter AND semantics
- [X] T059 [P] [US4] Add unit tests in tests/unit/services/search.service.test.ts for phrase search syntax (quoted phrases, mixed phrases and keywords)
- [X] T060 [P] [US4] Add unit tests in tests/unit/tools/search-azure-updates.test.ts for tags filter with AND semantics (single tag, multiple tags, no match)
- [X] T061 [P] [US4] Add unit tests in tests/unit/tools/search-azure-updates.test.ts for products filter with AND semantics
- [X] T062 [P] [US4] Add unit tests in tests/unit/tools/search-azure-updates.test.ts for productCategories filter with AND semantics
- [X] T063 [P] [US4] Add integration test in tests/integration/tools-integration.test.ts for phrase search with real data
- [X] T064 [P] [US4] Add integration test in tests/integration/tools-integration.test.ts for combined filters (tags + products + categories)
- [X] T065 [US4] Verify test coverage ≥80% for phrase search and filter logic (achieved 84.64%)

**Checkpoint**: Phrase search and structured filters fully functional ✅

### Guide Resource Updates for Phrase Search ✅

- [X] T066 [P] Add phrase search examples in src/resources/guide.resource.ts (exact phrase syntax with double quotes)
- [X] T067 [P] Add filter examples in src/resources/guide.resource.ts (tags, products, categories with AND semantics)
- [X] T068 Update query tips in src/resources/guide.resource.ts to explain FTS5 search scope (title + description only)
- [X] T069 Add usage example in src/resources/guide.resource.ts showing combined phrase search and filters

---

## Phase 9: End-to-End Testing

**Purpose**: Add comprehensive E2E tests for MCP server lifecycle

### MCP Server E2E Tests

- [X] T070 [P] Create E2E test suite in tests/integration/mcp-e2e.test.ts for MCP server initialization and tool registration
- [X] T071 [P] Add E2E tests for tool discovery (tools/list) and schema validation
- [X] T072 [P] Add E2E tests for search_azure_updates tool invocation via MCP request handlers
- [X] T073 [P] Add E2E tests for get_azure_update tool invocation via MCP request handlers
- [X] T074 [P] Add E2E test for two-tool workflow (search → get) through MCP server
- [X] T075 [P] Add E2E tests for resource discovery and retrieval (azure-updates://guide)
- [X] T076 [P] Add E2E tests for error handling (unknown tools, unknown resources)
- [X] T077 Verify all E2E tests pass with mock data (15 tests added, 228 total tests passing)

**Checkpoint**: Complete E2E testing coverage for MCP server lifecycle ✅

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - verification only
- **Foundational (Phase 2)**: Depends on Setup - BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational (T002) for `AzureUpdateSummary` type
- **User Story 2 (Phase 4)**: Depends on Foundational (T002, T003) for types
- **User Story 3 (Phase 5)**: Depends on Foundational (T003, T004) and User Story 2 (T012-T015) modifications
- **Integration (Phase 6)**: Depends on all user stories being complete
- **Polish (Phase 7)**: Depends on Integration completion
- **User Story 4 (Phase 8)**: Depends on User Story 2 (T012-T015) and User Story 3 (T019-T030) - extends search functionality with phrase search and filters
- **E2E Testing (Phase 9)**: Depends on all previous phases - validates complete MCP server lifecycle

### User Story Dependencies

- **User Story 1**: Independent after Foundational - can implement get_azure_update separately
- **User Story 2**: Independent after Foundational - modifies search_azure_updates independently
- **User Story 3**: Builds on User Story 2 - adds filtering/sorting to already-modified search tool

### Within Each User Story

**US1 (Get Tool)**:
- T005 (create file) → T006 (implement logic) → T007 (docs) → T008 (register) → T009 (schema) → T010 (tests) → T011 (coverage)

**US2 (Lightweight Search)**:
- T012, T013 (modify handler) in parallel → T014, T015 (update schema) → T016, T017 (update tests) in parallel → T018 (coverage)

**US3 (Retirement Filtering)**:
- T019, T020 (add parameters) in parallel → T021, T022, T023 (implement logic) sequentially → T024, T025, T026 (schema updates) sequentially → T027, T028, T029 (tests) in parallel → T030 (coverage)

**US4 (Phrase Search & Filters)**:
- T051, T052 (phrase search) → T053, T054, T055 (filter types) in parallel → T056 (filter implementation) → T057, T058 (schema updates) → T059, T060, T061, T062, T063, T064 (tests) in parallel → T065 (coverage) → T066, T067, T068, T069 (guide updates) in parallel

**Phase 9 (E2E Testing)**:
- T070, T071, T072, T073, T074, T075, T076 (all E2E tests) in parallel → T077 (verify all pass)

### Parallel Opportunities

**Foundational Phase**: T003 and T004 can run in parallel (different type definitions)

**User Story 1**: T010 (tests) can run in parallel with T005-T009 if using TDD approach

**User Story 2**: T012 and T013 can run in parallel (separate concerns), T016 and T017 can run in parallel (independent test cases)

**User Story 3**: T019 and T020 in parallel, T027/T028/T029 in parallel

**User Story 4**: T053/T054/T055 in parallel (filter types), T059-T064 in parallel (all tests), T066-T069 in parallel (guide updates)

**Integration Phase**: T031-T035 (guide resource changes) all in parallel, T039-T041 (integration tests) in parallel

**Polish Phase**: T043-T047 all in parallel (independent quality checks)

**E2E Testing Phase**: T070-T076 all in parallel (independent E2E test cases)

---

## Parallel Example: User Story 3

```bash
# Launch parameter additions in parallel:
Task T019: "Add retirementDateFrom/To to input handling"
Task T020: "Add sortBy parameter with enum validation"

# Launch test additions in parallel:
Task T027: "Test retirement date filtering"
Task T028: "Test sortBy parameter"
Task T029: "Test retirementDate sorting edge cases"
```

---

## Implementation Strategy

### Recommended Approach (Sequential by Priority)

1. **Phase 1-2**: Setup + Foundational types (T001-T004)
2. **Phase 3**: Complete User Story 1 - Get tool (T005-T011)
   - **Validate independently**: Can retrieve full update by ID
3. **Phase 4**: Complete User Story 2 - Lightweight search (T012-T018)
   - **Validate independently**: Search returns no descriptions, 80%+ size reduction
4. **Phase 5**: Complete User Story 3 - Retirement filtering (T019-T030)
   - **Validate independently**: Retirement date filtering and sorting work correctly
5. **Phase 6**: Integration & Documentation (T031-T042)
6. **Phase 7**: Polish & Quality (T043-T050)
7. **Phase 8**: Phrase Search & Filters (T051-T069)
8. **Phase 9**: E2E Testing (T070-T077)

### Parallel Team Strategy

If multiple developers available:

1. Complete Phase 1-2 together (T001-T004)
2. Split work:
   - **Developer A**: User Story 1 (T005-T011) - Get tool
   - **Developer B**: User Story 2 (T012-T018) - Lightweight search
3. Once US1 and US2 complete:
   - **Developer A**: User Story 3 (T019-T030) - Retirement filtering
   - **Developer B**: Integration work (T031-T042) - Guide + tests
4. Both: Phase 7 polish tasks in parallel (T043-T050)

### MVP Milestone

**Minimum deliverable**: Phases 1-4 (T001-T018)
- Get tool works (US1)
- Search is lightweight (US2)
- Basic two-tool pattern functional

**Enhanced deliverable v1**: Add Phase 5 (T019-T030)
- Retirement date filtering (US3)

**Enhanced deliverable v2**: Add Phase 8 (T051-T069)
- Phrase search with FTS5 (US4)
- Structured filters for tags/products/categories with AND semantics (US4)

**Production-ready deliverable**: Add Phase 9 (T070-T077)
- Complete E2E testing for MCP server lifecycle
- 228 tests total with 84.64% coverage

---

## Notes

- TypeScript project with existing database layer - no DB changes needed
- All tasks use existing infrastructure (better-sqlite3, MCP SDK)
- Tests update existing test files - no new test framework setup
- Constitution compliance: strict TypeScript, ESLint, JSDoc, <10 complexity
- Each user story can be validated independently before proceeding
- Phase 8 (US4) refines search behavior: query parameter searches only title+description (FTS5 with phrase support), filters provide structured filtering for metadata with AND semantics
- Phase 9 adds comprehensive E2E tests validating MCP server lifecycle (initialization, tool registration, invocation, resource handling, error cases)
- Total LOC: ~1140 (100 get tool + 50 search mods + 40 guide + 200 unit tests + 100 integration tests + 50 polish + 120 phrase search + 80 filters + 400 E2E tests)
