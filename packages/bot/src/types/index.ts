import { Context } from 'telegraf';

// Core domain types
export interface Message {
  id: string;
  chatId: string;
  userId: string;
  content: string;
  timestamp: number;
  language: string;
  messageType: 'text' | 'photo' | 'document' | 'voice' | 'video' | 'sticker' | 'location';
  metadata?: Record<string, any>;
  decisions?: Decision[];
  actionItems?: ActionItem[];
  threadId?: string;
}

export interface User {
  id: string;
  telegramId: number;
  firstName: string;
  lastName?: string;
  username?: string;
  languageCode?: string;
  preferences: UserPreferences;
  createdAt: number;
  lastActiveAt: number;
}

export interface UserPreferences {
  language: string;
  timezone: string;
  notifications: boolean;
  reminderFrequency: 'never' | 'daily' | 'weekly';
  summaryFrequency: 'never' | 'daily' | 'weekly';
  pluginsEnabled: string[];
}

export interface Decision {
  id: string;
  content: string;
  confidence: number;
  context: string;
  extractedAt: number;
  status: 'pending' | 'confirmed' | 'rejected';
  relatedMessages: string[];
}

export interface ActionItem {
  id: string;
  title: string;
  description: string;
  assignee?: string;
  dueDate?: number;
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  createdAt: number;
  updatedAt: number;
  relatedMessages: string[];
}

export interface Resource {
  id: string;
  type: 'pdf' | 'image' | 'url' | 'video' | 'audio';
  url?: string;
  filename?: string;
  content: string;
  summary: string;
  metadata: ResourceMetadata;
  extractedAt: number;
  chatId: string;
  userId: string;
}

export interface ResourceMetadata {
  size?: number;
  mimeType?: string;
  pages?: number;
  duration?: number;
  dimensions?: { width: number; height: number };
  language?: string;
  title?: string;
  author?: string;
}

export interface ConversationThread {
  id: string;
  chatId: string;
  topic: string;
  participants: string[];
  messageCount: number;
  lastActivity: number;
  createdAt: number;
  summary?: string;
  tags: string[];
}

export interface Plugin {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  config: PluginConfig;
  active: boolean;
  installedAt: number;
  lastUsed?: number;
}

export interface PluginConfig {
  commands: PluginCommand[];
  permissions: string[];
  settings: Record<string, any>;
  apiKeys?: Record<string, string>;
}

export interface PluginCommand {
  name: string;
  description: string;
  usage: string;
  parameters: PluginParameter[];
}

export interface PluginParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array';
  required: boolean;
  description: string;
  default?: any;
}

// Context and conversation types
export interface ConversationContext {
  chatId: string;
  recentMessages: Message[];
  activeThread?: ConversationThread;
  dominantLanguage: string;
  participants: User[];
  summary: string;
  topics: string[];
  decisions: Decision[];
  actionItems: ActionItem[];
  resources: Resource[];
}

export interface BotContext extends Context {
  user?: User;
  conversationContext?: ConversationContext;
  language: string;
}

// API response types
export interface OpenAIResponse {
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
  finishReason: string;
}

export interface LanguageDetectionResult {
  language: string;
  confidence: number;
  alternatives: Array<{ language: string; confidence: number }>;
}

export interface ContentAnalysisResult {
  content: string;
  summary: string;
  language: string;
  metadata: ResourceMetadata;
  extractedText?: string;
  keyPoints?: string[];
  sentiment?: 'positive' | 'negative' | 'neutral';
}

export interface SearchResult {
  id: string;
  type: 'message' | 'resource' | 'decision' | 'action_item';
  content: string;
  relevanceScore: number;
  context: string;
  timestamp: number;
  chatId: string;
  userId: string;
}

// Configuration types
export interface BotConfig {
  telegram: {
    token: string;
    webhookUrl?: string;
    allowedUpdates: string[];
  };
  convex: {
    url: string;
    adminKey: string;
  };
  openai: {
    endpoint: string;
    apiKey: string;
    apiVersion: string;
    deploymentName: string;
  };
  vision?: {
    endpoint: string;
    apiKey: string;
  };
  app: {
    port: number;
    logLevel: string;
    nodeEnv: string;
    maxConversationHistory: number;
    cacheTtl: number;
  };
  plugins: {
    enabled: boolean;
    timeout: number;
    directory: string;
  };
  rateLimit: {
    windowMs: number;
    maxRequests: number;
  };
}

// Error types
export class BuddianError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public context?: Record<string, any>
  ) {
    super(message);
    this.name = 'BuddianError';
  }
}

export class ValidationError extends BuddianError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'VALIDATION_ERROR', 400, context);
    this.name = 'ValidationError';
  }
}

export class ConvexError extends BuddianError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'CONVEX_ERROR', 500, context);
    this.name = 'ConvexError';
  }
}

export class OpenAIError extends BuddianError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'OPENAI_ERROR', 500, context);
    this.name = 'OpenAIError';
  }
}

// Utility types
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>;

export type OptionalFields<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
