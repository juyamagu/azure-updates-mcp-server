/**
 * Retry utility with exponential backoff
 * 
 * Used for resilient API calls and transient error handling
 */

import * as logger from './logger.js';

export interface RetryOptions {
    maxRetries: number; // Maximum number of retry attempts
    initialDelayMs: number; // Initial delay in milliseconds
    maxDelayMs: number; // Maximum delay cap
    backoffMultiplier: number; // Exponential backoff multiplier (e.g., 2 = double each time)
    retryableErrors?: string[]; // Error messages that should trigger retries
    onRetry?: (attempt: number, error: Error) => void; // Callback before each retry
}

const DEFAULT_OPTIONS: RetryOptions = {
    maxRetries: 3,
    initialDelayMs: 1000,
    maxDelayMs: 10000,
    backoffMultiplier: 2,
};

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate delay for next retry using exponential backoff
 */
function calculateDelay(attempt: number, options: RetryOptions): number {
    const delay = options.initialDelayMs * Math.pow(options.backoffMultiplier, attempt);
    return Math.min(delay, options.maxDelayMs);
}

/**
 * Check if an error should trigger a retry
 */
function isRetryableError(error: Error, options: RetryOptions): boolean {
    // If specific retryable errors are defined, check against them
    if (options.retryableErrors && options.retryableErrors.length > 0) {
        return options.retryableErrors.some(msg =>
            error.message.toLowerCase().includes(msg.toLowerCase())
        );
    }

    // Default: retry on network errors and timeouts
    const retryablePatterns = [
        'network',
        'timeout',
        'econnrefused',
        'econnreset',
        'etimedout',
        'fetch failed',
        '503', // Service unavailable
        '429', // Rate limit
    ];

    return retryablePatterns.some(pattern =>
        error.message.toLowerCase().includes(pattern)
    );
}

/**
 * Execute a function with exponential backoff retry logic
 * 
 * @param fn Function to execute
 * @param options Retry configuration
 * @returns Result of the function
 * @throws Last error if all retries fail
 */
export async function withRetry<T>(
    fn: () => Promise<T>,
    options: Partial<RetryOptions> = {}
): Promise<T> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
        try {
            // Try the operation
            return await fn();
        } catch (error) {
            lastError = error as Error;

            // If this is the last attempt, throw
            if (attempt === opts.maxRetries) {
                logger.error('Retry exhausted', {
                    attempts: attempt + 1,
                    maxRetries: opts.maxRetries,
                    error: lastError.message,
                });
                throw lastError;
            }

            // Check if error is retryable
            if (!isRetryableError(lastError, opts)) {
                logger.warn('Non-retryable error encountered', {
                    attempt: attempt + 1,
                    error: lastError.message,
                });
                throw lastError;
            }

            // Calculate delay and wait
            const delayMs = calculateDelay(attempt, opts);

            logger.warn('Retrying after error', {
                attempt: attempt + 1,
                maxRetries: opts.maxRetries,
                delayMs,
                error: lastError.message,
            });

            // Call onRetry callback if provided
            if (opts.onRetry) {
                opts.onRetry(attempt + 1, lastError);
            }

            await sleep(delayMs);
        }
    }

    // Should never reach here, but TypeScript needs this
    throw lastError ?? new Error('Retry failed with unknown error');
}

/**
 * Create a retry function with predefined options
 */
export function createRetryHandler(
    options: Partial<RetryOptions>
): <T>(fn: () => Promise<T>) => Promise<T> {
    return <T>(fn: () => Promise<T>) => withRetry(fn, options);
}
