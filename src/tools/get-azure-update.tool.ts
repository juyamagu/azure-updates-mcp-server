/**
 * MCP Tool: get_azure_update
 * 
 * Retrieves the complete details of a specific Azure update by its ID,
 * including the full description (in Markdown format).
 * 
 * This tool is part of a two-tool pattern:
 * 1. search_azure_updates - Lightweight discovery (metadata only)
 * 2. get_azure_update - Full detail retrieval (including description)
 */

import type Database from 'better-sqlite3';
import { getUpdateById } from '../database/queries.js';
import * as logger from '../utils/logger.js';

/**
 * Input parameters for get_azure_update tool
 */
export interface GetAzureUpdateInput {
    id: string; // Unique identifier of the Azure update (required)
}

/**
 * MCP tool response format
 */
interface ToolResponse {
    content: Array<{
        type: string;
        text: string;
    }>;
    isError?: boolean;
}

/**
 * Validation error response
 */
interface ValidationErrorResponse {
    error: string;
    details: string | string[];
}

/**
 * Not found error response
 */
interface NotFoundErrorResponse {
    error: string;
    details: string;
}

/**
 * Validate input parameters for get_azure_update tool
 * 
 * @param input Raw input from MCP client
 * @returns Validation result with errors if invalid
 */
function validateInput(input: unknown): { valid: boolean; errors: string[]; data?: GetAzureUpdateInput } {
    const errors: string[] = [];

    // Check if input is an object
    if (typeof input !== 'object' || input === null) {
        return { valid: false, errors: ['Input must be an object'] };
    }

    const data = input as Record<string, unknown>;

    // Validate id parameter
    if (!('id' in data)) {
        errors.push('id is required');
    } else if (typeof data.id !== 'string') {
        errors.push('id must be a string');
    } else if (data.id.trim() === '') {
        errors.push('id cannot be empty');
    }

    if (errors.length > 0) {
        return { valid: false, errors };
    }

    return {
        valid: true,
        errors: [],
        data: { id: (data.id as string).trim() }
    };
}

/**
 * Handle get_azure_update tool invocation
 * 
 * Retrieves the full Azure update details by ID, including the complete description.
 * 
 * @param db Database instance
 * @param input Tool input parameters (must contain id)
 * @returns MCP tool response with full update details or error
 */
export function handleGetAzureUpdate(db: Database.Database, input: unknown): ToolResponse {
    const startTime = Date.now();

    logger.debug('get_azure_update tool invoked', { input });

    // Validate input
    const validation = validateInput(input);
    if (!validation.valid) {
        logger.warn('get_azure_update validation failed', { errors: validation.errors });

        const errorResponse: ValidationErrorResponse = {
            error: 'Validation failed',
            details: validation.errors.length === 1 ? validation.errors[0] : validation.errors
        };

        return {
            content: [{ type: 'text', text: JSON.stringify(errorResponse, null, 2) }],
            isError: true
        };
    }

    // TypeScript should know data exists due to validation.valid check, but we double-check for safety
    if (!validation.data) {
        throw new Error('Validation succeeded but data is missing');
    }

    const { id } = validation.data;

    try {
        // Retrieve update from database
        const update = getUpdateById(db, id);

        if (!update) {
            logger.info('get_azure_update: Update not found', { id });

            const notFoundResponse: NotFoundErrorResponse = {
                error: 'Update not found',
                details: `No Azure update found with ID: ${id}`
            };

            return {
                content: [{ type: 'text', text: JSON.stringify(notFoundResponse, null, 2) }],
                isError: true
            };
        }

        const duration = Date.now() - startTime;

        logger.info('get_azure_update: Update retrieved', {
            id,
            title: update.title,
            durationMs: duration
        });

        // Return full update details (including description)
        return {
            content: [{
                type: 'text',
                text: JSON.stringify(update, null, 2)
            }],
            isError: false
        };

    } catch (error) {
        const duration = Date.now() - startTime;

        logger.error('get_azure_update: Unexpected error', {
            id,
            error: error instanceof Error ? error.message : String(error),
            durationMs: duration
        });

        const errorResponse: ValidationErrorResponse = {
            error: 'Internal error',
            details: 'An unexpected error occurred while retrieving the update'
        };

        return {
            content: [{ type: 'text', text: JSON.stringify(errorResponse, null, 2) }],
            isError: true
        };
    }
}
