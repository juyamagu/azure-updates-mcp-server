# Research Report: Azure Updates MCP Server

**Date**: 2025-12-16  
**Phase**: 0 - Technical Research  
**Purpose**: Resolve technical unknowns and establish best practices for implementation

## Research Areas

### 1. MCP SDK for TypeScript

**Decision**: Use `@modelcontextprotocol/sdk` npm package (official MCP SDK)

**Rationale**:
- Official SDK maintained by Anthropic with TypeScript-first design
- Provides server abstractions for stdio transport (required for local MCP)
- Built-in tool registration with JSON schema validation
- Strong typing support aligns with constitution's type safety requirements
- Active development and community support

**Implementation Approach**:
```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new Server({
  name: 'azure-updates-mcp-server',
  version: '1.0.0'
}, {
  capabilities: {
    tools: {}
  }
});

// Tool registration with JSON schema
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [/* tool definitions */]
}));

// Start stdio transport
const transport = new StdioServerTransport();
await server.connect(transport);
```

**Alternatives Considered**:
- Custom MCP protocol implementation: Rejected due to maintenance burden and higher complexity
- Alternative MCP frameworks: None mature enough for production use

**References**:
- [MCP SDK Documentation](https://github.com/modelcontextprotocol/typescript-sdk)
- [MCP Specification](https://spec.modelcontextprotocol.io/)

---

### 2. SQLite with FTS5 Full-Text Search

**Decision**: Use `better-sqlite3` with FTS5 extension enabled

**Rationale**:
- `better-sqlite3` is fastest Node.js SQLite binding (synchronous API, native C++ bindings)
- FTS5 (Full-Text Search 5) built into modern SQLite (3.9.0+), provides:
  - Case-insensitive keyword search
  - Relevance ranking with BM25 algorithm
  - Prefix matching for autocomplete
  - Tokenization with porter stemmer
- Zero infrastructure costs (embedded database)
- ACID guarantees for sync reliability
- Excellent performance for <100k record scale (spec requirement)

**Implementation Approach**:
```typescript
import Database from 'better-sqlite3';

const db = new Database('azure-updates.db');

// Create FTS5 virtual table
db.exec(`
  CREATE VIRTUAL TABLE IF NOT EXISTS updates_fts USING fts5(
    id UNINDEXED,
    title,
    description,
    content='updates',
    content_rowid='id'
  );
`);

// Search query with BM25 ranking
const searchStmt = db.prepare(`
  SELECT updates.*, updates_fts.rank
  FROM updates_fts
  JOIN updates ON updates.id = updates_fts.id
  WHERE updates_fts MATCH ?
  ORDER BY rank
  LIMIT ?
`);
```

**Performance Characteristics**:
- Insert/Update: ~50k records/sec on modern hardware
- FTS5 queries: <10ms for typical keyword searches on 10k records
- Database size: ~50-100MB for 10k records with full descriptions

**Alternatives Considered**:
- PostgreSQL with pg_trgm: Rejected due to infrastructure overhead (requires server)
- Elasticsearch: Rejected due to complexity and operational costs
- In-memory JS search: Rejected due to memory constraints and lack of persistence

**References**:
- [SQLite FTS5 Documentation](https://www.sqlite.org/fts5.html)
- [better-sqlite3 GitHub](https://github.com/WiseLibs/better-sqlite3)

---

### 3. HTML-to-Markdown Conversion

**Decision**: Use `turndown` library with custom rules for data URLs

**Rationale**:
- Most popular HTML-to-Markdown converter in Node.js ecosystem (7.6k+ GitHub stars)
- Extensible with custom rules for handling Azure-specific HTML patterns
- Preserves links, formatting, lists, code blocks
- Handles malformed HTML gracefully (requirement from spec edge cases)
- Minimal dependencies, actively maintained

**Implementation Approach**:
```typescript
import TurndownService from 'turndown';

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  emDelimiter: '_',
  bulletListMarker: '-'
});

// Custom rule for preserving data URLs in images
turndown.addRule('preserveDataUrls', {
  filter: 'img',
  replacement: (content, node) => {
    const alt = node.getAttribute('alt') || '';
    const src = node.getAttribute('src') || '';
    return `![${alt}](${src})`;
  }
});

const markdown = turndown.turndown(htmlContent);
```

**Edge Cases Handled**:
- Malformed HTML: Turndown's error handling returns plain text fallback
- Data URLs: Preserved as-is in markdown (spec requires full fidelity)
- Nested tables: Converted to simpler markdown tables
- Embedded scripts/styles: Stripped (not relevant for LLM consumption)

**Alternatives Considered**:
- `remark-html`: Rejected due to complex plugin ecosystem
- `html-to-md`: Rejected due to lack of customization options
- Manual parsing with cheerio: Rejected due to maintenance burden

**References**:
- [Turndown GitHub](https://github.com/mixmark-io/turndown)
- [Turndown API Documentation](https://github.com/mixmark-io/turndown#api)

---

### 4. Mock Azure Updates API for Development

**Decision**: Implement lightweight mock API server using Express for development and testing

**Rationale**:
- **Avoid API load during development**: Prevents unnecessary traffic to production Azure Updates API during local development and testing
- **Fast feedback loop**: <10ms response time vs 500-1000ms from production API
- **Offline development**: No internet connectivity required for core feature development
- **Test reproducibility**: Deterministic responses enable reliable integration tests
- **No rate limiting concerns**: Unlimited requests for rapid iteration

**Implementation Approach**:
```typescript
// tests/mock-api/server.ts
import express from 'express';
import { readFileSync } from 'fs';
import { join } from 'path';

const app = express();
const mockData = JSON.parse(
  readFileSync(join(__dirname, '../fixtures/azure-updates.json'), 'utf-8')
);

// Mock full dataset endpoint
app.get('/azure', (req, res) => {
  const modifiedSince = req.query.$filter?.match(/modified gt '([^']+)'/);
  let results = mockData.value;
  
  if (modifiedSince) {
    const timestamp = new Date(modifiedSince[1]);
    results = results.filter(u => new Date(u.modified) > timestamp);
  }
  
  res.json({ value: results });
});

if (require.main === module) {
  app.listen(3001, () => console.log('Mock API on http://localhost:3001'));
}

export default app;
```

**Azure API Client Configuration**:
```typescript
// src/services/azure-api.service.ts
export class AzureApiClient {
  private baseUrl: string;
  
  constructor() {
    // Development: use mock API
    // Production: use real Azure API
    this.baseUrl = process.env.AZURE_UPDATES_API_ENDPOINT || 
      'https://www.microsoft.com/releasecommunications/api/v2';
  }
  
  async fetchUpdates(modifiedSince?: string): Promise<AzureUpdate[]> {
    const url = `${this.baseUrl}/azure`;
    // ... rest of implementation
  }
}
```

**Development Environment Setup**:
```bash
# .env.development
AZURE_UPDATES_API_ENDPOINT=http://localhost:3001
SYNC_ON_STARTUP=false  # Disable auto-sync in dev
LOG_LEVEL=debug
NODE_ENV=development
```

**npm Scripts**:
```json
{
  "scripts": {
    "dev": "npm run mock-api & npm run start:dev",
    "mock-api": "tsx tests/mock-api/server.ts",
    "start:dev": "NODE_ENV=development tsx src/index.ts",
    "test": "NODE_ENV=test vitest"
  }
}
```

**Test Fixtures Strategy**:
- `tests/fixtures/azure-updates.json`: Small dataset (100-200 records) representing diverse update types
- `tests/fixtures/azure-updates-full.json`: Complete snapshot (~9,300 records) for performance testing
- Fixtures generated from one-time production API fetch, committed to git
- Update fixtures quarterly or when API schema changes

**Benefits**:
- ✅ Zero production API load during development
- ✅ Instant test execution (<100ms vs 45-60s with real API)
- ✅ Predictable test data for CI/CD
- ✅ Can simulate API failures, rate limits, schema changes
- ✅ Works offline (airplane coding, poor connectivity)

**Production vs Development**:
- **Production**: `AZURE_UPDATES_API_ENDPOINT` unset → uses real Azure API
- **Development**: `AZURE_UPDATES_API_ENDPOINT=http://localhost:3001` → uses mock
- **CI/CD**: Mock API runs in background during tests

**Alternatives Considered**:
- `nock` HTTP mocking: Rejected due to complexity with pagination and OData filters
- MSW (Mock Service Worker): Rejected as overkill for simple REST API
- Direct fixture imports: Rejected because doesn't test HTTP client logic

**References**:
- [Express.js Documentation](https://expressjs.com/)
- Pattern inspired by GitHub's API mocking approach

---

### 5. Synchronization Strategy for stdio MCP Servers

**Decision**: Startup-based sync with intelligent staleness detection + manual trigger tool

**Rationale**:
- **MCP stdio lifecycle constraint**: Server process only runs while LLM app is active (not a persistent daemon)
- **No background scheduling possible**: Cannot use cron/timers as process terminates when LLM app closes
- **Startup sync**: Check data freshness on server start, sync if stale (configurable threshold)
- **Manual control**: Provide `triggerSync` tool for user-initiated updates
- **Efficient differential sync**: Minimize startup delay with checkpoint-based incremental updates

**Implementation Approach**:
```typescript
// Server startup sequence with pre-populated snapshot
async function startServer() {
  const server = new Server({ name: 'azure-updates-mcp-server', version: '1.0.0' });
  
  // Initialize database from pre-populated snapshot (included in package)
  await initializeDatabase();
  
  // Register MCP tools
  registerTools(server);
  
  // Start MCP server
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info('MCP server ready with snapshot data, tools available');
  
  // Always run background sync if data is stale (non-blocking)
  const stalenessThresholdHours = parseInt(process.env.SYNC_STALENESS_HOURS || '24', 10);
  checkAndSyncInBackground(stalenessThresholdHours).catch(error => {
    logger.warn('Background sync failed, continuing with cached data', { error });
  });
}

async function checkAndSyncInBackground(thresholdHours: number): Promise<void> {
  const checkpoint = await getLastSyncCheckpoint();
  const hoursSinceSync = (Date.now() - new Date(checkpoint.last_sync).getTime()) / (1000 * 60 * 60);
  
  if (hoursSinceSync > thresholdHours) {
    logger.info(`Data is stale (${hoursSinceSync.toFixed(1)}h old), starting background sync`);
    await syncService.performDifferentialSync();
    logger.info('Background sync completed');
  } else {
    logger.info(`Data is fresh (${hoursSinceSync.toFixed(1)}h old), skipping sync`);
  }
}
```

**Configuration Options**:
- `SYNC_STALENESS_HOURS`: Hours before data considered stale (default: 24)
- `SYNC_ON_STARTUP`: Boolean to enable/disable startup sync check (default: true)
- `SYNC_TIMEOUT_MS`: Max time to wait for startup sync (default: 30000ms)

**User Workflow**:
1. **Every startup**: LLM app starts → MCP server loads from snapshot (<1 sec) → tools immediately available
2. Background sync starts if data is stale (>24h by default, configurable)
3. Background sync doesn't block queries (uses snapshot/cached data during sync)
4. After sync completes: fresh data for subsequent queries
5. User can manually trigger sync anytime via `triggerSync` tool
6. LLM app closes → MCP server terminates → data persists in SQLite

**Snapshot Strategy**:
- Pre-populated SQLite database included in npm package (~70MB)
- Snapshot refreshed with each package release (weekly/monthly)
- Users get reasonably fresh data on install without any wait
- Build script generates snapshot by fetching full dataset during CI/CD

**Alternatives Considered**:
- `node-cron` scheduling: **Rejected** - requires persistent process, incompatible with stdio lifecycle
- OS-level cron + separate daemon: **Rejected** - adds deployment complexity, defeats MCP's simplicity
- Always sync on startup: **Rejected** - unnecessary delay for fresh data
- Never auto-sync: **Rejected** - users may not realize data is stale

**References**:
- [MCP Lifecycle Documentation](https://modelcontextprotocol.io/specification/2025-03-26/basic/lifecycle)
- [MCP stdio Transport Patterns](https://dev.to/elsayed85/building-model-context-protocol-mcp-servers-with-stdio-a-complete-guide-513k)

---

### 5. Azure Updates API Integration Best Practices

**Decision**: Implement differential sync with exponential backoff retry and timestamp-based checkpointing

**Rationale**:
- API supports `$filter` with `modified gt [timestamp]` for differential updates
- Exponential backoff prevents API abuse during transient failures (constitution cost efficiency)
- Timestamp precision (7 decimals) ensures no missed updates
- OData `$top` parameter enables pagination (500 records per request recommended)

**Implementation Pattern**:
```typescript
class AzureApiService {
  private async fetchWithRetry<T>(url: string, attempt = 1): Promise<T> {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      if (attempt >= 3) throw error;
      const delay = Math.pow(2, attempt) * 1000; // 2s, 4s
      await sleep(delay);
      return this.fetchWithRetry(url, attempt + 1);
    }
  }

  async fetchUpdatesSince(timestamp: string): Promise<AzureUpdate[]> {
    const filter = encodeURIComponent(`modified gt ${timestamp}`);
    const url = `${API_BASE}/azure?$filter=${filter}&$top=500&$orderby=modified asc`;
    return this.fetchWithRetry(url);
  }
}
```

**API Rate Limiting**:
- No documented rate limits in Azure Updates API
- Implement conservative 1 request/second limit as best practice
- Use `$top=500` to minimize request count (balances memory vs. network)

**Error Handling Strategy**:
- 5xx errors: Retry with exponential backoff (transient server issues)
- 429 Too Many Requests: Exponential backoff with max 60s delay
- 4xx client errors: Log and fail fast (indicates code bug)
- Network errors: Retry with exponential backoff

**References**:
- [Azure Updates API Documentation](https://www.microsoft.com/releasecommunications/api/v2/azure)
- [OData Filter Conventions](https://www.odata.org/documentation/)

---

### 6. TypeScript Project Configuration Best Practices

**Decision**: Strict TypeScript configuration with ESLint + Prettier for code quality

**Rationale**:
- Constitution requires type safety and code quality standards
- Strict mode catches common errors at compile time
- ESLint + Prettier enforce consistent style automatically
- Pre-commit hooks prevent quality violations from entering repository

**Configuration Files**:

**tsconfig.json**:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

**Key Settings**:
- `strict: true`: Enables all strict type checking options
- `NodeNext` module resolution: Modern ESM support for Node.js 18+
- `declaration: true`: Generate .d.ts files for type checking consumers

**.eslintrc.json**:
```json
{
  "parser": "@typescript-eslint/parser",
  "plugins": ["@typescript-eslint"],
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/strict"
  ],
  "rules": {
    "complexity": ["error", 10],
    "max-lines-per-function": ["warn", 50],
    "@typescript-eslint/explicit-function-return-type": "error"
  }
}
```

**Alternatives Considered**:
- JavaScript with JSDoc: Rejected due to weaker type safety
- Relaxed TypeScript config: Rejected due to constitution requirements

---

### 7. Testing Strategy with Vitest

**Decision**: Vitest for fast unit/integration tests with SQLite in-memory testing

**Rationale**:
- Native TypeScript support without additional transpilation
- ~10x faster than Jest for TypeScript projects
- Built-in coverage reporting with v8
- Compatible with Jest API (easy migration if needed)
- Excellent watch mode for TDD workflow

**Test Structure**:
```typescript
// tests/unit/services/sync.service.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SyncService } from '../../../src/services/sync.service';

describe('SyncService', () => {
  let syncService: SyncService;
  let mockApiService: MockAzureApiService;
  let testDb: Database.Database;

  beforeEach(() => {
    testDb = new Database(':memory:');
    // Setup test schema
  });

  it('should perform differential sync using last checkpoint', async () => {
    // Given
    const lastSync = '2025-12-15T00:00:00.0000000Z';
    await testDb.prepare('INSERT INTO sync_checkpoints ...').run();

    // When
    await syncService.performDifferentialSync();

    // Then
    expect(mockApiService.fetchUpdatesSince).toHaveBeenCalledWith(lastSync);
  });
});
```

**Coverage Targets** (per constitution):
- Overall: 80%+ coverage
- Critical paths (sync, search): 95%+ coverage
- Integration tests: All MCP tools, full sync workflow

**References**:
- [Vitest Documentation](https://vitest.dev/)
- [Vitest SQLite Testing Patterns](https://vitest.dev/guide/testing-types.html)

---

## Implementation Checklist

- [x] MCP SDK selected and integration pattern defined
- [x] SQLite + FTS5 architecture validated for performance requirements
- [x] HTML-to-Markdown conversion library chosen with edge case handling
- [x] Scheduling mechanism defined with configuration options
- [x] Azure API integration best practices documented
- [x] TypeScript strict configuration defined
- [x] Testing strategy with Vitest established

## Next Steps (Phase 1)

1. Generate `data-model.md` with SQLite schema for Azure updates and FTS5 indices
2. Create `contracts/` with JSON schemas for all MCP tools
3. Document `quickstart.md` with npx installation and configuration
4. Update agent context with TypeScript, MCP SDK, and SQLite technologies

## Risk Mitigation Summary

| Risk | Mitigation Research |
|------|---------------------|
| API downtime | Local SQLite replication + exponential backoff retry |
| Search performance | FTS5 with BM25 ranking + proper indexing strategy |
| Dataset growth | SQLite scales to 100k+ records; archival strategy deferred to future |
| HTML complexity | Turndown with graceful error handling + plain text fallback |
| Type safety | TypeScript strict mode + ESLint complexity rules |
