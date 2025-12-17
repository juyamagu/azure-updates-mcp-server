#!/usr/bin/env node

/**
 * Azure Updates MCP Server - Entry Point
 * 
 * Initializes the database, sets up the MCP server with stdio transport,
 * and handles graceful shutdown.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { join } from 'path';
import { homedir } from 'os';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

import { initializeDatabase, closeDatabase } from './database/database.js';
import { createMCPServer } from './server.js';
import { performSync, isSyncNeeded } from './services/sync.service.js';
import { deleteUpdatesBeforeRetentionDate } from './database/queries.js';
import * as logger from './utils/logger.js';

// Get version from package.json
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'));

// Configuration from environment variables
const DATABASE_PATH = process.env.DATABASE_PATH ?? join(homedir(), '.azure-updates-mcp', 'azure-updates.db');
const LOG_LEVEL = (process.env.LOG_LEVEL ?? 'info') as 'debug' | 'info' | 'warn' | 'error';
const SYNC_STALENESS_HOURS = parseInt(process.env.SYNC_STALENESS_HOURS ?? '24', 10);
const SYNC_ON_STARTUP = (process.env.SYNC_ON_STARTUP ?? 'true').toLowerCase() === 'true';
const DATA_RETENTION_START_DATE = process.env.DATA_RETENTION_START_DATE ?? '2022-01-01';
const SERVER_NAME = 'azure-updates-mcp-server';
const SERVER_VERSION = packageJson.version;

/**
 * Main entry point
 */
async function main(): Promise<void> {
    try {
        // Configure logger
        logger.configureLogger({
            level: LOG_LEVEL,
            enableConsole: true,
        });

        logger.info('Starting Azure Updates MCP Server', {
            version: SERVER_VERSION,
            databasePath: DATABASE_PATH,
            logLevel: LOG_LEVEL,
        });

        // Initialize database
        logger.info('Initializing database', { path: DATABASE_PATH });
        const db = initializeDatabase({
            path: DATABASE_PATH,
            readonly: false,
            verbose: LOG_LEVEL === 'debug',
        });

        logger.info('Database initialized successfully');

        // Cleanup old data based on retention start date
        if (DATA_RETENTION_START_DATE) {
            logger.info('Cleaning up old records', { retentionStartDate: DATA_RETENTION_START_DATE });
            const deletedCount = deleteUpdatesBeforeRetentionDate(db, DATA_RETENTION_START_DATE);
            if (deletedCount > 0) {
                logger.info('Deleted old records', {
                    deletedCount,
                    retentionStartDate: DATA_RETENTION_START_DATE,
                });
            }
        }

        // T056: Check if sync is needed based on staleness
        if (SYNC_ON_STARTUP && isSyncNeeded(db, SYNC_STALENESS_HOURS)) {
            logger.info('Data is stale, starting background sync', {
                stalenessThreshold: `${SYNC_STALENESS_HOURS} hours`,
                dataRetentionStartDate: DATA_RETENTION_START_DATE,
            });

            // T057: Non-blocking background sync - don't await
            void performSync(db, DATA_RETENTION_START_DATE)
                .then(result => {
                    if (result.success) {
                        logger.info('Background sync completed', {
                            recordsProcessed: result.recordsProcessed,
                            recordsInserted: result.recordsInserted,
                            recordsUpdated: result.recordsUpdated,
                            durationMs: result.durationMs,
                        });
                    } else {
                        logger.warn('Background sync failed', {
                            error: result.error,
                            durationMs: result.durationMs,
                        });
                    }
                })
                .catch(error => {
                    logger.errorWithStack('Background sync error', error as Error);
                });
        } else {
            logger.info('Data is fresh, skipping startup sync', {
                syncOnStartup: SYNC_ON_STARTUP,
                stalenessThreshold: `${SYNC_STALENESS_HOURS} hours`,
            });
        }

        // Create MCP server
        const server = createMCPServer({
            name: SERVER_NAME,
            version: SERVER_VERSION,
            database: db,
        });

        // Setup stdio transport
        const transport = new StdioServerTransport();

        logger.info('Connecting MCP server to stdio transport');
        await server.connect(transport);

        logger.info('MCP server is ready and listening on stdio');

        // Graceful shutdown handlers
        const shutdown = (): void => {
            logger.info('Shutting down server');

            server.close()
                .then(() => {
                    closeDatabase();
                    logger.info('Server shutdown complete');
                    process.exit(0);
                })
                .catch((error: Error) => {
                    logger.errorWithStack('Error during shutdown', error);
                    process.exit(1);
                });
        };

        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);

        // Handle uncaught errors
        process.on('uncaughtException', (error) => {
            logger.errorWithStack('Uncaught exception', error);
            process.exit(1);
        });

        process.on('unhandledRejection', (reason) => {
            logger.error('Unhandled promise rejection', {
                reason: String(reason),
            });
            process.exit(1);
        });

    } catch (error) {
        logger.errorWithStack('Failed to start server', error as Error);
        process.exit(1);
    }
}

// Run the server
void main();
