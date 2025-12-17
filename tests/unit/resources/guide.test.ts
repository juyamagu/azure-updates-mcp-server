import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { generateGuideResource, getGuideResourceResponse } from '../../../src/resources/guide.resource.js';
import { upsertUpdate, replaceUpdateTags, replaceUpdateCategories, replaceUpdateProducts, replaceUpdateAvailabilities } from '../../../src/database/queries.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Guide Resource', () => {
    let db: Database.Database;

    beforeEach(() => {
        // Create in-memory database for testing
        db = new Database(':memory:');

        // Apply schema
        const schemaPath = join(__dirname, '../../../src/database/schema.sql');
        const schema = readFileSync(schemaPath, 'utf-8');
        db.exec(schema);

        // Insert test data
        upsertUpdate(db, {
            id: 'test-1',
            title: 'Test Update 1',
            description_html: '<p>Test HTML</p>',
            description_md: 'Test Markdown',
            status: 'Active',
            locale: null,
            created: '2025-01-01T00:00:00.0000000Z',
            modified: '2025-01-01T00:00:00.0000000Z',
            metadata: null,
        });

        replaceUpdateTags(db, 'test-1', ['Security', 'Features']);
        replaceUpdateCategories(db, 'test-1', ['Compute', 'Databases']);
        replaceUpdateProducts(db, 'test-1', ['Azure VM', 'Azure SQL']);
    });

    describe('generateGuideResource', () => {
        it('should generate guide resource with all sections', () => {
            const guide = generateGuideResource(db);

            expect(guide).toHaveProperty('overview');
            expect(guide).toHaveProperty('availableFilters');
            expect(guide).toHaveProperty('usageExamples');
            expect(guide).toHaveProperty('dataFreshness');
            expect(guide).toHaveProperty('queryTips');
        });

        it('should include available filter values', () => {
            const guide = generateGuideResource(db);

            expect(guide.availableFilters.tags).toContain('Security');
            expect(guide.availableFilters.tags).toContain('Features');
            expect(guide.availableFilters.productCategories).toContain('Compute');
            expect(guide.availableFilters.productCategories).toContain('Databases');
            expect(guide.availableFilters.products).toContain('Azure VM');
            expect(guide.availableFilters.products).toContain('Azure SQL');
        });

        it('should calculate data freshness', () => {
            const guide = generateGuideResource(db);

            expect(guide.dataFreshness).toHaveProperty('lastSync');
            expect(guide.dataFreshness).toHaveProperty('hoursSinceSync');
            expect(guide.dataFreshness).toHaveProperty('totalRecords');
            expect(guide.dataFreshness).toHaveProperty('syncStatus');
            expect(guide.dataFreshness.totalRecords).toBe(1);
        });

        it('should include usage examples', () => {
            const guide = generateGuideResource(db);

            expect(Array.isArray(guide.usageExamples)).toBe(true);
            expect(guide.usageExamples.length).toBeGreaterThan(0);

            guide.usageExamples.forEach(example => {
                expect(example).toHaveProperty('description');
                expect(example).toHaveProperty('query');
            });
        });

        it('should include query tips', () => {
            const guide = generateGuideResource(db);

            expect(Array.isArray(guide.queryTips)).toBe(true);
            expect(guide.queryTips.length).toBeGreaterThan(0);
        });

        it('should show total record count in overview', () => {
            const guide = generateGuideResource(db);

            expect(guide.overview).toContain('1');
        });

        it('should mention two-tool architecture in overview', () => {
            const guide = generateGuideResource(db);

            expect(guide.overview).toContain('two-tool architecture');
            expect(guide.overview).toContain('search_azure_updates');
            expect(guide.overview).toContain('get_azure_update');
        });

        it('should include tips about two-step workflow', () => {
            const guide = generateGuideResource(db);

            const workflowTip = guide.queryTips.find(tip => tip.includes('Two-step workflow'));
            expect(workflowTip).toBeDefined();
            expect(workflowTip).toContain('search_azure_updates');
            expect(workflowTip).toContain('get_azure_update');
        });

        it('should include tips about sortBy parameter', () => {
            const guide = generateGuideResource(db);

            const sortByTip = guide.queryTips.find(tip => tip.includes('sortBy'));
            expect(sortByTip).toBeDefined();
            expect(sortByTip).toContain('modified:desc');
            expect(sortByTip).toContain('retirementDate');
        });

        it('should include tips about retirement date filters', () => {
            const guide = generateGuideResource(db);

            const retirementTip = guide.queryTips.find(tip => tip.includes('retirementDateFrom'));
            expect(retirementTip).toBeDefined();
        });

        it('should explain structured filters with AND semantics', () => {
            const guide = generateGuideResource(db);

            const filterTip = guide.queryTips.find(tip =>
                tip.includes('filters.tags') || tip.includes('filters.products') || tip.includes('filters.productCategories')
            );
            expect(filterTip).toBeDefined();
            expect(filterTip).toContain('AND semantics');
        });

        it('should include examples demonstrating sortBy and retirement filters', () => {
            const guide = generateGuideResource(db);

            const retirementExample = guide.usageExamples.find(ex =>
                ex.description.includes('retirement')
            );
            expect(retirementExample).toBeDefined();
            expect(retirementExample?.query).toHaveProperty('sortBy');
            expect(retirementExample?.query).toHaveProperty('filters');
        });

        it('should not include id parameter examples', () => {
            const guide = generateGuideResource(db);

            // No examples should use the old 'id' parameter directly
            const idExample = guide.usageExamples.find(ex => {
                const query = ex.query as Record<string, unknown>;
                return 'id' in query && typeof query.id === 'string';
            });
            expect(idExample).toBeUndefined();
        });
    });

    describe('getGuideResourceResponse', () => {
        it('should return MCP resource response structure', () => {
            const response = getGuideResourceResponse(db);

            expect(response).toHaveProperty('contents');
            expect(Array.isArray(response.contents)).toBe(true);
            expect(response.contents.length).toBe(1);
        });

        it('should include correct URI and mimeType', () => {
            const response = getGuideResourceResponse(db);
            const content = response.contents[0];

            expect(content.uri).toBe('azure-updates://guide');
            expect(content.mimeType).toBe('application/json');
            expect(content).toHaveProperty('text');
        });

        it('should return valid JSON in text field', () => {
            const response = getGuideResourceResponse(db);
            const content = response.contents[0];

            expect(() => JSON.parse(content.text)).not.toThrow();

            const parsed = JSON.parse(content.text);
            expect(parsed).toHaveProperty('overview');
            expect(parsed).toHaveProperty('availableFilters');
        });
    });

    describe('edge cases', () => {
        it('should handle empty database gracefully', () => {
            // Create fresh database with no records
            const emptyDb = new Database(':memory:');
            const schemaPath = join(__dirname, '../../../src/database/schema.sql');
            const schema = readFileSync(schemaPath, 'utf-8');
            emptyDb.exec(schema);

            const guide = generateGuideResource(emptyDb);

            expect(guide.availableFilters.tags).toEqual([]);
            expect(guide.availableFilters.productCategories).toEqual([]);
            expect(guide.availableFilters.products).toEqual([]);
            expect(guide.dataFreshness.totalRecords).toBe(0);
        });

        it('should handle initial checkpoint (never synced)', () => {
            // Fresh database with initial checkpoint
            const freshDb = new Database(':memory:');
            const schemaPath = join(__dirname, '../../../src/database/schema.sql');
            const schema = readFileSync(schemaPath, 'utf-8');
            freshDb.exec(schema);

            const guide = generateGuideResource(freshDb);

            // Should have lastSync as initial value
            expect(guide.dataFreshness.lastSync).toBe('1970-01-01T00:00:00.0000000Z');
            expect(guide.dataFreshness.hoursSinceSync).toBe(0);
        });

        it('should include correct status values', () => {
            // Insert test data with availabilities
            replaceUpdateAvailabilities(db, 'test-1', [
                { ring: 'Preview', date: '2025-01-01' },
                { ring: 'General Availability', date: '2025-06-01' },
                { ring: 'Private Preview', date: null },
                { ring: 'Retirement', date: '2026-01-01' },
            ]);

            const guide = generateGuideResource(db);

            expect(guide.availableFilters.statuses).toContain('Active');
            expect(guide.availableFilters.availabilityRings).toContain('General Availability');
            expect(guide.availableFilters.availabilityRings).toContain('Preview');
            expect(guide.availableFilters.availabilityRings).toContain('Private Preview');
            expect(guide.availableFilters.availabilityRings).toContain('Retirement');
        });
    });
});
