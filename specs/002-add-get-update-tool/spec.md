# Feature Specification: Add Get Update Tool & Simplify Search

**Feature Branch**: `002-add-get-update-tool`
**Created**: 2025-12-17
**Status**: Draft
**Input**: User description: "Need a way to get full update details separately and reduce token usage in search."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Retrieve Full Update Details (Priority: P1)

An AI assistant needs to retrieve the complete content of a specific Azure update to provide a detailed answer to the user.

**Why this priority**: Essential for accessing the core content (description) which is being removed from the search results.

**Independent Test**: Can be tested by calling `get_azure_update` with a valid ID and verifying the response contains the full markdown description.

**Acceptance Scenarios**:

1. **Given** a valid update ID, **When** `get_azure_update` is called, **Then** the system returns the full update details including title, full markdown description, and metadata.
2. **Given** an invalid update ID, **When** `get_azure_update` is called, **Then** the system returns a clear "not found" error.
3. **Given** a request, **When** `id` is missing, **Then** the system returns a validation error.

---

### User Story 2 - Lightweight Search (Priority: P1)

An AI assistant wants to search for updates without consuming a large amount of tokens, receiving a concise list of results to choose from.

**Why this priority**: Improves performance and reduces token usage, allowing for broader searches and more context for other tasks.

**Independent Test**: Can be tested by calling `search_azure_updates` and verifying the response size is small and does not contain the full description text.

**Acceptance Scenarios**:

1. **Given** a search query, **When** `search_azure_updates` is called, **Then** the results include ID, title, dates, tags, and categories, but NOT the full description.
2. **Given** the tool definition, **When** inspected, **Then** the `id` parameter is no longer present in the input schema (search by ID is now handled by `get_azure_update`).
3. **Given** a search result, **When** displayed, **Then** it provides enough information (Title, Tags, Date) for the AI to decide which update to fetch in detail.

---

### User Story 3 - Retirement Date Filtering (Priority: P1)

An AI assistant needs to find Azure retirements happening within a specific date range and sort them by retirement date.

**Why this priority**: Critical for proactive planning - users need to know what's retiring soon.

**Independent Test**: Can be tested by calling `search_azure_updates` with `retirementDateFrom/To` filters and verifying only matching retirements are returned, sorted correctly.

**Acceptance Scenarios**:

1. **Given** a retirement date range filter, **When** `search_azure_updates` is called, **Then** only updates with retirement dates in that range are returned.
2. **Given** `sortBy: "retirementDate:asc"`, **When** results are returned, **Then** they are ordered by earliest retirement date first.
3. **Given** a keyword query and retirement filters, **When** combined, **Then** results match both keyword relevance AND date constraints.

### Edge Cases

- What happens when `search_azure_updates` is called with `id` (legacy usage)? -> Should fail validation or ignore it (schema change implies validation failure).
- What happens if the description is empty in the DB? -> `get_azure_update` should handle it gracefully.
- What happens when sorting by retirementDate but no Retirement ring exists? -> Those updates should be excluded from results.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a new tool `get_azure_update`.
- **FR-002**: `get_azure_update` MUST accept a single required argument `id` (string).
- **FR-003**: `get_azure_update` MUST return the full update object, including `description` in Markdown format.
- **FR-004**: System MUST modify `search_azure_updates` to remove the `id` parameter from its input schema.
- **FR-005**: `search_azure_updates` MUST NOT return the full `description` or `descriptionMarkdown` fields in the results list.
- **FR-006**: `search_azure_updates` MUST NOT return any description summary or snippet. It MUST return only title and metadata to maximize token savings.
- **FR-007**: `search_azure_updates` query parameter MUST search across title, description, tags, productCategories, and products fields.
- **FR-008**: `search_azure_updates` MUST support sorting by relevance, modified date, created date, and retirement date with explicit direction (asc/desc).
- **FR-009**: `search_azure_updates` filters MUST include only essential metadata: status, availabilityRing, date ranges (modified and retirement).

### Key Entities

- **AzureUpdate**: The full entity with all details.
- **AzureUpdateSummary**: The lightweight entity returned by search (subset of AzureUpdate).

## Success Criteria *(mandatory)*

- **SC-001**: `search_azure_updates` response payload size is reduced by at least 80% on average compared to the previous version for the same query.
- **SC-002**: Users (AI) can successfully retrieve full details using the two-step process (Search -> Get).
- **SC-003**: `get_azure_update` response time is under 200ms for cached/local data.

## Assumptions

- The database schema does not need to change, only the tool interfaces and query projections.
- Existing data is sufficient.
