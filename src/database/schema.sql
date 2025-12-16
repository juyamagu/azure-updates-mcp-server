-- Azure Updates MCP Server - SQLite Schema
-- Date: 2025-12-16
-- Purpose: Local data replication for Azure Updates API with FTS5 full-text search

-- =============================================================================
-- 1. Main Table: azure_updates
-- =============================================================================

CREATE TABLE IF NOT EXISTS azure_updates (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description_html TEXT,
  description_md TEXT,
  status TEXT,
  locale TEXT,
  created TEXT NOT NULL,  -- ISO 8601: YYYY-MM-DDTHH:MM:SS.SSSSSSSZ
  modified TEXT NOT NULL,  -- ISO 8601 with 7 decimal precision for differential sync
  metadata TEXT,  -- JSON blob for extensibility (handles unknown fields)
  
  CONSTRAINT chk_dates CHECK (
    created IS NOT NULL AND 
    modified IS NOT NULL AND
    modified >= created
  )
);

-- Index for differential sync queries (CRITICAL for performance)
CREATE INDEX IF NOT EXISTS idx_updates_modified ON azure_updates(modified DESC);

-- Index for date range filtering
CREATE INDEX IF NOT EXISTS idx_updates_created ON azure_updates(created);

-- Index for status filtering
CREATE INDEX IF NOT EXISTS idx_updates_status ON azure_updates(status);

-- =============================================================================
-- 2. Many-to-Many: update_tags
-- =============================================================================

CREATE TABLE IF NOT EXISTS update_tags (
  update_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  
  PRIMARY KEY (update_id, tag),
  FOREIGN KEY (update_id) REFERENCES azure_updates(id) ON DELETE CASCADE
);

-- Index for tag-based filtering (e.g., "Show all Retirements")
CREATE INDEX IF NOT EXISTS idx_tags_tag ON update_tags(tag);

-- =============================================================================
-- 3. Many-to-Many: update_categories
-- =============================================================================

CREATE TABLE IF NOT EXISTS update_categories (
  update_id TEXT NOT NULL,
  category TEXT NOT NULL,
  
  PRIMARY KEY (update_id, category),
  FOREIGN KEY (update_id) REFERENCES azure_updates(id) ON DELETE CASCADE
);

-- Index for category-based filtering (e.g., "Show Compute updates")
CREATE INDEX IF NOT EXISTS idx_categories_category ON update_categories(category);

-- =============================================================================
-- 4. Many-to-Many: update_products
-- =============================================================================

CREATE TABLE IF NOT EXISTS update_products (
  update_id TEXT NOT NULL,
  product TEXT NOT NULL,
  
  PRIMARY KEY (update_id, product),
  FOREIGN KEY (update_id) REFERENCES azure_updates(id) ON DELETE CASCADE
);

-- Index for product-based filtering (e.g., "Show Azure ML updates")
CREATE INDEX IF NOT EXISTS idx_products_product ON update_products(product);

-- =============================================================================
-- 5. One-to-Many: update_availabilities
-- =============================================================================

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

-- Composite index for common query pattern (ring + date filtering)
CREATE INDEX IF NOT EXISTS idx_availabilities_ring_date ON update_availabilities(ring, date);

-- =============================================================================
-- 6. FTS5 Virtual Table: updates_fts
-- =============================================================================

-- Full-text search index for title and description content
CREATE VIRTUAL TABLE IF NOT EXISTS updates_fts USING fts5(
  id UNINDEXED,  -- Don't index the ID itself (used for joins)
  title,
  description_md,
  content='azure_updates',  -- Extract content from this table
  content_rowid='rowid',  -- Map to rowid (SQLite internal)
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

-- =============================================================================
-- 7. Singleton Table: sync_checkpoints
-- =============================================================================

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

-- =============================================================================
-- Schema Version Tracking
-- =============================================================================

-- User-defined metadata table for schema versioning
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO schema_version (version) VALUES (1);
