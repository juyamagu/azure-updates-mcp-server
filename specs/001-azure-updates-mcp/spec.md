# Feature Specification: Azure Updates MCP Server

**Feature Branch**: `001-azure-updates-mcp`  
**Created**: 2025-12-16  
**Status**: Draft  
**Input**: User description: "Build a mcp server that wraps Azure Updates API for better UI/UX in LLM chat. It replicates the updates data and offers better search capabilities, including semantic search, easy filter, and so on."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Natural Language Search for Azure Updates (Priority: P1)

An AI assistant user wants to find Azure retirement information by asking natural language questions like "Show me all security-related retirements happening in 2026" or "What Azure services are retiring next quarter?" without needing to know OData syntax or API details.

**Why this priority**: This is the core value proposition - making Azure Updates accessible through conversational AI. Without this, users must manually construct complex OData queries, defeating the purpose of an MCP server for LLM integration.

**Independent Test**: Can be fully tested by sending natural language queries through the MCP server and verifying that relevant Azure updates are returned with accurate filtering, delivering immediate value for AI assistant integration.

**Acceptance Scenarios**:

1. **Given** the MCP server is running and has synced Azure Updates data, **When** user asks "Show me retirements in the Compute category", **Then** system returns only Azure updates tagged as "Retirements" with "Compute" in productCategories
2. **Given** the MCP server has current data, **When** user asks "What's retiring in Q1 2026?", **Then** system returns updates with retirement dates between January-March 2026
3. **Given** a user query with multiple criteria like "security retirements after December 2025", **When** query is processed, **Then** system returns updates matching all criteria (Security tag, Retirement tag, modified date > Dec 2025)
4. **Given** a vague query like "tell me about Azure ML changes", **When** keyword search is applied to title and description, **Then** system returns Azure Machine Learning updates ranked by relevance

---

### User Story 2 - Simplified Filtering Without OData Knowledge (Priority: P1)

An AI assistant needs to filter Azure updates by categories, tags, date ranges, and status without requiring the user or LLM to construct complex OData filter syntax with URL encoding.

**Why this priority**: OData syntax is complex (e.g., `tags/any(f:f eq 'Retirements')`) and error-prone. This is essential for making the API usable in conversational contexts.

**Independent Test**: Can be tested independently by sending simple filter requests (e.g., `{"tags": ["Retirements"], "productCategories": ["Security"]}`) and verifying correct results without OData syntax.

**Acceptance Scenarios**:

1. **Given** a filter request for tags = ["Retirements"], **When** MCP server processes the request, **Then** only updates with Retirements tag are returned
2. **Given** a filter combining tags, categories, and date range, **When** applied, **Then** system returns intersection of all filters
3. **Given** a request for updates modified since a specific timestamp, **When** processed, **Then** system returns only updates modified after that timestamp
4. **Given** a filter by availability ring (e.g., "General Availability", "Preview"), **When** applied, **Then** system returns updates with matching availability status

---

### User Story 3 - Keyword Search Across Title and Description (Priority: P2)

An AI assistant user wants to search for Azure updates by keywords that appear in the title or description content, such as finding all updates mentioning "authentication" or "OAuth" in their text.

**Why this priority**: Basic filtering by tags and categories alone is insufficient. Keyword search across title and description enables users to find updates based on actual content, significantly improving discoverability.

**Independent Test**: Can be tested by submitting keyword queries (e.g., "OAuth") and verifying that results include all updates with that keyword in title or description, ranked by relevance.

**Acceptance Scenarios**:

1. **Given** updates containing "OAuth2" in title or description, **When** user searches for "OAuth", **Then** those updates are returned
2. **Given** a query for "retirement", **When** keyword search is applied, **Then** results include updates with "retirement" in title or description (case-insensitive)
3. **Given** search results, **When** displayed, **Then** items with keyword in title are ranked higher than those with keyword only in description
4. **Given** a multi-word query like "machine learning", **When** searched, **Then** system returns updates containing both words (not necessarily adjacent)

---

### User Story 4 - Automatic Data Synchronization (Priority: P2)

The MCP server automatically keeps Azure Updates data current by periodically syncing with the Azure Updates API using differential updates, ensuring users always query fresh data without manual intervention.

**Why this priority**: Stale data undermines trust in search results. Automatic sync ensures data freshness without requiring manual updates, making the server production-ready.

**Independent Test**: Can be tested by running initial sync, noting latest modified timestamp, waiting for Azure Updates API changes, triggering sync, and verifying that new/updated records appear in local storage.

**Acceptance Scenarios**:

1. **Given** MCP server starts for the first time with included snapshot, **When** server initializes, **Then** tools are available immediately with snapshot data (<1 second) and background sync starts asynchronously
2. **Given** MCP server starts with stale data (>24h old), **When** server initializes, **Then** tools are available immediately and background sync starts asynchronously
3. **Given** new updates exist in Azure API, **When** differential sync runs, **Then** new records are added to local storage without blocking queries
4. **Given** existing updates have been modified in Azure API, **When** sync runs, **Then** local records are updated via UPSERT operations
5. **Given** sync fails midway, **When** next sync runs, **Then** system resumes from last successful checkpoint without data duplication
6. **Given** no updates have occurred since last sync, **When** sync runs, **Then** no unnecessary data fetching occurs
7. **Given** background sync is in progress, **When** user queries data, **Then** system responds with cached data without waiting for sync completion

---

### User Story 5 - Fast Response with Local Data Replication (Priority: P3)

Users experience sub-second response times for searches and filters because the MCP server queries local replicated data instead of making API calls to Azure Updates on every request.

**Why this priority**: While important for user experience, the core functionality works without optimization. This priority enables production-scale usage with acceptable performance.

**Independent Test**: Can be tested by measuring query response times with local storage versus direct API calls, demonstrating significant performance improvement.

**Acceptance Scenarios**:

1. **Given** data is replicated locally, **When** user performs a search, **Then** response time is under 500ms
2. **Given** 10,000+ updates in local storage, **When** complex filters are applied, **Then** results return within 1 second
3. **Given** concurrent requests from multiple AI assistants, **When** queries are processed, **Then** system handles them without significant performance degradation
4. **Given** keyword search is performed, **When** text indices are utilized, **Then** search completes faster than real-time API calls

---

### User Story 6 - Rich Metadata Exposure for AI Context (Priority: P3)

The MCP server exposes structured metadata (tags, product categories, availability dates, status) in a format optimized for LLM consumption, enabling AI assistants to provide rich contextual responses.

**Why this priority**: While the basic search works without this, exposing rich metadata enables more intelligent AI responses and better user experience. This is an enhancement rather than core functionality.

**Independent Test**: Can be tested by retrieving update details and verifying that all metadata fields are properly structured and formatted for LLM context windows.

**Acceptance Scenarios**:

1. **Given** a query for specific update, **When** returned, **Then** response includes title, description, tags, product categories, availability timeline, and status
2. **Given** HTML content in description field, **When** exposed to LLM, **Then** HTML is converted to markdown preserving formatting, links, and embedded content
3. **Given** multiple availability dates, **When** displayed, **Then** dates are formatted in human-readable format (e.g., "March 2026")
4. **Given** null or missing fields, **When** returned, **Then** response handles gracefully without breaking JSON structure

---

### Edge Cases

- What happens when Azure Updates API is unreachable during scheduled sync? (System should retry with exponential backoff and log failures)
- How does system handle API schema changes or new field additions? (Should accept unknown fields gracefully and log for monitoring)
- How are malformed or injection-prone queries handled? (Input validation and sanitization before processing)
- What happens when local storage is corrupted or empty? (Fall back to full resync from Azure Updates API)
- How does system handle concurrent sync operations? (Use locking mechanism to prevent duplicate syncs)
- What if user filters by values that don't exist in the dataset? (Return empty results with appropriate message, not error)
- How are timezone differences handled in date filtering? (All timestamps in UTC, clearly documented)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide an MCP server interface compliant with Model Context Protocol specification
- **FR-002**: System MUST replicate Azure Updates API data locally using differential synchronization based on the `modified` timestamp field
- **FR-003**: System MUST support natural language search queries that are translated into appropriate filters and keyword search operations across title and description fields
- **FR-004**: System MUST provide simplified filtering by tags, product categories, products, status, and date ranges without requiring OData syntax
- **FR-005**: System MUST implement case-insensitive keyword search across title and description fields with relevance ranking (title matches ranked higher than description matches)
- **FR-006**: System MUST perform UPSERT operations using `id` as unique key to handle both new updates and modifications to existing records
- **FR-007**: System MUST expose a single MCP tool (`search_azure_updates`) for search, filter, and retrieval operations optimized for LLM consumption, with all functionality accessible through one unified interface
- **FR-008**: System MUST include pre-populated database snapshot in distribution package, and automatically perform non-blocking background differential sync on startup if data is older than configurable threshold (default: 24 hours), allowing MCP tools to be available immediately with snapshot data
- **FR-009**: System MUST convert HTML description content to markdown format for LLM-friendly consumption, preserving all content including embedded links and data URLs
- **FR-010**: System MUST handle API failures gracefully with exponential backoff retry logic (max 3 retries with delays of 1s, 2s, 4s)
- **FR-011**: System MUST store full timestamp precision (7 decimal places) for accurate differential updates
- **FR-012**: System MUST accept and store unknown tag/category values dynamically without schema validation failures
- **FR-013**: System MUST provide pagination support for large result sets (default page size: 50 items)
- **FR-014**: System MUST expose metadata about available filters (tags, categories, products, statuses) as an MCP resource (`azure-updates://guide`) to help LLMs construct queries, allowing automatic inclusion in context without explicit tool calls
- **FR-015**: System MUST log all synchronization operations, errors, and query patterns for monitoring and debugging, and expose structured metrics including sync operation counts, query latency percentiles, error rates by type, and search index hit ratios
- **FR-016**: System MUST support filtering by availability ring (General Availability, Preview, Private Preview, Retirement)
- **FR-017**: System MUST support date range queries for created, modified, and availability date fields
- **FR-018**: System MUST return results ranked by relevance score for keyword searches (prioritizing title matches over description matches)
- **FR-019**: System MUST support combining multiple filter criteria with AND logic
- **FR-020**: System MUST provide a health check endpoint to verify server status and last sync timestamp, and expose operational metrics for monitoring dashboards (query counts, latency histograms, sync success/failure counts, data freshness indicators)

### Key Entities *(mandatory)*

- **Azure Update Record**: Represents a single update/announcement from Azure Updates API
  - Attributes: id (unique identifier), title, description (HTML content), tags (array), productCategories (array), products (array), status, created timestamp, modified timestamp, locale, availability dates, availabilities array
  - Relationships: Can have multiple tags, multiple product categories, multiple products, multiple availability entries

- **Sync Checkpoint**: Tracks synchronization state for differential updates
  - Attributes: last_sync_timestamp (ISO 8601 with 7 decimal precision), sync_status (success/failed), record_count, last_sync_duration
  - Purpose: Enables resumable syncs and tracks data freshness

- **Search Query**: Represents user search intent translated from natural language
  - Attributes: raw_query (original text), parsed_filters (structured), search_keywords (extracted terms), result_limit, offset
  - Relationships: Produces multiple Azure Update Records as results

- **Filter Metadata**: Available filter values to assist query construction
  - Attributes: tags (array), productCategories (array), products (array), statuses (array), availability_rings (array)
  - Purpose: Helps LLMs understand valid filter options without hardcoding

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can find relevant Azure updates using natural language queries with 90%+ accuracy for common query patterns (retirements, date ranges, product categories)
- **SC-002**: Search queries return results in under 500ms for typical queries (filters + keyword search across title and description)
- **SC-003**: System successfully syncs with Azure Updates API with 99%+ success rate, handling transient failures with automatic retry
- **SC-004**: Zero OData syntax knowledge required - 100% of filter operations work through simple JSON-based parameters
- **SC-005**: Data freshness maintained within configured staleness threshold - local data automatically updates on startup if older than threshold under normal operations (default: 24 hours)
- **SC-006**: Keyword search provides 85%+ precision for exact term matches in title and description fields
- **SC-007**: System handles concurrent requests from multiple AI assistants without performance degradation (tested with 10+ concurrent queries)
- **SC-008**: LLM context consumption reduced by 60%+ through clean markdown conversion of HTML descriptions
- **SC-009**: System recovers automatically from failures - 100% of interrupted syncs resume without data loss or duplication
- **SC-010**: Search result relevance - top 5 results include target content 85%+ of the time for well-formed queries

## Clarifications

### Session 2025-12-16

- Q: Should semantic search use a locally-runnable embedding model only, cloud-based service only, both options, or be deferred from MVP? → A: Defer semantic search from MVP - focus on keyword search across title and description fields instead (simpler implementation, sufficient for initial use cases)
- Q: What level of observability should the system provide - logs only, logs + health endpoint, logs + structured metrics, or full observability with tracing? → A: Logs + structured metrics (sync count, query latency, error rates) to enable dashboards and alerting for tracking Success Criteria
- Q: Should sync interval be hardcoded, configurable with presets, or fully configurable including manual-only mode? → A: Configurable staleness threshold with 24-hour default for startup sync checks (allows operators to tune based on usage patterns while providing sensible out-of-box behavior; note: stdio MCP servers cannot use background cron scheduling)
- Q: Should HTML description content be stripped to plain text, converted to markdown with all content preserved, converted with sanitization, or kept as HTML? → A: Convert to markdown preserving all content including data URLs (maintains full fidelity of original content for LLM consumption)
- Q: Should the server support local-only MCP access, remote HTTP access with auth, or both deployment modes? → A: Local MCP access only for MVP (simpler security model, faster iteration), with architecture designed to support future remote HTTP access with authentication

## Assumptions

- The Azure Updates API schema remains relatively stable (new fields may be added but existing fields won't change types)
- The API endpoint (`https://www.microsoft.com/releasecommunications/api/v2/azure`) remains available without authentication requirements
- Total dataset size stays under 100,000 records (currently ~9,300), allowing in-memory or local database storage
- Keyword search uses full-text indexing on title and description fields for acceptable performance
- MCP server will be run in environments with persistent storage for local data replication
- MCP server operates in local-only mode, communicating via stdio/local transport with AI assistants on the same machine
- Users interact through AI assistants that support Model Context Protocol
- Network connectivity to Azure Updates API is available for scheduled syncs (intermittent connectivity acceptable due to local replication)
- HTML in description fields follows standard formatting (though system should handle malformed HTML gracefully)
- The rate at which Azure Updates are modified is moderate (not thousands per hour), making 24-hour staleness threshold sufficient for most use cases
- stdio MCP servers only run while LLM app is active, so background scheduling is not possible; startup sync with staleness detection is the appropriate pattern
- Pre-populated database snapshot can be distributed with npm package (~70MB), with snapshot refreshed on each package release to maintain reasonable data freshness

## Out of Scope

- Manual data entry interface for administrators (mentioned in API docs as future enhancement, not part of this feature)
- Real-time push notifications of new Azure updates (system uses polling-based sync)
- Historical versioning of update changes (system only stores current state via UPSERT)
- Remote HTTP access with authentication (deferred to future version; current MVP focuses on local MCP stdio transport in trusted environment)
- Multi-language support beyond what's in the API (currently locale field is typically null)
- Custom alerting rules for specific update patterns (pure query/search capability only)
- Integration with other Microsoft APIs beyond Azure Updates
- GraphQL or REST API exposure (MCP protocol only)
- Web UI for browsing updates (server-side only)
- Export functionality to other formats (PDF, CSV, etc.)

## Dependencies

- Azure Updates API availability at `https://www.microsoft.com/releasecommunications/api/v2/azure`
- Persistent storage system (SQLite) for local data replication with full-text search capability
- MCP SDK/framework for implementing Model Context Protocol server
- HTML-to-Markdown conversion library for description field processing

## Risks and Mitigation

### Risk 1: Azure Updates API Availability
**Risk**: API downtime or rate limiting could prevent data synchronization  
**Impact**: High - without sync, data becomes stale  
**Mitigation**: Local data replication provides continued service during outages; exponential backoff prevents hammering the API; sync checkpoint allows resumption

### Risk 2: Keyword Search Performance
**Risk**: Full-text search on large description fields could be slow without proper indexing  
**Impact**: Medium - search response times may exceed targets  
**Mitigation**: Implement full-text indices on title and description fields; consider limiting description search to first N characters; use database-native text search features

### Risk 3: Dataset Growth
**Risk**: If Azure updates grow beyond expected scale, local storage and search performance degrade  
**Impact**: Medium - system may become slow or require infrastructure upgrade  
**Mitigation**: Design with scalable storage; implement archival strategy for old updates; use indexing for search performance

### Risk 4: API Schema Changes
**Risk**: Microsoft adds breaking changes to API schema without notice  
**Impact**: Low-Medium - sync could break or miss new fields  
**Mitigation**: Flexible schema handling (accept unknown fields); monitor $metadata endpoint; comprehensive error logging

### Risk 5: HTML Content Complexity
**Risk**: Description field HTML may be malformed or contain unexpected structures; data URLs and embedded images increase storage size  
**Impact**: Low-Medium - affects readability and storage requirements  
**Mitigation**: Use robust HTML-to-Markdown conversion library; implement fallback to raw text on parsing errors; monitor storage usage for large embedded content

## Success Metrics

- Query response time (target: p95 < 500ms for filters and keyword search)
- Sync success rate (target: >99%)
- Data freshness (target: within configured sync interval, default < 24 hours lag)
- Search recall (target: 85%+ relevant results in top 5)
- Keyword search precision (target: 85%+ for exact term matches)
- System uptime (target: 99.9% availability)
- Error rate (target: <0.1% of queries)

## Notes

This specification focuses on WHAT users need (natural language search, easy filtering, fresh data) and WHY (OData is complex, API direct calls are slow, LLMs need clean data). Implementation details like programming language, specific database choice, embedding model, and MCP framework are intentionally left to the planning phase.

The priority structure enables incremental delivery: P1 stories deliver core value (natural language search + simple filtering), P2 adds production readiness (keyword search across content + auto-sync), and P3 provides polish (performance optimization + rich metadata). Semantic search is deferred to future versions in favor of simpler, more maintainable keyword search implementation.

The MVP focuses on local deployment (MCP stdio transport) for simplicity and rapid iteration. The architecture should be designed with future extensibility in mind to support remote HTTP access with authentication, enabling multi-user deployments and cloud-hosted scenarios in subsequent versions.
