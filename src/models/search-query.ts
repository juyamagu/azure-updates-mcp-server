/**
 * TypeScript interfaces for search query parsing and validation
 * 
 * Used by the search_azure_updates MCP tool
 */

/**
 * Search filters for Azure updates
 */
export interface SearchFilters {
    tags?: string[]; // Filter by tags (e.g., ['Retirements', 'Security'])
    productCategories?: string[]; // Filter by product categories
    products?: string[]; // Filter by specific products
    status?: string; // Filter by status (e.g., 'Active', 'Retired')
    availabilityRing?: string; // Filter by availability ring
    dateFrom?: string; // ISO 8601 date - minimum date
    dateTo?: string; // ISO 8601 date - maximum date
}

/**
 * Search query parameters
 */
export interface SearchQuery {
    query?: string; // Natural language search query (optional)
    id?: string; // Fetch specific update by ID (overrides all other params)
    filters?: SearchFilters; // Structured filters
    limit?: number; // Max results to return (default: 50)
    offset?: number; // Skip this many results (for pagination)
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
