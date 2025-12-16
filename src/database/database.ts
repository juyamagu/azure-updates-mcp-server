import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';

// ESM-friendly __dirname replacement
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Database initialization and management for Azure Updates MCP Server
 * 
 * Features:
 * - SQLite with WAL mode for concurrent reads
 * - Automatic schema initialization
 * - Schema versioning for migrations
 * - Performance optimizations (cache size, temp store)
 */

export interface DatabaseConfig {
    path: string;
    readonly?: boolean;
    verbose?: boolean;
}

let dbInstance: Database.Database | null = null;

/**
 * Initialize and configure the SQLite database
 * 
 * @param config Database configuration options
 * @returns Configured database instance
 */
export function initializeDatabase(config: DatabaseConfig): Database.Database {
    // Ensure data directory exists
    const dataDir = dirname(config.path);
    if (!existsSync(dataDir)) {
        mkdirSync(dataDir, { recursive: true });
    }

    // Open database connection
    const db = new Database(config.path, {
        readonly: config.readonly ?? false,
        verbose: config.verbose ? (..._args: unknown[]): void => { /* verbose logging */ } : undefined,
    });

    // Enable WAL mode for better concurrent access
    // WAL allows multiple readers while writer is active
    db.pragma('journal_mode = WAL');

    // Set busy timeout (wait up to 5 seconds for locks)
    db.pragma('busy_timeout = 5000');

    // Increase cache size for better query performance
    // -64000 = 64MB cache (negative value means KB)
    db.pragma('cache_size = -64000');

    // Use memory for temporary tables and indices
    db.pragma('temp_store = MEMORY');

    // Enable foreign key constraints
    db.pragma('foreign_keys = ON');

    // Set page size to 4KB (good balance for FTS5)
    db.pragma('page_size = 4096');

    // Apply schema if not already initialized
    if (!isSchemaInitialized(db)) {
        applySchema(db);
    }

    // Verify schema version
    const currentVersion = getSchemaVersion(db);
    if (currentVersion !== 1) {
        throw new Error(`Unsupported schema version: ${currentVersion}. Expected version 1.`);
    }

    return db;
}

/**
 * Get or create the singleton database instance
 * 
 * @param config Optional configuration for first initialization
 * @returns Database instance
 */
export function getDatabase(config?: DatabaseConfig): Database.Database {
    if (!dbInstance) {
        if (!config) {
            throw new Error('Database not initialized. Call initializeDatabase() first or provide config.');
        }
        dbInstance = initializeDatabase(config);
    }
    return dbInstance;
}

/**
 * Close the database connection
 */
export function closeDatabase(): void {
    if (dbInstance) {
        dbInstance.close();
        dbInstance = null;
    }
}

/**
 * Check if the database schema has been initialized
 * 
 * @param db Database instance
 * @returns True if schema exists
 */
function isSchemaInitialized(db: Database.Database): boolean {
    const result = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'"
    ).get() as { name: string } | undefined;

    return result !== undefined;
}

/**
 * Get the current schema version
 * 
 * @param db Database instance
 * @returns Schema version number
 */
function getSchemaVersion(db: Database.Database): number {
    const result = db.prepare('SELECT version FROM schema_version ORDER BY version DESC LIMIT 1')
        .get() as { version: number } | undefined;

    return result?.version ?? 0;
}

/**
 * Apply the SQL schema to the database
 * 
 * @param db Database instance
 */
function applySchema(db: Database.Database): void {
    // Read schema.sql file
    const schemaPath = join(__dirname, 'schema.sql');
    const schemaSql = readFileSync(schemaPath, 'utf-8');

    // Execute schema in a transaction
    const applySchemaTransaction = db.transaction(() => {
        // Split by semicolon and execute each statement
        const statements = schemaSql
            .split(';')
            .map(stmt => stmt.trim())
            .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

        for (const statement of statements) {
            db.exec(statement);
        }
    });

    applySchemaTransaction();
}

/**
 * Optimize database (vacuum, analyze)
 * Should be run periodically (e.g., after large sync operations)
 * 
 * @param db Database instance
 */
export function optimizeDatabase(db: Database.Database): void {
    // Analyze query statistics for query planner
    db.exec('ANALYZE');

    // Optional: Vacuum to reclaim space (expensive, do sparingly)
    // db.exec('VACUUM');
}

/**
 * Get database statistics
 * 
 * @param db Database instance
 * @returns Statistics object
 */
export function getDatabaseStats(db: Database.Database): {
    updateCount: number;
    tagCount: number;
    categoryCount: number;
    productCount: number;
    databaseSizeKB: number;
} {
    const updateCount = (db.prepare('SELECT COUNT(*) as count FROM azure_updates').get() as { count: number }).count;
    const tagCount = (db.prepare('SELECT COUNT(DISTINCT tag) as count FROM update_tags').get() as { count: number }).count;
    const categoryCount = (db.prepare('SELECT COUNT(DISTINCT category) as count FROM update_categories').get() as { count: number }).count;
    const productCount = (db.prepare('SELECT COUNT(DISTINCT product) as count FROM update_products').get() as { count: number }).count;

    // Get database file size
    const pageCount = (db.pragma('page_count', { simple: true }) as number);
    const pageSize = (db.pragma('page_size', { simple: true }) as number);
    const databaseSizeKB = Math.round((pageCount * pageSize) / 1024);

    return {
        updateCount,
        tagCount,
        categoryCount,
        productCount,
        databaseSizeKB,
    };
}
