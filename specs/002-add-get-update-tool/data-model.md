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
- `description`: string - Full description in Markdown format
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
export type AzureUpdateSummary = Omit<AzureUpdate, 'description'>;
```

**Fields** (inherited from AzureUpdate, minus descriptions):
- `id`: string - Unique identifier for retrieval via get_azure_update
- `title`: string - Update title (FTS5 searchable via query parameter)
- `status`: string | null - Update status (filterable)
- `locale`: string | null - Locale
- `created`: string - Creation timestamp (sortable)
- `modified`: string - Last modified timestamp (sortable, filterable via dateFrom/To)
- `tags`: string[] - Update tags (filterable via filters.tags with AND semantics, displayed in results)
- `productCategories`: string[] - Product categories (filterable via filters.productCategories with AND semantics, displayed in results)
- `products`: string[] - Specific products (filterable via filters.products with AND semantics, displayed in results)
- `availabilities`: AzureUpdateAvailability[] - Availability info including retirement dates (filterable via retirementDateFrom/To)

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
    ├─ Contains: description (Markdown)
    └─ Includes: all AzureUpdateSummary fields

AzureUpdateSummary (Subset of AzureUpdate)
    ├─ Omits: description
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
- `description`: Required, non-empty string (Markdown)

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
- Description (Markdown): ~1500-4000 bytes
- **Total**: ~2000-5000 bytes per result

**Savings**: Search results are **80-90% smaller** without descriptions.

## Implementation Notes

1. **Type Safety**: Use TypeScript's `Omit` utility to derive `AzureUpdateSummary` from `AzureUpdate` to ensure type consistency.

2. **No Database Changes**: Both types are projections of the same database schema. No new tables or columns required.

3. **Response Formatting**: Tool handlers are responsible for projection:
   - `search_azure_updates`: Maps query results to `AzureUpdateSummary` format
   - `get_azure_update`: Returns `AzureUpdate` as-is from database query

4. **Query vs Filter Distinction**:
   - **query parameter**: FTS5 full-text search on title and description fields only, with phrase search support ("exact phrase")
   - **filters.tags/products/productCategories**: Structured filters with AND semantics (result must contain ALL specified values)
   - This separation provides precise control: text search for content discovery, filters for metadata constraints

5. **Phrase Search**: Query parameter supports phrase search syntax - text enclosed in double quotes ("virtual machine") is treated as an exact phrase, other words use OR logic with prefix matching.

6. **Sorting Enhancements**: Added explicit direction suffixes (`:asc`, `:desc`) to sortBy parameter and support for sorting by retirement date.

7. **Testing**: Type tests should verify that `AzureUpdateSummary` correctly omits description fields and includes all other fields from `AzureUpdate`. Integration tests should verify phrase search syntax and filter AND semantics.
