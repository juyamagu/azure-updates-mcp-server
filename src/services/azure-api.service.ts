/**
 * Azure Updates API HTTP client
 * 
 * Provides methods to fetch Azure updates from the official API with retry logic
 * and exponential backoff for resilience.
 */

import type { AzureUpdate } from '../models/azure-update.js';
import { withRetry } from '../utils/retry.js';
import * as logger from '../utils/logger.js';

const DEFAULT_AZURE_UPDATES_API_ENDPOINT = 'https://www.microsoft.com/releasecommunications/api/v2/azure';
const DEFAULT_PAGE_SIZE = 100; // Fetch 100 records per request for efficiency
const REQUEST_TIMEOUT_MS = 30000; // 30 second timeout

function getAzureUpdatesApiEndpoint(): string {
    return process.env.AZURE_UPDATES_API_ENDPOINT ?? DEFAULT_AZURE_UPDATES_API_ENDPOINT;
}

/**
 * API response wrapper from Azure Updates API
 */
interface AzureUpdatesApiResponse {
    value: AzureUpdateApiRecord[];
    '@odata.context'?: string;
    '@odata.nextLink'?: string;
    '@odata.count'?: number;
}

/**
 * Raw API record structure (may have different field names than our model)
 */
interface AzureUpdateApiRecord {
    id: string;
    title: string;
    description?: string;
    status?: string;
    locale?: string;
    created: string;
    modified: string;
    tags?: string[];
    productCategories?: string[];
    products?: string[];
    availabilities?: Array<{
        ring: string;
        year?: number;
        month?: string;
    }>;
    // Additional fields we don't explicitly map
    [key: string]: unknown;
}

/**
 * Fetch options for API requests
 */
export interface FetchOptions {
    modifiedSince?: string; // ISO 8601 timestamp for differential sync
    limit?: number; // Max results per page
    includeCount?: boolean; // Include total count in response
}

/**
 * State for tracking pagination progress
 */
interface PaginationState {
    allUpdates: AzureUpdate[];
    page: number;
    skip: number;
    nextLink: string | undefined;
    totalCount: number | undefined;
}

/**
 * Check if pagination should continue
 */
function shouldContinuePagination(
    state: PaginationState,
    updates: AzureUpdate[],
    maxResults: number | undefined,
    pageSize: number
): boolean {
    // Stop if we've reached the requested limit
    if (maxResults && state.allUpdates.length >= maxResults) {
        logger.info('Reached requested limit', { limit: maxResults });
        return false;
    }

    // Continue if server provides nextLink
    if (state.nextLink) {
        return true;
    }

    // Stop conditions for $skip-based pagination
    if (updates.length === 0) return false;
    if (updates.length > pageSize) return false;
    if (state.totalCount !== undefined && state.skip >= state.totalCount) return false;
    if (updates.length < pageSize) return false;

    return true;
}

/**
 * Fetch a single page of updates
 */
async function fetchPage(
    requestUrl: string
): Promise<AzureUpdatesApiResponse> {
    const response = await withRetry(
        () => fetchWithTimeout(requestUrl, REQUEST_TIMEOUT_MS),
        {
            maxRetries: 3,
            initialDelayMs: 1000,
            maxDelayMs: 10000,
            backoffMultiplier: 2,
            retryableErrors: ['network', 'timeout', '503', '429'],
        }
    );

    return response.json() as Promise<AzureUpdatesApiResponse>;
}

/**
 * Fetch Azure updates from the API with pagination
 * 
 * @param options Fetch options for filtering and pagination
 * @returns Array of Azure updates
 */
export async function fetchAzureUpdates(
    options: FetchOptions = {}
): Promise<AzureUpdate[]> {
    const startTime = Date.now();
    const maxResults = options.limit;
    const pageSize = Math.min(DEFAULT_PAGE_SIZE, maxResults ?? DEFAULT_PAGE_SIZE);

    logger.info('Starting Azure Updates API fetch', {
        modifiedSince: options.modifiedSince,
        limit: maxResults,
        pageSize,
    });

    try {
        const baseUrl = buildQueryUrl({ ...options, limit: pageSize }, 0);
        const state: PaginationState = {
            allUpdates: [],
            page: 1,
            skip: 0,
            nextLink: undefined,
            totalCount: undefined,
        };

        while (true) {
            const requestUrl = state.nextLink ?? (state.skip === 0 ? baseUrl : buildQueryUrl({ ...options, limit: pageSize }, state.skip));

            logger.debug('Fetching page from Azure Updates API', {
                page: state.page,
                url: requestUrl,
                skip: state.skip,
            });

            const data = await fetchPage(requestUrl);

            // Update total count if provided
            if (state.totalCount === undefined && typeof data['@odata.count'] === 'number') {
                state.totalCount = data['@odata.count'];
            }

            // Convert and accumulate updates
            const updates = data.value.map(convertApiRecordToUpdate);
            state.allUpdates.push(...updates);

            logger.info('Fetched page from Azure Updates API', {
                page: state.page,
                recordsInPage: updates.length,
                totalSoFar: state.allUpdates.length,
            });

            // Update pagination state
            state.nextLink = data['@odata.nextLink'];
            state.page++;
            state.skip += updates.length;

            // Check if we should continue
            if (!shouldContinuePagination(state, updates, maxResults, pageSize)) {
                break;
            }
        }

        const durationMs = Date.now() - startTime;

        logger.info('Completed Azure Updates API fetch', {
            totalRecords: state.allUpdates.length,
            pages: state.page - 1,
            durationMs,
        });

        return state.allUpdates;
    } catch (error) {
        const err = error as Error;
        const durationMs = Date.now() - startTime;

        logger.errorWithStack('Azure Updates API fetch failed', err, {
            modifiedSince: options.modifiedSince,
            durationMs,
        });

        throw new Error(`Failed to fetch Azure updates: ${err.message}`);
    }
}

/**
 * Build OData query URL with filters
 * 
 * @param options Fetch options
 * @returns Complete API URL with query parameters
 */
function buildQueryUrl(options: FetchOptions, skip: number = 0): string {
    const params = new URLSearchParams();

    // Page size
    const pageSize = options.limit || DEFAULT_PAGE_SIZE;
    params.set('$top', pageSize.toString());

    if (skip > 0) {
        params.set('$skip', skip.toString());
    }

    // Include count if requested
    if (options.includeCount) {
        params.set('$count', 'true');
    }

    // Filter by modified date for differential sync
    // Use 'ge' (>=) instead of 'gt' (>) to handle multiple updates with same timestamp
    if (options.modifiedSince) {
        params.set('$filter', `modified ge ${options.modifiedSince}`);
    }

    // Sort by newest first so initial pages contain recent updates
    params.set('$orderby', 'modified desc');

    return `${getAzureUpdatesApiEndpoint()}?${params.toString()}`;
}

/**
 * Fetch with timeout
 * 
 * @param url URL to fetch
 * @param timeoutMs Timeout in milliseconds
 * @returns Fetch response
 */
async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'azure-updates-mcp-server/1.0',
            },
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return response;
    } finally {
        clearTimeout(timeoutId);
    }
}

/**
 * Convert API record to our internal model
 * 
 * @param apiRecord Raw API record
 * @returns Normalized Azure update
 */
function convertApiRecordToUpdate(apiRecord: AzureUpdateApiRecord): AzureUpdate {
    // Convert availabilities: merge year+month into ISO date, or null if no date
    const availabilities = (apiRecord.availabilities || []).map(avail => {
        let date: string | null = null;

        if (avail.year && avail.month) {
            // Convert month name to number (January -> 01)
            const monthMap: Record<string, string> = {
                'January': '01', 'February': '02', 'March': '03', 'April': '04',
                'May': '05', 'June': '06', 'July': '07', 'August': '08',
                'September': '09', 'October': '10', 'November': '11', 'December': '12',
            };
            const monthNum = monthMap[avail.month];
            if (monthNum) {
                date = `${avail.year}-${monthNum}-01`; // Use first day of month
            }
        }

        return {
            ring: avail.ring,
            date,
        };
    });

    return {
        id: apiRecord.id,
        title: apiRecord.title,
        description: apiRecord.description || '',
        url: `https://azure.microsoft.com/en-us/updates/?id=${apiRecord.id}`,
        status: apiRecord.status || null,
        locale: apiRecord.locale || null,
        created: apiRecord.created,
        modified: apiRecord.modified,
        tags: apiRecord.tags || [],
        productCategories: apiRecord.productCategories || [],
        products: apiRecord.products || [],
        availabilities,
    };
}

/**
 * Fetch total count of updates from API
 * 
 * @returns Total number of updates available
 */
export async function fetchUpdateCount(): Promise<number> {
    const url = `${getAzureUpdatesApiEndpoint()}?$count=true&$top=1`;

    try {
        const response = await withRetry(
            () => fetchWithTimeout(url, REQUEST_TIMEOUT_MS),
            {
                maxRetries: 2,
                initialDelayMs: 500,
            }
        );

        const data = await response.json() as AzureUpdatesApiResponse;
        return data['@odata.count'] || 0;
    } catch (error) {
        const err = error as Error;
        logger.warn('Failed to fetch update count', { error: err.message });
        return 0;
    }
}
