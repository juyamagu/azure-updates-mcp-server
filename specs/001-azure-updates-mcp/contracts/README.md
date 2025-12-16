# MCP Tool Contracts

This directory contains JSON schema definitions for the MCP tool and resource exposed by the Azure Updates MCP Server.

## Architecture Overview

The server follows MCP best practices with a **single powerful tool** and a **resource for metadata/guide**:

| Component | Type | Purpose | URI/Name |
|-----------|------|---------|----------|
| **search_azure_updates** | Tool | Search, filter, and retrieve Azure updates | `search_azure_updates` |
| **Azure Updates Search Guide** | Resource | Available filter values and usage guide | `azure-updates://guide` |

**Design Rationale**:
- **Single Tool**: Reduces cognitive load for LLMs, enables complex queries in one call (search + filter + get by ID)
- **Resource for Metadata**: MCP resources are designed for static/semi-static data that LLMs can include in context
- **Simpler Integration**: One tool registration, one handler, less maintenance

## Component Descriptions

### 1. Tool: search_azure_updates (search-azure-updates-tool.json)

**Purpose**: All-in-one tool for searching, filtering, and retrieving Azure service updates. Supports natural language queries, structured filters, and fetching specific updates by ID.

**Key Features**:
- **Keyword Search**: Full-text search across title and description (FTS5 with BM25 relevance ranking)
- **Multi-dimensional Filtering**: Tags, product categories, products, status, availability rings, date ranges (all use AND logic)
- **Fetch by ID**: Retrieve specific update when `id` parameter is provided
- **Pagination**: Configurable limit (1-100, default 50) and offset for large result sets
- **Relevance Scoring**: Automatic BM25 ranking for keyword searches

**Input Parameters**:
- `query` (optional): Natural language or keyword search
- `id` (optional): Fetch specific update by ID (ignores other params)
- `filters` (optional): Object with `tags`, `productCategories`, `products`, `status`, `availabilityRing`, `dateFrom`, `dateTo`
- `limit` (optional): Max results (default 50, max 100)
- `offset` (optional): Pagination offset (default 0)

**Use Cases**:
1. Natural language search: `"Show me OAuth security updates"`
2. Filtered search: Retirements in Compute category, Q1 2026
3. Keyword + filters: `"machine learning"` + `availabilityRing: "Preview"`
4. Fetch by ID: Get complete details for known update ID
5. Browse all: Empty query with filters only

**Example Requests**:
```json
// Natural language + filters
{
  "query": "OAuth authentication",
  "filters": {
    "tags": ["Security"],
    "dateFrom": "2025-01-01"
  },
  "limit": 10
}

// Filter-only (no keyword search)
{
  "filters": {
    "tags": ["Retirements"],
    "productCategories": ["Compute"],
    "availabilityRing": "Retirement",
    "dateFrom": "2026-01-01",
    "dateTo": "2026-03-31"
  }
}

// Keyword-only (no filters)
{
  "query": "machine learning preview",
  "limit": 20
}

// Fetch specific update by ID
{
  "id": "AZ-123e4567-e89b-12d3-a456-426614174000"
}
```

**Response Structure**:
```json
{
  "results": [/* array of updates */],
  "total": 245,
  "limit": 50,
  "offset": 0,
  "hasMore": true
}
```

Each update includes: `id`, `title`, `description` (markdown), `status`, `tags`, `productCategories`, `products`, `availabilities`, `created`, `modified`, and `relevance` (for keyword searches).

---

### 2. Resource: azure-updates://guide (azure-updates-guide-resource.json)

**Purpose**: MCP Resource providing available filter values and metadata to help LLMs construct valid search queries. This is automatically included in context by MCP-aware clients.

**Resource URI**: `azure-updates://guide`

**Key Features**:
- Lists all available tags, product categories, products, statuses, availability rings
- Provides data freshness information (lastSyncTimestamp, dataFreshnessHours)
- Total update count in database
- No parameters required (static resource)

**Content Example**:
```json
{
  "tags": ["Retirements", "Security", "Features", "Developer"],
  "productCategories": ["Compute", "AI + Machine Learning", "Security"],
  "products": ["Azure Virtual Machines", "Azure SQL Database"],
  "statuses": ["Active", "Retired"],
  "availabilityRings": ["General Availability", "Preview", "Retirement"],
  "totalUpdates": 9300,
  "lastSyncTimestamp": "2025-12-16T02:00:00.0000000Z",
  "dataFreshnessHours": 8.5
}
```

**Use Case**: LLMs automatically access this resource to understand available vocabulary when constructing search queries. No explicit tool call needed - MCP clients include resources in context.

---

## Why Single Tool + Resource?

**Previous Design** (5 separate tools):
- ❌ `search`: keyword + filters
- ❌ `getMetadata`: discover filter values
- ❌ `getUpdate`: fetch by ID
- ❌ `health`: server diagnostics
- ❌ `triggerSync`: manual sync

**New Design** (1 tool + 1 resource):
- ✅ `search_azure_updates`: all search/filter/get-by-ID functionality
- ✅ `azure-updates://guide`: metadata as MCP resource

**Benefits**:
1. **Simpler Mental Model**: LLMs remember 1 tool instead of 5
2. **Fewer Round Trips**: Get ID from search, fetch details - both in description field already
3. **Natural Composition**: `query` + `filters` + `id` all in one schema
4. **MCP Best Practice**: Resources are designed for metadata/guides
5. **Less Maintenance**: 1 tool handler, 1 schema to validate
6. **Automatic Context**: Resources included by MCP client, no explicit call needed

**What About health & triggerSync?**
- Removed from MVP: Users don't need to manually check health or trigger sync
- Background sync happens automatically on startup (non-blocking)
- Health metrics logged internally for developers
- Can be re-added later if monitoring becomes a requirement

---

## Schema Conventions

All tool schemas follow these conventions:

1. **JSON Schema Draft 07**: Standard schema format for validation
2. **Descriptive Fields**: All properties include detailed descriptions and examples
3. **Type Safety**: Strict typing with enums where applicable
4. **Example Payloads**: Multiple realistic examples in each schema
5. **Error Documentation**: Explicit error codes and status codes for error cases
6. **Return Types**: Full response structure documented in `returns` property

## MCP Integration Pattern

The server registers one tool and one resource with the MCP SDK:

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import searchToolSchema from './contracts/search-azure-updates-tool.json';

// Tool registration
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'search_azure_updates',
      description: searchToolSchema.description,
      inputSchema: searchToolSchema
    }
  ]
}));

// Tool handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  if (name === 'search_azure_updates') {
    // Handle ID-based fetch
    if (args.id) {
      return await searchService.getById(args.id);
    }
    
    // Handle search + filters
    return await searchService.search({
      query: args.query,
      filters: args.filters,
      limit: args.limit ?? 50,
      offset: args.offset ?? 0
    });
  }
  
  throw new Error(`Unknown tool: ${name}`);
});

// Resource registration
server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    {
      uri: 'azure-updates://guide',
      name: 'Azure Updates Search Guide',
      mimeType: 'application/json',
      description: 'Available filter values and usage guide'
    }
  ]
}));

// Resource handler
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;
  
  if (uri === 'azure-updates://guide') {
    const metadata = await metadataService.getMetadata();
    return {
      contents: [{
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(metadata, null, 2)
      }]
    };
  }
  
  throw new Error(`Unknown resource: ${uri}`);
});
```

## Validation Strategy

1. **Schema Validation**: MCP SDK validates inputs against JSON schemas automatically
2. **Business Logic Validation**: Additional validation in service layer (e.g., date range checks)
3. **Error Handling**: Standardized error responses with codes and messages

## Testing Strategy

Test cases for the tool and resource:

```typescript
// tests/integration/mcp-tools.test.ts
describe('search_azure_updates tool', () => {
  it('should validate input against schema', async () => {
    const invalidInput = { limit: -1 }; // violates minimum
    await expect(callTool('search_azure_updates', invalidInput)).rejects.toThrow();
  });

  it('should handle keyword search', async () => {
    const result = await callTool('search_azure_updates', { 
      query: 'OAuth', 
      limit: 10 
    });
    expect(result.results).toBeDefined();
    expect(result.total).toBeGreaterThan(0);
  });

  it('should handle filter-only queries', async () => {
    const result = await callTool('search_azure_updates', { 
      filters: { tags: ['Retirements'] },
      limit: 5
    });
    expect(result.results.every(r => r.tags.includes('Retirements'))).toBe(true);
  });

  it('should fetch by ID', async () => {
    const result = await callTool('search_azure_updates', { 
      id: 'test-id-123' 
    });
    expect(result.results).toHaveLength(1);
    expect(result.results[0].id).toBe('test-id-123');
  });
});

describe('azure-updates://guide resource', () => {
  it('should return metadata', async () => {
    const content = await readResource('azure-updates://guide');
    const metadata = JSON.parse(content);
    
    expect(metadata.tags).toBeInstanceOf(Array);
    expect(metadata.productCategories).toBeInstanceOf(Array);
    expect(metadata.totalUpdates).toBeGreaterThan(0);
    expect(metadata.lastSyncTimestamp).toBeDefined();
  });
});
```

## Future Extensions

Potential enhancements (deferred from MVP):

### Additional Parameters for search_azure_updates:
- **semantic**: Boolean to enable semantic/vector search using embeddings (requires embedding model)
- **sortBy**: Custom sorting (relevance, date, title) beyond default behavior
- **facets**: Return facet counts for filters (e.g., "Show me 5 Retirement tags, 10 Compute categories")

### Additional Resources:
- **azure-updates://changelog**: Resource showing recent sync history and changes
- **azure-updates://stats**: Aggregate statistics and trends (update frequency by category, etc.)

### Additional Tools (if monitoring becomes requirement):
- **check_azure_updates_health**: Server health diagnostics (sync status, performance metrics)
- **refresh_azure_updates**: Manual sync trigger for critical updates

### Integration Features:
- **Subscribe to notifications**: Requires remote HTTP/WebSocket (out of scope for stdio MCP)
- **Export capabilities**: PDF/CSV export of search results

## References

- [MCP Specification](https://spec.modelcontextprotocol.io/)
- [JSON Schema Documentation](https://json-schema.org/)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
