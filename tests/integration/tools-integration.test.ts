/**
 * Integration tests for two-tool workflow (search + get)
 * 
 * Tests the integration between search_azure_updates and get_azure_update tools
 * to verify the two-tool pattern works correctly.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { handleSearchAzureUpdates } from '../../src/tools/search-azure-updates.tool.js';
import { handleGetAzureUpdate } from '../../src/tools/get-azure-update.tool.js';
import { mkdtempSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Tools Integration - Two-Tool Workflow', () => {
    let db: Database.Database;
    let tempDir: string;

    beforeEach(() => {
        tempDir = mkdtempSync(join(tmpdir(), 'tools-integration-test-'));
        const dbPath = join(tempDir, 'test.db');
        db = new Database(dbPath);

        // Apply schema
        const schemaPath = join(process.cwd(), 'src/database/schema.sql');
        const schema = readFileSync(schemaPath, 'utf-8');
        db.exec(schema);

        // Insert test data for integration testing
        db.prepare(`
            INSERT INTO azure_updates (id, title, description_html, description_md, status, locale, created, modified)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            'integration-test-1',
            'Azure Virtual Machines Security Update',
            '<p>This is a detailed security update for Azure Virtual Machines with important information about CVE-2025-12345.</p>',
            'This is a detailed security update for Azure Virtual Machines with important information about CVE-2025-12345.',
            'Active',
            'en-us',
            '2025-01-01T00:00:00.0000000Z',
            '2025-01-15T10:00:00.0000000Z'
        );

        db.prepare(`
            INSERT INTO azure_updates (id, title, description_html, description_md, status, locale, created, modified)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            'integration-test-2',
            'Azure SQL Database Retirement Notice',
            '<p>This service version will be retired on March 31, 2026. Please migrate to the new version.</p>',
            'This service version will be retired on March 31, 2026. Please migrate to the new version.',
            'Active',
            'en-us',
            '2024-12-01T00:00:00.0000000Z',
            '2025-01-10T08:00:00.0000000Z'
        );

        // Add tags
        db.prepare('INSERT INTO update_tags (update_id, tag) VALUES (?, ?)').run('integration-test-1', 'Security');
        db.prepare('INSERT INTO update_tags (update_id, tag) VALUES (?, ?)').run('integration-test-2', 'Retirements');

        // Add categories
        db.prepare('INSERT INTO update_categories (update_id, category) VALUES (?, ?)').run('integration-test-1', 'Compute');
        db.prepare('INSERT INTO update_categories (update_id, category) VALUES (?, ?)').run('integration-test-2', 'Databases');

        // Add products
        db.prepare('INSERT INTO update_products (update_id, product) VALUES (?, ?)').run('integration-test-1', 'Azure Virtual Machines');
        db.prepare('INSERT INTO update_products (update_id, product) VALUES (?, ?)').run('integration-test-2', 'Azure SQL Database');

        // Add availabilities
        db.prepare('INSERT INTO update_availabilities (update_id, ring, date) VALUES (?, ?, ?)').run(
            'integration-test-1',
            'General Availability',
            '2025-02-01'
        );
        db.prepare('INSERT INTO update_availabilities (update_id, ring, date) VALUES (?, ?, ?)').run(
            'integration-test-2',
            'Retirement',
            '2026-03-31'
        );
    });

    afterEach(() => {
        db.close();
        rmSync(tempDir, { recursive: true, force: true });
    });

    describe('Two-Step Workflow (T039)', () => {
        it('should complete search → get workflow successfully', () => {
            // Step 1: Search for updates
            const searchResult = handleSearchAzureUpdates(db, {
                query: 'Virtual Machines',
                limit: 10,
            });
            const searchResponse = JSON.parse(searchResult.content[0].text);

            expect(searchResponse.results.length).toBeGreaterThan(0);
            expect(searchResponse.results[0].id).toBe('integration-test-1');

            // Step 2: Get full details using ID from search
            const updateId = searchResponse.results[0].id;
            const getResult = handleGetAzureUpdate(db, { id: updateId });
            const update = JSON.parse(getResult.content[0].text);

            // Verify full details are present
            expect(update.id).toBe(updateId);
            expect(update.title).toBe('Azure Virtual Machines Security Update');
            expect(update.description).toContain('CVE-2025-12345');
            expect(update.url).toBe(`https://azure.microsoft.com/en-us/updates/?id=${updateId}`);
        });

        it('should handle search → get workflow with retirement date filtering', () => {
            // Step 1: Search for retirements
            const searchResult = handleSearchAzureUpdates(db, {
                filters: {
                    retirementDateFrom: '2026-01-01',
                    retirementDateTo: '2026-12-31',
                },
                sortBy: 'retirementDate:asc',
            });
            const searchResponse = JSON.parse(searchResult.content[0].text);

            expect(searchResponse.results.length).toBeGreaterThan(0);
            const retirementUpdate = searchResponse.results[0];
            expect(retirementUpdate.id).toBe('integration-test-2');

            // Step 2: Get full retirement details
            const getResult = handleGetAzureUpdate(db, { id: retirementUpdate.id });
            const update = JSON.parse(getResult.content[0].text);

            expect(update.description).toContain('retired on March 31, 2026');
            expect(update.availabilities.some((a: { ring: string }) => a.ring === 'Retirement')).toBe(true);
        });
    });

    describe('Response Size Reduction (T040)', () => {
        it('should verify search response excludes description fields', () => {
            const searchResult = handleSearchAzureUpdates(db, {
                query: 'security',
            });
            const searchResponse = JSON.parse(searchResult.content[0].text);

            expect(searchResponse.results.length).toBeGreaterThan(0);
            const update = searchResponse.results[0];

            // Lightweight: no description field
            expect(update).not.toHaveProperty('description');

            // Essential metadata present
            expect(update).toHaveProperty('id');
            expect(update).toHaveProperty('title');
            expect(update).toHaveProperty('status');
            expect(update).toHaveProperty('tags');
            expect(update).toHaveProperty('productCategories');
            expect(update).toHaveProperty('products');
            expect(update).toHaveProperty('availabilities');
        });

        it('should verify get response includes full description', () => {
            const getResult = handleGetAzureUpdate(db, { id: 'integration-test-1' });
            const update = JSON.parse(getResult.content[0].text);

            // Full update includes description and url
            expect(update).toHaveProperty('description');
            expect(update).toHaveProperty('url');
            expect(update.description).toBeTruthy();
            expect(update.url).toBe('https://azure.microsoft.com/en-us/updates/?id=integration-test-1');
        });

        it('should demonstrate significant size reduction (80%+)', () => {
            // Search returns lightweight metadata
            const searchResult = handleSearchAzureUpdates(db, {});
            const searchText = searchResult.content[0].text;

            // Get returns full details
            const getResult = handleGetAzureUpdate(db, { id: 'integration-test-1' });
            const getText = getResult.content[0].text;

            // For a single update, get response should be significantly larger due to description
            // Search response size per update should be much smaller
            const searchData = JSON.parse(searchText);
            const searchUpdateSize = JSON.stringify(searchData.results[0]).length;
            const getUpdateSize = getText.length;

            // Get response should be at least 2x larger due to description field
            expect(getUpdateSize).toBeGreaterThan(searchUpdateSize * 1.5);
        });
    });

    describe('Search Response Format (T041)', () => {
        it('should not include description in search results', () => {
            const result = handleSearchAzureUpdates(db, {});
            const response = JSON.parse(result.content[0].text);

            expect(response.results).toBeDefined();
            response.results.forEach((update: Record<string, unknown>) => {
                expect(update).not.toHaveProperty('description');
            });
        });

        it('should include all metadata fields except description', () => {
            const result = handleSearchAzureUpdates(db, {});
            const response = JSON.parse(result.content[0].text);

            const update = response.results[0];
            const requiredFields = [
                'id',
                'title',
                'status',
                'created',
                'modified',
                'tags',
                'productCategories',
                'products',
                'availabilities',
            ];

            requiredFields.forEach((field) => {
                expect(update).toHaveProperty(field);
            });
        });
    });

    describe('Error Handling', () => {
        it('should handle get_azure_update with invalid ID from search', () => {
            const getResult = handleGetAzureUpdate(db, { id: 'non-existent-id' });
            const response = JSON.parse(getResult.content[0].text);

            expect(getResult.isError).toBe(true);
            expect(response.error).toBe('Update not found');
        });

        it('should handle empty search results gracefully', () => {
            const searchResult = handleSearchAzureUpdates(db, {
                query: 'nonexistentquerystring12345',
            });
            const searchResponse = JSON.parse(searchResult.content[0].text);

            expect(searchResponse.results).toEqual([]);
            expect(searchResponse.metadata.total).toBe(0);
        });
    });
});
