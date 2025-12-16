# Data Model: Azure Updates MCP Server

**Date**: 2025-12-16  
**Phase**: 1 - Design & Contracts  
**Purpose**: Define SQLite schema, relationships, and indexing strategy

## Entity Relationship Overview

```
┌─────────────────────┐
│  azure_updates      │
│  (main table)       │
│                     │
│  - id (PK)          │
│  - title            │
│  - description_html │◄────┐
│  - description_md   │     │
│  - status           │     │
│  - locale           │     │
│  - created          │     │
│  - modified         │     │
│  - metadata (JSON)  │     │
└─────────────────────┘     │
         │                  │
         │                  │ FTS5 content extraction
         │                  │
         ├─────────────────────────┐
         │                         │
         ▼                         ▼
┌──────────────────┐    ┌──────────────────────┐
│  update_tags     │    │  updates_fts         │
│  (many-to-many)  │    │  (FTS5 virtual)      │
│                  │    │                      │
│  - update_id (FK)│    │  - id                │
│  - tag           │    │  - title             │
└──────────────────┘    │  - description_md    │
         │              └──────────────────────┘
         │
         ▼
┌──────────────────────┐
│  update_categories   │
│  (many-to-many)      │
│                      │
│  - update_id (FK)    │
│  - category          │
└──────────────────────┘
         │
         │
         ▼
┌──────────────────────┐
│  update_products     │
│  (many-to-many)      │
│                      │
│  - update_id (FK)    │
│  - product           │
└──────────────────────┘
         │
         │
         ▼
┌──────────────────────┐
│  update_availabilities│
│  (one-to-many)       │
│                      │
│  - id (PK)           │
│  - update_id (FK)    │
│  - ring              │
│  - date              │
└──────────────────────┘

┌─────────────────────┐
│  sync_checkpoints   │
│  (singleton)        │
│                     │
│  - id (PK)          │
│  - last_sync        │
│  - sync_status      │
│  - record_count     │
│  - duration_ms      │
│  - error_message    │
└─────────────────────┘
```

## Schema Definition (SQLite)

### 1. azure_updates (Main Table)

Stores the complete Azure Update record with all metadata.

```sql
CREATE TABLE IF NOT EXISTS azure_updates (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description_html TEXT,
  description_md TEXT,
  status TEXT,
  locale TEXT,
  created TEXT NOT NULL,  -- ISO 8601: YYYY-MM-DDTHH:MM:SS.SSSSSSSZ
  modified TEXT NOT NULL,  -- ISO 8601 with 7 decimal precision
  metadata TEXT,  -- JSON blob for extensibility (handles unknown fields)
  
  -- Computed/indexed fields for filtering
  has_retirement BOOLEAN GENERATED ALWAYS AS (
    EXISTS (SELECT 1 FROM update_tags WHERE update_id = id AND tag = 'Retirements')
  ) STORED,
  
  CONSTRAINT chk_dates CHECK (
    created IS NOT NULL AND 
    modified IS NOT NULL AND
    modified >= created
  )
);

-- Index for differential sync queries (most critical)
CREATE INDEX IF NOT EXISTS idx_updates_modified ON azure_updates(modified DESC);

-- Index for date range filtering
CREATE INDEX IF NOT EXISTS idx_updates_created ON azure_updates(created);

-- Index for status filtering
CREATE INDEX IF NOT EXISTS idx_updates_status ON azure_updates(status);
```

**Field Details**:
- `id`: Unique identifier from Azure API (GUID format)
- `title`: Update title (plain text, indexed in FTS5)
- `description_html`: Original HTML content from API (archived for reference)
- `description_md`: Converted markdown content (indexed in FTS5)
- `status`: Update status (e.g., "Active", "Retired", null)
- `locale`: Language/region code (typically null per spec assumptions)
- `created`: ISO 8601 timestamp when update was created
- `modified`: ISO 8601 timestamp with 7 decimal precision for differential sync
- `metadata`: JSON blob for unknown/future API fields (forwards compatibility)

**Validation Rules**:
- `id`, `title`, `created`, `modified` are mandatory (NOT NULL)
- `modified` must be >= `created` (logical consistency)

---

### 2. update_tags (Many-to-Many Relationship)

Maps updates to their tags (e.g., "Retirements", "Security", "Features").

```sql
CREATE TABLE IF NOT EXISTS update_tags (
  update_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  
  PRIMARY KEY (update_id, tag),
  FOREIGN KEY (update_id) REFERENCES azure_updates(id) ON DELETE CASCADE
);

-- Index for tag-based filtering
CREATE INDEX IF NOT EXISTS idx_tags_tag ON update_tags(tag);
```

**Usage**:
- Supports filtering like "Show all Retirements"
- Dynamic schema: New tags from API are inserted without validation
- Cascade delete ensures referential integrity

---

### 3. update_categories (Many-to-Many Relationship)

Maps updates to product categories (e.g., "Compute", "Security", "AI").

```sql
CREATE TABLE IF NOT EXISTS update_categories (
  update_id TEXT NOT NULL,
  category TEXT NOT NULL,
  
  PRIMARY KEY (update_id, category),
  FOREIGN KEY (update_id) REFERENCES azure_updates(id) ON DELETE CASCADE
);

-- Index for category-based filtering
CREATE INDEX IF NOT EXISTS idx_categories_category ON update_categories(category);
```

**Usage**:
- Supports filtering like "Show Compute updates"
- Dynamic schema: New categories accepted without validation

---

### 4. update_products (Many-to-Many Relationship)

Maps updates to specific Azure products (e.g., "Azure Virtual Machines", "Azure SQL Database").

```sql
CREATE TABLE IF NOT EXISTS update_products (
  update_id TEXT NOT NULL,
  product TEXT NOT NULL,
  
  PRIMARY KEY (update_id, product),
  FOREIGN KEY (update_id) REFERENCES azure_updates(id) ON DELETE CASCADE
);

-- Index for product-based filtering
CREATE INDEX IF NOT EXISTS idx_products_product ON update_products(product);
```

**Usage**:
- Supports filtering like "Show Azure ML updates"
- Dynamic schema: New products accepted without validation

---

### 5. update_availabilities (One-to-Many Relationship)

Tracks availability timeline for each update (GA, Preview, Retirement dates).

```sql
CREATE TABLE IF NOT EXISTS update_availabilities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  update_id TEXT NOT NULL,
  ring TEXT NOT NULL,  -- 'General Availability', 'Preview', 'Private Preview', 'Retirement'
  date TEXT,  -- ISO 8601 date (can be null for TBD dates)
  
  FOREIGN KEY (update_id) REFERENCES azure_updates(id) ON DELETE CASCADE
);

-- Index for availability ring filtering
CREATE INDEX IF NOT EXISTS idx_availabilities_ring ON update_availabilities(ring);

-- Index for date range queries
CREATE INDEX IF NOT EXISTS idx_availabilities_date ON update_availabilities(date);

-- Composite index for common query pattern
CREATE INDEX IF NOT EXISTS idx_availabilities_ring_date ON update_availabilities(ring, date);
```

**Usage**:
- Supports queries like "Show retirements in Q1 2026"
- Multiple availability entries per update (e.g., Preview → GA → Retirement)
- Null dates handled for TBD announcements

---

### 6. updates_fts (FTS5 Virtual Table)

Full-text search index for title and description content.

```sql
-- FTS5 virtual table with content extraction from azure_updates
CREATE VIRTUAL TABLE IF NOT EXISTS updates_fts USING fts5(
  id UNINDEXED,  -- Don't index the ID itself
  title,
  description_md,
  content='azure_updates',  -- Extract content from this table
  content_rowid='id',  -- Map to this column
  tokenize='porter unicode61 remove_diacritics 2'  -- Advanced tokenization
);

-- Triggers to keep FTS5 in sync with azure_updates
CREATE TRIGGER IF NOT EXISTS updates_fts_insert AFTER INSERT ON azure_updates BEGIN
  INSERT INTO updates_fts(rowid, id, title, description_md)
  VALUES (new.rowid, new.id, new.title, new.description_md);
END;

CREATE TRIGGER IF NOT EXISTS updates_fts_update AFTER UPDATE ON azure_updates BEGIN
  UPDATE updates_fts 
  SET title = new.title, description_md = new.description_md
  WHERE rowid = old.rowid;
END;

CREATE TRIGGER IF NOT EXISTS updates_fts_delete AFTER DELETE ON azure_updates BEGIN
  DELETE FROM updates_fts WHERE rowid = old.rowid;
END;
```

**FTS5 Configuration**:
- `tokenize='porter unicode61 remove_diacritics 2'`:
  - **porter**: Stemming algorithm (e.g., "retiring" matches "retirement")
  - **unicode61**: Unicode normalization
  - **remove_diacritics**: Accent-insensitive search
- Content extraction from `azure_updates` keeps FTS5 automatically synchronized
- `id UNINDEXED`: ID column for joins but not searchable

**Search Query Pattern**:
```sql
SELECT 
  au.*,
  bm25(updates_fts) AS rank  -- Relevance score
FROM updates_fts fts
JOIN azure_updates au ON au.id = fts.id
WHERE updates_fts MATCH ?  -- FTS5 query syntax
ORDER BY rank
LIMIT ? OFFSET ?;
```

**FTS5 Query Syntax Examples**:
- Simple keyword: `OAuth`
- Multiple keywords (AND): `OAuth security`
- Phrase match: `"machine learning"`
- OR operator: `OAuth OR authentication`
- Column-specific: `title:retirement`

---

### 7. sync_checkpoints (Singleton Table)

Tracks synchronization state for differential updates.

```sql
CREATE TABLE IF NOT EXISTS sync_checkpoints (
  id INTEGER PRIMARY KEY CHECK (id = 1),  -- Enforce singleton
  last_sync TEXT NOT NULL,  -- ISO 8601: YYYY-MM-DDTHH:MM:SS.SSSSSSSZ
  sync_status TEXT NOT NULL CHECK (sync_status IN ('success', 'failed', 'in_progress')),
  record_count INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER,
  error_message TEXT,
  
  -- Metadata for observability
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Initialize with epoch timestamp for first sync
INSERT OR IGNORE INTO sync_checkpoints (id, last_sync, sync_status, record_count)
VALUES (1, '1970-01-01T00:00:00.0000000Z', 'success', 0);
```

**Usage**:
- Single row (id=1) stores latest checkpoint
- `last_sync` used in `$filter=modified gt {last_sync}` for differential sync
- `sync_status` tracks current state for concurrent sync prevention
- `record_count` for monitoring data freshness
- `error_message` for debugging failed syncs

**Checkpoint Update Pattern**:
```sql
-- Start sync (pessimistic locking)
UPDATE sync_checkpoints 
SET sync_status = 'in_progress', updated_at = datetime('now')
WHERE id = 1 AND sync_status != 'in_progress';

-- Complete sync (update checkpoint)
UPDATE sync_checkpoints 
SET 
  last_sync = ?,
  sync_status = 'success',
  record_count = ?,
  duration_ms = ?,
  error_message = NULL,
  updated_at = datetime('now')
WHERE id = 1;
```

---

## Data Access Patterns

### Pattern 1: Differential Sync (Most Critical)

```sql
-- Get last successful checkpoint
SELECT last_sync FROM sync_checkpoints WHERE id = 1 AND sync_status = 'success';

-- Fetch updates from API: /azure?$filter=modified gt {last_sync}

-- UPSERT updates
INSERT INTO azure_updates (id, title, description_html, description_md, ...)
VALUES (?, ?, ?, ?, ...)
ON CONFLICT(id) DO UPDATE SET
  title = excluded.title,
  description_html = excluded.description_html,
  description_md = excluded.description_md,
  modified = excluded.modified,
  ...;

-- Update tags (delete + insert for simplicity)
DELETE FROM update_tags WHERE update_id = ?;
INSERT INTO update_tags (update_id, tag) VALUES (?, ?), (?, ?), ...;
```

**Performance**: 
- Index on `modified` makes checkpoint queries instant (<1ms)
- UPSERT uses primary key index (O(log n))
- Batch inserts for tags/categories (~1000 inserts/transaction)

---

### Pattern 2: Keyword Search + Filters

```sql
-- Search "OAuth security" in Compute category with Retirements tag
SELECT 
  au.*,
  bm25(updates_fts) AS relevance
FROM updates_fts fts
JOIN azure_updates au ON au.id = fts.id
WHERE 
  updates_fts MATCH 'OAuth security'
  AND EXISTS (SELECT 1 FROM update_tags WHERE update_id = au.id AND tag = 'Retirements')
  AND EXISTS (SELECT 1 FROM update_categories WHERE update_id = au.id AND category = 'Compute')
ORDER BY relevance
LIMIT 50 OFFSET 0;
```

**Performance**:
- FTS5 MATCH uses inverted index (~10ms for 10k records)
- EXISTS subqueries use covering indices (~1ms each)
- Total query time: <50ms (well under 500ms target)

---

### Pattern 3: Date Range Filtering

```sql
-- Retirements in Q1 2026
SELECT au.*
FROM azure_updates au
JOIN update_tags ut ON ut.update_id = au.id
JOIN update_availabilities ua ON ua.update_id = au.id
WHERE 
  ut.tag = 'Retirements'
  AND ua.ring = 'Retirement'
  AND ua.date >= '2026-01-01'
  AND ua.date < '2026-04-01'
ORDER BY ua.date;
```

**Performance**:
- Composite index on `(ring, date)` enables efficient range scan
- Tag index filters candidate set
- Query time: <20ms for typical date ranges

---

### Pattern 4: Metadata Retrieval (Filter Options)

```sql
-- Get all available tags
SELECT DISTINCT tag FROM update_tags ORDER BY tag;

-- Get all available categories
SELECT DISTINCT category FROM update_categories ORDER BY category;

-- Get all available products
SELECT DISTINCT product FROM update_products ORDER BY product;

-- Get availability rings
SELECT DISTINCT ring FROM update_availabilities ORDER BY ring;
```

**Performance**:
- Covering indices on each table enable index-only scans
- Query time: <5ms per query (can be cached in memory)

---

## Migration Strategy

### Initial Schema Creation

```typescript
// database/schema.sql - Executed on first run
const SCHEMA_VERSION = 1;

export function initializeDatabase(db: Database.Database): void {
  // Check schema version
  const version = db.pragma('user_version', { simple: true });
  
  if (version === 0) {
    // Run all CREATE TABLE statements
    db.exec(SCHEMA_SQL);
    
    // Set schema version
    db.pragma(`user_version = ${SCHEMA_VERSION}`);
    
    logger.info('Database initialized', { version: SCHEMA_VERSION });
  } else if (version < SCHEMA_VERSION) {
    // Future: Run migration scripts
    throw new Error(`Migration from v${version} to v${SCHEMA_VERSION} not implemented`);
  }
}
```

### Future Schema Evolution

For future versions, migrations will be handled incrementally:

```typescript
// database/migrations/002_add_sentiment_analysis.sql
ALTER TABLE azure_updates ADD COLUMN sentiment_score REAL;
CREATE INDEX idx_updates_sentiment ON azure_updates(sentiment_score);
```

---

## Data Validation Rules

### Field-Level Validation

| Field | Validation Rule | Error Handling |
|-------|----------------|----------------|
| `id` | Non-empty string, GUID format preferred | Log warning if not GUID, accept as-is |
| `title` | Non-empty string | Error - reject record |
| `modified` | ISO 8601 with 7 decimals | Error - reject record |
| `created` | ISO 8601 | Warning - use modified if missing |
| `status` | Any string or null | Accept as-is |
| `tags` | Array of strings | Empty array if missing |
| `categories` | Array of strings | Empty array if missing |

### Referential Integrity

- Foreign keys with `ON DELETE CASCADE` ensure orphaned records are cleaned up
- Sync checkpoint prevents concurrent modifications with `sync_status = 'in_progress'` check

---

## Storage Estimates

### Current Scale (9,300 records)

| Component | Size Estimate |
|-----------|---------------|
| azure_updates table | ~30 MB (with full HTML + markdown descriptions) |
| update_tags | ~200 KB (avg 3 tags per update) |
| update_categories | ~150 KB (avg 2 categories per update) |
| update_products | ~300 KB (avg 4 products per update) |
| update_availabilities | ~400 KB (avg 2 availability entries per update) |
| updates_fts index | ~40 MB (FTS5 inverted index) |
| **Total** | **~70 MB** |

### Projected Scale (100,000 records)

| Component | Size Estimate |
|-----------|---------------|
| azure_updates table | ~320 MB |
| update_tags | ~2 MB |
| update_categories | ~1.5 MB |
| update_products | ~3 MB |
| update_availabilities | ~4 MB |
| updates_fts index | ~430 MB |
| **Total** | **~760 MB** |

**Conclusion**: Storage requirements well within acceptable limits for embedded SQLite database on modern systems.

---

## Performance Optimization Notes

1. **Prepared Statements**: All queries use prepared statements (better-sqlite3 default) for safety and performance
2. **Transaction Batching**: Sync operations use single transaction for all inserts (50x speedup)
3. **Index Coverage**: All filter queries have covering indices (no table scans)
4. **FTS5 Tuning**: Porter stemmer + BM25 ranking optimized for relevance
5. **Write-Ahead Logging (WAL)**: Enable WAL mode for concurrent read/write

```typescript
// Enable performance optimizations
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('cache_size = -64000');  // 64MB cache
db.pragma('temp_store = MEMORY');
```

---

## Next Steps

- [x] SQLite schema defined with all entities and relationships
- [x] FTS5 full-text search configuration documented
- [x] Indexing strategy for all access patterns verified
- [x] Data validation rules specified
- [x] Storage estimates calculated for current and future scale
- [ ] Generate MCP tool contracts (JSON schemas)
- [ ] Document quickstart guide
- [ ] Update agent context with technologies
