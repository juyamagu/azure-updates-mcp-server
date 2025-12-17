# Research: Add Get Update Tool & Simplify Search

**Feature**: 002-add-get-update-tool  
**Date**: 2025-12-17  
**Status**: Complete

## Overview

This document captures research findings for implementing a two-tool pattern in the Azure Updates MCP Server: `search_azure_updates` (lightweight discovery) and `get_azure_update` (full detail retrieval).

## Research Questions

### 1. MCP Tool Design Best Practices

**Question**: What are the best practices for designing MCP tool interfaces for LLM consumption?

**Findings**:
- **Single Responsibility**: Each tool should have one clear purpose. Mixing search and get-by-ID in one tool creates ambiguity for LLMs.
- **Token Efficiency**: Tools should return minimal data for list operations. LLMs can make follow-up calls for details.
- **Clear Naming**: Tool names should be verb-based (`get_`, `search_`, `list_`) to indicate the operation type.
- **Input Validation**: Required vs optional parameters should be clearly defined in the schema.

**Decision**: Split search and get operations into separate tools with clear, distinct purposes.

**Alternatives Considered**:
- Option A: Add `includeDescription` boolean flag to search tool
  - Rejected: LLMs may not reliably set this flag appropriately, and it complicates the tool's interface
- Option B: Keep combined tool with id parameter
  - Rejected: Current implementation shows 80%+ token waste due to descriptions in search results

---

### 2. Response Payload Optimization

**Question**: What fields should be included in search results vs full detail retrieval?

**Findings**:
- **Search Results (Lightweight)**: id, title, status, tags, productCategories, products, created, modified, relevanceScore
  - Average size: ~500 bytes per result
  - Provides enough context for LLM to decide which update to fetch
- **Full Details (Complete)**: All fields from lightweight + description (HTML) + descriptionMarkdown
  - Average description size: ~2000-5000 bytes (4-10x the metadata)
  - Only needed when user asks for specific update content

**Decision**: Search returns metadata only (no description fields). Get returns complete object with full description.

**Rationale**: Title, tags, categories, and dates provide sufficient context for discovery. Description is only needed for detailed answers.

---

### 3. TypeScript Type Design

**Question**: How to structure types for the two response formats?

**Findings**:
- Existing type: `AzureUpdate` (complete object with all fields)
- Need: `AzureUpdateSummary` (subset without description fields)
- TypeScript utility: Use `Omit<AzureUpdate, 'description' | 'descriptionMarkdown'>` for type safety

**Decision**: 
```typescript
// In src/models/azure-update.ts
export type AzureUpdateSummary = Omit<AzureUpdate, 'description'>;
```

**Alternatives Considered**:
- Duplicate type definition: Rejected (violates DRY)
- Optional description fields: Rejected (ambiguous semantics - is it missing or not loaded?)

---

### 4. Backward Compatibility

**Question**: Should we maintain backward compatibility for the `id` parameter in search?

**Findings**:
- MCP tools are consumed by LLM agents, not end users directly
- Tool interface changes are handled by updating the tool schema in the server
- LLM agents adapt to new schemas automatically on next invocation

**Decision**: Breaking change is acceptable. Remove `id` parameter from `search_azure_updates` tool schema.

**Rationale**: Clean separation of concerns outweighs backward compatibility concerns in an MCP context where tool discovery is dynamic.

---

### 5. Error Handling for Get Operation

**Question**: What error responses should `get_azure_update` return?

**Findings**:
- MCP error format: `{ error: string, details: string | string[] }`
- Common errors:
  - Missing/invalid ID → Validation error
  - ID not found → Not found error
  - Database error → Internal error

**Decision**: Use consistent error response format from `search-azure-updates.tool.ts` (existing pattern).

---

## Implementation Approach

### Phase 1: Create Get Tool
1. Create `src/tools/get-azure-update.tool.ts` handler
2. Reuse existing `getUpdateById()` from `src/database/queries.ts`
3. Return full `AzureUpdate` object (no modifications to query)

### Phase 2: Simplify Search Tool
1. Update `search_azure_updates` response formatting to exclude description fields
2. Remove `id` parameter from `ToolInput` interface
3. Remove get-by-ID logic (line 89-91 in current implementation)

### Phase 3: Update Server Registration
1. Add `get_azure_update` tool to `ListToolsRequestSchema` handler
2. Add `get_azure_update` case to `CallToolRequestSchema` handler
3. Update `search_azure_updates` tool schema to remove `id` parameter

### Phase 4: Testing
1. Unit tests for `get_azure_update` tool handler
2. Update unit tests for `search_azure_updates` (remove id tests, verify no description in response)
3. Integration test for two-step workflow (search → get)

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Existing clients break due to removed `id` param | Medium | Low | MCP clients adapt to new schema automatically |
| Search results lack enough context | Low | Medium | Monitor usage; title + tags + categories proven sufficient |
| Performance regression | Low | Low | Both operations use existing optimized queries |

## References

- MCP SDK Documentation: https://github.com/modelcontextprotocol/typescript-sdk
- Existing implementation: `src/tools/search-azure-updates.tool.ts`
- Database queries: `src/database/queries.ts`
