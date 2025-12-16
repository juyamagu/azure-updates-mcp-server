/**
 * Structured logging utility for Azure Updates MCP Server
 * 
 * Provides JSON-formatted logs with severity levels and metrics
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
    [key: string]: unknown;
}

export interface LoggerConfig {
    level: LogLevel;
    enableConsole: boolean;
}

const LOG_LEVELS: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

let currentConfig: LoggerConfig = {
    level: 'info',
    enableConsole: true,
};

/**
 * Configure the logger
 */
export function configureLogger(config: Partial<LoggerConfig>): void {
    currentConfig = { ...currentConfig, ...config };
}

/**
 * Get current log level
 */
export function getLogLevel(): LogLevel {
    return currentConfig.level;
}

/**
 * Check if a log level should be output
 */
function shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[currentConfig.level];
}

/**
 * Format a log message as JSON
 */
function formatLog(level: LogLevel, message: string, context?: LogContext): string {
    const logEntry = {
        timestamp: new Date().toISOString(),
        level,
        message,
        ...context,
    };
    return JSON.stringify(logEntry);
}

/**
 * Log a debug message
 */
export function debug(message: string, context?: LogContext): void {
    if (!shouldLog('debug')) return;

    const formatted = formatLog('debug', message, context);
    if (currentConfig.enableConsole) {
        // eslint-disable-next-line no-console
        console.debug(formatted);
    }
}

/**
 * Log an info message
 */
export function info(message: string, context?: LogContext): void {
    if (!shouldLog('info')) return;

    const formatted = formatLog('info', message, context);
    if (currentConfig.enableConsole) {
        // eslint-disable-next-line no-console
        console.info(formatted);
    }
}

/**
 * Log a warning message
 */
export function warn(message: string, context?: LogContext): void {
    if (!shouldLog('warn')) return;

    const formatted = formatLog('warn', message, context);
    if (currentConfig.enableConsole) {
        // eslint-disable-next-line no-console
        console.warn(formatted);
    }
}

/**
 * Log an error message
 */
export function error(message: string, context?: LogContext): void {
    if (!shouldLog('error')) return;

    const formatted = formatLog('error', message, context);
    if (currentConfig.enableConsole) {
        // eslint-disable-next-line no-console
        console.error(formatted);
    }
}

/**
 * Log an error with stack trace
 */
export function errorWithStack(message: string, err: Error, context?: LogContext): void {
    error(message, {
        ...context,
        error: err.message,
        stack: err.stack,
    });
}

/**
 * Create a scoped logger with default context
 */
export function createLogger(defaultContext: LogContext): {
    debug: (message: string, context?: LogContext) => void;
    info: (message: string, context?: LogContext) => void;
    warn: (message: string, context?: LogContext) => void;
    error: (message: string, context?: LogContext) => void;
    errorWithStack: (message: string, err: Error, context?: LogContext) => void;
} {
    return {
        debug: (message: string, context?: LogContext) =>
            debug(message, { ...defaultContext, ...context }),
        info: (message: string, context?: LogContext) =>
            info(message, { ...defaultContext, ...context }),
        warn: (message: string, context?: LogContext) =>
            warn(message, { ...defaultContext, ...context }),
        error: (message: string, context?: LogContext) =>
            error(message, { ...defaultContext, ...context }),
        errorWithStack: (message: string, err: Error, context?: LogContext) =>
            errorWithStack(message, err, { ...defaultContext, ...context }),
    };
}

/**
 * Measure execution time and log it
 */
export async function measureTime<T>(
    operation: string,
    fn: () => Promise<T>,
    context?: LogContext
): Promise<T> {
    const startTime = Date.now();

    try {
        const result = await fn();
        const durationMs = Date.now() - startTime;

        info(`Operation completed: ${operation}`, {
            ...context,
            durationMs,
            operation,
        });

        return result;
    } catch (err) {
        const durationMs = Date.now() - startTime;

        errorWithStack(`Operation failed: ${operation}`, err as Error, {
            ...context,
            durationMs,
            operation,
        });

        throw err;
    }
}
