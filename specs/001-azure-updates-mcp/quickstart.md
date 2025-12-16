# Azure Updates MCP Server - Quick Start Guide

**Version**: 1.0.0  
**Last Updated**: 2025-12-16

## Overview

The Azure Updates MCP Server provides a Model Context Protocol (MCP) interface for searching and filtering Azure service updates. It replicates Azure Updates API data locally in SQLite for fast querying, supports natural language search, and automatically keeps data fresh through scheduled synchronization.

## Prerequisites

- **Node.js**: 18.x or higher
- **npm**: 9.x or higher
- **Operating System**: Linux, macOS, or Windows
- **Network**: Internet access for syncing with Azure Updates API
- **Storage**: ~100MB free disk space for database

## Installation

### Option 1: Run with npx (Recommended)

Run directly without installation:

```bash
npx azure-updates-mcp-server
```

The server will:
1. Load pre-populated database snapshot (included in package, ~70MB)
2. Start MCP server with tools immediately available (<1 second)
3. Background sync runs automatically if data is stale (>24h, configurable)
4. Snapshot is refreshed with each package release for reasonable data freshness

### Option 2: Global Installation

Install globally for persistent use:

```bash
npm install -g azure-updates-mcp-server

# Run the server
azure-updates-mcp-server
```

### Option 3: Local Development

Clone and build from source:

```bash
git clone https://github.com/your-org/azure-updates-mcp-server.git
cd azure-updates-mcp-server
npm install
npm run build
npm start
```

## Configuration

Configuration is done via environment variables. Create a `.env` file in the server directory or set environment variables:

```bash
# Database location (default: ./data/azure-updates.db)
DATABASE_PATH=/path/to/azure-updates.db

# Data staleness threshold in hours (default: 24)
# If data is older than this, sync automatically on startup
SYNC_STALENESS_HOURS=24

# Enable/disable startup sync check (default: true)
SYNC_ON_STARTUP=true

# Timeout for startup sync in milliseconds (default: 30000)
SYNC_TIMEOUT_MS=30000

# Log level: debug, info, warn, error (default: info)
LOG_LEVEL=info

# Log format: json, pretty (default: json for production, pretty for dev)
LOG_FORMAT=json
```

### Sync Behavior

**Important**: MCP servers using stdio transport only run while your LLM app is active. Background scheduling (cron) is not possible.

**Automatic Sync Strategy**:

The server starts **immediately** with cached data and syncs in the background:

```bash
# Check data every 24 hours (default)
SYNC_STALENESS_HOURS=24

# More aggressive: sync if data is 6 hours old
SYNC_STALENESS_HOURS=6

# Conservative: only sync if data is 7 days old
SYNC_STALENESS_HOURS=168

# Manual sync only (disable startup checks)
SYNC_ON_STARTUP=false
```

**How it works**:
1. Server starts with pre-populated snapshot (<1 second)
2. Tools are immediately available with snapshot data
3. If data is stale (>24h by default), background sync begins (non-blocking)
4. Queries use snapshot/cached data during sync (slightly stale but functional)
5. After sync completes, fresh data for subsequent queries
6. Snapshot refreshed with each package release for reasonable freshness

## MCP Client Configuration

### Claude Desktop

Add to your Claude Desktop configuration (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "azure-updates": {
      "command": "npx",
      "args": ["-y", "azure-updates-mcp-server"],
      "env": {
        "DATABASE_PATH": "/Users/yourname/.azure-updates/data.db",
        "SYNC_STALENESS_HOURS": "24"
      }
    }
  }
}
```

### Continue.dev

Add to your Continue configuration (`.continue/config.json`):

```json
{
  "mcpServers": [
    {
      "name": "azure-updates",
      "command": "npx",
      "args": ["-y", "azure-updates-mcp-server"],
      "env": {
        "DATABASE_PATH": "${workspaceFolder}/.azure-updates/data.db"
      }
    }
  ]
}
```

### Cline (VSCode Extension)

Add to Cline settings in VSCode:

```json
{
  "cline.mcpServers": {
    "azure-updates": {
      "command": "npx",
      "args": ["-y", "azure-updates-mcp-server"],
      "env": {
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

## Usage Examples

### 1. Natural Language Search

Ask your AI assistant natural language questions:

**Example 1**: "Show me all security-related retirements happening in 2026"

The MCP server translates this to:
```json
{
  "tags": ["Security", "Retirements"],
  "dateFrom": "2026-01-01",
  "dateTo": "2026-12-31"
}
```

**Example 2**: "What Azure ML services are in preview?"

Translates to:
```json
{
  "query": "Azure Machine Learning",
  "availabilityRing": "Preview"
}
```

**Example 3**: "Find updates about OAuth authentication"

Translates to:
```json
{
  "query": "OAuth authentication",
  "limit": 50
}
```

### 2. Direct MCP Tool Calls

If your AI assistant supports direct tool calls:

#### Search Tool

```json
{
  "tool": "search",
  "arguments": {
    "query": "retirement",
    "tags": ["Retirements"],
    "productCategories": ["Compute"],
    "dateFrom": "2026-01-01",
    "dateTo": "2026-03-31",
    "limit": 20
  }
}
```

#### Get Metadata Tool

```json
{
  "tool": "getMetadata",
  "arguments": {}
}
```

Returns all available tags, categories, products, and availability rings.

#### Get Update Details Tool

```json
{
  "tool": "getUpdate",
  "arguments": {
    "id": "AZ-123e4567-e89b-12d3-a456-426614174000"
  }
}
```

#### Health Check Tool

```json
{
  "tool": "health",
  "arguments": {}
}
```

Returns server health, sync status, and performance metrics.

#### Trigger Sync Tool

```json
{
  "tool": "triggerSync",
  "arguments": {
    "force": false
  }
}
```

Manually triggers data synchronization.

### 3. Common Query Patterns

**Find all retirements in specific date range**:
```json
{
  "tags": ["Retirements"],
  "dateFrom": "2026-01-01",
  "dateTo": "2026-06-30"
}
```

**Search for specific technology across all updates**:
```json
{
  "query": "Kubernetes",
  "limit": 30
}
```

**Filter by multiple categories**:
```json
{
  "productCategories": ["Compute", "Networking"],
  "status": "Active"
}
```

**Get recent updates (last 7 days)**:
```json
{
  "dateFrom": "2025-12-09"
}
```

## Monitoring and Maintenance

### Check Server Health

Use the `health` tool to verify:
- Data freshness (last sync timestamp)
- Database size and record count
- Query performance metrics
- Sync status and errors

### Manual Sync

**Note**: The MCP server only runs while your LLM app is active. Data sync happens:
1. **Automatically in background on startup** if data is older than `SYNC_STALENESS_HOURS` (default: 24 hours) - non-blocking, tools available immediately
2. **Manually via tool** when you explicitly request it

Check sync status with the health tool:
```bash
# In your AI assistant
"Check Azure updates server health and sync status"
```

Trigger a manual sync if you need the latest data:

```bash
# In your AI assistant
"Trigger a sync of Azure updates data"
```

Or force a full resync if corruption is suspected:

```bash
# In your AI assistant
"Force a full resync of Azure updates data"
```

**Tip**: If you use your LLM app daily, automatic startup sync (24h threshold) keeps data fresh without manual intervention.

### View Logs

Logs are written to stdout in JSON format by default. To view logs:

```bash
# If running directly
azure-updates-mcp-server 2>&1 | jq .

# With pretty logging for development
LOG_FORMAT=pretty azure-updates-mcp-server
```

### Database Location

The SQLite database is stored at:
- Default: `./data/azure-updates.db` (relative to server directory)
- Custom: Set `DATABASE_PATH` environment variable

To reset the database:

```bash
rm /path/to/azure-updates.db
# Server will recreate and re-sync on next start
```

## Performance Characteristics

### Initial Sync
- **Duration**: 1-2 minutes for ~9,300 records
- **Network**: ~50MB download from Azure Updates API
- **Disk**: ~70MB database size after initial sync

### Query Performance
- **Simple filters**: <50ms (status, tag, category filters)
- **Keyword search**: <200ms (title and description search with FTS5)
- **Complex queries**: <500ms (keyword search + multiple filters)
- **Pagination**: Negligible overhead (<10ms per page)

### Sync Performance
- **Differential sync**: 5-15 seconds for typical daily updates (10-50 new/modified records)
- **Full sync**: 1-2 minutes (recovery scenario only)
- **Resource usage**: <100MB memory during sync

## Troubleshooting

### Server Won't Start

**Symptom**: Server exits immediately after starting

**Solutions**:
1. Check Node.js version: `node --version` (must be 18+)
2. Check permissions on database directory
3. Verify no other process is using the database file
4. Check logs for error messages

### Sync Failures

**Symptom**: Health check shows `lastSyncStatus: "failed"`

**Solutions**:
1. Check network connectivity to `https://www.microsoft.com`
2. Verify no firewall blocking outbound HTTPS
3. Check logs for specific API error messages
4. Try manual sync: "Trigger a sync of Azure updates"
5. If persistent, force full resync: "Force a full resync"

### Slow Query Performance

**Symptom**: Queries take >1 second

**Solutions**:
1. Check database size: `health` tool shows `databaseSizeMB`
2. If >500MB, consider archiving old updates (future feature)
3. Verify SQLite indices exist: Check logs for migration warnings
4. Increase SQLite cache size in configuration (future feature)

### Stale Data

**Symptom**: `dataFreshnessHours` > 48 hours

**Solutions**:
1. Check if sync is disabled: `SYNC_DISABLED=true`
2. Verify cron schedule: `SYNC_SCHEDULE` environment variable
3. Check for sync failures in health status
4. Manually trigger sync to catch up

### Memory Issues

**Symptom**: Server crashes with out-of-memory errors

**Solutions**:
1. Verify Node.js heap size is sufficient (default 512MB usually enough)
2. Check for memory leaks in logs
3. Restart server to clear memory
4. Reduce batch size in configuration (future feature)

## Upgrading

### From npm

```bash
npm update -g azure-updates-mcp-server
```

### With npx

npx automatically uses the latest version. To force update:

```bash
npx clear-npx-cache
npx azure-updates-mcp-server
```

### Database Migrations

Schema migrations are handled automatically. On upgrade:
1. Server detects schema version
2. Runs migration scripts if needed
3. Preserves existing data
4. Logs migration status

**Note**: Always back up your database before major version upgrades.

## Security Considerations

### Local-Only Access

MVP version uses stdio transport (local-only):
- No network ports exposed
- No authentication required
- MCP client must run on same machine

### Data Privacy

- All data stored locally in SQLite
- No data sent to external services except Azure Updates API
- No telemetry or analytics collection

### API Rate Limiting

- Conservative 1 request/second limit to Azure Updates API
- Exponential backoff on failures prevents abuse
- Differential sync minimizes API calls

## Advanced Configuration

### Custom Database Schema

Future versions will support schema customizations. For now, schema is fixed.

### Performance Tuning

SQLite pragma settings (future configuration options):

```bash
# Future: Environment variables for tuning
SQLITE_CACHE_SIZE_MB=64
SQLITE_PAGE_SIZE=4096
SQLITE_JOURNAL_MODE=WAL
```

### Multi-Tenancy

MVP does not support multi-tenancy. Each server instance manages one database.

## Getting Help

### Documentation
- Full specification: [spec.md](spec.md)
- Data model details: [data-model.md](data-model.md)
- MCP tool contracts: [contracts/README.md](contracts/README.md)
- Implementation research: [research.md](research.md)

### Issues and Support

Report issues at: https://github.com/your-org/azure-updates-mcp-server/issues

Include:
- Server version (`health` tool shows version)
- Environment (OS, Node.js version)
- Logs (set `LOG_LEVEL=debug`)
- Steps to reproduce

### Contributing

Contributions welcome! See CONTRIBUTING.md for guidelines.

## What's Next?

This MVP focuses on core functionality. Future enhancements planned:

### Phase 2 (Next Release)
- Semantic search with embeddings
- Remote HTTP access with authentication
- Advanced filtering (regex, fuzzy search)
- Export to PDF/CSV

### Phase 3 (Future)
- Real-time push notifications
- Historical versioning of updates
- Custom alerting rules
- Multi-language support
- GraphQL API

See [spec.md](spec.md) "Out of Scope" section for complete roadmap.

---

**Quick Reference**

| Task | Command |
|------|---------|
| Run server | `npx azure-updates-mcp-server` |
| Check health | Ask AI: "Check Azure updates server health" |
| Manual sync | Ask AI: "Trigger Azure updates sync" |
| Search retirements | Ask AI: "Show Azure retirements in Q1 2026" |
| View metadata | Ask AI: "What Azure update categories are available?" |
| Reset database | `rm $DATABASE_PATH` (server recreates on restart) |

**Configuration Summary**

```bash
# Minimal production config
DATABASE_PATH=/var/lib/azure-updates/data.db
SYNC_STALENESS_HOURS=24
LOG_LEVEL=info
LOG_FORMAT=json

# Development config (manual sync only)
DATABASE_PATH=./data/dev.db
SYNC_ON_STARTUP=false
LOG_LEVEL=debug
LOG_FORMAT=pretty
```
