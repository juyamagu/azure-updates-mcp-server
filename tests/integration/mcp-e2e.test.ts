/**
 * End-to-End MCP Server Tests
 * 
 * Tests the complete MCP server lifecycle with mock data:
 * - Server initialization
 * - Tool registration and discovery
 * - Tool invocation via MCP SDK
 * - Resource registration and retrieval
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { createMCPServer } from '../../src/server.js';
import { mkdtempSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('MCP Server E2E Tests', () => {
    let db: Database.Database;
    let server: Server;
    let tempDir: string;

    beforeEach(() => {
        // Create temporary database with test data
        tempDir = mkdtempSync(join(tmpdir(), 'mcp-e2e-test-'));
        const dbPath = join(tempDir, 'test.db');
        db = new Database(dbPath);

        // Apply schema
        const schemaPath = join(process.cwd(), 'src/database/schema.sql');
        const schema = readFileSync(schemaPath, 'utf-8');
        db.exec(schema);

        // Insert test data
        insertTestData(db);

        // Create MCP server instance
        server = createMCPServer({
            name: 'azure-updates-mcp-server-test',
            version: '1.0.0-test',
            database: db,
        });
    });

    afterEach(() => {
        db.close();
        rmSync(tempDir, { recursive: true, force: true });
    });

    describe('Server Initialization', () => {
        it('should create MCP server with correct configuration', () => {
            expect(server).toBeDefined();
        });
    });

    describe('Tool Discovery', () => {
        it('should list all registered tools', async () => {
            // @ts-expect-error - Accessing private handler for testing
            const handler = server._requestHandlers.get('tools/list');
            expect(handler).toBeDefined();

            const response = await handler!({ method: 'tools/list', params: {} });

            expect(response.tools).toHaveLength(2);

            const toolNames = response.tools.map((t: { name: string }) => t.name);
            expect(toolNames).toContain('search_azure_updates');
            expect(toolNames).toContain('get_azure_update');
        });

        it('should provide tool schemas with required fields', async () => {
            // @ts-expect-error - Accessing private handler for testing
            const handler = server._requestHandlers.get('tools/list');
            const response = await handler!({ method: 'tools/list', params: {} });

            const searchTool = response.tools.find((t: { name: string }) => t.name === 'search_azure_updates');
            expect(searchTool).toBeDefined();
            expect(searchTool.description).toContain('Search and filter');
            expect(searchTool.inputSchema).toBeDefined();
            expect(searchTool.inputSchema.properties).toHaveProperty('query');
            expect(searchTool.inputSchema.properties).toHaveProperty('filters');

            const getTool = response.tools.find((t: { name: string }) => t.name === 'get_azure_update');
            expect(getTool).toBeDefined();
            expect(getTool.description).toContain('Retrieve complete details');
            expect(getTool.inputSchema.required).toContain('id');
        });
    });

    describe('Tool Invocation - search_azure_updates', () => {
        it('should execute search with query parameter', async () => {
            // @ts-expect-error - Accessing private handler for testing
            const handler = server._requestHandlers.get('tools/call');
            const response = await handler!({
                method: 'tools/call',
                params: {
                    name: 'search_azure_updates',
                    arguments: {
                        query: 'Virtual Machines',
                        limit: 10,
                    },
                },
            });

            expect(response.content).toBeDefined();
            expect(response.content).toHaveLength(1);
            expect(response.content[0].type).toBe('text');

            const result = JSON.parse(response.content[0].text);
            expect(result.results).toBeDefined();
            expect(result.metadata).toBeDefined();
            expect(result.metadata.total).toBeGreaterThanOrEqual(0);
        });

        it('should execute search with filters', async () => {
            // @ts-expect-error - Accessing private handler for testing
            const handler = server._requestHandlers.get('tools/call');
            const response = await handler!({
                method: 'tools/call',
                params: {
                    name: 'search_azure_updates',
                    arguments: {
                        filters: {
                            tags: ['Security'],
                            productCategories: ['Compute'],
                        },
                    },
                },
            });

            const result = JSON.parse(response.content[0].text);
            expect(result.results).toBeDefined();

            if (result.results.length > 0) {
                const update = result.results[0];
                expect(update.tags).toContain('Security');
                expect(update.productCategories).toContain('Compute');
            }
        });

        it('should return lightweight results without description', async () => {
            // @ts-expect-error - Accessing private handler for testing
            const handler = server._requestHandlers.get('tools/call');
            const response = await handler!({
                method: 'tools/call',
                params: {
                    name: 'search_azure_updates',
                    arguments: { limit: 5 },
                },
            });

            const result = JSON.parse(response.content[0].text);

            if (result.results.length > 0) {
                const update = result.results[0];
                expect(update).toHaveProperty('id');
                expect(update).toHaveProperty('title');
                expect(update).not.toHaveProperty('description');
            }
        });

        it('should handle validation errors gracefully', async () => {
            // @ts-expect-error - Accessing private handler for testing
            const handler = server._requestHandlers.get('tools/call');
            const response = await handler!({
                method: 'tools/call',
                params: {
                    name: 'search_azure_updates',
                    arguments: {
                        limit: 500, // Exceeds MAX_LIMIT
                    },
                },
            });

            const result = JSON.parse(response.content[0].text);
            expect(result.error).toBe('Validation failed');
            expect(result.details).toBeDefined();
        });
    });

    describe('Tool Invocation - get_azure_update', () => {
        it('should retrieve full update details by ID', async () => {
            // @ts-expect-error - Accessing private handler for testing
            const handler = server._requestHandlers.get('tools/call');
            const response = await handler!({
                method: 'tools/call',
                params: {
                    name: 'get_azure_update',
                    arguments: {
                        id: 'e2e-test-1',
                    },
                },
            });

            expect(response.isError).toBeFalsy();
            const update = JSON.parse(response.content[0].text);

            expect(update.id).toBe('e2e-test-1');
            expect(update.title).toBeDefined();
            expect(update.description).toBeDefined();
            expect(update.url).toBe('https://azure.microsoft.com/en-us/updates/?id=e2e-test-1');
            expect(update).not.toHaveProperty('descriptionMarkdown');
        });

        it('should return error for non-existent ID', async () => {
            // @ts-expect-error - Accessing private handler for testing
            const handler = server._requestHandlers.get('tools/call');
            const response = await handler!({
                method: 'tools/call',
                params: {
                    name: 'get_azure_update',
                    arguments: {
                        id: 'non-existent-id',
                    },
                },
            });

            expect(response.isError).toBe(true);
            const result = JSON.parse(response.content[0].text);
            expect(result.error).toBe('Update not found');
        });

        it('should handle validation errors', async () => {
            // @ts-expect-error - Accessing private handler for testing
            const handler = server._requestHandlers.get('tools/call');
            const response = await handler!({
                method: 'tools/call',
                params: {
                    name: 'get_azure_update',
                    arguments: {
                        id: '', // Empty ID
                    },
                },
            });

            expect(response.isError).toBe(true);
            const result = JSON.parse(response.content[0].text);
            expect(result.error).toBe('Validation failed');
        });
    });

    describe('Two-Tool Workflow via MCP SDK', () => {
        it('should complete search → get workflow', async () => {
            // @ts-expect-error - Accessing private handler for testing
            const handler = server._requestHandlers.get('tools/call');

            // Step 1: Search
            const searchResponse = await handler!({
                method: 'tools/call',
                params: {
                    name: 'search_azure_updates',
                    arguments: {
                        query: 'Security Update',
                        limit: 10,
                    },
                },
            });

            const searchResult = JSON.parse(searchResponse.content[0].text);
            expect(searchResult.results.length).toBeGreaterThan(0);

            // Step 2: Get full details
            const updateId = searchResult.results[0].id;
            const getResponse = await handler!({
                method: 'tools/call',
                params: {
                    name: 'get_azure_update',
                    arguments: { id: updateId },
                },
            });

            const update = JSON.parse(getResponse.content[0].text);
            expect(update.id).toBe(updateId);
            expect(update.description).toBeDefined();
        });
    });

    describe('Resource Discovery', () => {
        it('should list all registered resources', async () => {
            // @ts-expect-error - Accessing private handler for testing
            const handler = server._requestHandlers.get('resources/list');
            const response = await handler!({ method: 'resources/list', params: {} });

            expect(response.resources).toHaveLength(1);
            expect(response.resources[0].uri).toBe('azure-updates://guide');
            expect(response.resources[0].name).toBe('Azure Updates Search Guide');
        });

        it('should retrieve guide resource', async () => {
            // @ts-expect-error - Accessing private handler for testing
            const handler = server._requestHandlers.get('resources/read');
            const response = await handler!({
                method: 'resources/read',
                params: {
                    uri: 'azure-updates://guide',
                },
            });

            expect(response.contents).toHaveLength(1);
            expect(response.contents[0].mimeType).toBe('application/json');

            const guide = JSON.parse(response.contents[0].text);
            expect(guide).toHaveProperty('overview');
            expect(guide).toHaveProperty('availableFilters');
            expect(guide.availableFilters).toHaveProperty('tags');
            expect(guide.availableFilters).toHaveProperty('productCategories');
            expect(guide.availableFilters).toHaveProperty('products');
            expect(guide.availableFilters).toHaveProperty('availabilityRings');
        });
    });

    describe('Error Handling', () => {
        it('should handle unknown tool invocation', async () => {
            // @ts-expect-error - Accessing private handler for testing
            const handler = server._requestHandlers.get('tools/call');

            await expect(
                handler!({
                    method: 'tools/call',
                    params: {
                        name: 'unknown_tool',
                        arguments: {},
                    },
                })
            ).rejects.toThrow('Unknown tool');
        });

        it('should handle unknown resource request', async () => {
            // @ts-expect-error - Accessing private handler for testing
            const handler = server._requestHandlers.get('resources/read');

            await expect(async () => {
                await handler!({
                    method: 'resources/read',
                    params: {
                        uri: 'azure-updates://unknown',
                    },
                });
            }).rejects.toThrow(/Unknown resource/);
        });
    });
});

/**
 * Insert test data for E2E testing
 */
function insertTestData(db: Database.Database): void {
    // Insert updates
    db.prepare(`
        INSERT INTO azure_updates (id, title, description_html, description_md, status, locale, created, modified)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        'e2e-test-1',
        'Azure Virtual Machines Security Update',
        '<p>Critical security patch for Azure VMs addressing CVE-2025-12345</p>',
        'Critical security patch for Azure VMs addressing CVE-2025-12345',
        'Active',
        'en-us',
        '2025-01-01T00:00:00.0000000Z',
        '2025-01-15T10:00:00.0000000Z'
    );

    db.prepare(`
        INSERT INTO azure_updates (id, title, description_html, description_md, status, locale, created, modified)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        'e2e-test-2',
        'Azure SQL Database Retirement Notice',
        '<p>Version 11.0 will be retired on March 31, 2026</p>',
        'Version 11.0 will be retired on March 31, 2026',
        'Active',
        'en-us',
        '2024-12-01T00:00:00.0000000Z',
        '2025-01-10T08:00:00.0000000Z'
    );

    db.prepare(`
        INSERT INTO azure_updates (id, title, description_html, description_md, status, locale, created, modified)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        'e2e-test-3',
        'Azure Machine Learning Preview Features',
        '<p>New preview features for AutoML and model deployment</p>',
        'New preview features for AutoML and model deployment',
        'In preview',
        'en-us',
        '2025-01-20T00:00:00.0000000Z',
        '2025-01-20T12:00:00.0000000Z'
    );

    // Add tags
    db.prepare('INSERT INTO update_tags (update_id, tag) VALUES (?, ?)').run('e2e-test-1', 'Security');
    db.prepare('INSERT INTO update_tags (update_id, tag) VALUES (?, ?)').run('e2e-test-1', 'Features');
    db.prepare('INSERT INTO update_tags (update_id, tag) VALUES (?, ?)').run('e2e-test-2', 'Retirements');
    db.prepare('INSERT INTO update_tags (update_id, tag) VALUES (?, ?)').run('e2e-test-3', 'Features');

    // Add categories
    db.prepare('INSERT INTO update_categories (update_id, category) VALUES (?, ?)').run('e2e-test-1', 'Compute');
    db.prepare('INSERT INTO update_categories (update_id, category) VALUES (?, ?)').run('e2e-test-2', 'Databases');
    db.prepare('INSERT INTO update_categories (update_id, category) VALUES (?, ?)').run('e2e-test-3', 'AI + Machine Learning');

    // Add products
    db.prepare('INSERT INTO update_products (update_id, product) VALUES (?, ?)').run('e2e-test-1', 'Azure Virtual Machines');
    db.prepare('INSERT INTO update_products (update_id, product) VALUES (?, ?)').run('e2e-test-2', 'Azure SQL Database');
    db.prepare('INSERT INTO update_products (update_id, product) VALUES (?, ?)').run('e2e-test-3', 'Azure Machine Learning');

    // Add availabilities
    db.prepare('INSERT INTO update_availabilities (update_id, ring, date) VALUES (?, ?, ?)').run(
        'e2e-test-1',
        'General Availability',
        '2025-02-01'
    );
    db.prepare('INSERT INTO update_availabilities (update_id, ring, date) VALUES (?, ?, ?)').run(
        'e2e-test-2',
        'Retirement',
        '2026-03-31'
    );
    db.prepare('INSERT INTO update_availabilities (update_id, ring, date) VALUES (?, ?, ?)').run(
        'e2e-test-3',
        'Preview',
        '2025-01-20'
    );
}
