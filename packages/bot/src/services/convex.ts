import { ConvexClient } from 'convex/browser';
import { api } from '../../../../convex/_generated/api';
import { convexConfig } from '@/config/env';
import { convexLogger, logError, logDatabaseOperation } from '@/utils/logger';
import { 
  Message, 
  User, 
  Resource, 
  Decision, 
  ActionItem, 
  ConversationThread,
  SearchResult,
  ConvexError 
} from '@/types';

// Initialize Convex client
const convex = new ConvexClient(convexConfig.url);

// Set authentication if admin key is provided
if (convexConfig.adminKey) {
  convex.setAuth(convexConfig.adminKey);
}

// Connection management
let isConnected = false;
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;

convex.onTransition((isConnected_: boolean) => {
  isConnected = isConnected_;
  if (isConnected) {
    convexLogger.info('Connected to Convex');
    reconnectAttempts = 0;
  } else {
    convexLogger.warn('Disconnected from Convex');
    if (reconnectAttempts < maxReconnectAttempts) {
      reconnectAttempts++;
      convexLogger.info(`Attempting to reconnect (${reconnectAttempts}/${maxReconnectAttempts})`);
    }
  }
});

// Helper function to execute operations with error handling
async function executeOperation<T>(
  operation: () => Promise<T>,
  operationName: string,
  context?: Record<string, any>
): Promise<T> {
  const startTime = Date.now();
  
  try {
    if (!isConnected) {
      throw new ConvexError('Not connected to Convex database');
    }
    
    const result = await operation();
    const duration = Date.now() - startTime;
    
    logDatabaseOperation(convexLogger, operationName, 'convex', undefined, duration, context);
    
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    logError(convexLogger, error as Error, { 
      operation: operationName, 
      duration,
      ...context 
    });
    
    if (error instanceof Error) {
      throw new ConvexError(`Convex operation failed: ${error.message}`, { 
        operation: operationName,
        originalError: error.message,
        ...context 
      });
    }
    
    throw error;
  }
}

// Message operations
export const messageService = {
  async storeMessage(message: Omit<Message, 'id'>): Promise<string> {
    return executeOperation(
      () => convex.mutation(api.messages.storeMessage, message),
      'storeMessage',
      { chatId: message.chatId, userId: message.userId }
    );
  },

  async getMessage(messageId: string): Promise<Message | null> {
    return executeOperation(
      () => convex.query(api.messages.getMessage, { messageId }),
      'getMessage',
      { messageId }
    );
  },

  async getMessages(chatId: string, limit: number = 50, before?: number): Promise<Message[]> {
    return executeOperation(
      () => convex.query(api.messages.getMessages, { chatId, limit, before }),
      'getMessages',
      { chatId, limit }
    );
  },

  async searchMessages(chatId: string, query: string, limit: number = 20): Promise<SearchResult[]> {
    return executeOperation(
      () => convex.query(api.messages.searchMessages, { chatId, query, limit }),
      'searchMessages',
      { chatId, query }
    );
  },

  async getThreadContext(chatId: string, messageCount: number = 10): Promise<Message[]> {
    return executeOperation(
      () => convex.query(api.messages.getThreadContext, { chatId, messageCount }),
      'getThreadContext',
      { chatId, messageCount }
    );
  },

  async updateMessageDecisions(messageId: string, decisions: Decision[]): Promise<void> {
    return executeOperation(
      () => convex.mutation(api.messages.updateMessageDecisions, { messageId, decisions }),
      'updateMessageDecisions',
      { messageId, decisionsCount: decisions.length }
    );
  },

  async updateMessageActionItems(messageId: string, actionItems: ActionItem[]): Promise<void> {
    return executeOperation(
      () => convex.mutation(api.messages.updateMessageActionItems, { messageId, actionItems }),
      'updateMessageActionItems',
      { messageId, actionItemsCount: actionItems.length }
    );
  }
};

// User operations
export const userService = {
  async createUser(user: Omit<User, 'id' | 'createdAt' | 'lastActiveAt'>): Promise<string> {
    return executeOperation(
      () => convex.mutation(api.users.createUser, {
        ...user,
        createdAt: Date.now(),
        lastActiveAt: Date.now()
      }),
      'createUser',
      { telegramId: user.telegramId }
    );
  },

  async getUser(telegramId: number): Promise<User | null> {
    return executeOperation(
      () => convex.query(api.users.getUser, { telegramId }),
      'getUser',
      { telegramId }
    );
  },

  async getUserById(userId: string): Promise<User | null> {
    return executeOperation(
      () => convex.query(api.users.getUserById, { userId }),
      'getUserById',
      { userId }
    );
  },

  async updateUserPreferences(userId: string, preferences: Partial<User['preferences']>): Promise<void> {
    return executeOperation(
      () => convex.mutation(api.users.updateUserPreferences, { userId, preferences }),
      'updateUserPreferences',
      { userId }
    );
  },

  async updateLastActive(userId: string): Promise<void> {
    return executeOperation(
      () => convex.mutation(api.users.updateLastActive, { userId, lastActiveAt: Date.now() }),
      'updateLastActive',
      { userId }
    );
  },

  async getUserLanguage(userId: string): Promise<string> {
    return executeOperation(
      () => convex.query(api.users.getUserLanguage, { userId }),
      'getUserLanguage',
      { userId }
    );
  }
};

// Resource operations
export const resourceService = {
  async storeResource(resource: Omit<Resource, 'id'>): Promise<string> {
    return executeOperation(
      () => convex.mutation(api.resources.storeResource, resource),
      'storeResource',
      { type: resource.type, chatId: resource.chatId }
    );
  },

  async getResource(resourceId: string): Promise<Resource | null> {
    return executeOperation(
      () => convex.query(api.resources.getResource, { resourceId }),
      'getResource',
      { resourceId }
    );
  },

  async getResources(chatId: string, type?: Resource['type'], limit: number = 20): Promise<Resource[]> {
    return executeOperation(
      () => convex.query(api.resources.getResources, { chatId, type, limit }),
      'getResources',
      { chatId, type, limit }
    );
  },

  async searchResources(chatId: string, query: string, limit: number = 10): Promise<SearchResult[]> {
    return executeOperation(
      () => convex.query(api.resources.searchResources, { chatId, query, limit }),
      'searchResources',
      { chatId, query }
    );
  },

  async updateResourceSummary(resourceId: string, summary: string): Promise<void> {
    return executeOperation(
      () => convex.mutation(api.resources.updateResourceSummary, { resourceId, summary }),
      'updateResourceSummary',
      { resourceId }
    );
  }
};

// Thread operations
export const threadService = {
  async createThread(thread: Omit<ConversationThread, 'id' | 'createdAt'>): Promise<string> {
    return executeOperation(
      () => convex.mutation(api.threads.createThread, {
        ...thread,
        createdAt: Date.now()
      }),
      'createThread',
      { chatId: thread.chatId, topic: thread.topic }
    );
  },

  async getThread(threadId: string): Promise<ConversationThread | null> {
    return executeOperation(
      () => convex.query(api.threads.getThread, { threadId }),
      'getThread',
      { threadId }
    );
  },

  async getActiveThreads(chatId: string, limit: number = 10): Promise<ConversationThread[]> {
    return executeOperation(
      () => convex.query(api.threads.getActiveThreads, { chatId, limit }),
      'getActiveThreads',
      { chatId, limit }
    );
  },

  async updateThreadActivity(threadId: string): Promise<void> {
    return executeOperation(
      () => convex.mutation(api.threads.updateThreadActivity, { 
        threadId, 
        lastActivity: Date.now() 
      }),
      'updateThreadActivity',
      { threadId }
    );
  },

  async updateThreadSummary(threadId: string, summary: string): Promise<void> {
    return executeOperation(
      () => convex.mutation(api.threads.updateThreadSummary, { threadId, summary }),
      'updateThreadSummary',
      { threadId }
    );
  }
};

// Search operations
export const searchService = {
  async searchByKeywords(
    chatId: string, 
    keywords: string[], 
    limit: number = 20
  ): Promise<SearchResult[]> {
    return executeOperation(
      () => convex.query(api.search.searchByKeywords, { chatId, keywords, limit }),
      'searchByKeywords',
      { chatId, keywordsCount: keywords.length }
    );
  },

  async searchByContext(
    chatId: string, 
    context: string, 
    limit: number = 20
  ): Promise<SearchResult[]> {
    return executeOperation(
      () => convex.query(api.search.searchByContext, { chatId, context, limit }),
      'searchByContext',
      { chatId, context: context.substring(0, 100) }
    );
  },

  async getRelatedContent(
    messageId: string, 
    limit: number = 10
  ): Promise<SearchResult[]> {
    return executeOperation(
      () => convex.query(api.search.getRelatedContent, { messageId, limit }),
      'getRelatedContent',
      { messageId, limit }
    );
  }
};

// Health check
export const healthService = {
  async checkConnection(): Promise<boolean> {
    try {
      await convex.query(api.health.ping);
      return true;
    } catch (error) {
      logError(convexLogger, error as Error, { operation: 'healthCheck' });
      return false;
    }
  },

  async getStats(): Promise<Record<string, any>> {
    return executeOperation(
      () => convex.query(api.health.getStats),
      'getStats'
    );
  }
};

// Real-time subscriptions
export const subscriptionService = {
  subscribeToMessages(chatId: string, callback: (messages: Message[]) => void) {
    return convex.subscribe(
      api.messages.getMessages,
      { chatId, limit: 50 },
      callback
    );
  },

  subscribeToResources(chatId: string, callback: (resources: Resource[]) => void) {
    return convex.subscribe(
      api.resources.getResources,
      { chatId, limit: 20 },
      callback
    );
  },

  subscribeToThreads(chatId: string, callback: (threads: ConversationThread[]) => void) {
    return convex.subscribe(
      api.threads.getActiveThreads,
      { chatId, limit: 10 },
      callback
    );
  }
};

// Cleanup function
export const cleanup = () => {
  convex.close();
  convexLogger.info('Convex client closed');
};

// Export the client for advanced usage
export { convex };

// Export all services
export default {
  message: messageService,
  user: userService,
  resource: resourceService,
  thread: threadService,
  search: searchService,
  health: healthService,
  subscription: subscriptionService,
  cleanup
};
