/**
 * TypeScript interfaces for Azure Update API schema
 * 
 * Based on Azure Updates API response structure
 */

/**
 * Availability ring for an Azure update
 */
export interface AzureUpdateAvailability {
    ring: string; // e.g., 'General Availability', 'Preview', 'Private Preview', 'Retirement'
    date: string | null; // ISO 8601 date, can be null for TBD
}

/**
 * Complete Azure update record from the API
 */
export interface AzureUpdate {
    id: string; // Unique identifier (GUID)
    title: string; // Update title
    description: string; // HTML content from API
    descriptionMarkdown?: string; // Converted markdown (populated locally)
    status: string | null; // Update status (e.g., 'Active', 'Retired')
    locale: string | null; // Language/region code
    created: string; // ISO 8601 timestamp
    modified: string; // ISO 8601 timestamp with 7 decimal precision

    // Multi-valued fields
    tags: string[]; // e.g., ['Retirements', 'Security']
    productCategories: string[]; // e.g., ['Compute', 'AI + Machine Learning']
    products: string[]; // e.g., ['Azure Virtual Machines']
    availabilities: AzureUpdateAvailability[]; // Timeline entries

    // Extensibility for unknown fields
    [key: string]: unknown;
}

/**
 * Database record representation (flattened for SQLite storage)
 */
export interface AzureUpdateRecord {
    id: string;
    title: string;
    description_html: string;
    description_md: string | null;
    status: string | null;
    locale: string | null;
    created: string;
    modified: string;
    metadata: string | null; // JSON blob for unknown fields
}

/**
 * Search result with relevance score
 */
export interface AzureUpdateSearchResult extends AzureUpdate {
    relevanceScore?: number; // BM25 relevance score from FTS5
}

/**
 * API response wrapper from Azure Updates API
 */
export interface AzureUpdatesApiResponse {
    value: AzureUpdate[]; // Array of updates
    '@odata.context'?: string; // OData metadata
    '@odata.nextLink'?: string; // Pagination link (if applicable)
}
