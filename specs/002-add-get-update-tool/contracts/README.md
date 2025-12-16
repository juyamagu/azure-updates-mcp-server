# Tool Contracts

This directory contains JSON schema definitions for the MCP tools in this feature.

## Files

### get-azure-update.json
Tool contract for the new `get_azure_update` tool. Retrieves full update details by ID.

**Key Features**:
- Single required parameter: `id`
- Returns complete `AzureUpdate` object with full description
- ~4-10KB average response size

### search-azure-updates.json
Updated tool contract for the modified `search_azure_updates` tool. Searches and filters updates, returning lightweight results.

**Key Changes from Original**:
- **Removed**: `id` parameter (use `get_azure_update` instead)
- **Removed**: `description` and `descriptionMarkdown` from output schema
- **Added**: Note about using `get_azure_update` for full details
- ~500-700 bytes average per result (80%+ reduction)

## Usage

These JSON schemas serve as:
1. **Documentation**: Clear contract definitions for tool interfaces
2. **Validation**: Can be used to validate tool inputs/outputs in tests
3. **Code Generation**: Reference for implementing tool handlers

## Relationship

```
search_azure_updates → Returns: id, title, metadata (lightweight)
                       ↓
get_azure_update(id) → Returns: Full update with description
```

The two-tool pattern enables efficient discovery (search) followed by selective detail retrieval (get).
