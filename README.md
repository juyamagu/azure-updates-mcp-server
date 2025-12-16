# Azure Updates MCP Server

> **Natural language search for Azure service updates without OData syntax**

An MCP (Model Context Protocol) server that provides AI assistants with seamless access to Azure service updates, retirements, and feature announcements. Search across 9,000+ updates using natural language queries—no OData syntax required.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

## Features

🔍 **Keyword Matching** - Full-text search across titles and descriptions with BM25 relevance ranking  
🎯 **Simplified Filtering** - Filter by tags, categories, products, dates, and status—no OData knowledge needed  
⚡ **Fast Response** - Local SQLite replication ensures <500ms query response times  
🔄 **Automatic Sync** - Differential synchronization keeps data fresh (configurable interval, default 24h)  
📊 **Help Resource** - Expose all available filters and data freshness to help AI construct queries  

## Quick Start

### Installation

**Step 1: Get the tarball package**

Obtain `azure-updates-mcp-server-{version}.tgz` from your internal distribution channel.

**Step 2: Install globally**

```bash
npm install -g ./azure-updates-mcp-server-{version}.tgz
```

**Step 3: Run the MCP server**

Now, you can run the MCP server via `azure-updates-mcp-server` command. If you're using VS Code, the following configuration will launch the server:

```json
{
  "cline.mcpServers": {
    "azure-updates": {
      "command": "azure-updates-mcp-server",
      // Those environment variables are optional; configure as needed
      // "env": {
      //   "DATABASE_PATH": "${workspaceFolder}/.azure-updates/data.db",
      //   "SYNC_STALENESS_HOURS": "24",
      //   "LOG_LEVEL": "info"
      // }
    }
  }
}
```

**Note**: Or, simply run with `npx` without global installation:

```json
{
  "cline.mcpServers": {
    "azure-updates": {
      "command": "npx",
      "args": ["~/azure-updates-mcp-server-{version}.tgz"],
    }
  }
}
```

## Configuration

Configuration is done via environment variables. Create a `.env` file or set environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_PATH` | `~/.azure-updates-mcp/azure-updates.db` | Path to SQLite database |
| `SYNC_STALENESS_HOURS` | `24` | Sync if data older than this many hours |
| `SYNC_ON_STARTUP` | `true` | Enable/disable startup sync check |
| `DATA_RETENTION_START_DATE` | `2022-01-01` | Retain updates from this date onwards (ISO 8601: YYYY-MM-DD) |
| `LOG_LEVEL` | `info` | Log level: debug, info, warn, error |
| `LOG_FORMAT` | `json` | Log format: json or pretty |

See [.env.example](./.env.example) for all configuration options.

## Available Tools

### `search_azure_updates`

Search, filter, and retrieve Azure updates using natural language queries or structured filters.

**Key Parameters:**
- `query`: Natural language or keyword search
- `id`: Fetch specific update by ID
- `filters`: Tags, categories, products, dates, status, availability ring
- `limit`: Max results (1-100, default: 50)

**Example:**
```json
{
  "query": "OAuth authentication security",
  "filters": {
    "tags": ["Security"],
    "dateFrom": "2025-01-01"
  },
  "limit": 10
}
```

For more examples, see the `azure-updates://guide` resource (distributed through MCP protocol).

## Architecture

```mermaid
sequenceDiagram
    participant LLM as AI Assistant
    participant MCP as MCP Server
    participant Search as Search Service
    participant DB as SQLite DB
    participant Sync as Sync Service
    participant API as Azure API

    Note over MCP,DB: Startup
    MCP->>DB: Initialize database
    MCP->>Sync: Check data staleness
    alt Data is stale (>24h)
        Sync->>API: Fetch updates (differential)
        API-->>Sync: Return new/modified updates
        Sync->>DB: Store updates
    end

    Note over LLM,DB: Query Execution
    LLM->>MCP: search_azure_updates<br/>(natural language query)
    MCP->>Search: Execute search
    Search->>DB: FTS5 query + filters
    DB-->>Search: Matching results
    Search-->>MCP: Ranked results
    MCP-->>LLM: JSON response (<500ms)

    Note over LLM,MCP: Metadata Access
    LLM->>MCP: Get azure-updates://guide
    MCP-->>LLM: Available filters & metadata
```

Local SQLite replication with FTS5 full-text search provides fast queries (<500ms). Differential sync keeps data fresh from Azure Updates API.

**Technology Stack:**
- **MCP SDK**: `@modelcontextprotocol/sdk`
- **Database**: `better-sqlite3` with FTS5
- **Testing**: Vitest with TypeScript strict mode
- **Runtime**: Node.js 18+

## Development

See [Development Guide](./docs/development.md) for setup, testing, and contributing instructions.

## Troubleshooting

See [Troubleshooting Guide](./docs/troubleshooting.md) for common issues and solutions.

## Documentation

- [Development Guide](./docs/development.md) - Contributing and testing
- [Troubleshooting](./docs/troubleshooting.md) - Common issues
- [Azure Updates API Manual](./docs/azure-updates-api-manual.md) - API reference

## License

MIT License - see [LICENSE](./LICENSE) file for details.
