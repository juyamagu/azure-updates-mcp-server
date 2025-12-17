/**
 * Unit tests for search service phrase search functionality
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { searchUpdates } from '../../../src/services/search.service.js';
import type { SearchQuery } from '../../../src/models/search-query.js';

describe('Search Service - Phrase Search', () => {
    let db: Database.Database;

    beforeEach(() => {
        // Create in-memory database for testing
        db = new Database(':memory:');

        // Create schema
        db.exec(`
            CREATE TABLE azure_updates (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                description_html TEXT,
                description_md TEXT,
                status TEXT,
                locale TEXT,
                created TEXT NOT NULL,
                modified TEXT NOT NULL
            );

            CREATE VIRTUAL TABLE updates_fts USING fts5(
                id UNINDEXED,
                title,
                description_md,
                content=azure_updates,
                content_rowid=rowid,
                tokenize='porter unicode61 remove_diacritics 2'
            );

            CREATE TABLE update_tags (
                update_id TEXT NOT NULL,
                tag TEXT NOT NULL,
                PRIMARY KEY (update_id, tag)
            );

            CREATE TABLE update_products (
                update_id TEXT NOT NULL,
                product TEXT NOT NULL,
                PRIMARY KEY (update_id, product)
            );

            CREATE TABLE update_product_categories (
                update_id TEXT NOT NULL,
                category TEXT NOT NULL,
                PRIMARY KEY (update_id, category)
            );

            -- Alias for getCategoriesForUpdate query
            CREATE VIEW update_categories AS
            SELECT update_id, category FROM update_product_categories;

            CREATE TABLE update_availabilities (
                update_id TEXT NOT NULL,
                ring TEXT NOT NULL,
                date TEXT,
                year INTEGER,
                month TEXT
            );
        `);

        // Insert test data
        db.prepare(`
            INSERT INTO azure_updates (id, title, description_html, description_md, status, locale, created, modified)
            VALUES
                ('1', 'Azure Virtual Machines retirement', 'VM retirement notice', 'VM retirement notice', 'Active', 'en-US', '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
                ('2', 'Virtual machine scaling improvements', 'Scaling improvements', 'Scaling improvements', 'Active', 'en-US', '2025-01-02T00:00:00Z', '2025-01-02T00:00:00Z'),
                ('3', 'Azure Databricks preview', 'Databricks new features', 'Databricks new features', 'Preview', 'en-US', '2025-01-03T00:00:00Z', '2025-01-03T00:00:00Z')
        `).run();

        // Rebuild FTS index
        db.prepare("INSERT INTO updates_fts(updates_fts) VALUES('rebuild')").run();
    });

    afterEach(() => {
        db.close();
    });

    describe('Phrase Search Syntax', () => {
        it('should match exact phrase "Azure Virtual Machines"', () => {
            const query: SearchQuery = {
                query: '"Azure Virtual Machines"',
            };

            const result = searchUpdates(db, query);

            expect(result.results).toHaveLength(1);
            expect(result.results[0].id).toBe('1');
            expect(result.results[0].title).toContain('Azure Virtual Machines');
        });

        it('should match exact phrase "Virtual machine" case-insensitively', () => {
            const query: SearchQuery = {
                query: '"Virtual machine"',
            };

            const result = searchUpdates(db, query);

            // Should match both "Azure Virtual Machines" and "Virtual machine scaling"
            expect(result.results.length).toBeGreaterThanOrEqual(1);
        });

        it('should combine phrase search with OR logic for other words', () => {
            const query: SearchQuery = {
                query: '"Azure Databricks" retirement',
            };

            const result = searchUpdates(db, query);

            // Should match:
            // - "Azure Databricks preview" (exact phrase)
            // - "Azure Virtual Machines retirement" (contains "retirement")
            expect(result.results.length).toBeGreaterThanOrEqual(2);
        });

        it('should handle multiple phrases', () => {
            const query: SearchQuery = {
                query: '"Azure Virtual" "machine scaling"',
            };

            const result = searchUpdates(db, query);

            // Should match entries with either phrase
            expect(result.results.length).toBeGreaterThanOrEqual(1);
        });

        it('should handle empty query gracefully', () => {
            const query: SearchQuery = {
                query: '""',
            };

            const result = searchUpdates(db, query);

            expect(result.results).toHaveLength(0);
        });

        it('should handle OR logic for non-phrase words', () => {
            const query: SearchQuery = {
                query: 'virtual machine',
            };

            const result = searchUpdates(db, query);

            // Should match all entries with "virtual" OR "machine" (prefix matching)
            expect(result.results.length).toBeGreaterThanOrEqual(2);
        });
    });
});
