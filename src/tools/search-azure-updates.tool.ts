/**
 * MCP Tool Handler: search_azure_updates
 * 
 * Tool for searching and filtering Azure updates.
 * Supports natural language queries and structured filters.
 * 
 * @example Natural language search with filters
 * ```json
 * {
 *   "query": "OAuth authentication security",
 *   "filters": {
 *     "tags": ["Security"],
 *     "dateFrom": "2025-01-01"
 *   },
 *   "limit": 10
 * }
 * ```
 * 
 * @example Filter-only search (no keyword)
 * ```json
 * {
 *   "filters": {
 *     "tags": ["Retirements"],
 *     "productCategories": ["Compute"],
 *     "availabilityRing": "Retirement",
 *     "dateFrom": "2026-01-01",
 *     "dateTo": "2026-03-31"
 *   }
 * }
 * ```
 * 
 * @example Keyword-only search
 * ```json
 * {
 *   "query": "machine learning preview features",
 *   "limit": 20
 * }
 * ```
 * 
 * @example Complex multi-filter search
 * ```json
 * {
 *   "query": "database performance",
 *   "filters": {
 *     "productCategories": ["Databases"],
 *     "products": ["Azure SQL Database", "Cosmos DB"],
 *     "status": "Active",
 *     "availabilityRing": "General Availability",
 *     "dateFrom": "2025-01-01"
 *   },
 *   "limit": 50,
 *   "offset": 0
 * }
 * ```
 */

import type Database from 'better-sqlite3';
import type { SearchQuery, SearchFilters } from '../models/search-query.js';
import { searchUpdates } from '../services/search.service.js';
import * as logger from '../utils/logger.js';

// Constants for validation
const VALID_AVAILABILITY_RINGS = [
    'General Availability',
    'Preview',
    'Private Preview',
    'Retirement',
] as const;
const DEFAULT_LIMIT = 20;
const MIN_LIMIT = 1;
const MAX_LIMIT = 100;
const MIN_OFFSET = 0;

/**
 * Tool input schema validation
 */
interface ToolInput {
    query?: string;
    filters?: {
        tags?: string[];
        productCategories?: string[];
        products?: string[];
        status?: string;
        availabilityRing?: string;
        dateFrom?: string;
        dateTo?: string;
        retirementDateFrom?: string;
        retirementDateTo?: string;
    };
    sortBy?: string;
    limit?: number;
    offset?: number;
}

/**
 * Validation result
 */
interface ValidationResult {
    valid: boolean;
    errors: string[];
    searchQuery?: SearchQuery;
}

/**
 * Create error response in MCP format
 * 
 * @param error Error type/category
 * @param details Error details (string or array)
 * @returns MCP tool error response
 */
function createErrorResponse(
    error: string,
    details: string | string[]
): { content: Array<{ type: string; text: string }> } {
    return {
        content: [
            {
                type: 'text',
                text: JSON.stringify({ error, details }, null, 2),
            },
        ],
    };
}

/**
 * Handle search_azure_updates tool call
 * 
 * @param db Database instance
 * @param args Tool arguments
 * @returns MCP tool response
 */
export function handleSearchAzureUpdates(
    db: Database.Database,
    args: unknown
): { content: Array<{ type: string; text: string }> } {
    const startTime = Date.now();

    // T030: Log tool invocation
    logger.info('search_azure_updates tool called', {
        hasArgs: !!args,
        argsType: typeof args,
    });

    try {
        // T028: Input validation
        const validation = validateInput(args);

        if (!validation.valid) {
            logger.warn('search_azure_updates validation failed', {
                errors: validation.errors,
            });

            return createErrorResponse('Validation failed', validation.errors);
        }

        // TypeScript knows searchQuery exists due to validation.valid check
        const searchQuery = validation.searchQuery as SearchQuery;

        // T030: Log search parameters
        logger.info('Executing search', {
            hasKeywordQuery: !!searchQuery.query,
            hasFilters: !!searchQuery.filters,
            limit: searchQuery.limit,
            offset: searchQuery.offset,
        });

        // Execute search
        const response = searchUpdates(db, searchQuery);

        // T030: Log search results
        const queryTime = Date.now() - startTime;
        logger.info('Search completed', {
            totalResults: response.metadata.totalResults,
            returnedResults: response.metadata.returnedResults,
            queryTime,
        });

        // Format response (lightweight: no description fields)
        // Returns AzureUpdateSearchSummary[] for token efficiency
        const formattedResponse = {
            results: response.results.map(update => ({
                id: update.id,
                title: update.title,
                status: update.status,
                tags: update.tags,
                productCategories: update.productCategories,
                products: update.products,
                availabilities: update.availabilities,
                created: update.created,
                modified: update.modified,
                relevance: update.relevanceScore,
            })),
            metadata: {
                total: response.metadata.totalResults,
                limit: response.metadata.limit,
                offset: response.metadata.offset,
                hasMore: response.metadata.hasMore,
                queryTime: response.metadata.queryTime,
            },
        };

        return {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(formattedResponse, null, 2),
                },
            ],
        };
    } catch (error) {
        // T028: Error handling with descriptive messages
        const err = error as Error;

        logger.errorWithStack('search_azure_updates tool error', err, {
            queryTime: Date.now() - startTime,
        });

        return createErrorResponse('Search failed', `${err.message}. An unexpected error occurred while processing your search. Please try again or contact support if the issue persists.`);
    }
}

/**
 * Validate tool input and convert to SearchQuery
 * 
 * T028: Input validation with descriptive error messages
 * 
 * @param args Raw tool arguments
 * @returns Validation result
 */
function validateInput(args: unknown): ValidationResult {
    const errors: string[] = [];

    // Check if args is an object
    if (!args || typeof args !== 'object') {
        return {
            valid: false,
            errors: ['Input must be an object with query parameters'],
        };
    }

    const input = args as ToolInput;

    // Validate pagination parameters
    validatePagination(input, errors);

    // Validate query parameters
    validateQueryParams(input, errors);

    // Validate sortBy parameter
    if (input.sortBy !== undefined) {
        validateSortBy(input.sortBy, errors);
    }

    // Validate filters
    if (input.filters !== undefined) {
        validateFilters(input.filters, errors);
    }

    if (errors.length > 0) {
        return { valid: false, errors };
    }

    // Build SearchQuery
    const searchQuery: SearchQuery = {
        query: input.query,
        sortBy: input.sortBy as SearchQuery['sortBy'],
        limit: input.limit ?? DEFAULT_LIMIT,
        offset: input.offset ?? MIN_OFFSET,
    };

    if (input.filters) {
        searchQuery.filters = buildSearchFilters(input.filters);
    }

    return { valid: true, errors: [], searchQuery };
}

/**
 * Build SearchFilters from validated input filters
 * 
 * @param inputFilters Input filter object
 * @returns SearchFilters object
 */
function buildSearchFilters(inputFilters: ToolInput['filters']): SearchFilters {
    if (!inputFilters) return {};

    const filters: SearchFilters = {};

    // Copy string filters
    if (inputFilters.status) filters.status = inputFilters.status;
    if (inputFilters.availabilityRing) filters.availabilityRing = inputFilters.availabilityRing;
    if (inputFilters.dateFrom) filters.dateFrom = inputFilters.dateFrom;
    if (inputFilters.dateTo) filters.dateTo = inputFilters.dateTo;
    if (inputFilters.retirementDateFrom) filters.retirementDateFrom = inputFilters.retirementDateFrom;
    if (inputFilters.retirementDateTo) filters.retirementDateTo = inputFilters.retirementDateTo;

    // Copy array filters
    if (inputFilters.tags) filters.tags = inputFilters.tags;
    if (inputFilters.products) filters.products = inputFilters.products;
    if (inputFilters.productCategories) filters.productCategories = inputFilters.productCategories;

    return filters;
}

/**
 * Validate pagination parameters
 * 
 * @param input Tool input
 * @param errors Error array to push errors to
 */
function validatePagination(input: ToolInput, errors: string[]): void {
    if (input.limit !== undefined) {
        if (typeof input.limit !== 'number') {
            errors.push('limit must be a number');
        } else if (input.limit < MIN_LIMIT || input.limit > MAX_LIMIT) {
            errors.push(`limit must be between ${MIN_LIMIT} and ${MAX_LIMIT}`);
        }
    }

    if (input.offset !== undefined) {
        if (typeof input.offset !== 'number') {
            errors.push('offset must be a number');
        } else if (input.offset < MIN_OFFSET) {
            errors.push('offset must be non-negative');
        }
    }
}

/**
 * Validate query parameters
 * 
 * @param input Tool input
 * @param errors Error array to push errors to
 */
function validateQueryParams(input: ToolInput, errors: string[]): void {
    if (input.query !== undefined && typeof input.query !== 'string') {
        errors.push('query must be a string');
    }
}

/**
 * Validate sortBy parameter
 * 
 * @param sortBy Sort parameter value
 * @param errors Error array to push errors to
 */
function validateSortBy(sortBy: unknown, errors: string[]): void {
    if (typeof sortBy !== 'string') {
        errors.push('sortBy must be a string');
        return;
    }

    const validSortOptions = [
        'modified:desc',
        'modified:asc',
        'created:desc',
        'created:asc',
        'retirementDate:asc',
        'retirementDate:desc',
    ];

    if (!validSortOptions.includes(sortBy)) {
        errors.push(`sortBy must be one of: ${validSortOptions.join(', ')}`);
    }
}

/**
 * Validate filter parameters
 * 
 * @param filters Filter input
 * @param errors Error array to push errors to
 */
function validateFilters(
    filters: ToolInput['filters'],
    errors: string[]
): void {
    if (typeof filters !== 'object') {
        errors.push('filters must be an object');
        return;
    }

    // Validate array filters
    validateArrayFilter(filters.tags, 'tags', errors);
    validateArrayFilter(filters.productCategories, 'productCategories', errors);
    validateArrayFilter(filters.products, 'products', errors);

    // Validate string filters
    if (filters.status !== undefined && typeof filters.status !== 'string') {
        errors.push('filters.status must be a string');
    }

    // Validate availability ring
    if (filters.availabilityRing !== undefined) {
        if (typeof filters.availabilityRing !== 'string') {
            errors.push('filters.availabilityRing must be a string');
        } else if (!VALID_AVAILABILITY_RINGS.includes(filters.availabilityRing as typeof VALID_AVAILABILITY_RINGS[number])) {
            errors.push(`filters.availabilityRing must be one of: ${VALID_AVAILABILITY_RINGS.join(', ')}`);
        }
    }

    // Validate date filters
    validateDateFilter(filters.dateFrom, 'dateFrom', errors);
    validateDateFilter(filters.dateTo, 'dateTo', errors);
    validateDateFilter(filters.retirementDateFrom, 'retirementDateFrom', errors);
    validateDateFilter(filters.retirementDateTo, 'retirementDateTo', errors);
}

/**
 * Validate an array filter parameter
 * 
 * @param value Filter value
 * @param fieldName Field name for error messages
 * @param errors Error array to push errors to
 */
function validateArrayFilter(
    value: unknown,
    fieldName: string,
    errors: string[]
): void {
    if (value === undefined) {
        return;
    }

    if (!Array.isArray(value)) {
        errors.push(`filters.${fieldName} must be an array`);
    } else if (!value.every(item => typeof item === 'string')) {
        errors.push(`filters.${fieldName} must be an array of strings`);
    }
}

/**
 * Validate a date filter parameter
 * 
 * @param value Date string value
 * @param fieldName Field name for error messages
 * @param errors Error array to push errors to
 */
function validateDateFilter(
    value: unknown,
    fieldName: string,
    errors: string[]
): void {
    if (value === undefined) {
        return;
    }

    if (typeof value !== 'string') {
        errors.push(`filters.${fieldName} must be an ISO 8601 date string`);
    } else if (!isValidIsoDate(value)) {
        errors.push(`filters.${fieldName} must be a valid ISO 8601 date`);
    }
}

/**
 * Validate ISO 8601 date string
 * 
 * @param dateString Date string to validate
 * @returns True if valid ISO 8601 date
 */
function isValidIsoDate(dateString: string): boolean {
    const date = new Date(dateString);
    return !isNaN(date.getTime()) && dateString.includes('-');
}
