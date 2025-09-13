import pino from 'pino';
import { appConfig } from '@/config/env';

// Create logger configuration based on environment
const loggerConfig = {
  level: appConfig.logLevel,
  ...(appConfig.nodeEnv === 'development' && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
        singleLine: true,
      },
    },
  }),
  ...(appConfig.nodeEnv === 'production' && {
    formatters: {
      level: (label: string) => {
        return { level: label };
      },
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  }),
};

// Create the main logger instance
export const logger = pino(loggerConfig);

// Create child loggers for different components
export const createChildLogger = (component: string) => {
  return logger.child({ component });
};

// Specialized loggers for different parts of the application
export const botLogger = createChildLogger('bot');
export const convexLogger = createChildLogger('convex');
export const openaiLogger = createChildLogger('openai');
export const telegramLogger = createChildLogger('telegram');
export const pluginLogger = createChildLogger('plugin');
export const contentLogger = createChildLogger('content');

// Request correlation ID generator
let requestIdCounter = 0;
export const generateRequestId = (): string => {
  return `req_${Date.now()}_${++requestIdCounter}`;
};

// Request logger middleware
export const createRequestLogger = (requestId: string) => {
  return logger.child({ requestId });
};

// Error logging helper
export const logError = (
  logger: pino.Logger,
  error: Error,
  context?: Record<string, any>
) => {
  logger.error(
    {
      err: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      ...context,
    },
    'Error occurred'
  );
};

// Performance logging helper
export const logPerformance = (
  logger: pino.Logger,
  operation: string,
  duration: number,
  context?: Record<string, any>
) => {
  logger.info(
    {
      operation,
      duration,
      ...context,
    },
    `Operation completed in ${duration}ms`
  );
};

// API call logging helper
export const logApiCall = (
  logger: pino.Logger,
  service: string,
  method: string,
  url: string,
  statusCode?: number,
  duration?: number,
  context?: Record<string, any>
) => {
  logger.info(
    {
      service,
      method,
      url,
      statusCode,
      duration,
      ...context,
    },
    `API call to ${service}`
  );
};

// User action logging helper
export const logUserAction = (
  logger: pino.Logger,
  userId: string,
  chatId: string,
  action: string,
  context?: Record<string, any>
) => {
  logger.info(
    {
      userId,
      chatId,
      action,
      ...context,
    },
    `User action: ${action}`
  );
};

// Message processing logging helper
export const logMessageProcessing = (
  logger: pino.Logger,
  messageId: string,
  chatId: string,
  userId: string,
  messageType: string,
  processingStage: string,
  context?: Record<string, any>
) => {
  logger.info(
    {
      messageId,
      chatId,
      userId,
      messageType,
      processingStage,
      ...context,
    },
    `Message processing: ${processingStage}`
  );
};

// Plugin logging helper
export const logPluginActivity = (
  logger: pino.Logger,
  pluginName: string,
  action: string,
  success: boolean,
  duration?: number,
  context?: Record<string, any>
) => {
  logger.info(
    {
      pluginName,
      action,
      success,
      duration,
      ...context,
    },
    `Plugin ${pluginName}: ${action} ${success ? 'succeeded' : 'failed'}`
  );
};

// Database operation logging helper
export const logDatabaseOperation = (
  logger: pino.Logger,
  operation: string,
  table: string,
  recordId?: string,
  duration?: number,
  context?: Record<string, any>
) => {
  logger.debug(
    {
      operation,
      table,
      recordId,
      duration,
      ...context,
    },
    `Database operation: ${operation} on ${table}`
  );
};

// Content analysis logging helper
export const logContentAnalysis = (
  logger: pino.Logger,
  contentType: string,
  analysisType: string,
  success: boolean,
  duration?: number,
  context?: Record<string, any>
) => {
  logger.info(
    {
      contentType,
      analysisType,
      success,
      duration,
      ...context,
    },
    `Content analysis: ${analysisType} for ${contentType}`
  );
};

// Rate limiting logging helper
export const logRateLimit = (
  logger: pino.Logger,
  userId: string,
  chatId: string,
  action: string,
  remaining: number,
  resetTime: number
) => {
  logger.warn(
    {
      userId,
      chatId,
      action,
      remaining,
      resetTime,
    },
    'Rate limit applied'
  );
};

// System health logging helper
export const logSystemHealth = (
  logger: pino.Logger,
  component: string,
  status: 'healthy' | 'degraded' | 'unhealthy',
  metrics?: Record<string, any>
) => {
  const logLevel = status === 'healthy' ? 'info' : status === 'degraded' ? 'warn' : 'error';
  
  logger[logLevel](
    {
      component,
      status,
      ...metrics,
    },
    `System health check: ${component} is ${status}`
  );
};

// Startup logging helper
export const logStartup = (
  logger: pino.Logger,
  component: string,
  version: string,
  config?: Record<string, any>
) => {
  logger.info(
    {
      component,
      version,
      ...config,
    },
    `${component} starting up`
  );
};

// Shutdown logging helper
export const logShutdown = (
  logger: pino.Logger,
  component: string,
  reason: string,
  graceful: boolean = true
) => {
  logger.info(
    {
      component,
      reason,
      graceful,
    },
    `${component} shutting down`
  );
};

// Export default logger
export default logger;
