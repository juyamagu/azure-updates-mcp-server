# Quick Start: Get Update Tool & Simplified Search

**Feature**: 002-add-get-update-tool  
**Updated**: 2025-12-17

## Overview

Two-step workflow for discovering and retrieving Azure updates:
1. **Search** (`search_azure_updates`) - Lightweight discovery with metadata only
2. **Get** (`get_azure_update`) - Full detail retrieval including description

## Tool: `search_azure_updates` (Modified)

### Purpose
Search and filter Azure updates, returning lightweight results with metadata only (no descriptions).

### Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | No | Full-text search query (FTS5 on title + description). Supports phrase search: "exact phrase" for phrases, space-separated words for OR logic |
| `filters` | object | No | Structured filters: status, availabilityRing, dates, retirementDates, tags[], products[], productCategories[] (arrays use AND semantics) |
| `sortBy` | string | No | Sort order: modified:desc/asc, created:desc/asc, retirementDate:desc/asc (default: modified:desc) |
| `limit` | number | No | Maximum results to return (1-100, default: 20) |
| `offset` | number | No | Number of results to skip for pagination (default: 0) |

**Note**: The `id` parameter has been **removed**. Use `get_azure_update` instead.

**Key Features**:
- **Phrase search**: Use "virtual machine" to search for exact phrases in title/description
- **Structured filters**: Use filters.tags, filters.products, filters.productCategories with AND semantics (result must contain ALL specified values)
- **Flexible sorting**: Sort by relevance, modified, created, or retirementDate with explicit direction (:asc/:desc)
- **Retirement planning**: Filter by retirementDateFrom/To for proactive planning

### Example 1: Phrase Search for Specific Product

```json
{
  "query": "\"Azure Databricks\" retirement",
  "filters": {
    "retirementDateFrom": "2026-01-01",
    "retirementDateTo": "2026-12-31"
  },
  "sortBy": "retirementDate:asc",
  "limit": 10
}
```

**Explanation**: Searches for the exact phrase "Azure Databricks" plus the word "retirement" in title/description fields.

### Example 2: Filter by Multiple Tags

```json
{
  "query": "virtual machine",
  "filters": {
    "tags": ["Retirements", "Compute"],
    "productCategories": ["Compute"]
  },
  "sortBy": "modified:desc",
  "limit": 20
}
```

**Explanation**: Full-text search for "virtual" OR "machine" in title/description, AND result must have BOTH "Retirements" AND "Compute" tags, AND must be in "Compute" category.

### Response Structure

```json
{
  "results": [
    {
      "id": "AZ-abc123...",
      "title": "Retirement: Azure Virtual Machines Basic tier",
      "status": "Active",
      "tags": ["Retirements"],
      "productCategories": ["Compute"],
      "products": ["Azure Virtual Machines"],
      "created": "2025-01-15T10:00:00.000Z",
      "modified": "2025-01-20T14:30:00.000Z",
      "availabilities": [
        {
          "ring": "Retirement",
          "date": "2026-03-31"
        }
      ],
      "relevanceScore": 0.85
    }
  ],
  "metadata": {
    "total": 45,
    "limit": 10,
    "offset": 0,
    "hasMore": true,
    "queryTime": 23
  }
}
```

**Key Change**: No `description` or `descriptionMarkdown` fields in results.

---

## Tool: `get_azure_update` (New)

### Purpose
Retrieve the complete details of a specific Azure update by its ID, including the full description.

### Input Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | **Yes** | Unique identifier of the Azure update |

### Example: Get Update by ID

```json
{
  "id": "AZ-abc123..."
}
```

### Response Structure

```json
{
  "id": "AZ-abc123...",
  "title": "Retirement: Azure Virtual Machines Basic tier",
  "description": "The Basic tier for Azure Virtual Machines will be retired on March 31, 2026...",
  "status": "Active",
  "tags": ["Retirements"],
  "productCategories": ["Compute"],
  "products": ["Azure Virtual Machines"],
  "created": "2025-01-15T10:00:00.000Z",
  "modified": "2025-01-20T14:30:00.000Z",
  "availabilities": [
    {
      "ring": "Retirement",
      "date": "2026-03-31"
    }
  ],
  "_metadata": {
    "queryTime": 12
  }
}
```

**Key Feature**: Includes full `description` in Markdown format.

---

## Common Workflows

### Workflow 1: Find Retirements and Get Details

**Step 1**: Search for upcoming retirements sorted by date
```json
{
  "query": "retirement",
  "filters": {
    "retirementDateFrom": "2026-01-01",
    "retirementDateTo": "2026-12-31"
  },
  "sortBy": "retirementDate:asc",
  "limit": 20
}
```

**Step 2**: Pick an interesting result from the search, get full details
```json
{
  "id": "AZ-abc123..."
}
```

---

### Workflow 2: Keyword Search with Tag Filter + Detail Retrieval

**Step 1**: Search for security-related updates using tag filter
```json
{
  "query": "OAuth authentication",
  "filters": {
    "tags": ["Security"],
    "dateFrom": "2025-01-01"
  },
  "sortBy": "modified:desc"
}
```

**Explanation**: Full-text search for "OAuth" OR "authentication" in title/description, filtered to updates with "Security" tag.

**Step 2**: Get complete information for relevant updates
```json
{
  "id": "AZ-security456..."
}
```

---

### Workflow 3: Browse by Category and Product

**Step 1**: Search for AI/ML updates using category filter
```json
{
  "filters": {
    "productCategories": ["AI + machine learning"]
  },
  "sortBy": "modified:desc",
  "limit": 50
}
```

**Explanation**: Filter by category without keyword search. Returns all updates in "AI + machine learning" category, sorted by modification date.

**Step 2**: Get details for specific updates of interest
```json
{
  "id": "AZ-ml789..."
}
```

---

## Error Handling

### Search Tool Errors

**Validation Error** (invalid parameters):
```json
{
  "error": "Validation failed",
  "details": ["limit must be between 1 and 100"]
}
```

**Search Failed** (unexpected error):
```json
{
  "error": "Search failed",
  "details": "An unexpected error occurred while processing your search."
}
```

### Get Tool Errors

**Validation Error** (missing/invalid ID):
```json
{
  "error": "Validation failed",
  "details": "ID must be a non-empty string"
}
```

**Not Found** (ID doesn't exist):
```json
{
  "error": "Not Found",
  "details": "No update found with ID: AZ-invalid123"
}
```

**Operation Failed** (unexpected error):
```json
{
  "error": "Operation failed",
  "details": "An unexpected error occurred."
}
```

---

## Performance Notes

- **Search**: ~20-50ms average query time, ~500-700 bytes per result
- **Get**: ~10-20ms average query time, ~2-5KB per result
- **Token Savings**: Search results are **80-90% smaller** than previous version
- **Recommended Pattern**: Search broad, retrieve narrow (only fetch details for updates the user cares about)

---

## Migration Guide

### Before (Single Tool)
```json
// Get by ID was part of search tool
{
  "id": "AZ-abc123..."
}
```

### After (Two Tools)
```json
// Use dedicated get tool
Tool: "get_azure_update"
{
  "id": "AZ-abc123..."
}
```

### Impact
- Search results no longer include descriptions (intentional for token efficiency)
- Clients must call `get_azure_update` separately for full details
- No change to search filters or query capabilities
