import Database from 'better-sqlite3';
import type {
    AzureUpdate,
    AzureUpdateRecord,
    AzureUpdateAvailability
} from '../models/azure-update.js';
import type {
    SyncCheckpoint
} from '../models/sync-checkpoint.js';

/**
 * Prepared statements and database queries for Azure Updates MCP Server
 * 
 * All queries use prepared statements for performance and SQL injection prevention
 */

// =============================================================================
// Sync Checkpoint Queries
// =============================================================================

/**
 * Get the current sync checkpoint
 */
export function getSyncCheckpoint(db: Database.Database): SyncCheckpoint | null {
    const stmt = db.prepare(`
    SELECT 
      id, 
      last_sync as lastSync, 
      sync_status as syncStatus, 
      record_count as recordCount,
      duration_ms as durationMs,
      error_message as errorMessage,
      created_at as createdAt,
      updated_at as updatedAt
    FROM sync_checkpoints 
    WHERE id = 1
  `);

    return stmt.get() as SyncCheckpoint | null;
}

/**
 * Start a new sync operation (pessimistic lock)
 * Returns true if lock acquired, false if already in progress
 */
export function startSync(db: Database.Database): boolean {
    const stmt = db.prepare(`
    UPDATE sync_checkpoints 
    SET sync_status = 'in_progress', updated_at = datetime('now')
    WHERE id = 1 AND sync_status != 'in_progress'
  `);

    const result = stmt.run();
    return result.changes > 0;
}

/**
 * Complete a sync operation successfully
 */
export function completeSyncSuccess(
    db: Database.Database,
    checkpoint: string,
    recordCount: number,
    durationMs: number
): void {
    const stmt = db.prepare(`
    UPDATE sync_checkpoints 
    SET 
      last_sync = ?,
      sync_status = 'success',
      record_count = ?,
      duration_ms = ?,
      error_message = NULL,
      updated_at = datetime('now')
    WHERE id = 1
  `);

    stmt.run(checkpoint, recordCount, durationMs);
}

/**
 * Mark sync as failed
 */
export function completeSyncFailure(
    db: Database.Database,
    errorMessage: string
): void {
    const stmt = db.prepare(`
    UPDATE sync_checkpoints 
    SET 
      sync_status = 'failed',
      error_message = ?,
      updated_at = datetime('now')
    WHERE id = 1
  `);

    stmt.run(errorMessage);
}

// =============================================================================
// Azure Update CRUD Operations
// =============================================================================

/**
 * Upsert an Azure update record
 */
export function upsertUpdate(
    db: Database.Database,
    update: AzureUpdateRecord
): void {
    const stmt = db.prepare(`
    INSERT INTO azure_updates (
      id, title, description_html, description_md, status, locale, created, modified, metadata
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      description_html = excluded.description_html,
      description_md = excluded.description_md,
      status = excluded.status,
      locale = excluded.locale,
      created = excluded.created,
      modified = excluded.modified,
      metadata = excluded.metadata
  `);

    stmt.run(
        update.id,
        update.title,
        update.description_html,
        update.description_md,
        update.status,
        update.locale,
        update.created,
        update.modified,
        update.metadata
    );
}

/**
 * Get an Azure update by ID
 */
export function getUpdateById(db: Database.Database, id: string): AzureUpdate | null {
    const updateStmt = db.prepare(`
    SELECT 
      id, 
      title, 
      description_html as description,
      description_md as descriptionMarkdown,
      status, 
      locale, 
      created, 
      modified
    FROM azure_updates 
    WHERE id = ?
  `);

    const update = updateStmt.get(id) as Partial<AzureUpdate> | undefined;
    if (!update) return null;

    // Fetch related data
    update.tags = getTagsForUpdate(db, id);
    update.productCategories = getCategoriesForUpdate(db, id);
    update.products = getProductsForUpdate(db, id);
    update.availabilities = getAvailabilitiesForUpdate(db, id);

    return update as AzureUpdate;
}

/**
 * Delete an Azure update (cascade deletes related records)
 */
export function deleteUpdate(db: Database.Database, id: string): void {
    const stmt = db.prepare('DELETE FROM azure_updates WHERE id = ?');
    stmt.run(id);
}

// =============================================================================
// Related Data Queries
// =============================================================================

/**
 * Get tags for an update
 */
export function getTagsForUpdate(db: Database.Database, updateId: string): string[] {
    const stmt = db.prepare('SELECT tag FROM update_tags WHERE update_id = ? ORDER BY tag');
    const rows = stmt.all(updateId) as { tag: string }[];
    return rows.map(row => row.tag);
}

/**
 * Get categories for an update
 */
export function getCategoriesForUpdate(db: Database.Database, updateId: string): string[] {
    const stmt = db.prepare('SELECT category FROM update_categories WHERE update_id = ? ORDER BY category');
    const rows = stmt.all(updateId) as { category: string }[];
    return rows.map(row => row.category);
}

/**
 * Get products for an update
 */
export function getProductsForUpdate(db: Database.Database, updateId: string): string[] {
    const stmt = db.prepare('SELECT product FROM update_products WHERE update_id = ? ORDER BY product');
    const rows = stmt.all(updateId) as { product: string }[];
    return rows.map(row => row.product);
}

/**
 * Get availabilities for an update
 */
export function getAvailabilitiesForUpdate(
    db: Database.Database,
    updateId: string
): AzureUpdateAvailability[] {
    const stmt = db.prepare(`
    SELECT ring, date 
    FROM update_availabilities 
    WHERE update_id = ? 
    ORDER BY date
  `);
    return stmt.all(updateId) as AzureUpdateAvailability[];
}

// =============================================================================
// Batch Insert Operations
// =============================================================================

/**
 * Replace tags for an update (delete + batch insert)
 */
export function replaceUpdateTags(
    db: Database.Database,
    updateId: string,
    tags: string[]
): void {
    // Delete existing tags
    const deleteStmt = db.prepare('DELETE FROM update_tags WHERE update_id = ?');
    deleteStmt.run(updateId);

    if (tags.length === 0) return;

    // Batch insert new tags
    const insertStmt = db.prepare('INSERT INTO update_tags (update_id, tag) VALUES (?, ?)');
    const insertMany = db.transaction((tagsToInsert: string[]) => {
        for (const tag of tagsToInsert) {
            insertStmt.run(updateId, tag);
        }
    });

    insertMany(tags);
}

/**
 * Replace categories for an update
 */
export function replaceUpdateCategories(
    db: Database.Database,
    updateId: string,
    categories: string[]
): void {
    const deleteStmt = db.prepare('DELETE FROM update_categories WHERE update_id = ?');
    deleteStmt.run(updateId);

    if (categories.length === 0) return;

    const insertStmt = db.prepare('INSERT INTO update_categories (update_id, category) VALUES (?, ?)');
    const insertMany = db.transaction((categoriesToInsert: string[]) => {
        for (const category of categoriesToInsert) {
            insertStmt.run(updateId, category);
        }
    });

    insertMany(categories);
}

/**
 * Replace products for an update
 */
export function replaceUpdateProducts(
    db: Database.Database,
    updateId: string,
    products: string[]
): void {
    const deleteStmt = db.prepare('DELETE FROM update_products WHERE update_id = ?');
    deleteStmt.run(updateId);

    if (products.length === 0) return;

    const insertStmt = db.prepare('INSERT INTO update_products (update_id, product) VALUES (?, ?)');
    const insertMany = db.transaction((productsToInsert: string[]) => {
        for (const product of productsToInsert) {
            insertStmt.run(updateId, product);
        }
    });

    insertMany(products);
}

/**
 * Replace availabilities for an update
 */
export function replaceUpdateAvailabilities(
    db: Database.Database,
    updateId: string,
    availabilities: AzureUpdateAvailability[]
): void {
    const deleteStmt = db.prepare('DELETE FROM update_availabilities WHERE update_id = ?');
    deleteStmt.run(updateId);

    if (availabilities.length === 0) return;

    const insertStmt = db.prepare(`
    INSERT INTO update_availabilities (update_id, ring, date) 
    VALUES (?, ?, ?)
  `);
    const insertMany = db.transaction((availabilitiesToInsert: AzureUpdateAvailability[]) => {
        for (const availability of availabilitiesToInsert) {
            insertStmt.run(updateId, availability.ring, availability.date);
        }
    });

    insertMany(availabilities);
}

// =============================================================================
// Metadata Queries
// =============================================================================

/**
 * Get all distinct tags
 */
export function getAllTags(db: Database.Database): string[] {
    const stmt = db.prepare('SELECT DISTINCT tag FROM update_tags ORDER BY tag');
    const rows = stmt.all() as { tag: string }[];
    return rows.map(row => row.tag);
}

/**
 * Get all distinct categories
 */
export function getAllCategories(db: Database.Database): string[] {
    const stmt = db.prepare('SELECT DISTINCT category FROM update_categories ORDER BY category');
    const rows = stmt.all() as { category: string }[];
    return rows.map(row => row.category);
}

/**
 * Get all distinct products
 */
export function getAllProducts(db: Database.Database): string[] {
    const stmt = db.prepare('SELECT DISTINCT product FROM update_products ORDER BY product');
    const rows = stmt.all() as { product: string }[];
    return rows.map(row => row.product);
}

/**
 * Get all distinct availability rings
 */
export function getAllAvailabilityRings(db: Database.Database): string[] {
    const stmt = db.prepare('SELECT DISTINCT ring FROM update_availabilities ORDER BY ring');
    const rows = stmt.all() as { ring: string }[];
    return rows.map(row => row.ring);
}

/**
 * Get all distinct statuses
 */
export function getAllStatuses(db: Database.Database): string[] {
    const stmt = db.prepare('SELECT DISTINCT status FROM azure_updates WHERE status IS NOT NULL ORDER BY status');
    const rows = stmt.all() as { status: string }[];
    return rows.map(row => row.status);
}

/**
 * Get total update count
 */
export function getUpdateCount(db: Database.Database): number {
    const stmt = db.prepare('SELECT COUNT(*) as count FROM azure_updates');
    const result = stmt.get() as { count: number };
    return result.count;
}
