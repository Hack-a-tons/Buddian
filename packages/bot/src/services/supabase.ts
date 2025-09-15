import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { supabaseConfig } from '@/config/env';
import { databaseLogger, logError, logDatabaseOperation } from '@/utils/logger';
import { 
  Message, 
  User, 
  Resource, 
  Decision, 
  ActionItem, 
  ConversationThread,
  SearchResult,
  DatabaseError 
} from '@/types';

// Initialize Supabase client
const supabase: SupabaseClient = createClient(
  supabaseConfig.url,
  supabaseConfig.serviceRoleKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

// Connection management
let isConnected = false;
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;

// Test connection on initialization
async function testConnection() {
  try {
    const { data, error } = await supabase.from('system_health').select('*').limit(1);
    if (error) throw error;
    isConnected = true;
    databaseLogger.info('Connected to Supabase');
    reconnectAttempts = 0;
  } catch (error) {
    isConnected = false;
    databaseLogger.error('Failed to connect to Supabase', { error });
    if (reconnectAttempts < maxReconnectAttempts) {
      reconnectAttempts++;
      databaseLogger.info(`Attempting to reconnect (${reconnectAttempts}/${maxReconnectAttempts})`);
      setTimeout(testConnection, 5000);
    }
  }
}

// Initialize connection
testConnection();

// Helper function to execute operations with error handling
async function executeOperation<T>(
  operation: () => Promise<T>,
  operationName: string,
  context?: Record<string, any>
): Promise<T> {
  const startTime = Date.now();
  
  try {
    if (!isConnected) {
      throw new DatabaseError('Not connected to Supabase database');
    }
    
    const result = await operation();
    const duration = Date.now() - startTime;
    
    logDatabaseOperation(databaseLogger, operationName, 'supabase', undefined, duration, context);
    
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    logError(databaseLogger, error as Error, { 
      operation: operationName, 
      duration,
      ...context 
    });
    
    if (error instanceof Error) {
      throw new DatabaseError(`Supabase operation failed: ${error.message}`, { 
        operation: operationName,
        originalError: error.message,
        ...context 
      });
    }
    
    throw error;
  }
}

// Helper function to convert timestamp to bigint
function toBigInt(timestamp: number): number {
  return Math.floor(timestamp);
}

// Message operations
export const messageService = {
  async storeMessage(message: Omit<Message, 'id'>): Promise<string> {
    return executeOperation(
      async () => {
        const { data, error } = await supabase
          .from('messages')
          .insert({
            chat_id: message.chatId,
            user_id: message.userId,
            content: message.content,
            timestamp: toBigInt(message.timestamp),
            language: message.language,
            message_type: message.messageType,
            metadata: message.metadata || null,
            decisions: message.decisions || [],
            action_items: message.actionItems || [],
            thread_id: message.threadId || null
          })
          .select('id')
          .single();
        
        if (error) throw error;
        return data.id;
      },
      'storeMessage',
      { chatId: message.chatId, userId: message.userId }
    );
  },

  async getMessage(messageId: string): Promise<Message | null> {
    return executeOperation(
      async () => {
        const { data, error } = await supabase
          .from('messages')
          .select('*')
          .eq('id', messageId)
          .single();
        
        if (error) {
          if (error.code === 'PGRST116') return null; // Not found
          throw error;
        }
        
        return {
          id: data.id,
          chatId: data.chat_id,
          userId: data.user_id,
          content: data.content,
          timestamp: data.timestamp,
          language: data.language,
          messageType: data.message_type,
          metadata: data.metadata,
          decisions: data.decisions || [],
          actionItems: data.action_items || [],
          threadId: data.thread_id
        };
      },
      'getMessage',
      { messageId }
    );
  },

  async getMessages(chatId: string, limit: number = 50, before?: number): Promise<Message[]> {
    return executeOperation(
      async () => {
        let query = supabase
          .from('messages')
          .select('*')
          .eq('chat_id', chatId)
          .order('timestamp', { ascending: false })
          .limit(limit);
        
        if (before) {
          query = query.lt('timestamp', before);
        }
        
        const { data, error } = await query;
        
        if (error) throw error;
        
        return data.map(row => ({
          id: row.id,
          chatId: row.chat_id,
          userId: row.user_id,
          content: row.content,
          timestamp: row.timestamp,
          language: row.language,
          messageType: row.message_type,
          metadata: row.metadata,
          decisions: row.decisions || [],
          actionItems: row.action_items || [],
          threadId: row.thread_id
        }));
      },
      'getMessages',
      { chatId, limit }
    );
  },

  async searchMessages(chatId: string, query: string, limit: number = 20): Promise<SearchResult[]> {
    return executeOperation(
      async () => {
        const { data, error } = await supabase
          .from('messages')
          .select('*')
          .eq('chat_id', chatId)
          .textSearch('content', query)
          .order('timestamp', { ascending: false })
          .limit(limit);
        
        if (error) throw error;
        
        return data.map(row => ({
          id: row.id,
          type: 'message' as const,
          content: row.content,
          relevanceScore: 1.0, // PostgreSQL doesn't return relevance score by default
          context: row.content.substring(0, 200),
          timestamp: row.timestamp,
          chatId: row.chat_id,
          userId: row.user_id
        }));
      },
      'searchMessages',
      { chatId, query }
    );
  },

  async getThreadContext(chatId: string, messageCount: number = 10): Promise<Message[]> {
    return executeOperation(
      async () => {
        const { data, error } = await supabase
          .from('messages')
          .select('*')
          .eq('chat_id', chatId)
          .order('timestamp', { ascending: false })
          .limit(messageCount);
        
        if (error) throw error;
        
        return data.map(row => ({
          id: row.id,
          chatId: row.chat_id,
          userId: row.user_id,
          content: row.content,
          timestamp: row.timestamp,
          language: row.language,
          messageType: row.message_type,
          metadata: row.metadata,
          decisions: row.decisions || [],
          actionItems: row.action_items || [],
          threadId: row.thread_id
        })).reverse(); // Return in chronological order
      },
      'getThreadContext',
      { chatId, messageCount }
    );
  },

  async updateMessageDecisions(messageId: string, decisions: Decision[]): Promise<void> {
    return executeOperation(
      async () => {
        const { error } = await supabase
          .from('messages')
          .update({ decisions })
          .eq('id', messageId);
        
        if (error) throw error;
      },
      'updateMessageDecisions',
      { messageId, decisionsCount: decisions.length }
    );
  },

  async updateMessageActionItems(messageId: string, actionItems: ActionItem[]): Promise<void> {
    return executeOperation(
      async () => {
        const { error } = await supabase
          .from('messages')
          .update({ action_items: actionItems })
          .eq('id', messageId);
        
        if (error) throw error;
      },
      'updateMessageActionItems',
      { messageId, actionItemsCount: actionItems.length }
    );
  }
};

// User operations
export const userService = {
  async createUser(user: Omit<User, 'id' | 'createdAt' | 'lastActiveAt'>): Promise<string> {
    return executeOperation(
      async () => {
        const now = Date.now();
        const { data, error } = await supabase
          .from('users')
          .insert({
            telegram_id: user.telegramId,
            first_name: user.firstName,
            last_name: user.lastName || null,
            username: user.username || null,
            language_code: user.languageCode || null,
            preferences: user.preferences,
            created_at: toBigInt(now),
            last_active_at: toBigInt(now)
          })
          .select('id')
          .single();
        
        if (error) throw error;
        return data.id;
      },
      'createUser',
      { telegramId: user.telegramId }
    );
  },

  async getUser(telegramId: number): Promise<User | null> {
    return executeOperation(
      async () => {
        const { data, error } = await supabase
          .from('users')
          .select('*')
          .eq('telegram_id', telegramId)
          .single();
        
        if (error) {
          if (error.code === 'PGRST116') return null; // Not found
          throw error;
        }
        
        return {
          id: data.id,
          telegramId: data.telegram_id,
          firstName: data.first_name,
          lastName: data.last_name,
          username: data.username,
          languageCode: data.language_code,
          preferences: data.preferences,
          createdAt: data.created_at,
          lastActiveAt: data.last_active_at
        };
      },
      'getUser',
      { telegramId }
    );
  },

  async getUserById(userId: string): Promise<User | null> {
    return executeOperation(
      async () => {
        const { data, error } = await supabase
          .from('users')
          .select('*')
          .eq('id', userId)
          .single();
        
        if (error) {
          if (error.code === 'PGRST116') return null; // Not found
          throw error;
        }
        
        return {
          id: data.id,
          telegramId: data.telegram_id,
          firstName: data.first_name,
          lastName: data.last_name,
          username: data.username,
          languageCode: data.language_code,
          preferences: data.preferences,
          createdAt: data.created_at,
          lastActiveAt: data.last_active_at
        };
      },
      'getUserById',
      { userId }
    );
  },

  async updateUserPreferences(userId: string, preferences: Partial<User['preferences']>): Promise<void> {
    return executeOperation(
      async () => {
        // First get current preferences
        const { data: currentUser, error: fetchError } = await supabase
          .from('users')
          .select('preferences')
          .eq('id', userId)
          .single();
        
        if (fetchError) throw fetchError;
        
        // Merge preferences
        const updatedPreferences = { ...currentUser.preferences, ...preferences };
        
        const { error } = await supabase
          .from('users')
          .update({ preferences: updatedPreferences })
          .eq('id', userId);
        
        if (error) throw error;
      },
      'updateUserPreferences',
      { userId }
    );
  },

  async updateLastActive(userId: string): Promise<void> {
    return executeOperation(
      async () => {
        const { error } = await supabase
          .from('users')
          .update({ last_active_at: toBigInt(Date.now()) })
          .eq('id', userId);
        
        if (error) throw error;
      },
      'updateLastActive',
      { userId }
    );
  },

  async getUserLanguage(userId: string): Promise<string> {
    return executeOperation(
      async () => {
        const { data, error } = await supabase
          .from('users')
          .select('preferences')
          .eq('id', userId)
          .single();
        
        if (error) throw error;
        
        return data.preferences?.language || 'en';
      },
      'getUserLanguage',
      { userId }
    );
  }
};

// Resource operations
export const resourceService = {
  async storeResource(resource: Omit<Resource, 'id'>): Promise<string> {
    return executeOperation(
      async () => {
        const { data, error } = await supabase
          .from('resources')
          .insert({
            type: resource.type,
            url: resource.url || null,
            filename: resource.filename || null,
            content: resource.content,
            summary: resource.summary,
            metadata: resource.metadata,
            extracted_at: toBigInt(resource.extractedAt),
            chat_id: resource.chatId,
            user_id: resource.userId
          })
          .select('id')
          .single();
        
        if (error) throw error;
        return data.id;
      },
      'storeResource',
      { type: resource.type, chatId: resource.chatId }
    );
  },

  async getResource(resourceId: string): Promise<Resource | null> {
    return executeOperation(
      async () => {
        const { data, error } = await supabase
          .from('resources')
          .select('*')
          .eq('id', resourceId)
          .single();
        
        if (error) {
          if (error.code === 'PGRST116') return null; // Not found
          throw error;
        }
        
        return {
          id: data.id,
          type: data.type,
          url: data.url,
          filename: data.filename,
          content: data.content,
          summary: data.summary,
          metadata: data.metadata,
          extractedAt: data.extracted_at,
          chatId: data.chat_id,
          userId: data.user_id
        };
      },
      'getResource',
      { resourceId }
    );
  },

  async getResources(chatId: string, type?: Resource['type'], limit: number = 20): Promise<Resource[]> {
    return executeOperation(
      async () => {
        let query = supabase
          .from('resources')
          .select('*')
          .eq('chat_id', chatId)
          .order('extracted_at', { ascending: false })
          .limit(limit);
        
        if (type) {
          query = query.eq('type', type);
        }
        
        const { data, error } = await query;
        
        if (error) throw error;
        
        return data.map(row => ({
          id: row.id,
          type: row.type,
          url: row.url,
          filename: row.filename,
          content: row.content,
          summary: row.summary,
          metadata: row.metadata,
          extractedAt: row.extracted_at,
          chatId: row.chat_id,
          userId: row.user_id
        }));
      },
      'getResources',
      { chatId, type, limit }
    );
  },

  async searchResources(chatId: string, query: string, limit: number = 10): Promise<SearchResult[]> {
    return executeOperation(
      async () => {
        const { data, error } = await supabase
          .from('resources')
          .select('*')
          .eq('chat_id', chatId)
          .or(`content.ilike.%${query}%,summary.ilike.%${query}%`)
          .order('extracted_at', { ascending: false })
          .limit(limit);
        
        if (error) throw error;
        
        return data.map(row => ({
          id: row.id,
          type: 'resource' as const,
          content: row.summary,
          relevanceScore: 1.0,
          context: row.content.substring(0, 200),
          timestamp: row.extracted_at,
          chatId: row.chat_id,
          userId: row.user_id
        }));
      },
      'searchResources',
      { chatId, query }
    );
  },

  async updateResourceSummary(resourceId: string, summary: string): Promise<void> {
    return executeOperation(
      async () => {
        const { error } = await supabase
          .from('resources')
          .update({ summary })
          .eq('id', resourceId);
        
        if (error) throw error;
      },
      'updateResourceSummary',
      { resourceId }
    );
  }
};

// Thread operations
export const threadService = {
  async createThread(thread: Omit<ConversationThread, 'id' | 'createdAt'>): Promise<string> {
    return executeOperation(
      async () => {
        const { data, error } = await supabase
          .from('conversation_threads')
          .insert({
            chat_id: thread.chatId,
            topic: thread.topic,
            participants: thread.participants,
            message_count: thread.messageCount,
            last_activity: toBigInt(thread.lastActivity),
            created_at: toBigInt(Date.now()),
            summary: thread.summary || null,
            tags: thread.tags
          })
          .select('id')
          .single();
        
        if (error) throw error;
        return data.id;
      },
      'createThread',
      { chatId: thread.chatId, topic: thread.topic }
    );
  },

  async getThread(threadId: string): Promise<ConversationThread | null> {
    return executeOperation(
      async () => {
        const { data, error } = await supabase
          .from('conversation_threads')
          .select('*')
          .eq('id', threadId)
          .single();
        
        if (error) {
          if (error.code === 'PGRST116') return null; // Not found
          throw error;
        }
        
        return {
          id: data.id,
          chatId: data.chat_id,
          topic: data.topic,
          participants: data.participants,
          messageCount: data.message_count,
          lastActivity: data.last_activity,
          createdAt: data.created_at,
          summary: data.summary,
          tags: data.tags
        };
      },
      'getThread',
      { threadId }
    );
  },

  async getActiveThreads(chatId: string, limit: number = 10): Promise<ConversationThread[]> {
    return executeOperation(
      async () => {
        const { data, error } = await supabase
          .from('conversation_threads')
          .select('*')
          .eq('chat_id', chatId)
          .order('last_activity', { ascending: false })
          .limit(limit);
        
        if (error) throw error;
        
        return data.map(row => ({
          id: row.id,
          chatId: row.chat_id,
          topic: row.topic,
          participants: row.participants,
          messageCount: row.message_count,
          lastActivity: row.last_activity,
          createdAt: row.created_at,
          summary: row.summary,
          tags: row.tags
        }));
      },
      'getActiveThreads',
      { chatId, limit }
    );
  },

  async updateThreadActivity(threadId: string): Promise<void> {
    return executeOperation(
      async () => {
        const { error } = await supabase
          .from('conversation_threads')
          .update({ 
            last_activity: toBigInt(Date.now()),
            message_count: supabase.raw('message_count + 1')
          })
          .eq('id', threadId);
        
        if (error) throw error;
      },
      'updateThreadActivity',
      { threadId }
    );
  },

  async updateThreadSummary(threadId: string, summary: string): Promise<void> {
    return executeOperation(
      async () => {
        const { error } = await supabase
          .from('conversation_threads')
          .update({ summary })
          .eq('id', threadId);
        
        if (error) throw error;
      },
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
      async () => {
        const searchQuery = keywords.join(' | ');
        const { data, error } = await supabase
          .from('messages')
          .select('*')
          .eq('chat_id', chatId)
          .textSearch('content', searchQuery)
          .order('timestamp', { ascending: false })
          .limit(limit);
        
        if (error) throw error;
        
        return data.map(row => ({
          id: row.id,
          type: 'message' as const,
          content: row.content,
          relevanceScore: 1.0,
          context: row.content.substring(0, 200),
          timestamp: row.timestamp,
          chatId: row.chat_id,
          userId: row.user_id
        }));
      },
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
      async () => {
        const { data, error } = await supabase
          .from('messages')
          .select('*')
          .eq('chat_id', chatId)
          .textSearch('content', context)
          .order('timestamp', { ascending: false })
          .limit(limit);
        
        if (error) throw error;
        
        return data.map(row => ({
          id: row.id,
          type: 'message' as const,
          content: row.content,
          relevanceScore: 1.0,
          context: row.content.substring(0, 200),
          timestamp: row.timestamp,
          chatId: row.chat_id,
          userId: row.user_id
        }));
      },
      'searchByContext',
      { chatId, context: context.substring(0, 100) }
    );
  },

  async getRelatedContent(
    messageId: string, 
    limit: number = 10
  ): Promise<SearchResult[]> {
    return executeOperation(
      async () => {
        // First get the message content to find related content
        const { data: message, error: messageError } = await supabase
          .from('messages')
          .select('content, chat_id')
          .eq('id', messageId)
          .single();
        
        if (messageError) throw messageError;
        
        // Search for similar content in the same chat
        const { data, error } = await supabase
          .from('messages')
          .select('*')
          .eq('chat_id', message.chat_id)
          .neq('id', messageId)
          .textSearch('content', message.content.split(' ').slice(0, 5).join(' '))
          .order('timestamp', { ascending: false })
          .limit(limit);
        
        if (error) throw error;
        
        return data.map(row => ({
          id: row.id,
          type: 'message' as const,
          content: row.content,
          relevanceScore: 1.0,
          context: row.content.substring(0, 200),
          timestamp: row.timestamp,
          chatId: row.chat_id,
          userId: row.user_id
        }));
      },
      'getRelatedContent',
      { messageId, limit }
    );
  }
};

// Health check
export const healthService = {
  async checkConnection(): Promise<boolean> {
    try {
      const { data, error } = await supabase.from('system_health').select('*').limit(1);
      if (error) throw error;
      return true;
    } catch (error) {
      logError(databaseLogger, error as Error, { operation: 'healthCheck' });
      return false;
    }
  },

  async getStats(): Promise<Record<string, any>> {
    return executeOperation(
      async () => {
        const { data, error } = await supabase
          .from('system_health')
          .select('*')
          .eq('service_name', 'database')
          .single();
        
        if (error) throw error;
        
        return {
          status: data.status,
          metrics: data.metrics,
          lastCheck: data.last_check
        };
      },
      'getStats'
    );
  }
};

// Real-time subscriptions using Supabase Realtime
export const subscriptionService = {
  subscribeToMessages(chatId: string, callback: (messages: Message[]) => void) {
    const channel = supabase
      .channel(`messages:${chatId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `chat_id=eq.${chatId}`
        },
        async () => {
          // Fetch updated messages when changes occur
          const messages = await messageService.getMessages(chatId, 50);
          callback(messages);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },

  subscribeToResources(chatId: string, callback: (resources: Resource[]) => void) {
    const channel = supabase
      .channel(`resources:${chatId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'resources',
          filter: `chat_id=eq.${chatId}`
        },
        async () => {
          // Fetch updated resources when changes occur
          const resources = await resourceService.getResources(chatId, undefined, 20);
          callback(resources);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },

  subscribeToThreads(chatId: string, callback: (threads: ConversationThread[]) => void) {
    const channel = supabase
      .channel(`threads:${chatId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversation_threads',
          filter: `chat_id=eq.${chatId}`
        },
        async () => {
          // Fetch updated threads when changes occur
          const threads = await threadService.getActiveThreads(chatId, 10);
          callback(threads);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }
};

// Cleanup function
export const cleanup = () => {
  // Remove all channels and close connection
  supabase.removeAllChannels();
  databaseLogger.info('Supabase client cleaned up');
};

// Export the client for advanced usage
export { supabase };

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
