# MCP Tool Design Best Practices

This document outlines best practices for designing MCP (Model Context Protocol) tools based on real-world usage patterns and the MCP specification.

## Core Principles

### 1. Tool Descriptions Are Critical

**Reality**: Most MCP clients don't frequently reference resources. Clients primarily rely on tool descriptions during tool selection.

**Implication**: Tool descriptions must be self-contained and comprehensive. Don't assume the client has read your resource documentation.

### 2. Keep Descriptions Concise

**Pattern**: 1-2 sentences structured as `[Verb] + [Resource/Object] + [Key Details]`

**Examples**:
- ✅ "Search and filter Azure service updates with FTS5 full-text search and structured filters."
- ✅ "Retrieve complete details of a specific Azure update by ID including full descriptions."
- ❌ "This tool allows you to search through the database of Azure updates..." (too verbose)

### 3. Mention Critical Operational Details

Include in description when relevant:
- **Pagination limits**: "Returns up to 100 results per request"
- **Token optimization**: "Returns lightweight metadata without descriptions to reduce token usage by 80%"
- **Required follow-up**: "Use get_azure_update to retrieve full details"
- **Key capabilities**: "Supports phrase search with 'exact phrase' syntax"

### 4. Use Schema for Parameter Details

**Tool description**: High-level purpose and workflow
**inputSchema properties**: Detailed parameter documentation

```typescript
{
    name: 'search_azure_updates',
    description: 'Search and filter Azure updates. Returns lightweight metadata without descriptions.',
    inputSchema: {
        properties: {
            query: {
                type: 'string',
                description: 'Full-text search query. Supports phrase search: "exact phrase" for phrases, regular words use OR logic.'
            },
            limit: {
                type: 'number',
                description: 'Maximum results (1-100, default: 20)',
                minimum: 1,
                maximum: 100
            }
        }
    }
}
```

## Tool Design Patterns

### Pattern 1: Two-Tool Architecture (Discovery + Details)

**Use case**: Large result objects with expensive descriptions

**Design**:
1. **Search tool**: Returns lightweight metadata (id, title, tags)
2. **Get tool**: Retrieves full details by ID

**Benefits**:
- Reduces token usage by 80%+ during discovery
- Allows clients to scan many results efficiently
- Client controls when to fetch expensive content

**Example**: This server's `search_azure_updates` + `get_azure_update`

### Pattern 2: Single Powerful Tool

**Use case**: Small result objects or operations without expensive data

**Design**: One tool with comprehensive filtering and optional parameters

**Benefits**:
- Simpler client integration
- Single tool call for complete operation
- Reduced cognitive load for LLMs

### Pattern 3: Resource for Metadata

**Use case**: Static or slowly-changing metadata (valid filter values, configuration)

**Design**: MCP resource (e.g., `azure-updates://guide`) with available filter values

**Reality Check**: Resources are underutilized by clients. If data is critical for tool usage, include summary in tool description.

## Common Mistakes

### ❌ Overly Generic Descriptions

```typescript
description: 'Query the database for information'
```

**Problem**: Doesn't tell the client what data is available or how to use it

### ❌ Implementation Details in Description

```typescript
description: 'Uses SQLite FTS5 with porter stemming to search the azure_updates table'
```

**Problem**: Clients care about capabilities, not implementation

### ❌ Missing Workflow Context

```typescript
// get_azure_update tool
description: 'Get an Azure update by ID'
```

**Problem**: Doesn't explain relationship to search tool or when to use it

**Better**:
```typescript
description: 'Retrieve complete details of a specific Azure update by ID. Use after search_azure_updates to get full descriptions.'
```

### ❌ Hiding Critical Limits in Schema Only

```typescript
description: 'Search Azure updates'
inputSchema: {
    properties: {
        limit: { type: 'number', maximum: 100 }
    }
}
```

**Problem**: Client may not check schema during tool selection

**Better**: Mention in description: "Returns up to 100 results per request"

## Schema Design

### Property Descriptions

**Pattern**: `[What it does] + [Format/Constraints] + [Example if complex]`

```typescript
{
    query: {
        type: 'string',
        description: 'Full-text search query. Supports phrase search: "exact phrase" for exact matches, other words use OR logic. Case-insensitive.'
    },
    dateFrom: {
        type: 'string',
        description: 'ISO 8601 date - include updates modified/available on or after this date (e.g., 2025-01-01)'
    }
}
```

### Use Enums for Fixed Values

```typescript
{
    sortBy: {
        type: 'string',
        enum: ['modified:desc', 'modified:asc', 'created:desc', 'created:asc'],
        description: 'Sort order. Default is modified:desc.'
    }
}
```

### Complex Objects Need Structure

```typescript
{
    filters: {
        type: 'object',
        description: 'Structured filters. All filters use AND logic.',
        properties: {
            tags: {
                type: 'array',
                items: { type: 'string' },
                description: 'Filter by tags - result must contain ALL specified tags'
            }
        }
    }
}
```

## Response Design

### 1. Consistent Structure

```typescript
{
    results: [...],      // Array of results
    total: 150,          // Total matches (for pagination)
    metadata: {          // Query metadata
        queryTime: 23,
        appliedFilters: {...}
    }
}
```

### 2. Include Pagination Metadata

```typescript
{
    results: [...],
    total: 150,
    limit: 20,
    offset: 0,
    hasMore: true
}
```

### 3. Meaningful Error Messages

```typescript
{
    error: 'validation_error',
    details: [
        'limit must be between 1 and 100',
        'dateFrom must be ISO 8601 format (YYYY-MM-DD)'
    ]
}
```

## Testing Tool Descriptions

### Questions to Ask

1. **Can a user understand the tool's purpose without reading code?**
2. **Does the description mention critical limitations (max results, required follow-up)?**
3. **Is the relationship to other tools clear?**
4. **Are parameter descriptions detailed enough to avoid guessing?**
5. **Do examples cover common use cases?**

### Example Review

**Before**:
```typescript
{
    name: 'search_azure_updates',
    description: 'Search Azure updates database',
    inputSchema: { /* ... */ }
}
```

**After**:
```typescript
{
    name: 'search_azure_updates',
    description: 'Search Azure service updates with full-text search and filters. ' +
                 'Returns lightweight metadata without descriptions (80% token reduction). ' +
                 'Use get_azure_update to retrieve full details.',
    inputSchema: { /* ... */ }
}
```

**Improvements**:
- ✅ Mentions key capabilities (full-text search, filters)
- ✅ Explains token optimization benefit
- ✅ Shows relationship to get_azure_update tool
- ✅ Still concise (2 sentences)

## Real-World Example: This Server

### search_azure_updates

```typescript
{
    name: 'search_azure_updates',
    description: 
        'Search and filter Azure service updates. ' +
        'Returns lightweight metadata without descriptions for efficient token usage. ' +
        'Supports phrase search ("exact phrase") and structured filters (AND semantics). ' +
        'Use get_azure_update to retrieve full details.',
    inputSchema: { /* detailed parameter descriptions */ }
}
```

**Why this works**:
- Clearly states what it does (search and filter)
- Mentions token optimization (important for clients)
- Highlights key features (phrase search, filters)
- Explains workflow (use get_azure_update next)

### get_azure_update

```typescript
{
    name: 'get_azure_update',
    description:
        'Retrieve complete details of a specific Azure update by ID including full descriptions. ' +
        'Use after search_azure_updates to get detailed content.',
    inputSchema: { /* id parameter */ }
}
```

**Why this works**:
- States exactly what it returns (complete details, full descriptions)
- Shows when to use it (after search)
- Simple because it's a straightforward fetch operation

## Summary Checklist

- [ ] Tool description is 1-2 sentences
- [ ] Description starts with a clear verb (Search, Retrieve, Create, etc.)
- [ ] Critical limitations mentioned (max results, pagination, etc.)
- [ ] Relationship to other tools explained (if applicable)
- [ ] Token optimization benefits stated (if applicable)
- [ ] Parameter descriptions include format/constraints/examples
- [ ] Enums used for fixed value sets
- [ ] Response structure is consistent and documented
- [ ] Error messages are descriptive and actionable
- [ ] Tool can be understood without reading implementation code

## References

- [MCP Specification](https://spec.modelcontextprotocol.io/)
- [MCP Tool Description Guide](https://www.merge.dev/blog/mcp-tool-description) (Merge.dev)
- [JSON Schema Documentation](https://json-schema.org/)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
