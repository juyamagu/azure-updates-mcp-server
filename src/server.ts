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
import { handleSearchAzureUpdates } from './tools/search-azure-updates.tool.js';
import { handleGetAzureUpdate } from './tools/get-azure-update.tool.js';
import { getGuideResourceResponse } from './resources/guide.resource.js';

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
function registerToolHandlers(server: Server, db: Database.Database): void {
    // List available tools
    server.setRequestHandler(ListToolsRequestSchema, () => {
        logger.debug('ListTools request received');

        return {
            tools: [
                {
                    name: 'get_azure_update',
                    description:
                        'Retrieve complete details of a specific Azure update by ID including full descriptions in Markdown. ' +
                        'Use after search_azure_updates to get detailed content.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            id: {
                                type: 'string',
                                description: 'Unique identifier of the Azure update (required)',
                            },
                        },
                        required: ['id'],
                    },
                },
                {
                    name: 'search_azure_updates',
                    description:
                        'Search and filter Azure service updates. Returns lightweight metadata without descriptions (80% token reduction). ' +
                        'Supports phrase search ("exact phrase"), structured filters (tags/products/categories with AND semantics), ' +
                        'and pagination. Use get_azure_update to retrieve full details.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            query: {
                                type: 'string',
                                description:
                                    'Full-text search query (FTS5 on title + description). Supports phrase search: ' +
                                    'enclose text in double quotes for exact phrases ("virtual machine"), other words use OR logic ' +
                                    'with prefix matching. Case-insensitive. Leave empty to filter only without keyword search.',
                            },
                            filters: {
                                type: 'object',
                                description: 'Structured filters to narrow down search results. All filters use AND logic.',
                                properties: {
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
                                    retirementDateFrom: {
                                        type: 'string',
                                        description: 'ISO 8601 date - include updates with retirement date on or after this date (filters by Retirement availability ring)',
                                    },
                                    retirementDateTo: {
                                        type: 'string',
                                        description: 'ISO 8601 date - include updates with retirement date on or before this date (filters by Retirement availability ring)',
                                    },
                                    tags: {
                                        type: 'array',
                                        items: { type: 'string' },
                                        description: 'Filter by tags - result must contain ALL specified tags (AND semantics)',
                                    },
                                    products: {
                                        type: 'array',
                                        items: { type: 'string' },
                                        description: 'Filter by products - result must contain ALL specified products (AND semantics)',
                                    },
                                    productCategories: {
                                        type: 'array',
                                        items: { type: 'string' },
                                        description: 'Filter by product categories - result must contain ALL specified categories (AND semantics)',
                                    },
                                },
                            },
                            sortBy: {
                                type: 'string',
                                enum: ['modified:desc', 'modified:asc', 'created:desc', 'created:asc', 'retirementDate:asc', 'retirementDate:desc'],
                                description: 'Sort order. Default is "modified:desc". retirementDate sorts require Retirement availability ring.',
                            },
                            limit: {
                                type: 'number',
                                description: 'Maximum number of results to return (1-100, default: 20)',
                                minimum: 1,
                                maximum: 100,
                            },
                            offset: {
                                type: 'number',
                                description: 'Number of results to skip for pagination. Example: offset=20 with limit=20 returns results 21-40. (default: 0)',
                                minimum: 0,
                            },
                        },
                    },
                },
            ],
        };
    });

    // Call tool handler
    server.setRequestHandler(CallToolRequestSchema, (request) => {
        logger.info('CallTool request received', {
            tool: request.params.name,
        });

        if (request.params.name === 'get_azure_update') {
            return handleGetAzureUpdate(db, request.params.arguments);
        }

        if (request.params.name === 'search_azure_updates') {
            return handleSearchAzureUpdates(db, request.params.arguments);
        }

        throw new Error(`Unknown tool: ${request.params.name}`);
    });
}

/**
 * Register resource handlers
 * 
 * T068: Register azure-updates://guide resource with MCP SDK
 */
function registerResourceHandlers(server: Server, db: Database.Database): void {
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
            return getGuideResourceResponse(db);
        }

        throw new Error(`Unknown resource: ${request.params.uri}`);
    });
}
