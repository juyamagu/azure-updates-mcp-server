import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { handleGetAzureUpdate } from '../../../src/tools/get-azure-update.tool.js';
import { mkdtempSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Get Azure Update Tool', () => {
    let db: Database.Database;
    let tempDir: string;

    beforeEach(() => {
        tempDir = mkdtempSync(join(tmpdir(), 'get-tool-test-'));
        const dbPath = join(tempDir, 'test.db');
        db = new Database(dbPath);

        // Apply schema
        const schemaPath = join(process.cwd(), 'src/database/schema.sql');
        const schema = readFileSync(schemaPath, 'utf-8');
        db.exec(schema);

        // Insert test data
        db.prepare(`
            INSERT INTO azure_updates (id, title, description_html, description_md, status, locale, created, modified)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            'test-update-123',
            'Test Azure Update',
            '<p>This is a test update</p>',
            'This is a test update',
            'Active',
            'en-us',
            '2025-01-01T00:00:00.0000000Z',
            '2025-01-15T10:00:00.0000000Z'
        );

        db.prepare('INSERT INTO update_tags (update_id, tag) VALUES (?, ?)').run('test-update-123', 'Security');
        db.prepare('INSERT INTO update_tags (update_id, tag) VALUES (?, ?)').run('test-update-123', 'Features');
        db.prepare('INSERT INTO update_categories (update_id, category) VALUES (?, ?)').run('test-update-123', 'Compute');
        db.prepare('INSERT INTO update_products (update_id, product) VALUES (?, ?)').run('test-update-123', 'Azure Virtual Machines');
        db.prepare('INSERT INTO update_availabilities (update_id, ring, date) VALUES (?, ?, ?)').run('test-update-123', 'General Availability', '2025-02-01');
    });

    afterEach(() => {
        db.close();
        rmSync(tempDir, { recursive: true, force: true });
    });

    describe('Input Validation', () => {
        it('should reject non-object input', () => {
            const result = handleGetAzureUpdate(db, 'invalid');
            const response = JSON.parse(result.content[0].text);

            expect(result.isError).toBe(true);
            expect(response.error).toBe('Validation failed');
        });

        it('should reject missing id parameter', () => {
            const result = handleGetAzureUpdate(db, {});
            const response = JSON.parse(result.content[0].text);

            expect(result.isError).toBe(true);
            expect(response.error).toBe('Validation failed');
            expect(response.details).toContain('id is required');
        });

        it('should reject empty id', () => {
            const result = handleGetAzureUpdate(db, { id: '' });
            const response = JSON.parse(result.content[0].text);

            expect(result.isError).toBe(true);
            expect(response.error).toBe('Validation failed');
            expect(response.details).toContain('id cannot be empty');
        });

        it('should reject non-string id', () => {
            const result = handleGetAzureUpdate(db, { id: 123 });
            const response = JSON.parse(result.content[0].text);

            expect(result.isError).toBe(true);
            expect(response.error).toBe('Validation failed');
            expect(response.details).toContain('id must be a string');
        });
    });

    describe('Update Retrieval', () => {
        it('should retrieve full update by valid ID', () => {
            const result = handleGetAzureUpdate(db, { id: 'test-update-123' });
            const update = JSON.parse(result.content[0].text);

            expect(result.isError).toBe(false);
            expect(update.id).toBe('test-update-123');
            expect(update.title).toBe('Test Azure Update');
            // description field contains Markdown (from description_md column)
            expect(update.description).toBe('This is a test update');
            // url field is generated from the id
            expect(update.url).toBe('https://azure.microsoft.com/en-us/updates/?id=test-update-123');
            expect(update.status).toBe('Active');
            expect(update.tags).toEqual(expect.arrayContaining(['Security', 'Features']));
            expect(update.tags).toHaveLength(2);
            expect(update.productCategories).toEqual(['Compute']);
            expect(update.products).toEqual(['Azure Virtual Machines']);
            expect(update.availabilities).toHaveLength(1);
            expect(update.availabilities[0].ring).toBe('General Availability');
        });

        it('should return not found error for invalid ID', () => {
            const result = handleGetAzureUpdate(db, { id: 'non-existent-id' });
            const response = JSON.parse(result.content[0].text);

            expect(result.isError).toBe(true);
            expect(response.error).toBe('Update not found');
            expect(response.details).toContain('non-existent-id');
        });

        it('should include created and modified timestamps', () => {
            const result = handleGetAzureUpdate(db, { id: 'test-update-123' });
            const update = JSON.parse(result.content[0].text);

            expect(update.created).toBe('2025-01-01T00:00:00.0000000Z');
            expect(update.modified).toBe('2025-01-15T10:00:00.0000000Z');
        });

        it('should handle updates with null status', () => {
            db.prepare(`
                INSERT INTO azure_updates (id, title, description_html, description_md, status, locale, created, modified)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                'test-update-null-status',
                'Update with null status',
                '<p>Test</p>',
                'Test',
                null,
                'en-us',
                '2025-01-01T00:00:00.0000000Z',
                '2025-01-01T00:00:00.0000000Z'
            );

            const result = handleGetAzureUpdate(db, { id: 'test-update-null-status' });
            const update = JSON.parse(result.content[0].text);

            expect(result.isError).toBe(false);
            expect(update.status).toBeNull();
        });

        it('should handle updates with empty arrays', () => {
            db.prepare(`
                INSERT INTO azure_updates (id, title, description_html, description_md, status, locale, created, modified)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                'test-update-empty-arrays',
                'Update with no tags/categories',
                '<p>Test</p>',
                'Test',
                'Active',
                'en-us',
                '2025-01-01T00:00:00.0000000Z',
                '2025-01-01T00:00:00.0000000Z'
            );

            const result = handleGetAzureUpdate(db, { id: 'test-update-empty-arrays' });
            const update = JSON.parse(result.content[0].text);

            expect(result.isError).toBe(false);
            expect(update.tags).toEqual([]);
            expect(update.productCategories).toEqual([]);
            expect(update.products).toEqual([]);
            expect(update.availabilities).toEqual([]);
        });
    });

    describe('Response Format', () => {
        it('should return MCP tool response format', () => {
            const result = handleGetAzureUpdate(db, { id: 'test-update-123' });

            expect(result).toHaveProperty('content');
            expect(result.content).toBeInstanceOf(Array);
            expect(result.content[0]).toHaveProperty('type', 'text');
            expect(result.content[0]).toHaveProperty('text');
        });

        it('should return valid JSON in text field', () => {
            const result = handleGetAzureUpdate(db, { id: 'test-update-123' });

            expect(() => JSON.parse(result.content[0].text)).not.toThrow();
        });
    });
});
