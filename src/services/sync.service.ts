/**
 * Sync service for Azure Updates
 * 
 * Implements differential synchronization with checkpointing, transaction safety,
 * and HTML-to-Markdown conversion.
 */

import type Database from 'better-sqlite3';
import type { AzureUpdate } from '../models/azure-update.js';
import {
    getSyncCheckpoint,
    startSync,
    completeSyncSuccess,
    completeSyncFailure,
    upsertUpdate,
    replaceUpdateTags,
    replaceUpdateCategories,
    replaceUpdateProducts,
    replaceUpdateAvailabilities,
    getUpdateCount,
} from '../database/queries.js';
import { fetchAzureUpdates } from './azure-api.service.js';
import { convertHtmlToMarkdown } from './html-converter.service.js';
import * as logger from '../utils/logger.js';

const INITIAL_SYNC_CHECKPOINT = '1970-01-01T00:00:00.0000000Z';

/**
 * Filter updates older than retention start date based on modified and created timestamps
 * 
 * @param updates Updates to filter
 * @param retentionStartDate ISO 8601 date string (e.g., '2022-01-01')
 * @returns Filtered updates
 */
function filterUpdatesByRetentionDate(updates: AzureUpdate[], retentionStartDate: string): AzureUpdate[] {
    const cutoffTime = new Date(retentionStartDate + 'T00:00:00.000Z').getTime();

    return updates.filter(update => {
        // Use the more recent timestamp between modified and created
        const modifiedTime = new Date(update.modified).getTime();
        const createdTime = new Date(update.created).getTime();
        const relevantTime = Math.max(modifiedTime, createdTime);

        return relevantTime >= cutoffTime;
    });
}

/**
 * Sync result information
 */
export interface SyncResult {
    success: boolean;
    recordsProcessed: number;
    recordsInserted: number;
    recordsUpdated: number;
    durationMs: number;
    error?: string;
}

/**
 * Create a sync failure result
 */
function createSyncFailureResult(startTime: number, error: string): SyncResult {
    return {
        success: false,
        recordsProcessed: 0,
        recordsInserted: 0,
        recordsUpdated: 0,
        durationMs: Date.now() - startTime,
        error,
    };
}

/**
 * Apply retention date filter to updates if configured
 */
function applyRetentionFilter(
    allUpdates: AzureUpdate[],
    retentionStartDate: string | undefined
): AzureUpdate[] {
    if (!retentionStartDate) {
        return allUpdates;
    }

    const updates = filterUpdatesByRetentionDate(allUpdates, retentionStartDate);

    if (allUpdates.length !== updates.length) {
        logger.info('Filtered out old updates', {
            totalFetched: allUpdates.length,
            afterFilter: updates.length,
            filtered: allUpdates.length - updates.length,
            retentionStartDate,
        });
    }

    return updates;
}

/**
 * Calculate insert and update counts
 */
function calculateSyncCounts(
    recordCountBefore: number,
    recordCountAfter: number,
    recordsProcessed: number
): { recordsInserted: number; recordsUpdated: number } {
    const recordsInserted = Math.max(0, recordCountAfter - recordCountBefore);
    const recordsUpdated = recordsProcessed - recordsInserted;
    return { recordsInserted, recordsUpdated };
}

/**
 * Perform full or differential sync with Azure Updates API
 * 
 * @param db Database instance
 * @param retentionStartDate Optional retention start date (ISO 8601: YYYY-MM-DD) - records older than this will be filtered out
 * @returns Sync result
 */
export async function performSync(db: Database.Database, retentionStartDate?: string): Promise<SyncResult> {
    const startTime = Date.now();

    logger.info('Starting sync operation');

    // Acquire sync lock
    const lockAcquired = startSync(db);
    if (!lockAcquired) {
        logger.warn('Sync already in progress, skipping');
        return createSyncFailureResult(startTime, 'Sync already in progress');
    }

    try {
        // Get checkpoint and metadata
        const checkpoint = getSyncCheckpoint(db);
        const lastSync = checkpoint?.lastSync || INITIAL_SYNC_CHECKPOINT;
        const recordCountBefore = getUpdateCount(db);
        const isInitialSync = lastSync === INITIAL_SYNC_CHECKPOINT;

        logger.info('Sync checkpoint retrieved', {
            lastSync,
            isInitialSync,
            recordCountBefore,
        });

        // Fetch updates from API
        const retentionModifiedSince = retentionStartDate ? `${retentionStartDate}T00:00:00.000Z` : undefined;
        const allUpdates = await fetchAzureUpdates({
            modifiedSince: isInitialSync ? retentionModifiedSince : lastSync,
            includeCount: isInitialSync,
        });

        // Apply retention filter
        const updates = applyRetentionFilter(allUpdates, retentionStartDate);

        // Handle no updates case
        if (updates.length === 0) {
            const durationMs = Date.now() - startTime;
            completeSyncSuccess(db, new Date().toISOString(), recordCountBefore, durationMs);
            logger.info('Sync completed - no new updates', { durationMs });

            return {
                success: true,
                recordsProcessed: 0,
                recordsInserted: 0,
                recordsUpdated: 0,
                durationMs,
            };
        }

        // Process updates
        const result = syncUpdatesInTransaction(db, updates);
        const recordCountAfter = getUpdateCount(db);
        const { recordsInserted, recordsUpdated } = calculateSyncCounts(
            recordCountBefore,
            recordCountAfter,
            result.recordsProcessed
        );

        // Update checkpoint
        const latestModified = updates.reduce((latest, update) => {
            return update.modified > latest ? update.modified : latest;
        }, lastSync);

        const durationMs = Date.now() - startTime;
        completeSyncSuccess(db, latestModified, recordCountAfter, durationMs);

        logger.info('Sync completed successfully', {
            recordsProcessed: result.recordsProcessed,
            recordsInserted,
            recordsUpdated,
            totalRecords: recordCountAfter,
            durationMs,
            isInitialSync,
        });

        return {
            success: true,
            recordsProcessed: result.recordsProcessed,
            recordsInserted,
            recordsUpdated,
            durationMs,
        };
    } catch (error) {
        const err = error as Error;
        const durationMs = Date.now() - startTime;

        completeSyncFailure(db, err.message);
        logger.errorWithStack('Sync failed', err, { durationMs });

        return createSyncFailureResult(startTime, err.message);
    }
}

/**
 * Sync updates in a database transaction
 * 
 * T051: Transaction wrapping for sync operations
 * T049: UPSERT operations for azure_updates
 * T050: Batch insert for tags, categories, products, availabilities
 * T053: HTML-to-Markdown conversion during sync
 * 
 * @param db Database instance
 * @param updates Updates to sync
 * @returns Sync statistics
 */
function syncUpdatesInTransaction(
    db: Database.Database,
    updates: AzureUpdate[]
): { recordsProcessed: number } {
    // T051: Wrap in transaction
    const syncTransaction = db.transaction((updatesToSync: AzureUpdate[]) => {
        let processed = 0;

        for (const update of updatesToSync) {
            try {
                // T053: Convert HTML to Markdown
                const descriptionMarkdown = update.description
                    ? convertHtmlToMarkdown(update.description)
                    : null;

                // T049: UPSERT main update record
                upsertUpdate(db, {
                    id: update.id,
                    title: update.title,
                    description_html: update.description || '',
                    description_md: descriptionMarkdown,
                    status: update.status,
                    locale: update.locale,
                    created: update.created,
                    modified: update.modified,
                    metadata: null, // Store unknown fields as JSON if needed
                });

                // T050: Batch insert related data (replace existing)
                replaceUpdateTags(db, update.id, update.tags || []);
                replaceUpdateCategories(db, update.id, update.productCategories || []);
                replaceUpdateProducts(db, update.id, update.products || []);
                replaceUpdateAvailabilities(db, update.id, update.availabilities || []);

                processed++;

                // Log progress every 100 records
                if (processed % 100 === 0) {
                    logger.debug('Sync progress', {
                        processed,
                        total: updatesToSync.length,
                    });
                }
            } catch (error) {
                const err = error as Error;

                // Log individual record error but continue processing
                logger.warn('Failed to sync update', {
                    updateId: update.id,
                    error: err.message,
                });

                // T055: Transaction will rollback automatically on throw
                throw new Error(`Failed to sync update ${update.id}: ${err.message}`);
            }
        }

        return processed;
    });

    // Execute transaction
    const processed = syncTransaction(updates);

    return { recordsProcessed: processed };
}

/**
 * Check if sync is needed based on data staleness
 * 
 * @param db Database instance
 * @param stalenessHours Hours after which data is considered stale
 * @returns True if sync is needed
 */
export function isSyncNeeded(db: Database.Database, stalenessHours: number): boolean {
    const checkpoint = getSyncCheckpoint(db);

    if (!checkpoint || checkpoint.lastSync === INITIAL_SYNC_CHECKPOINT) {
        // No sync yet, definitely need one
        return true;
    }

    const lastSyncTime = new Date(checkpoint.lastSync).getTime();
    const now = Date.now();
    const hoursSinceSync = (now - lastSyncTime) / (1000 * 60 * 60);

    return hoursSinceSync >= stalenessHours;
}

/**
 * Get sync status information
 * 
 * @param db Database instance
 * @returns Sync status
 */
export function getSyncStatus(db: Database.Database): {
    lastSync: string;
    syncStatus: string;
    recordCount: number;
    hoursSinceSync: number;
} | null {
    const checkpoint = getSyncCheckpoint(db);

    if (!checkpoint) {
        return null;
    }

    const lastSyncTime = new Date(checkpoint.lastSync).getTime();
    const now = Date.now();
    const hoursSinceSync = (now - lastSyncTime) / (1000 * 60 * 60);

    return {
        lastSync: checkpoint.lastSync,
        syncStatus: checkpoint.syncStatus,
        recordCount: checkpoint.recordCount,
        hoursSinceSync: Math.round(hoursSinceSync * 10) / 10, // Round to 1 decimal
    };
}
