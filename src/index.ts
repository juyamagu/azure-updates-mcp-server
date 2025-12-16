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

import { initializeDatabase, closeDatabase } from './database/database.js';
import { createMCPServer } from './server.js';
import * as logger from './utils/logger.js';

// Configuration from environment variables
const DATABASE_PATH = process.env.DATABASE_PATH ?? join(homedir(), '.azure-updates-mcp', 'azure-updates.db');
const LOG_LEVEL = (process.env.LOG_LEVEL ?? 'info') as 'debug' | 'info' | 'warn' | 'error';
const SERVER_NAME = 'azure-updates-mcp-server';
const SERVER_VERSION = '1.0.0';

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
