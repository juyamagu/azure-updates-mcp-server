# Implementation Plan: Add Get Update Tool & Simplify Search

**Branch**: `002-add-get-update-tool` | **Date**: 2025-12-17 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/002-add-get-update-tool/spec.md`

## Summary

Add a new `get_azure_update` tool for retrieving full update details by ID and simplify `search_azure_updates` to return only lightweight metadata (no descriptions). This separates search (discovery) from retrieval (detail access), reducing token consumption by 80%+ for search operations while maintaining full detail access through a dedicated get operation.

## Technical Context

**Language/Version**: TypeScript 5.x (Node.js 18+)  
**Primary Dependencies**: @modelcontextprotocol/sdk, better-sqlite3 (existing)  
**Storage**: SQLite (existing schema, no changes required)  
**Testing**: Vitest (existing test framework)  
**Target Platform**: Node.js MCP server  
**Project Type**: Single project (MCP server)  
**Performance Goals**: 
- `get_azure_update`: <200ms response time for local DB queries
- `search_azure_updates`: Response payload size reduced by 80%+ compared to current version  
**Constraints**: 
- No breaking changes to database schema
- Existing search filters and query parameters must be preserved (except `id` parameter)
- Backward compatibility not required (breaking change acceptable for tool interface)  
**Scale/Scope**: 
- Single new tool handler (~100 LOC)
- Modify existing tool handler (~50 LOC changes)
- Modify guide resource (~40 LOC changes: update examples, tips, overview)
- Modify server registration (~20 LOC)
- Add unit tests (~200 LOC)
- Update integration tests (~100 LOC)
- Update resource tests (~30 LOC)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Initial Check (Pre-Research)**:
- [x] **Code Quality**: TypeScript strict mode enabled, ESLint configured, JSDoc documentation required for public APIs
- [x] **Testing Strategy**: TDD approach with unit tests for tool handlers, integration tests for MCP tool contracts
- [x] **Maintainability**: YAGNI applied (no speculative features), clear separation of concerns (search vs get)
- [x] **Cost Efficiency**: Primary goal is token cost reduction (80%+ payload size decrease), minimal development time (~1 day)
- [x] **Workflow Compliance**: Specification complete, testable acceptance criteria defined, constitution-aligned

**Post-Design Check (After Phase 1)**:
- [x] **Code Quality**: Tool contracts defined with clear schemas, type safety maintained via `Omit<>` utility
- [x] **Testing Strategy**: Test plan includes unit tests for both tools, integration tests for two-step workflow
- [x] **Maintainability**: No new dependencies, reuses existing database queries, minimal code changes (~170 LOC total)
- [x] **Cost Efficiency**: Design achieves 80-90% payload reduction (500-700 bytes vs 4-10KB per result)
- [x] **Workflow Compliance**: Research, data model, contracts, and quickstart documentation complete

**Status**: ✅ All constitution principles satisfied. Ready for task generation.

## Project Structure

### Documentation (this feature)

```text
specs/002-add-get-update-tool/
├── plan.md              # This file
├── research.md          # Phase 0: Best practices for MCP tool design
├── data-model.md        # Phase 1: AzureUpdateSummary model definition
├── quickstart.md        # Phase 1: Usage examples for both tools
├── contracts/           # Phase 1: Tool schemas (JSON)
│   ├── get-azure-update.json
│   └── search-azure-updates.json (updated)
└── tasks.md             # Phase 2: Implementation tasks (created by /speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── models/
│   ├── azure-update.ts          # MODIFIED: Add AzureUpdateSummary type
│   └── search-query.ts          # MODIFIED: Remove 'id' from SearchQuery
├── tools/
│   ├── get-azure-update.tool.ts # NEW: Handler for get_azure_update tool
│   └── search-azure-updates.tool.ts # MODIFIED: Remove id handling, remove description from response
├── resources/
│   └── guide.resource.ts        # MODIFIED: Update examples and tips for two-tool pattern
├── server.ts                    # MODIFIED: Register new tool, update search tool schema
└── database/
    └── queries.ts               # UNMODIFIED: Existing getUpdateById() already suitable

tests/
├── unit/
│   └── tools/
│       ├── get-azure-update.test.ts     # NEW: Unit tests for get tool
│       └── search-azure-updates.test.ts # MODIFIED: Update test expectations
└── integration/
    └── tools-integration.test.ts        # MODIFIED: Test two-step workflow (search -> get)
```

**Structure Decision**: Single project structure (existing MCP server). All changes are additive (new tool handler file) or modifications to existing tool handler and server registration. No architectural changes required.

## Complexity Tracking

> No constitution violations. This feature aligns with YAGNI (addresses real user need for token reduction), maintainability (clear separation of search vs get), and cost efficiency (primary goal).
