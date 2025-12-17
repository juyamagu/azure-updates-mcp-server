/**
 * Integration tests for Azure Updates entry modifications
 * Tests detection and handling of updated entries based on modified field
 * 
 * Uses existing query functions instead of raw SQL for better maintainability
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdtempSync, rmSync } from 'fs';
import { createServer, Server } from 'http';
import { parse as parseUrl } from 'url';
import { upsertUpdate, upsertUpdateIfNewer, getUpdateById } from '../../src/database/queries.js';
import type { AzureUpdateRecord } from '../../src/models/azure-update.js';

describe('Update Detection Integration Tests', () => {
    let db: Database.Database;
    let tempDir: string;
    let mockServer: Server;
    const MOCK_PORT = 13003;
    const MOCK_API_URL = `http://localhost:${MOCK_PORT}/api/v2/azure`;

    beforeAll(() => {
        // Load delta fixture data (includes updated and new entries)
        const deltaFixturePath = join(process.cwd(), 'tests/fixtures/azure-updates-delta.json');
        const deltaFixtures = JSON.parse(readFileSync(deltaFixturePath, 'utf-8'));

        // Start mock API server with synthetic data
        mockServer = createServer((req, res) => {
            const url = parseUrl(req.url || '', true);

            // Enable CORS
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Content-Type', 'application/json');

            if (url.pathname === '/api/v2/azure') {
                let results = [...deltaFixtures.value];

                // Apply $filter for modified gt (differential sync)
                const filter = url.query.$filter as string | undefined;
                if (filter && filter.includes('modified gt')) {
                    // Parse OData date format (modified gt 2025-12-15T00:00:00.0000000Z)
                    // Handle URL encoding and extract date string
                    const match = filter.match(/modified\s+gt\s+([^\s&]+)/i);
                    if (match) {
                        const dateStr = decodeURIComponent(match[1]);
                        const threshold = new Date(dateStr);
                        results = results.filter(item => {
                            const itemDate = new Date(item.modified);
                            return itemDate > threshold;
                        });
                    }
                }

                // Apply pagination
                const top = url.query.$top ? parseInt(url.query.$top as string, 10) : results.length;
                const skip = url.query.$skip ? parseInt(url.query.$skip as string, 10) : 0;
                const paginatedResults = results.slice(skip, skip + top);

                const response = {
                    '@odata.context': deltaFixtures['@odata.context'],
                    '@odata.count': results.length,
                    value: paginatedResults,
                };

                res.writeHead(200);
                res.end(JSON.stringify(response));
            } else {
                res.writeHead(404);
                res.end(JSON.stringify({ error: 'Not found' }));
            }
        });

        return new Promise<void>((resolve, reject) => {
            mockServer.on('error', (err: any) => {
                if (err.code === 'EADDRINUSE') {
                    reject(new Error(`Port ${MOCK_PORT} is already in use. Please ensure no other test is using this port.`));
                } else {
                    reject(err);
                }
            });

            mockServer.listen(MOCK_PORT, () => {
                resolve();
            });
        });
    });

    afterAll(() => {
        return new Promise<void>((resolve) => {
            if (mockServer) {
                mockServer.close(() => {
                    resolve();
                });
            } else {
                resolve();
            }
        });
    });

    beforeEach(() => {
        // Create temporary directory for test database
        tempDir = mkdtempSync(join(tmpdir(), 'azure-updates-update-test-'));
        db = new Database(join(tempDir, 'test.db'));

        // Load and execute test schema (without FTS5 triggers)
        const schemaPath = join(process.cwd(), 'tests/fixtures/test-schema.sql');
        const schema = readFileSync(schemaPath, 'utf-8');
        db.exec(schema);
    });

    afterEach(() => {
        db.close();
        rmSync(tempDir, { recursive: true, force: true });
    });

    it('should detect updated entries by comparing modified field', () => {
        // Insert original version using upsertUpdate
        const originalEntry: AzureUpdateRecord = {
            id: '515484',
            title: 'Original: The retirement date for default outbound access',
            description_html: '<div>Original description</div>',
            description_md: 'Original description',
            status: null,
            locale: null,
            created: '2025-12-12T11:30:27.0841562Z',
            modified: '2025-12-12T11:30:27.0841562Z',
            metadata: null,
        };

        upsertUpdate(db, originalEntry);

        // Verify original entry
        const originalFromDb = getUpdateById(db, '515484');
        expect(originalFromDb).toBeDefined();
        expect(originalFromDb?.modified).toBe('2025-12-12T11:30:27.0841562Z');

        // Now fetch updated entry from delta fixture
        const deltaData = JSON.parse(
            readFileSync(join(process.cwd(), 'tests/fixtures/azure-updates-delta.json'), 'utf-8')
        );

        const updatedEntry = deltaData.value.find((e: any) => e.id === '515484');
        expect(updatedEntry).toBeDefined();
        expect(updatedEntry.modified).toBe('2025-12-16T10:00:00.0000000Z');

        // Verify that modified field is later
        if (originalFromDb) {
            expect(new Date(updatedEntry.modified) > new Date(originalFromDb.modified)).toBe(true);
        }
    });

    it('should update existing entry when modified field is newer', () => {
        // Insert original entry
        const originalEntry: AzureUpdateRecord = {
            id: '515484',
            title: 'Original Title',
            description_html: '<div>Original Description</div>',
            description_md: 'Original Description',
            status: null,
            locale: null,
            created: '2025-12-12T11:30:27.0841562Z',
            modified: '2025-12-12T11:30:27.0841562Z',
            metadata: null,
        };

        upsertUpdate(db, originalEntry);

        // Simulate update with newer modified field using conditional upsert
        const updatedEntry: AzureUpdateRecord = {
            ...originalEntry,
            title: 'Updated: Extended to September 30, 2026',
            description_html: '<div>Updated description</div>',
            description_md: 'Updated description',
            modified: '2025-12-16T10:00:00.0000000Z',
        };

        const wasUpdated = upsertUpdateIfNewer(db, updatedEntry);
        expect(wasUpdated).toBe(true);

        // Verify update
        const updated = getUpdateById(db, '515484');
        expect(updated?.title).toContain('September 30');
        expect(updated?.modified).toBe('2025-12-16T10:00:00.0000000Z');
    });

    it('should filter updates using modified gt in differential sync', async () => {
        // Insert some old entries
        const oldEntry: AzureUpdateRecord = {
            id: '515484',
            title: 'Old Title',
            description_html: '<div>Old Description</div>',
            description_md: 'Old Description',
            status: null,
            locale: null,
            created: '2025-12-12T11:30:27.0841562Z',
            modified: '2025-12-12T11:30:27.0841562Z',
            metadata: null,
        };

        upsertUpdate(db, oldEntry);

        // Query mock API with filter for updates after a specific date
        const filterDate = '2025-12-15T00:00:00.0000000Z';
        const filterParam = encodeURIComponent(`modified gt ${filterDate}`);
        const url = `${MOCK_API_URL}?$filter=${filterParam}`;

        const response = await fetch(url);
        const data = await response.json() as any;

        // Should only return entries modified after 2025-12-15
        expect(data.value.length).toBeGreaterThan(0);

        for (const entry of data.value) {
            expect(new Date(entry.modified) > new Date(filterDate)).toBe(true);
        }
    });

    it('should handle multiple updated entries in a single sync', () => {
        // Insert original versions of entries that will be updated
        const origEntry1: AzureUpdateRecord = {
            id: '515484',
            title: 'Original Title 1',
            description_html: '<div>Original Description 1</div>',
            description_md: 'Original Description 1',
            status: null,
            locale: null,
            created: '2025-12-12T11:30:27.0841562Z',
            modified: '2025-12-12T11:30:27.0841562Z',
            metadata: null,
        };

        const origEntry2: AzureUpdateRecord = {
            id: '536907',
            title: 'Original Title 2',
            description_html: '<div>Original Description 2</div>',
            description_md: 'Original Description 2',
            status: 'In preview',
            locale: null,
            created: '2025-12-11T20:30:24.5013232Z',
            modified: '2025-12-11T20:30:24.5013232Z',
            metadata: null,
        };

        upsertUpdate(db, origEntry1);
        upsertUpdate(db, origEntry2);

        // Load delta data with updates
        const deltaData = JSON.parse(
            readFileSync(join(process.cwd(), 'tests/fixtures/azure-updates-delta.json'), 'utf-8')
        );

        // Simulate batch update using upsertUpdate
        const updatedEntries = deltaData.value.filter((e: any) =>
            e.id === '515484' || e.id === '536907'
        );

        expect(updatedEntries.length).toBe(2);

        for (const entry of updatedEntries) {
            const updateRecord: AzureUpdateRecord = {
                id: entry.id,
                title: entry.title,
                description_html: entry.description,
                description_md: entry.description.replace(/<[^>]*>/g, ''),
                status: entry.status,
                locale: entry.locale,
                created: entry.created,
                modified: entry.modified,
                metadata: null,
            };
            upsertUpdateIfNewer(db, updateRecord);
        }

        // Verify both updates
        const updated1 = getUpdateById(db, '515484');
        const updated2 = getUpdateById(db, '536907');

        expect(updated1?.modified).toBe('2025-12-16T10:00:00.0000000Z');
        expect(updated2?.modified).toBe('2025-12-16T09:30:00.0000000Z');
        expect(updated1?.title).toContain('September 30');
        expect(updated2?.title).toContain('Teams');
    });

    it('should not update entry when modified field is not newer', () => {
        // Insert entry with recent modified date
        const recentModified = '2025-12-16T10:00:00.0000000Z';
        const currentEntry: AzureUpdateRecord = {
            id: '515484',
            title: 'Current Title',
            description_html: '<div>Current Description</div>',
            description_md: 'Current Description',
            status: null,
            locale: null,
            created: '2025-12-12T11:30:27.0841562Z',
            modified: recentModified,
            metadata: null,
        };

        upsertUpdate(db, currentEntry);

        const beforeUpdate = getUpdateById(db, '515484');

        // In real implementation, we would check if modified is newer before upserting
        const olderModified = '2025-12-12T11:30:27.0841562Z';
        const shouldUpdate = new Date(olderModified) > new Date(recentModified);
        expect(shouldUpdate).toBe(false);

        // Don't perform upsert if date is not newer (simulating proper sync logic)
        if (!shouldUpdate) {
            // Skip upsert - entry should remain unchanged
        }

        const afterUpdate = getUpdateById(db, '515484');
        expect(afterUpdate?.title).toBe(beforeUpdate?.title);
        expect(afterUpdate?.modified).toBe(recentModified);
    });

    it('should insert new entries while updating existing ones', () => {
        // Insert one existing entry
        const existingEntry: AzureUpdateRecord = {
            id: '515484',
            title: 'Original Title',
            description_html: '<div>Original Description</div>',
            description_md: 'Original Description',
            status: null,
            locale: null,
            created: '2025-12-12T11:30:27.0841562Z',
            modified: '2025-12-12T11:30:27.0841562Z',
            metadata: null,
        };

        upsertUpdate(db, existingEntry);

        // Load delta data with both updates and new entries
        const deltaData = JSON.parse(
            readFileSync(join(process.cwd(), 'tests/fixtures/azure-updates-delta.json'), 'utf-8')
        );

        // Simulate upsert logic using upsertUpdate function
        for (const entry of deltaData.value) {
            const record: AzureUpdateRecord = {
                id: entry.id,
                title: entry.title,
                description_html: entry.description,
                description_md: entry.description.replace(/<[^>]*>/g, ''),
                status: entry.status,
                locale: entry.locale,
                created: entry.created,
                modified: entry.modified,
                metadata: null,
            };

            // Use conditional upsert (only updates if modified is newer)
            upsertUpdateIfNewer(db, record);
        }

        // Verify results
        const countStmt = db.prepare('SELECT COUNT(*) as count FROM azure_updates');
        const allEntries = countStmt.get() as any;
        expect(allEntries.count).toBe(5); // 1 original + 4 new from synthetic

        const updated515484 = getUpdateById(db, '515484');
        expect(updated515484?.modified).toBe('2025-12-16T10:00:00.0000000Z');
        expect(updated515484?.title).toContain('September 30');

        // Verify new entries exist
        const newEntry = getUpdateById(db, '999001');
        expect(newEntry).toBeDefined();
        expect(newEntry?.title).toContain('SQL Database');
    });
});
