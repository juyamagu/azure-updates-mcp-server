/**
 * MCP Resource: Azure Updates Search Guide
 * 
 * Provides metadata and usage guidance for the search_azure_updates tool.
 * This resource is automatically included in LLM context by MCP-aware clients.
 */

import type Database from 'better-sqlite3';
import {
    getAllTags,
    getAllCategories,
    getAllProducts,
    getAllAvailabilityRings,
    getAllStatuses,
    getUpdateCount,
    getSyncCheckpoint,
} from '../database/queries.js';
import * as logger from '../utils/logger.js';

/**
 * Guide resource data structure
 */
export interface GuideResourceData {
    overview: string;
    dataAvailability: {
        retentionStartDate: string | null;
        note: string;
    };
    availableFilters: {
        tags: string[];
        productCategories: string[];
        products: string[];
        statuses: string[];
        availabilityRings: string[];
    };
    usageExamples: Array<{
        description: string;
        query: unknown;
    }>;
    dataFreshness: {
        lastSync: string;
        hoursSinceSync: number;
        totalRecords: number;
        syncStatus: string;
    };
    queryTips: string[];
}

/**
 * Generate the guide resource content
 * 
 * T066: Implement guide resource handler
 * T067: Calculate data freshness (hours since last sync)
 * 
 * @param db Database instance
 * @returns Guide resource data
 */
export function generateGuideResource(db: Database.Database): GuideResourceData {
    const startTime = Date.now();

    logger.debug('Generating guide resource');

    // T065: Extract metadata from database
    const tags = getAllTags(db);
    const categories = getAllCategories(db);
    const products = getAllProducts(db);
    const statuses = getAllStatuses(db);
    const availabilityRings = getAllAvailabilityRings(db);
    const totalRecords = getUpdateCount(db);

    // T067: Calculate data freshness
    const checkpoint = getSyncCheckpoint(db);
    const lastSync = checkpoint?.lastSync || 'Never';
    const syncStatus = checkpoint?.syncStatus || 'unknown';

    let hoursSinceSync = 0;
    if (checkpoint && checkpoint.lastSync !== '1970-01-01T00:00:00.0000000Z') {
        const lastSyncTime = new Date(checkpoint.lastSync).getTime();
        const now = Date.now();
        hoursSinceSync = Math.round((now - lastSyncTime) / (1000 * 60 * 60) * 10) / 10; // Round to 1 decimal
    }

    const duration = Date.now() - startTime;

    logger.info('Guide resource generated', {
        tagCount: tags.length,
        categoryCount: categories.length,
        productCount: products.length,
        totalRecords,
        hoursSinceSync,
        durationMs: duration,
    });

    // Get retention start date from environment
    const retentionStartDate = process.env.DATA_RETENTION_START_DATE || null;

    return {
        overview: `Azure Updates MCP Server provides natural language search for Azure service updates, retirements, and feature announcements. Search across ${totalRecords.toLocaleString()} updates using a two-tool architecture: search_azure_updates for lightweight discovery (metadata only), then get_azure_update for full details including descriptions.`,

        dataAvailability: {
            retentionStartDate,
            note: retentionStartDate
                ? `Updates are retained from ${retentionStartDate} onwards. Older updates are automatically filtered during sync to save storage space.`
                : 'All historical updates are retained without date filtering.',
        },

        availableFilters: {
            tags,
            productCategories: categories,
            products,
            statuses,
            availabilityRings,
        },

        usageExamples: [
            {
                description: 'Phrase search: Find exact "Azure Virtual Machines" mentions',
                query: {
                    query: '"Azure Virtual Machines" retirement',
                    limit: 10,
                },
            },
            {
                description: 'Filter by tags with AND semantics (must have ALL specified tags)',
                query: {
                    query: 'security',
                    filters: {
                        tags: ['Security', 'Retirements'],
                    },
                    limit: 10,
                },
            },
            {
                description: 'Filter by products and categories (AND semantics for each array)',
                query: {
                    filters: {
                        products: ['Azure Key Vault'],
                        productCategories: ['Security'],
                    },
                    sortBy: 'modified:desc',
                    limit: 20,
                },
            },
            {
                description: 'Find upcoming retirements sorted by date (earliest first)',
                query: {
                    query: 'retirement',
                    filters: {
                        retirementDateFrom: '2026-01-01',
                        retirementDateTo: '2026-12-31',
                    },
                    sortBy: 'retirementDate:asc',
                    limit: 20,
                },
            },
            {
                description: 'Combined phrase search and filters',
                query: {
                    query: '"Azure Databricks" preview',
                    filters: {
                        tags: ['AI + machine learning'],
                        productCategories: ['Analytics'],
                    },
                },
            },
            {
                description: 'Two-step workflow: search then get details',
                query: {
                    step1: {
                        tool: 'search_azure_updates',
                        params: {
                            query: 'Azure SQL Database',
                            limit: 5,
                        },
                    },
                    step2: {
                        tool: 'get_azure_update',
                        params: {
                            id: '<id_from_search_results>',
                        },
                    },
                },
            },
        ],

        dataFreshness: {
            lastSync,
            hoursSinceSync,
            totalRecords,
            syncStatus,
        },

        queryTips: [
            'Two-step workflow: Use search_azure_updates for discovery (returns lightweight metadata), then get_azure_update to fetch full descriptions',
            'Phrase search: Use double quotes for exact matches (e.g., "Azure Virtual Machines" finds that exact phrase)',
            'Without quotes: Words are matched with OR logic (e.g., security authentication matches "security" OR "authentication")',
            'Combine phrase search with regular words: "Azure Databricks" preview',
            'Structured filters: Use filters.tags, filters.products, filters.productCategories for precise filtering with AND semantics',
            'Filter arrays require ALL values to match: tags: ["Security", "Retirements"] returns only updates with BOTH tags',
            'sortBy parameter supports: modified:desc (default), modified:asc, created:desc/asc, retirementDate:desc/asc',
            'Use retirementDateFrom/retirementDateTo to filter by retirement dates (ISO 8601: YYYY-MM-DD)',
            'Use dateFrom/dateTo for filtering by modified/availability dates (ISO 8601: YYYY-MM-DD)',
            'Set limit (default: 20, max: 100) and offset for pagination through large result sets',
            'search_azure_updates returns lightweight metadata without descriptions to reduce token usage by 80%+',
        ],
    };
}

/**
 * Format guide resource as MCP resource response
 * 
 * @param db Database instance
 * @returns MCP resource response
 */
export function getGuideResourceResponse(
    db: Database.Database
): { contents: Array<{ uri: string; mimeType: string; text: string }> } {
    const guideData = generateGuideResource(db);

    return {
        contents: [
            {
                uri: 'azure-updates://guide',
                mimeType: 'application/json',
                text: JSON.stringify(guideData, null, 2),
            },
        ],
    };
}
