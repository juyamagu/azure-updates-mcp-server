# Data Model: Add Get Update Tool & Simplify Search

**Feature**: 002-add-get-update-tool  
**Date**: 2025-12-17

## Overview

This document defines the data models for the two-tool pattern: lightweight search results and full update details.

## Entities

### AzureUpdate (Existing - No Changes)

The complete Azure update entity with all fields.

**Fields**:
- `id`: string - Unique identifier (UUID format)
- `title`: string - Update title
- `description`: string - Full HTML description
- `descriptionMarkdown`: string | undefined - Markdown version of description
- `status`: string | null - Update status (e.g., "Active", "Retired")
- `locale`: string | null - Locale (e.g., "en-US")
- `created`: string - ISO 8601 timestamp
- `modified`: string - ISO 8601 timestamp
- `tags`: string[] - Update tags (e.g., ["Retirements", "Security"])
- `productCategories`: string[] - Product categories (e.g., ["Compute", "AI + Machine Learning"])
- `products`: string[] - Specific products (e.g., ["Azure Virtual Machines"])
- `availabilities`: AzureUpdateAvailability[] - Availability information

**Usage**: Returned by `get_azure_update` tool.

**Source**: Already defined in `src/models/azure-update.ts`.

---

### AzureUpdateSummary (New)

Lightweight version of Azure update for search results, excluding large description fields.

**Type Definition**:
```typescript
export type AzureUpdateSummary = Omit<AzureUpdate, 'description' | 'descriptionMarkdown'>;
```

**Fields** (inherited from AzureUpdate, minus descriptions):
- `id`: string
- `title`: string
- `status`: string | null
- `locale`: string | null
- `created`: string
- `modified`: string
- `tags`: string[]
- `productCategories`: string[]
- `products`: string[]
- `availabilities`: AzureUpdateAvailability[]

**Additional Field** (search-specific):
- `relevanceScore`: number | undefined - BM25 relevance score (only present for keyword searches)

**Usage**: Returned by `search_azure_updates` tool (array of summaries).

**Rationale**: Provides sufficient metadata for discovery without the token cost of full descriptions.

---

### AzureUpdateAvailability (Existing - No Changes)

Availability information for an update.

**Fields**:
- `ring`: string - Availability ring (e.g., "General Availability", "Preview", "Retirement")
- `date`: string - ISO 8601 date

**Usage**: Nested within both AzureUpdate and AzureUpdateSummary.

---

## Type Relationships

```
AzureUpdate (Full entity)
    ├─ Contains: description (HTML)
    ├─ Contains: descriptionMarkdown
    └─ Includes: all AzureUpdateSummary fields

AzureUpdateSummary (Subset of AzureUpdate)
    ├─ Omits: description, descriptionMarkdown
    ├─ Adds: relevanceScore (search context only)
    └─ Includes: id, title, status, locale, created, modified, tags, productCategories, products, availabilities

AzureUpdateAvailability (Nested)
    └─ Used in both AzureUpdate and AzureUpdateSummary
```

## Data Flow

### Search Flow
1. User calls `search_azure_updates` with query/filters
2. Service executes search query (existing logic)
3. Tool handler formats results as `AzureUpdateSummary[]`
4. Response excludes `description` and `descriptionMarkdown` fields

### Get Flow
1. User calls `get_azure_update` with `id`
2. Service queries database by ID (existing `getUpdateById()`)
3. Tool handler returns full `AzureUpdate` object
4. Response includes complete description fields

## Validation Rules

### AzureUpdateSummary
- `id`: Required, non-empty string
- `title`: Required, non-empty string
- `created`: Required, valid ISO 8601 timestamp
- `modified`: Required, valid ISO 8601 timestamp
- `tags`: Array (may be empty)
- `productCategories`: Array (may be empty)
- `products`: Array (may be empty)
- `availabilities`: Array (may be empty)

### AzureUpdate
- Inherits all AzureUpdateSummary validations
- `description`: Required, non-empty string (HTML)
- `descriptionMarkdown`: Optional (may be undefined if conversion failed)

## Size Estimates

### AzureUpdateSummary (average)
- Metadata: ~300 bytes
- Tags (3 items): ~60 bytes
- Categories (2 items): ~50 bytes
- Products (2 items): ~80 bytes
- Availabilities (2 items): ~100 bytes
- **Total**: ~500-700 bytes per result

### AzureUpdate (average)
- Summary fields: ~600 bytes
- Description (HTML): ~2000-5000 bytes
- Description (Markdown): ~1500-4000 bytes
- **Total**: ~4000-10000 bytes per result

**Savings**: Search results are **80-90% smaller** without descriptions.

## Implementation Notes

1. **Type Safety**: Use TypeScript's `Omit` utility to derive `AzureUpdateSummary` from `AzureUpdate` to ensure type consistency.

2. **No Database Changes**: Both types are projections of the same database schema. No new tables or columns required.

3. **Response Formatting**: Tool handlers are responsible for projection:
   - `search_azure_updates`: Maps query results to `AzureUpdateSummary` format
   - `get_azure_update`: Returns `AzureUpdate` as-is from database query

4. **Testing**: Type tests should verify that `AzureUpdateSummary` correctly omits description fields and includes all other fields from `AzureUpdate`.
