/**
 * TypeScript interfaces for sync checkpoint tracking
 * 
 * Used to manage differential synchronization state
 */

/**
 * Sync status enumeration
 */
export type SyncStatus = 'success' | 'failed' | 'in_progress';

/**
 * Sync checkpoint record from database
 */
export interface SyncCheckpoint {
    id: number; // Always 1 (singleton)
    lastSync: string; // ISO 8601 timestamp of last successful sync
    syncStatus: SyncStatus; // Current sync state
    recordCount: number; // Total number of records synced
    durationMs: number | null; // Sync duration in milliseconds
    errorMessage: string | null; // Error message if sync failed
    createdAt: string; // Checkpoint creation timestamp
    updatedAt: string; // Last update timestamp
}

/**
 * Database representation (snake_case)
 */
export interface SyncCheckpointRecord {
    id: number;
    last_sync: string;
    sync_status: SyncStatus;
    record_count: number;
    duration_ms: number | null;
    error_message: string | null;
    created_at: string;
    updated_at: string;
}

/**
 * Sync operation result
 */
export interface SyncResult {
    success: boolean;
    recordsProcessed: number;
    recordsInserted: number;
    recordsUpdated: number;
    durationMs: number;
    error?: string;
    checkpoint: string; // New checkpoint timestamp
}

/**
 * Sync configuration
 */
export interface SyncConfig {
    stalenessThresholdHours: number; // Trigger sync if data older than this
    apiUrl: string; // Azure Updates API base URL
    batchSize: number; // Records per transaction batch
    maxRetries: number; // Max retry attempts for API calls
}
