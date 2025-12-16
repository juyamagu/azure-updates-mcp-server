/**
 * Data staleness checker utility
 * 
 * Determines if local data needs to be refreshed based on last sync timestamp
 */

import type { SyncCheckpoint } from '../models/sync-checkpoint.js';

export interface StalenessConfig {
    thresholdHours: number; // Data is considered stale after this many hours
}

const DEFAULT_THRESHOLD_HOURS = 24;

/**
 * Check if data is stale based on last sync timestamp
 * 
 * @param checkpoint Sync checkpoint with lastSync timestamp
 * @param config Staleness configuration
 * @returns True if data is stale and needs refresh
 */
export function isDataStale(
    checkpoint: SyncCheckpoint | null,
    config: Partial<StalenessConfig> = {}
): boolean {
    const thresholdHours = config.thresholdHours ?? DEFAULT_THRESHOLD_HOURS;

    // If no checkpoint exists, data is stale (never synced)
    if (!checkpoint) {
        return true;
    }

    // If last sync failed, data is stale
    if (checkpoint.syncStatus === 'failed') {
        return true;
    }

    // If sync is in progress, data is NOT stale (wait for completion)
    if (checkpoint.syncStatus === 'in_progress') {
        return false;
    }

    // Calculate time since last sync
    const lastSyncTime = new Date(checkpoint.lastSync);
    const now = new Date();
    const hoursSinceSync = (now.getTime() - lastSyncTime.getTime()) / (1000 * 60 * 60);

    return hoursSinceSync >= thresholdHours;
}

/**
 * Get hours since last sync
 * 
 * @param checkpoint Sync checkpoint
 * @returns Hours since last sync, or null if never synced
 */
export function getHoursSinceSync(checkpoint: SyncCheckpoint | null): number | null {
    if (!checkpoint) {
        return null;
    }

    const lastSyncTime = new Date(checkpoint.lastSync);
    const now = new Date();
    const hoursSinceSync = (now.getTime() - lastSyncTime.getTime()) / (1000 * 60 * 60);

    return Math.round(hoursSinceSync * 10) / 10; // Round to 1 decimal place
}

/**
 * Get a human-readable freshness message
 * 
 * @param checkpoint Sync checkpoint
 * @returns Human-readable freshness description
 */
function formatTimeAgo(value: number, unit: string): string {
    return `${value} ${unit}${value !== 1 ? 's' : ''} ago`;
}

export function getFreshnessMessage(checkpoint: SyncCheckpoint | null): string {
    if (!checkpoint) return 'Never synced';
    if (checkpoint.syncStatus === 'in_progress') return 'Sync in progress';
    if (checkpoint.syncStatus === 'failed') {
        return `Sync failed: ${checkpoint.errorMessage ?? 'Unknown error'}`;
    }

    const hours = getHoursSinceSync(checkpoint);
    if (hours === null) return 'Unknown';
    if (hours < 1) return formatTimeAgo(Math.round(hours * 60), 'minute');
    if (hours < 24) return formatTimeAgo(Math.round(hours), 'hour');
    return formatTimeAgo(Math.round(hours / 24), 'day');
}

/**
 * Calculate next sync time based on threshold
 * 
 * @param checkpoint Sync checkpoint
 * @param config Staleness configuration
 * @returns ISO 8601 timestamp of next sync, or null if unknown
 */
export function getNextSyncTime(
    checkpoint: SyncCheckpoint | null,
    config: Partial<StalenessConfig> = {}
): string | null {
    const thresholdHours = config.thresholdHours ?? DEFAULT_THRESHOLD_HOURS;

    if (!checkpoint || checkpoint.syncStatus !== 'success') {
        return null;
    }

    const lastSyncTime = new Date(checkpoint.lastSync);
    const nextSyncTime = new Date(lastSyncTime.getTime() + thresholdHours * 60 * 60 * 1000);

    return nextSyncTime.toISOString();
}
