# Changelog

All notable changes to Azure Updates MCP Server will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned

- Pre-populated database snapshot for instant startup
- Semantic search with embedding-based similarity matching
- Export functionality (JSON, CSV, Markdown)
- Historical versioning of updates
- Multi-language support

## [1.2.0] - 2025-12-17

### Added

- **Phrase Search**: FTS5 phrase search with double-quote syntax for exact phrase matching (`"Azure Virtual Machines"`)
- **Structured Filters**: Array filters for tags, products, and productCategories with AND semantics
  - Results must contain ALL specified filter values
  - Implemented with SQL EXISTS subqueries for optimal performance
- **E2E Test Suite**: Comprehensive end-to-end tests for MCP server lifecycle (15 new tests)
  - Server initialization and tool registration
  - Tool invocation via MCP request handlers
  - Resource discovery and retrieval
  - Error handling for unknown tools/resources
- **MCP Best Practices Documentation**: Guide for designing effective MCP tools (docs/mcp-best-practices.md)

### Changed

- **Default Sort Order**: Changed default `sortBy` to always be `modified:desc` (newest first) for consistency
- **Removed relevance option**: Removed `relevance` from `sortBy` enum (phrase search provides better relevance)
- Tool descriptions enhanced to emphasize token efficiency and phrase search syntax
- Updated `url` field in responses: includes direct link to Azure updates page
- Response format: `description` field now consistently returns Markdown (removed `descriptionMarkdown` field)

### Fixed

- **Critical Sync Bug**: Changed differential sync filter from `modified gt` to `modified ge` to prevent missing updates at same timestamp
- Type safety improvements in filter handling (explicit property copying vs loops)

### Improved

- Test coverage increased to 84.64% (228 tests total, all passing)
- Enhanced query validation with descriptive error messages
- Better code organization with extracted helper functions for filter building

## [1.1.0] - 2025-12-17

### Added

- **Two-Tool Architecture**: Split search and detail retrieval into separate tools for 80%+ token reduction
  - `search_azure_updates`: Lightweight discovery returning metadata only (no descriptions)
  - `get_azure_update`: Full detail retrieval by ID including complete Markdown description
- **Advanced Sorting**: `sortBy` parameter supporting relevance, modified date, created date, and retirement date sorting
- **Retirement Date Filtering**: New `retirementDateFrom` and `retirementDateTo` filters for proactive retirement planning
- **Simplified Query Interface**: Tags, categories, and products now searchable directly via `query` parameter
- **Integration Tests**: Comprehensive two-tool workflow and response validation tests

### Changed

- **BREAKING**: Removed `id` parameter from `search_azure_updates` - use `get_azure_update` instead
- **BREAKING**: Search results no longer include `description` or `descriptionMarkdown` fields
- Default result limit reduced from 50 to 20 for better token efficiency
- Updated guide resource to document two-tool workflow and new features

### Improved

- Reduced cyclomatic complexity in search service (buildOrderByClause: 12→7, buildSearchFilters: 11→4)
- Enhanced type safety by removing non-null assertions
- Better code organization with extracted helper functions

### Performance

- Search response size: 80-90% reduction per result (excludes descriptions)
- Average search result: ~500-700 bytes (previously ~2-5KB)
- Two-step workflow recommended: search broad, retrieve narrow

## [1.0.0] - 2025-12-16

### Added

- **Natural Language Search**: Full-text search across Azure updates using FTS5 with BM25 relevance ranking
- **Simplified Filtering**: Filter by tags, product categories, products, status, availability rings, and date ranges—no OData syntax required
- **Automatic Data Synchronization**: Differential sync with Azure Updates API using `modified` timestamp field
- **Fast Local Queries**: SQLite replication with optimized indices ensures <500ms p95 query latency
- **Rich Metadata Exposure**: MCP resource (`azure-updates://guide`) provides available filter values and data freshness
- **MCP Tool**: Single unified `search_azure_updates` tool for all query types (search, filter, get-by-ID)
- **Configurable Sync**: Control sync frequency and staleness threshold via environment variables
- **Non-Blocking Startup**: Server starts immediately with MCP tools available; sync runs in background
- **HTML to Markdown Conversion**: Automatic conversion of update descriptions for LLM-friendly consumption
- **Retry Logic**: Exponential backoff for API calls with configurable retry attempts
- **Structured Logging**: JSON-formatted logs with timing metrics and context
- **TypeScript Strict Mode**: Full type safety and compile-time guarantees
- **Comprehensive Test Suite**: Unit and integration tests with Vitest
- **ESLint Configuration**: Enforces code quality (complexity ≤10, no `any` types)

### Technical Details

- Built with `@modelcontextprotocol/sdk` v1.25.0
- SQLite with `better-sqlite3` v12.5.0 (FTS5 full-text search)
- HTML conversion with `turndown` v7.2.2
- Node.js 18+ runtime with ES modules
- TypeScript 5.x with strict mode
- Vitest for testing with coverage

### Performance

- Query latency: p95 < 500ms (keyword search + filters)
- Simple filter queries: p95 < 200ms
- Sync throughput: >100 records/sec
- Database size: ~50-100MB for 10k records
- Memory footprint: <100MB

## [0.1.0] - 2025-12-16

### Added

- Initial development version
- Basic MCP server setup with stdio transport
- Database schema with 7 tables (azure_updates, update_tags, update_categories, update_products, update_availabilities, updates_fts, sync_checkpoints)
- FTS5 full-text search configuration
- Basic search and filter functionality

---

## Version History Summary

- **1.1.0** (2025-12-17): Two-tool architecture for token efficiency
- **1.0.0** (2025-12-16): First stable release with full feature set
- **0.1.0** (2025-12-16): Initial development version

## Release Notes Format

Each release follows this structure:

- **Added**: New features
- **Changed**: Changes in existing functionality
- **Deprecated**: Soon-to-be removed features
- **Removed**: Removed features
- **Fixed**: Bug fixes
- **Security**: Security vulnerability fixes

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines on proposing changes.
