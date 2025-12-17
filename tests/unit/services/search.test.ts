import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { searchUpdates } from '../../../src/services/search.service.js';
import type { SearchQuery } from '../../../src/models/search-query.js';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { readFileSync } from 'fs';

describe('Search Service', () => {
    let db: Database.Database;
    let tempDir: string;

    beforeEach(() => {
        // Create temporary directory for test database
        tempDir = mkdtempSync(join(tmpdir(), 'search-test-'));
        const dbPath = join(tempDir, 'test.db');
        db = new Database(dbPath);

        // Apply schema
        const schemaPath = join(process.cwd(), 'src/database/schema.sql');
        const schema = readFileSync(schemaPath, 'utf-8');

        // Execute entire schema at once
        db.exec(schema);

        // Insert test data
        insertTestData(db);
    });

    afterEach(() => {
        db.close();
        rmSync(tempDir, { recursive: true, force: true });
    });

    function insertTestData(database: Database.Database) {
        // Insert test updates
        database.prepare(`
            INSERT INTO azure_updates (id, title, description_html, description_md, status, locale, created, modified)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            'test-1',
            'Azure Virtual Machines Update',
            '<p>Security update for VMs</p>',
            'Security update for VMs',
            'Active',
            'en-us',
            '2025-01-01T00:00:00.0000000Z',
            '2025-01-15T00:00:00.0000000Z'
        );

        database.prepare(`
            INSERT INTO azure_updates (id, title, description_html, description_md, status, locale, created, modified)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            'test-2',
            'Azure SQL Database Retirement',
            '<p>Old version retiring in 2026</p>',
            'Old version retiring in 2026',
            'Retired',
            'en-us',
            '2024-01-01T00:00:00.0000000Z',
            '2025-06-01T00:00:00.0000000Z'
        );

        database.prepare(`
            INSERT INTO azure_updates (id, title, description_html, description_md, status, locale, created, modified)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            'test-3',
            'Azure Machine Learning Preview',
            '<p>New ML features in preview</p>',
            'New ML features in preview',
            'Active',
            'en-us',
            '2025-02-01T00:00:00.0000000Z',
            '2025-02-01T00:00:00.0000000Z'
        );

        // Insert tags
        database.prepare('INSERT INTO update_tags (update_id, tag) VALUES (?, ?)').run('test-1', 'Security');
        database.prepare('INSERT INTO update_tags (update_id, tag) VALUES (?, ?)').run('test-2', 'Retirements');
        database.prepare('INSERT INTO update_tags (update_id, tag) VALUES (?, ?)').run('test-3', 'Features');

        // Insert categories
        database.prepare('INSERT INTO update_categories (update_id, category) VALUES (?, ?)').run('test-1', 'Compute');
        database.prepare('INSERT INTO update_categories (update_id, category) VALUES (?, ?)').run('test-2', 'Databases');
        database.prepare('INSERT INTO update_categories (update_id, category) VALUES (?, ?)').run('test-3', 'AI + Machine Learning');

        // Insert products
        database.prepare('INSERT INTO update_products (update_id, product) VALUES (?, ?)').run('test-1', 'Azure Virtual Machines');
        database.prepare('INSERT INTO update_products (update_id, product) VALUES (?, ?)').run('test-2', 'Azure SQL Database');
        database.prepare('INSERT INTO update_products (update_id, product) VALUES (?, ?)').run('test-3', 'Azure Machine Learning');

        // Insert availabilities
        database.prepare('INSERT INTO update_availabilities (update_id, ring, date) VALUES (?, ?, ?)').run(
            'test-2',
            'Retirement',
            '2026-03-31'
        );
        database.prepare('INSERT INTO update_availabilities (update_id, ring, date) VALUES (?, ?, ?)').run(
            'test-3',
            'Preview',
            '2025-02-01'
        );
    }

    describe('searchUpdates', () => {
        it('should search by keyword in title', () => {
            const query: SearchQuery = {
                query: 'Virtual Machines',
                limit: 10,
                offset: 0,
            };

            const result = searchUpdates(db, query);

            expect(result.results.length).toBeGreaterThan(0);
            // Results are sorted by modified:desc, so find the matching result
            const matchingResult = result.results.find(r => r.title.includes('Virtual Machines'));
            expect(matchingResult).toBeDefined();
            expect(result.metadata.totalResults).toBeGreaterThan(0);
        });

        it('should search by keyword in description', () => {
            const query: SearchQuery = {
                query: 'Security',
                limit: 10,
                offset: 0,
            };

            const result = searchUpdates(db, query);

            expect(result.results.length).toBeGreaterThan(0);
            expect(result.metadata.totalResults).toBeGreaterThan(0);
        });

        it('should return all updates with no filters', () => {
            const query: SearchQuery = {
                limit: 50,
                offset: 0,
            };

            const result = searchUpdates(db, query);

            expect(result.results.length).toBe(3);
            expect(result.metadata.totalResults).toBe(3);
        });

        it('should filter by status', () => {
            const query: SearchQuery = {
                filters: {
                    status: 'Active',
                },
                limit: 10,
                offset: 0,
            };

            const result = searchUpdates(db, query);

            expect(result.results.length).toBe(2);
            result.results.forEach(update => {
                expect(update.status).toBe('Active');
            });
        });

        it('should filter by availability ring', () => {
            const query: SearchQuery = {
                filters: {
                    availabilityRing: 'Retirement',
                },
                limit: 10,
                offset: 0,
            };

            const result = searchUpdates(db, query);

            expect(result.results.length).toBe(1);
            expect(result.results[0].availabilities.some(a => a.ring === 'Retirement')).toBe(true);
        });

        it('should filter by date range', () => {
            const query: SearchQuery = {
                filters: {
                    dateFrom: '2025-01-01T00:00:00.0000000Z',
                    dateTo: '2025-03-01T00:00:00.0000000Z',
                },
                limit: 10,
                offset: 0,
            };

            const result = searchUpdates(db, query);

            expect(result.results.length).toBeGreaterThan(0);
            result.results.forEach(update => {
                expect(new Date(update.modified).getTime()).toBeGreaterThanOrEqual(new Date('2025-01-01').getTime());
                expect(new Date(update.modified).getTime()).toBeLessThanOrEqual(new Date('2025-03-01').getTime());
            });
        });

        it('should combine keyword search with filters', () => {
            const query: SearchQuery = {
                query: 'security',
                filters: {
                    status: 'Active',
                },
                limit: 10,
                offset: 0,
            };

            const result = searchUpdates(db, query);

            expect(result.results.length).toBeGreaterThan(0);
            result.results.forEach(update => {
                expect(update.status).toBe('Active');
            });
        });

        it('should support pagination', () => {
            const query1: SearchQuery = {
                limit: 1,
                offset: 0,
            };

            const query2: SearchQuery = {
                limit: 1,
                offset: 1,
            };

            const result1 = searchUpdates(db, query1);
            const result2 = searchUpdates(db, query2);

            expect(result1.results.length).toBe(1);
            expect(result2.results.length).toBe(1);
            expect(result1.results[0].id).not.toBe(result2.results[0].id);
            expect(result1.metadata.hasMore).toBe(true);
        });

        it('should respect limit parameter', () => {
            const query: SearchQuery = {
                limit: 2,
                offset: 0,
            };

            const result = searchUpdates(db, query);

            expect(result.results.length).toBeLessThanOrEqual(2);
            expect(result.metadata.limit).toBe(2);
        });

        it('should enforce maximum limit of 100', () => {
            const query: SearchQuery = {
                limit: 200,
                offset: 0,
            };

            const result = searchUpdates(db, query);

            expect(result.metadata.limit).toBe(100);
        });

        it('should include query time in metadata', () => {
            const query: SearchQuery = {
                limit: 10,
                offset: 0,
            };

            const result = searchUpdates(db, query);

            expect(result.metadata.queryTime).toBeGreaterThanOrEqual(0);
        });

        it('should enrich results with related data', () => {
            const query: SearchQuery = {
                query: 'Virtual Machines',
                limit: 1,
                offset: 0,
            };

            const result = searchUpdates(db, query);

            expect(result.results.length).toBeGreaterThan(0);
            expect(result.results[0].tags).toBeDefined();
            expect(result.results[0].productCategories).toBeDefined();
            expect(result.results[0].products).toBeDefined();
            expect(result.results[0].availabilities).toBeDefined();
        });
    });
});
