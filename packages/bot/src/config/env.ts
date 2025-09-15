import { z } from 'zod';
import dotenv from 'dotenv';
import { BotConfig } from '@/types';

// Load environment variables
dotenv.config();

// Environment validation schema
const envSchema = z.object({
  // Telegram configuration
  TELEGRAM_BOT_TOKEN: z.string().min(1, 'Telegram bot token is required'),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
  TELEGRAM_WEBHOOK_BASE_URL: z.string().url().optional(),
  
  // Supabase configuration
  SUPABASE_URL: z.string().url('Invalid Supabase URL'),
  SUPABASE_ANON_KEY: z.string().min(1, 'Supabase anon key is required'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'Supabase service role key is required'),
  
  // Azure OpenAI configuration
  AZURE_OPENAI_ENDPOINT: z.string().url('Invalid Azure OpenAI endpoint'),
  AZURE_OPENAI_KEY: z.string().min(1, 'Azure OpenAI key is required'),
  AZURE_OPENAI_API_VERSION: z.string().default('2024-02-15-preview'),
  AZURE_OPENAI_DEPLOYMENT_NAME: z.string().default('gpt-4'),
  AZURE_OPENAI_VISION_DEPLOYMENT_NAME: z.string().optional(),
  
  // Optional Azure Vision configuration
  AZURE_VISION_ENDPOINT: z.string().url().optional(),
  AZURE_VISION_KEY: z.string().optional(),
  
  // Application configuration
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  PORT: z.coerce.number().int().positive().default(3000),
  
  // Performance and limits
  MAX_CONVERSATION_HISTORY: z.coerce.number().int().positive().default(1000),
  CACHE_TTL: z.coerce.number().int().positive().default(3600),
  
  // Plugin configuration
  PLUGINS_ENABLED: z.coerce.boolean().default(true),
  PLUGIN_TIMEOUT: z.coerce.number().int().positive().default(30000),
  
  // Rate limiting
  RATE_LIMIT_WINDOW: z.coerce.number().int().positive().default(60000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(100),
  
  // Optional content analysis APIs
  MERCURY_API_KEY: z.string().optional(),
  READABILITY_API_KEY: z.string().optional(),
});

// Validate environment variables
const parseResult = envSchema.safeParse(process.env);

if (!parseResult.success) {
  console.error('❌ Invalid environment configuration:');
  parseResult.error.issues.forEach((issue) => {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  });
  process.exit(1);
}

const env = parseResult.data;

// Define allowed updates with proper typing
const allowedUpdates: NonNullable<BotConfig['telegram']['allowedUpdates']> = [
  'message',
  'edited_message',
  'callback_query',
  'inline_query',
  'chosen_inline_result',
  'my_chat_member',
  'chat_member',
];

// Create typed configuration object
export const config: BotConfig = {
  telegram: {
    token: env.TELEGRAM_BOT_TOKEN,
    ...(env.TELEGRAM_WEBHOOK_BASE_URL && { webhookUrl: env.TELEGRAM_WEBHOOK_BASE_URL }),
    allowedUpdates,
  },
  supabase: {
    url: env.SUPABASE_URL,
    anonKey: env.SUPABASE_ANON_KEY,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
  },
  openai: {
    endpoint: env.AZURE_OPENAI_ENDPOINT,
    apiKey: env.AZURE_OPENAI_KEY,
    apiVersion: env.AZURE_OPENAI_API_VERSION,
    deploymentName: env.AZURE_OPENAI_DEPLOYMENT_NAME,
    ...(env.AZURE_OPENAI_VISION_DEPLOYMENT_NAME && {
      visionDeploymentName: env.AZURE_OPENAI_VISION_DEPLOYMENT_NAME
    }),
  },
  ...(env.AZURE_VISION_ENDPOINT && env.AZURE_VISION_KEY && {
    vision: {
      endpoint: env.AZURE_VISION_ENDPOINT,
      apiKey: env.AZURE_VISION_KEY,
    }
  }),
  app: {
    port: env.PORT,
    logLevel: env.LOG_LEVEL,
    nodeEnv: env.NODE_ENV,
    maxConversationHistory: env.MAX_CONVERSATION_HISTORY,
    cacheTtl: env.CACHE_TTL,
  },
  plugins: {
    enabled: env.PLUGINS_ENABLED,
    timeout: env.PLUGIN_TIMEOUT,
    directory: './plugins',
  },
  rateLimit: {
    windowMs: env.RATE_LIMIT_WINDOW,
    maxRequests: env.RATE_LIMIT_MAX_REQUESTS,
  },
};

// Export individual config sections for convenience
export const telegramConfig = config.telegram;
export const supabaseConfig = config.supabase;
export const openaiConfig = config.openai;
export const visionConfig = config.vision;
export const appConfig = config.app;
export const pluginsConfig = config.plugins;
export const rateLimitConfig = config.rateLimit;

// Environment helpers
export const isDevelopment = env.NODE_ENV === 'development';
export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

// Validation helper
export function validateRequiredEnvVars(): void {
  const required = [
    'TELEGRAM_BOT_TOKEN',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'AZURE_OPENAI_ENDPOINT',
    'AZURE_OPENAI_KEY',
  ];
  
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

// Configuration logging (safe for production)
export function logConfiguration(): void {
  console.log('🔧 Configuration loaded:');
  console.log(`  - Environment: ${env.NODE_ENV}`);
  console.log(`  - Port: ${env.PORT}`);
  console.log(`  - Log Level: ${env.LOG_LEVEL}`);
  console.log(`  - Plugins Enabled: ${env.PLUGINS_ENABLED}`);
  console.log(`  - Max Conversation History: ${env.MAX_CONVERSATION_HISTORY}`);
  console.log(`  - Cache TTL: ${env.CACHE_TTL}s`);
  console.log(`  - Rate Limit: ${env.RATE_LIMIT_MAX_REQUESTS} requests per ${env.RATE_LIMIT_WINDOW}ms`);
  
  if (config.vision) {
    console.log('  - Azure Vision: Enabled');
  }
  
  if (env.MERCURY_API_KEY) {
    console.log('  - Mercury API: Enabled');
  }
  
  if (env.READABILITY_API_KEY) {
    console.log('  - Readability API: Enabled');
  }
}
