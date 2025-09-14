import { Telegraf } from 'telegraf';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config, logConfiguration } from '@/config/env';
import { botLogger, logStartup, logShutdown, logError } from '@/utils/logger';
import { BotContext } from '@/types';
import { handleMessage } from '@/handlers/message';
import commandHandlers from '@/handlers/commands';
import convexService from '@/services/convex';
import openaiService from '@/services/openai';
import { pluginManager } from '@/plugins/manager';

// Initialize Express app for health checks and webhooks
const app = express();

// Server reference for graceful shutdown
let server: import('http').Server | undefined;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '1.0.0'
  });
});

// Webhook endpoint (for production)
app.post('/webhook/telegram', (req, res) => {
  // Verify webhook secret
  const secretToken = req.headers['x-telegram-bot-api-secret-token'];
  if (secretToken !== process.env['TELEGRAM_WEBHOOK_SECRET']) {
    return res.status(401).send('Unauthorized');
  }
  
  bot.handleUpdate(req.body);
  res.sendStatus(200);
});

// Initialize Telegram bot
const bot = new Telegraf<BotContext>(config.telegram.token);

// Error handling middleware
bot.catch((err, ctx) => {
  logError(botLogger, err as Error, {
    operation: 'bot_error',
    chatId: ctx.chat?.id.toString(),
    userId: ctx.from?.id.toString(),
    updateType: ctx.updateType
  });
});

// Command handlers
bot.start(commandHandlers.start);
bot.help(commandHandlers.help);
bot.command('search', commandHandlers.search);
bot.command('summary', commandHandlers.summary);
bot.command('translate', commandHandlers.translate);
bot.command('remind', commandHandlers.remind);
bot.command('settings', commandHandlers.settings);
bot.command('ping', commandHandlers.ping);

// Message handler for all non-command messages
bot.on('message', handleMessage);

// Graceful shutdown handler
const gracefulShutdown = async (signal: string) => {
  logShutdown(botLogger, 'buddian-bot', `Received ${signal}`, true);
  
  // Stop the bot
  bot.stop(signal);
  
  // Shutdown plugin manager
  if (config.plugins.enabled) {
    await pluginManager.shutdown();
    botLogger.info('🔌 Plugin manager shutdown');
  }
  
  // Close database connections
  convexService.cleanup();
  
  // Close Express server if it exists
  if (server) {
    server.close(() => {
      logShutdown(botLogger, 'express-server', 'Server closed', true);
      process.exit(0);
    });
  } else {
    logShutdown(botLogger, 'express-server', 'Server not started, proceeding to exit', true);
    process.exit(0);
  }
  
  // Force exit after 10 seconds
  setTimeout(() => {
    logShutdown(botLogger, 'buddian-bot', 'Force exit after timeout', false);
    process.exit(1);
  }, 10000);
};

// Register shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Unhandled error handlers
process.on('unhandledRejection', (reason, promise) => {
  logError(botLogger, new Error(`Unhandled Rejection: ${reason}`), {
    operation: 'unhandled_rejection',
    promise: promise.toString()
  });
});

process.on('uncaughtException', (error) => {
  logError(botLogger, error, {
    operation: 'uncaught_exception'
  });
  
  // Graceful shutdown on uncaught exception
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

// Start the application
async function startApplication() {
  try {
    // Log startup information
    logStartup(botLogger, 'buddian-bot', '1.0.0', {
      nodeEnv: config.app.nodeEnv,
      port: config.app.port,
      logLevel: config.app.logLevel
    });
    
    // Log configuration (safe for production)
    logConfiguration();
    
    // Test database connection
    const dbHealthy = await convexService.health.checkConnection();
    if (!dbHealthy) {
      throw new Error('Database connection failed');
    }
    botLogger.info('✅ Database connection established');
    
    // Test AI service connection
    const aiHealthy = await openaiService.health.checkConnection();
    if (!aiHealthy) {
      botLogger.warn('⚠️ AI service connection failed - some features may be limited');
    } else {
      botLogger.info('✅ AI service connection established');
    }
    
    // Initialize plugin manager
    if (config.plugins.enabled) {
      await pluginManager.initialize();
      botLogger.info('🔌 Plugin manager initialized');
    }
    
    // Start Express server
    server = app.listen(config.app.port, () => {
      botLogger.info(`🚀 Express server listening on port ${config.app.port}`);
    });
    
    // Set up webhook or polling based on environment
    if (config.app.nodeEnv === 'production' && config.telegram.webhookUrl) {
      // Production: Use webhooks
      const webhookOptions: any = {
        allowed_updates: config.telegram.allowedUpdates
      };
      if (process.env['TELEGRAM_WEBHOOK_SECRET']) {
        webhookOptions.secret_token = process.env['TELEGRAM_WEBHOOK_SECRET'];
      }
      await bot.telegram.setWebhook(`${config.telegram.webhookUrl}/webhook/telegram`, webhookOptions);
      botLogger.info('🔗 Webhook configured for production');
    } else {
      // Development: Use polling
      await bot.launch({
        allowedUpdates: config.telegram.allowedUpdates
      });
      botLogger.info('🔄 Bot started with polling for development');
    }
    
    botLogger.info('🤖 Buddian bot is now running!');
    
  } catch (error) {
    logError(botLogger, error as Error, {
      operation: 'application_startup'
    });
    
    botLogger.error('❌ Failed to start application');
    process.exit(1);
  }
}


// Start the application
startApplication();
