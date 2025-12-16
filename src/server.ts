/**
 * MCP Server implementation for Azure Updates
 * 
 * Registers tools and resources with the MCP SDK
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
    ListToolsRequestSchema,
    CallToolRequestSchema,
    ListResourcesRequestSchema,
    ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type Database from 'better-sqlite3';

import * as logger from './utils/logger.js';

/**
 * MCP Server configuration
 */
export interface ServerConfig {
    name: string;
    version: string;
    database: Database.Database;
}

/**
 * Create and configure the MCP server
 */
export function createMCPServer(config: ServerConfig): Server {
    const server = new Server(
        {
            name: config.name,
            version: config.version,
        },
        {
            capabilities: {
                tools: {},
                resources: {},
            },
        }
    );

    // Register handlers
    registerToolHandlers(server, config.database);
    registerResourceHandlers(server, config.database);

    logger.info('MCP server created', {
        name: config.name,
        version: config.version,
        capabilities: ['tools', 'resources'],
    });

    return server;
}

/**
 * Register tool handlers
 */
function registerToolHandlers(server: Server, _db: Database.Database): void {
    // List available tools
    server.setRequestHandler(ListToolsRequestSchema, () => {
        logger.debug('ListTools request received');

        return {
            tools: [
                {
                    name: 'search_azure_updates',
                    description:
                        'Search, filter, and retrieve Azure service updates. Supports natural language queries with ' +
                        'keyword matching, multi-dimensional filtering (tags, categories, products, dates), and ' +
                        'fetching specific updates by ID. This is the primary tool for accessing Azure Updates data.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            query: {
                                type: 'string',
                                description:
                                    'Natural language search query or keywords to match in title and description. ' +
                                    'Uses full-text search with BM25 relevance ranking. Leave empty to filter only without keyword search.',
                            },
                            id: {
                                type: 'string',
                                description:
                                    'Fetch a specific Azure update by its unique ID. When provided, all other parameters are ignored.',
                            },
                            filters: {
                                type: 'object',
                                description: 'Structured filters to narrow down search results. All filters use AND logic.',
                                properties: {
                                    tags: {
                                        type: 'array',
                                        items: { type: 'string' },
                                        description: "Filter by update tags (e.g., ['Retirements', 'Security'])",
                                    },
                                    productCategories: {
                                        type: 'array',
                                        items: { type: 'string' },
                                        description: "Filter by Azure product categories (e.g., ['Compute', 'AI + Machine Learning'])",
                                    },
                                    products: {
                                        type: 'array',
                                        items: { type: 'string' },
                                        description: "Filter by specific Azure products (e.g., ['Azure Virtual Machines'])",
                                    },
                                    status: {
                                        type: 'string',
                                        description: "Filter by update status (e.g., 'Active', 'Retired')",
                                    },
                                    availabilityRing: {
                                        type: 'string',
                                        enum: ['General Availability', 'Preview', 'Private Preview', 'Retirement'],
                                        description: 'Filter by availability ring',
                                    },
                                    dateFrom: {
                                        type: 'string',
                                        description: 'ISO 8601 date - include updates modified/available on or after this date',
                                    },
                                    dateTo: {
                                        type: 'string',
                                        description: 'ISO 8601 date - include updates modified/available on or before this date',
                                    },
                                },
                            },
                            limit: {
                                type: 'number',
                                description: 'Maximum number of results to return (1-100, default: 50)',
                                minimum: 1,
                                maximum: 100,
                            },
                            offset: {
                                type: 'number',
                                description: 'Number of results to skip for pagination (default: 0)',
                                minimum: 0,
                            },
                        },
                    },
                },
            ],
        };
    });

    // Call tool handler (actual implementation will be in tools/ directory)
    server.setRequestHandler(CallToolRequestSchema, (request) => {
        logger.info('CallTool request received', {
            tool: request.params.name,
        });

        if (request.params.name === 'search_azure_updates') {
            // Tool implementation will be imported from tools/search-azure-updates.tool.ts
            // For now, return a placeholder
            return {
                content: [
                    {
                        type: 'text',
                        text: 'Tool implementation pending - will be completed in Phase 3 (User Story 1)',
                    },
                ],
            };
        }

        throw new Error(`Unknown tool: ${request.params.name}`);
    });
}

/**
 * Register resource handlers
 */
function registerResourceHandlers(server: Server, _db: Database.Database): void {
    // List available resources
    server.setRequestHandler(ListResourcesRequestSchema, () => {
        logger.debug('ListResources request received');

        return {
            resources: [
                {
                    uri: 'azure-updates://guide',
                    name: 'Azure Updates Search Guide',
                    description:
                        'Available filter values and metadata to help construct valid search queries. ' +
                        'Includes all available tags, product categories, products, availability rings, and data freshness info.',
                    mimeType: 'application/json',
                },
            ],
        };
    });

    // Read resource handler (actual implementation will be in resources/ directory)
    server.setRequestHandler(ReadResourceRequestSchema, (request) => {
        logger.info('ReadResource request received', {
            uri: request.params.uri,
        });

        if (request.params.uri === 'azure-updates://guide') {
            // Resource implementation will be imported from resources/guide.resource.ts
            // For now, return a placeholder
            return {
                contents: [
                    {
                        uri: request.params.uri,
                        mimeType: 'application/json',
                        text: JSON.stringify({
                            message: 'Resource implementation pending - will be completed in Phase 8 (User Story 6)',
                        }),
                    },
                ],
            };
        }

        throw new Error(`Unknown resource: ${request.params.uri}`);
    });
}
