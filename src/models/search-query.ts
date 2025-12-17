/**
 * TypeScript interfaces for search query parsing and validation
 * 
 * Used by the search_azure_updates MCP tool
 */

/**
 * Sort options for search results
 */
export type SortBy =
    | 'relevance' // BM25 relevance score (keyword queries only)
    | 'modified:desc' // Most recently modified first
    | 'modified:asc' // Oldest modified first
    | 'created:desc' // Most recently created first
    | 'created:asc' // Oldest created first
    | 'retirementDate:asc' // Earliest retirement date first
    | 'retirementDate:desc'; // Latest retirement date first

/**
 * Search filters for Azure updates
 */
export interface SearchFilters {
    status?: string; // Filter by status (e.g., 'Active', 'Retired')
    availabilityRing?: string; // Filter by availability ring
    dateFrom?: string; // ISO 8601 date - include updates modified/available on or after this date
    dateTo?: string; // ISO 8601 date - include updates modified/available on or before this date
    retirementDateFrom?: string; // ISO 8601 date - include updates with retirement date on or after this date
    retirementDateTo?: string; // ISO 8601 date - include updates with retirement date on or before this date
    tags?: string[]; // Filter by tags - result must contain ALL specified tags (AND semantics)
    products?: string[]; // Filter by products - result must contain ALL specified products (AND semantics)
    productCategories?: string[]; // Filter by product categories - result must contain ALL specified categories (AND semantics)
}

/**
 * Search query parameters
 */
export interface SearchQuery {
    query?: string; // Natural language search query - searches across title, description, tags, productCategories, products
    filters?: SearchFilters; // Structured filters (AND logic)
    sortBy?: SortBy; // Sort order with direction suffix
    limit?: number; // Max results to return (default: 20, max: 100)
    offset?: number; // Number of results to skip for pagination (default: 0)
}

/**
 * Search result metadata
 */
export interface SearchMetadata {
    totalResults: number; // Total matching results (before limit/offset)
    returnedResults: number; // Number of results in this response
    limit: number; // Applied limit
    offset: number; // Applied offset
    hasMore: boolean; // True if more results available
    queryTime: number; // Query execution time in milliseconds
}

/**
 * Complete search response
 */
export interface SearchResponse<T = unknown> {
    results: T[]; // Array of matching results
    metadata: SearchMetadata; // Query metadata
}

/**
 * Validation error
 */
export interface ValidationError {
    field: string; // Field name that failed validation
    message: string; // Human-readable error message
    value?: unknown; // The invalid value
}

/**
 * Query validation result
 */
export interface QueryValidationResult {
    valid: boolean;
    errors: ValidationError[];
}

/**
 * Available filter options (metadata)
 */
export interface FilterOptions {
    tags: string[];
    productCategories: string[];
    products: string[];
    availabilityRings: string[];
    statuses: string[];
}
