# Implementation Plan: Azure Updates MCP Server

**Branch**: `001-azure-updates-mcp` | **Date**: 2025-12-16 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/001-azure-updates-mcp/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Build an MCP server that wraps the Azure Updates API to enable natural language search and simplified filtering in LLM chat interfaces. The system replicates Azure updates data locally in SQLite for fast querying, implements keyword search across titles and descriptions using FTS5, and automatically syncs with the API on a configurable schedule (default: 24 hours). Users can search with natural language queries like "Show me security retirements in Q1 2026" without learning OData syntax. The server converts HTML descriptions to markdown for LLM-friendly consumption and exposes a single MCP tool (`search_azure_updates`) with an MCP resource (`azure-updates://guide`) for metadata discovery.

## Technical Context

**Language/Version**: TypeScript 5.x (Node.js 18+ runtime)
**Primary Dependencies**: @modelcontextprotocol/sdk (MCP server framework), better-sqlite3 (embedded SQLite with FTS5 support), turndown (HTML-to-Markdown conversion)
**Development Dependencies**: express (mock API server for dev/test), tsx (TypeScript execution for dev)
**Storage**: SQLite with FTS5 full-text search extension for local data replication (~9,300 records, expected <100k scale)
**Testing**: Vitest (unit + integration tests), TypeScript strict mode for type safety
**Target Platform**: Cross-platform CLI tool (Linux/macOS/Windows), installable via npx for easy distribution
**Project Type**: Single project (TypeScript MCP server)
**Performance Goals**: p95 query latency <500ms for keyword search + filters, sync throughput >100 records/sec
**Constraints**: <200ms p95 for simple filter queries (no keyword search), <100MB memory footprint, offline operation between syncs
**Scale/Scope**: ~10k Azure update records at launch, supports concurrent queries from multiple LLM clients, handles daily syncs with differential updates

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **Code Quality**: TypeScript strict mode enabled, ESLint configured, 80%+ coverage target for all modules, JSDoc for all public APIs
- [x] **Testing Strategy**: TDD approach with Vitest - unit tests (services, parsers), integration tests (SQLite operations, MCP tools), e2e tests (full sync + query workflows)
- [x] **Maintainability**: YAGNI applied - MVP defers semantic search, remote HTTP access; dependencies justified (MCP SDK required, better-sqlite3 for embedded DB, turndown for HTML conversion, node-cron for scheduling); cyclomatic complexity ≤10 enforced
- [x] **Cost Efficiency**: Zero infrastructure costs (local SQLite, no cloud services); API rate limiting with exponential backoff prevents abuse; caching via local replication eliminates redundant API calls; efficient FTS5 indexing for fast queries
- [x] **Workflow Compliance**: Specification complete with P1/P2/P3 priorities, user scenarios with acceptance criteria, success criteria measurable; constitution compliance verified; quality gates defined (pre-commit hooks, CI with linting/tests/coverage)

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
azure-updates-mcp-server/
├── src/
│   ├── index.ts                 # MCP server entry point, stdio transport setup
│   ├── server.ts                # MCP server implementation, tool registration
│   ├── models/
│   │   ├── azure-update.ts      # TypeScript interfaces for Azure Update API schema
│   │   ├── sync-checkpoint.ts   # Sync state tracking model
│   │   └── search-query.ts      # Query parsing and validation models
│   ├── services/
│   │   ├── azure-api.service.ts      # HTTP client for Azure Updates API
│   │   ├── sync.service.ts           # Differential sync logic with checkpointing
│   │   ├── search.service.ts         # Keyword search + filtering using SQLite FTS5
│   │   └── html-converter.service.ts # HTML-to-Markdown conversion with Turndown
│   ├── database/
│   │   ├── schema.sql           # SQLite table definitions + FTS5 indices
│   │   ├── database.ts          # better-sqlite3 initialization and migrations
│   │   └── queries.ts           # Prepared statements for CRUD + search
│   ├── tools/
│   │   └── search-azure-updates.tool.ts  # Single MCP tool: search, filter, get by ID
│   ├── resources/
│   │   └── guide.resource.ts    # MCP resource: metadata and available filters
│   └── utils/
│       ├── logger.ts            # Structured logging with metrics
│       ├── retry.ts             # Exponential backoff retry logic
│       └── staleness.ts         # Data freshness checking for startup sync
├── tests/
│   ├── unit/
│   │   ├── services/            # Service layer unit tests
│   │   ├── tools/               # MCP tool unit tests
│   │   └── utils/               # Utility function tests
│   ├── integration/
│   │   ├── database.test.ts     # SQLite operations + FTS5 queries
│   │   ├── sync.test.ts         # Full sync workflow with mock API
│   │   └── mcp-tools.test.ts    # MCP tool integration tests
│   ├── mock-api/
│   │   └── server.ts            # Express-based mock Azure Updates API for dev/test
│   └── fixtures/
│       ├── azure-updates.json          # Small dataset (100-200 records) for dev
│       ├── azure-updates-full.json     # Full snapshot (~9,300 records) for perf tests
│       └── test.db                     # Test database snapshots
├── .env.development             # Development environment variables (mock API, no auto-sync)
├── package.json                 # npm scripts, dependencies, "bin" for npx
├── tsconfig.json                # TypeScript strict mode configuration
├── vitest.config.ts             # Vitest test runner configuration
└── .eslintrc.json               # ESLint rules for TypeScript
```

**Structure Decision**: Single TypeScript project with clear separation of concerns - MCP server layer (`server.ts`, `tools/`), business logic (`services/`), data layer (`database/`), and models. This structure supports the constitution's maintainability principles (single responsibility, clear naming) and enables independent testing of each layer. The `bin` entry in package.json enables npx execution.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations - all constitution principles are satisfied within acceptable bounds.

---

## Phase 0: Outline & Research ✅ COMPLETE

All technical unknowns have been researched and resolved. See [research.md](research.md) for full details.

### Key Decisions Made

1. **MCP SDK**: `@modelcontextprotocol/sdk` (official TypeScript SDK)
2. **Database**: `better-sqlite3` with FTS5 extension for embedded full-text search
3. **HTML Conversion**: `turndown` library with custom rules for data URLs
4. **Scheduling**: `node-cron` for configurable sync intervals
5. **Testing**: Vitest for fast TypeScript unit/integration tests
6. **API Integration**: Differential sync with exponential backoff retry

All NEEDS CLARIFICATION items from Technical Context have been resolved.

---

## Phase 1: Design & Contracts ✅ COMPLETE

Design artifacts have been generated based on research findings:

### Artifacts Created

1. **[data-model.md](data-model.md)**: Complete SQLite schema with:
   - 7 tables (azure_updates, update_tags, update_categories, update_products, update_availabilities, updates_fts, sync_checkpoints)
   - FTS5 full-text search configuration with porter stemming
   - Indexing strategy for all query patterns
   - Migration strategy and performance estimates

2. **[contracts/](contracts/)**: MCP tool and resource schemas:
   - `search-azure-updates-tool.json`: Single unified tool for search, filter, and get-by-ID operations
   - `azure-updates-guide-resource.json`: MCP resource schema for metadata and available filter values
   - `README.md`: Architecture overview, usage patterns, and integration guide

3. **[quickstart.md](quickstart.md)**: Complete user documentation:
   - Installation (npx, global, local development)
   - Configuration (environment variables, cron schedules)
   - MCP client setup (Claude Desktop, Continue.dev, Cline)
   - Usage examples and query patterns
   - Monitoring and troubleshooting

4. **Snapshot Generation Strategy**:
   - Build script to generate pre-populated SQLite snapshot
   - Script fetches full Azure Updates dataset (~9,300 records)
   - Populates database with all tables, indices, FTS5 virtual table
   - Run during CI/CD pipeline before npm publish
   - Include snapshot file (~70MB) in package distribution
   - Document refresh cadence (weekly/monthly releases recommended)

5. **Mock API Implementation** (for development/testing):
   - Express-based mock server in `tests/mock-api/server.ts`
   - Serves fixture data from `tests/fixtures/azure-updates.json`
   - Supports OData `$filter` query for differential sync testing
   - Configurable via `AZURE_UPDATES_API_ENDPOINT` environment variable
   - npm scripts: `npm run dev` launches mock API + server
   - Prevents production API load during development

6. **Agent Context Updated**: [.github/agents/copilot-instructions.md](.github/agents/copilot-instructions.md)
   - TypeScript 5.x + Node.js 18+ runtime context
   - MCP SDK, better-sqlite3, turndown, node-cron dependencies
   - SQLite with FTS5 architecture

### Constitution Re-Check (Post-Design)

- [x] **Code Quality**: TypeScript strict mode, ESLint, JSDoc standards verified in research
- [x] **Testing Strategy**: Vitest with unit/integration/e2e hierarchy documented
- [x] **Maintainability**: Single project structure with clear separation of concerns (models, services, database, tools)
- [x] **Cost Efficiency**: Zero infrastructure costs (local SQLite), efficient FTS5 indexing, no cloud services
- [x] **Workflow Compliance**: All design artifacts complete, ready for task generation

**Status**: All gates passed. Ready for Phase 2 (Task Generation via `/speckit.tasks` command).

---

## Phase 2: Task Generation

**Command**: `/speckit.tasks` - Generates dependency-ordered implementation tasks in [tasks.md](tasks.md)

**Note**: Phase 2 is handled by a separate command and is NOT part of `/speckit.plan` scope. This planning phase is now complete.

---

## Planning Complete ✅

### Summary

Implementation planning for **Azure Updates MCP Server** has been completed successfully. All technical unknowns have been researched, design decisions documented, and artifacts generated.

### Generated Artifacts

| Artifact | Path | Status |
|----------|------|--------|
| Implementation Plan | [plan.md](plan.md) | ✅ Complete |
| Technical Research | [research.md](research.md) | ✅ Complete |
| Data Model | [data-model.md](data-model.md) | ✅ Complete |
| MCP Tool Contracts | [contracts/](contracts/) | ✅ Complete (5 tools) |
| Quick Start Guide | [quickstart.md](quickstart.md) | ✅ Complete |
| Agent Context | [.github/agents/copilot-instructions.md](.github/agents/copilot-instructions.md) | ✅ Updated |

### Technical Stack Summary

- **Language**: TypeScript 5.x (Node.js 18+)
- **MCP Framework**: @modelcontextprotocol/sdk
- **Database**: SQLite with FTS5 (better-sqlite3)
- **HTML Conversion**: turndown
- **Sync Strategy**: Startup-based with staleness detection
- **Testing**: Vitest
- **Deployment**: npm package with npx support

### Key Architecture Decisions

1. **Local-first**: Embedded SQLite with FTS5 for zero infrastructure costs
2. **Startup Sync Model**: Data freshness check on server start (stdio lifecycle constraint)
3. **Differential Sync**: Timestamp-based checkpointing for efficient API usage
4. **Type Safety**: TypeScript strict mode throughout
5. **Test-Driven**: TDD workflow with 80%+ coverage target
6. **Simple First**: MVP defers semantic search and remote access

### Next Steps

Run `/speckit.tasks` to generate actionable implementation tasks from this plan.

### Branch Information

- **Feature Branch**: `001-azure-updates-mcp`
- **Spec Location**: `/specs/001-azure-updates-mcp/spec.md`
- **Plan Location**: `/specs/001-azure-updates-mcp/plan.md`

---

**Planning Phase Complete** | **Date**: 2025-12-16 | **Ready for Implementation**
