import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { handleSearchAzureUpdates } from '../../../src/tools/search-azure-updates.tool.js';
import { mkdtempSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Search Azure Updates Tool', () => {
    let db: Database.Database;
    let tempDir: string;

    beforeEach(() => {
        tempDir = mkdtempSync(join(tmpdir(), 'tool-test-'));
        const dbPath = join(tempDir, 'test.db');
        db = new Database(dbPath);

        // Apply schema
        const schemaPath = join(process.cwd(), 'src/database/schema.sql');
        const schema = readFileSync(schemaPath, 'utf-8');

        // Execute entire schema at once
        db.exec(schema);

        // Insert test data
        db.prepare(`
            INSERT INTO azure_updates (id, title, description_html, description_md, status, locale, created, modified)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            'test-1',
            'Test Update',
            '<p>Test</p>',
            'Test',
            'Active',
            'en-us',
            '2025-01-01T00:00:00.0000000Z',
            '2025-01-01T00:00:00.0000000Z'
        );

        db.prepare('INSERT INTO update_tags (update_id, tag) VALUES (?, ?)').run('test-1', 'Security');

        // Add test data with retirement dates for sorting/filtering tests
        db.prepare(`
            INSERT INTO azure_updates (id, title, description_html, description_md, status, locale, created, modified)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            'retire-1',
            'Service A Retirement',
            '<p>Retiring soon</p>',
            'Retiring soon',
            'Active',
            'en-us',
            '2025-01-01T00:00:00.0000000Z',
            '2025-01-15T00:00:00.0000000Z'
        );

        db.prepare(`
            INSERT INTO azure_updates (id, title, description_html, description_md, status, locale, created, modified)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            'retire-2',
            'Service B Retirement',
            '<p>Retiring later</p>',
            'Retiring later',
            'Active',
            'en-us',
            '2025-01-01T00:00:00.0000000Z',
            '2025-01-10T00:00:00.0000000Z'
        );

        // Add retirement dates
        db.prepare('INSERT INTO update_availabilities (update_id, ring, date) VALUES (?, ?, ?)').run(
            'retire-1',
            'Retirement',
            '2026-03-31'
        );

        db.prepare('INSERT INTO update_availabilities (update_id, ring, date) VALUES (?, ?, ?)').run(
            'retire-2',
            'Retirement',
            '2026-06-30'
        );

        db.prepare('INSERT INTO update_tags (update_id, tag) VALUES (?, ?)').run('retire-1', 'Retirements');
        db.prepare('INSERT INTO update_tags (update_id, tag) VALUES (?, ?)').run('retire-2', 'Retirements');
    });

    afterEach(() => {
        db.close();
        rmSync(tempDir, { recursive: true, force: true });
    });

    describe('Input Validation', () => {
        it('should reject non-object input', () => {
            const result = handleSearchAzureUpdates(db, 'invalid');
            const response = JSON.parse(result.content[0].text);

            expect(response.error).toBe('Validation failed');
            expect(response.details).toEqual(expect.arrayContaining([expect.stringContaining('Input must be an object')]));
        });

        it('should reject invalid limit', () => {
            const result = handleSearchAzureUpdates(db, { limit: 'not-a-number' });
            const response = JSON.parse(result.content[0].text);

            expect(response.error).toBe('Validation failed');
            expect(response.details).toContain('limit must be a number');
        });

        it('should reject limit out of range', () => {
            const result = handleSearchAzureUpdates(db, { limit: 200 });
            const response = JSON.parse(result.content[0].text);

            expect(response.error).toBe('Validation failed');
            expect(response.details).toContain('limit must be between 1 and 100');
        });

        it('should reject negative offset', () => {
            const result = handleSearchAzureUpdates(db, { offset: -1 });
            const response = JSON.parse(result.content[0].text);

            expect(response.error).toBe('Validation failed');
            expect(response.details).toContain('offset must be non-negative');
        });

        it('should reject invalid query type', () => {
            const result = handleSearchAzureUpdates(db, { query: 123 });
            const response = JSON.parse(result.content[0].text);

            expect(response.error).toBe('Validation failed');
            expect(response.details).toContain('query must be a string');
        });

        it('should reject invalid filters type', () => {
            const result = handleSearchAzureUpdates(db, { filters: 'invalid' });
            const response = JSON.parse(result.content[0].text);

            expect(response.error).toBe('Validation failed');
            expect(response.details).toContain('filters must be an object');
        });

        it('should reject invalid availability ring', () => {
            const result = handleSearchAzureUpdates(db, {
                filters: { availabilityRing: 'Invalid Ring' }
            });
            const response = JSON.parse(result.content[0].text);

            expect(response.error).toBe('Validation failed');
            expect(response.details.some((d: string) => d.includes('availabilityRing must be one of'))).toBe(true);
        });

        it('should reject invalid date format', () => {
            const result = handleSearchAzureUpdates(db, {
                filters: { dateFrom: 'not-a-date' }
            });
            const response = JSON.parse(result.content[0].text);

            expect(response.error).toBe('Validation failed');
            expect(response.details).toContain('filters.dateFrom must be a valid ISO 8601 date');
        });

        it('should accept valid availability rings', () => {
            const validRings = ['General Availability', 'Preview', 'Private Preview', 'Retirement'];

            for (const ring of validRings) {
                const result = handleSearchAzureUpdates(db, {
                    filters: { availabilityRing: ring }
                });
                const response = JSON.parse(result.content[0].text);

                expect(response.error).toBeUndefined();
            }
        });
    });

    describe('Successful Queries', () => {
        it('should return results for valid query', () => {
            const result = handleSearchAzureUpdates(db, { query: 'Test' });
            const response = JSON.parse(result.content[0].text);

            expect(response.results).toBeDefined();
            expect(response.metadata).toBeDefined();
            expect(Array.isArray(response.results)).toBe(true);
        });

        it('should return results for empty query', () => {
            const result = handleSearchAzureUpdates(db, {});
            const response = JSON.parse(result.content[0].text);

            expect(response.results).toBeDefined();
            expect(response.results.length).toBeGreaterThan(0);
        });

        it('should return metadata with query info', () => {
            const result = handleSearchAzureUpdates(db, { limit: 10 });
            const response = JSON.parse(result.content[0].text);

            expect(response.metadata.total).toBeDefined();
            expect(response.metadata.limit).toBe(10);
            expect(response.metadata.offset).toBeDefined();
            expect(response.metadata.hasMore).toBeDefined();
            expect(response.metadata.queryTime).toBeDefined();
        });

        it('should include all update fields (excluding description)', () => {
            const result = handleSearchAzureUpdates(db, {});
            const response = JSON.parse(result.content[0].text);

            const update = response.results[0];
            expect(update).toHaveProperty('id');
            expect(update).toHaveProperty('title');
            expect(update).not.toHaveProperty('description'); // Lightweight: no description
            expect(update).not.toHaveProperty('descriptionMarkdown'); // Lightweight: no description
            expect(update).toHaveProperty('status');
            expect(update).toHaveProperty('tags');
            expect(update).toHaveProperty('productCategories');
            expect(update).toHaveProperty('products');
            expect(update).toHaveProperty('availabilities');
            expect(update).toHaveProperty('created');
            expect(update).toHaveProperty('modified');
        });

        it('should return correct response structure', () => {
            const result = handleSearchAzureUpdates(db, {});

            expect(result).toHaveProperty('content');
            expect(Array.isArray(result.content)).toBe(true);
            expect(result.content[0]).toHaveProperty('type');
            expect(result.content[0]).toHaveProperty('text');
            expect(result.content[0].type).toBe('text');

            // Should be valid JSON
            expect(() => JSON.parse(result.content[0].text)).not.toThrow();
        });
    });

    describe('Error Handling', () => {
        it('should handle database errors gracefully', () => {
            // Close database to simulate error
            db.close();

            const result = handleSearchAzureUpdates(db, {});
            const response = JSON.parse(result.content[0].text);

            expect(response.error).toBe('Search failed');
            expect(response.details).toBeDefined();
            expect(response.details).toContain('unexpected error');
        });
    });

    describe('Retirement Date Filtering', () => {
        it('should filter by retirement date from', () => {
            const result = handleSearchAzureUpdates(db, {
                filters: {
                    retirementDateFrom: '2026-04-01',
                },
            });
            const response = JSON.parse(result.content[0].text);

            expect(response.results.length).toBe(1);
            expect(response.results[0].id).toBe('retire-2');
        });

        it('should filter by retirement date to', () => {
            const result = handleSearchAzureUpdates(db, {
                filters: {
                    retirementDateTo: '2026-05-31',
                },
            });
            const response = JSON.parse(result.content[0].text);

            expect(response.results.length).toBe(1);
            expect(response.results[0].id).toBe('retire-1');
        });

        it('should filter by retirement date range', () => {
            const result = handleSearchAzureUpdates(db, {
                filters: {
                    retirementDateFrom: '2026-01-01',
                    retirementDateTo: '2026-12-31',
                },
            });
            const response = JSON.parse(result.content[0].text);

            expect(response.results.length).toBe(2);
            expect(response.results.some((r: { id: string }) => r.id === 'retire-1')).toBe(true);
            expect(response.results.some((r: { id: string }) => r.id === 'retire-2')).toBe(true);
        });

        it('should validate retirement date format', () => {
            const result = handleSearchAzureUpdates(db, {
                filters: {
                    retirementDateFrom: 'invalid-date',
                },
            });
            const response = JSON.parse(result.content[0].text);

            expect(response.error).toBe('Validation failed');
            expect(response.details.some((d: string) => d.includes('retirementDateFrom') && d.includes('ISO 8601'))).toBe(true);
        });
    });

    describe('SortBy Parameter', () => {
        it('should sort by modified date descending (default)', () => {
            const result = handleSearchAzureUpdates(db, {});
            const response = JSON.parse(result.content[0].text);

            // retire-1 has modified date 2025-01-15 (newest)
            expect(response.results[0].id).toBe('retire-1');
        });

        it('should sort by modified date ascending', () => {
            const result = handleSearchAzureUpdates(db, {
                sortBy: 'modified:asc',
            });
            const response = JSON.parse(result.content[0].text);

            // test-1 has modified date 2025-01-01 (oldest)
            expect(response.results[0].id).toBe('test-1');
        });

        it('should sort by created date descending', () => {
            const result = handleSearchAzureUpdates(db, {
                sortBy: 'created:desc',
            });
            const response = JSON.parse(result.content[0].text);

            // All have same created date, so order may vary
            expect(response.results.length).toBeGreaterThan(0);
        });

        it('should sort by retirement date ascending', () => {
            const result = handleSearchAzureUpdates(db, {
                sortBy: 'retirementDate:asc',
            });
            const response = JSON.parse(result.content[0].text);

            // retire-1 has retirement date 2026-03-31 (earliest)
            const retirementUpdates = response.results.filter(
                (r: { id: string }) => r.id.startsWith('retire-')
            );
            expect(retirementUpdates[0].id).toBe('retire-1');
        });

        it('should sort by retirement date descending', () => {
            const result = handleSearchAzureUpdates(db, {
                sortBy: 'retirementDate:desc',
            });
            const response = JSON.parse(result.content[0].text);

            // retire-2 has retirement date 2026-06-30 (latest)
            const retirementUpdates = response.results.filter(
                (r: { id: string }) => r.id.startsWith('retire-')
            );
            expect(retirementUpdates[0].id).toBe('retire-2');
        });

        it('should reject invalid sortBy value', () => {
            const result = handleSearchAzureUpdates(db, {
                sortBy: 'invalid:sort',
            });
            const response = JSON.parse(result.content[0].text);

            expect(response.error).toBe('Validation failed');
            expect(response.details.some((d: string) => d.includes('sortBy must be one of'))).toBe(true);
        });

        it('should reject non-string sortBy', () => {
            const result = handleSearchAzureUpdates(db, {
                sortBy: 123,
            });
            const response = JSON.parse(result.content[0].text);

            expect(response.error).toBe('Validation failed');
            expect(response.details).toContain('sortBy must be a string');
        });
    });

    describe('Logging', () => {
        it('should log tool invocations', () => {
            // This test verifies the tool runs without errors
            // Actual logging is tested by logger tests
            const result = handleSearchAzureUpdates(db, {});

            expect(result).toBeDefined();
        });
    });

    describe('Tags Filter with AND Semantics', () => {
        beforeEach(() => {
            // Add more test data with multiple tags
            db.prepare(`
                INSERT INTO azure_updates (id, title, description_html, description_md, status, locale, created, modified)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                'multi-tag-1',
                'Update with multiple tags',
                '<p>Test</p>',
                'Test',
                'Active',
                'en-us',
                '2025-01-05T00:00:00.0000000Z',
                '2025-01-05T00:00:00.0000000Z'
            );

            db.prepare('INSERT INTO update_tags (update_id, tag) VALUES (?, ?)').run('multi-tag-1', 'Security');
            db.prepare('INSERT INTO update_tags (update_id, tag) VALUES (?, ?)').run('multi-tag-1', 'Retirements');
            db.prepare('INSERT INTO update_tags (update_id, tag) VALUES (?, ?)').run('multi-tag-1', 'Compute');
        });

        it('should filter by single tag', () => {
            const result = handleSearchAzureUpdates(db, {
                filters: {
                    tags: ['Security'],
                },
            });
            const response = JSON.parse(result.content[0].text);

            expect(response.results.length).toBeGreaterThanOrEqual(2);
            expect(response.results.some((r: { id: string }) => r.id === 'test-1')).toBe(true);
            expect(response.results.some((r: { id: string }) => r.id === 'multi-tag-1')).toBe(true);
        });

        it('should filter by multiple tags with AND semantics', () => {
            const result = handleSearchAzureUpdates(db, {
                filters: {
                    tags: ['Security', 'Retirements'],
                },
            });
            const response = JSON.parse(result.content[0].text);

            // Only multi-tag-1 has BOTH Security AND Retirements
            expect(response.results).toHaveLength(1);
            expect(response.results[0].id).toBe('multi-tag-1');
        });

        it('should return no results when no update has all specified tags', () => {
            const result = handleSearchAzureUpdates(db, {
                filters: {
                    tags: ['Security', 'NonExistentTag'],
                },
            });
            const response = JSON.parse(result.content[0].text);

            expect(response.results).toHaveLength(0);
        });

        it('should filter by three tags with AND semantics', () => {
            const result = handleSearchAzureUpdates(db, {
                filters: {
                    tags: ['Security', 'Retirements', 'Compute'],
                },
            });
            const response = JSON.parse(result.content[0].text);

            // Only multi-tag-1 has all three tags
            expect(response.results).toHaveLength(1);
            expect(response.results[0].id).toBe('multi-tag-1');
        });
    });

    describe('Products Filter with AND Semantics', () => {
        beforeEach(() => {
            db.prepare(`
                INSERT INTO azure_updates (id, title, description_html, description_md, status, locale, created, modified)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                'multi-product-1',
                'Update with multiple products',
                '<p>Test</p>',
                'Test',
                'Active',
                'en-us',
                '2025-01-06T00:00:00.0000000Z',
                '2025-01-06T00:00:00.0000000Z'
            );

            db.prepare('INSERT INTO update_products (update_id, product) VALUES (?, ?)').run('multi-product-1', 'Azure Virtual Machines');
            db.prepare('INSERT INTO update_products (update_id, product) VALUES (?, ?)').run('multi-product-1', 'Azure Batch');
        });

        it('should filter by single product', () => {
            const result = handleSearchAzureUpdates(db, {
                filters: {
                    products: ['Azure Virtual Machines'],
                },
            });
            const response = JSON.parse(result.content[0].text);

            expect(response.results.some((r: { id: string }) => r.id === 'multi-product-1')).toBe(true);
        });

        it('should filter by multiple products with AND semantics', () => {
            const result = handleSearchAzureUpdates(db, {
                filters: {
                    products: ['Azure Virtual Machines', 'Azure Batch'],
                },
            });
            const response = JSON.parse(result.content[0].text);

            // Only multi-product-1 has BOTH products
            expect(response.results).toHaveLength(1);
            expect(response.results[0].id).toBe('multi-product-1');
        });

        it('should return no results when no update has all specified products', () => {
            const result = handleSearchAzureUpdates(db, {
                filters: {
                    products: ['Azure Virtual Machines', 'NonExistentProduct'],
                },
            });
            const response = JSON.parse(result.content[0].text);

            expect(response.results).toHaveLength(0);
        });
    });

    describe('Product Categories Filter with AND Semantics', () => {
        beforeEach(() => {
            db.prepare(`
                INSERT INTO azure_updates (id, title, description_html, description_md, status, locale, created, modified)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                'multi-category-1',
                'Update with multiple categories',
                '<p>Test</p>',
                'Test',
                'Active',
                'en-us',
                '2025-01-07T00:00:00.0000000Z',
                '2025-01-07T00:00:00.0000000Z'
            );

            db.prepare('INSERT INTO update_categories (update_id, category) VALUES (?, ?)').run('multi-category-1', 'Compute');
            db.prepare('INSERT INTO update_categories (update_id, category) VALUES (?, ?)').run('multi-category-1', 'AI + machine learning');
        });

        it('should filter by single category', () => {
            const result = handleSearchAzureUpdates(db, {
                filters: {
                    productCategories: ['Compute'],
                },
            });
            const response = JSON.parse(result.content[0].text);

            expect(response.results.some((r: { id: string }) => r.id === 'multi-category-1')).toBe(true);
        });

        it('should filter by multiple categories with AND semantics', () => {
            const result = handleSearchAzureUpdates(db, {
                filters: {
                    productCategories: ['Compute', 'AI + machine learning'],
                },
            });
            const response = JSON.parse(result.content[0].text);

            // Only multi-category-1 has BOTH categories
            expect(response.results).toHaveLength(1);
            expect(response.results[0].id).toBe('multi-category-1');
        });

        it('should return no results when no update has all specified categories', () => {
            const result = handleSearchAzureUpdates(db, {
                filters: {
                    productCategories: ['Compute', 'NonExistentCategory'],
                },
            });
            const response = JSON.parse(result.content[0].text);

            expect(response.results).toHaveLength(0);
        });
    });

    describe('Combined Filters', () => {
        beforeEach(() => {
            db.prepare(`
                INSERT INTO azure_updates (id, title, description_html, description_md, status, locale, created, modified)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                'combined-1',
                'Update with everything',
                '<p>Test</p>',
                'Test',
                'Active',
                'en-us',
                '2025-01-08T00:00:00.0000000Z',
                '2025-01-08T00:00:00.0000000Z'
            );

            db.prepare('INSERT INTO update_tags (update_id, tag) VALUES (?, ?)').run('combined-1', 'Security');
            db.prepare('INSERT INTO update_products (update_id, product) VALUES (?, ?)').run('combined-1', 'Azure Key Vault');
            db.prepare('INSERT INTO update_categories (update_id, category) VALUES (?, ?)').run('combined-1', 'Security');
        });

        it('should filter by tags + products + categories simultaneously', () => {
            const result = handleSearchAzureUpdates(db, {
                filters: {
                    tags: ['Security'],
                    products: ['Azure Key Vault'],
                    productCategories: ['Security'],
                },
            });
            const response = JSON.parse(result.content[0].text);

            expect(response.results.some((r: { id: string }) => r.id === 'combined-1')).toBe(true);
        });

        it('should return no results when any filter does not match', () => {
            const result = handleSearchAzureUpdates(db, {
                filters: {
                    tags: ['Security'],
                    products: ['NonExistentProduct'],
                    productCategories: ['Security'],
                },
            });
            const response = JSON.parse(result.content[0].text);

            expect(response.results).toHaveLength(0);
        });
    });
});
