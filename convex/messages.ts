import { mutation, query } from "convex/server";
import { v } from "convex/values";

// Store a new message
export const storeMessage = mutation({
  args: {
    chatId: v.string(),
    userId: v.string(),
    content: v.string(),
    timestamp: v.number(),
    language: v.string(),
    messageType: v.union(
      v.literal("text"),
      v.literal("photo"),
      v.literal("document"),
      v.literal("voice"),
      v.literal("video"),
      v.literal("sticker"),
      v.literal("location")
    ),
    metadata: v.optional(v.any()),
    threadId: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("messages", args);
  },
});

// Get a specific message by ID
export const getMessage = query({
  args: { messageId: v.id("messages") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.messageId);
  },
});

// Get messages for a chat with pagination
export const getMessages = query({
  args: {
    chatId: v.string(),
    limit: v.optional(v.number()),
    before: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    
    let query = ctx.db
      .query("messages")
      .withIndex("by_chat_timestamp", (q) => q.eq("chatId", args.chatId));
    
    if (args.before) {
      query = query.filter((q) => q.lt(q.field("timestamp"), args.before));
    }
    
    return await query
      .order("desc")
      .take(limit);
  },
});

// Search messages by content
export const searchMessages = query({
  args: {
    chatId: v.string(),
    query: v.string(),
    limit: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;
    
    const results = await ctx.db
      .query("messages")
      .withSearchIndex("search_content", (q) =>
        q.search("content", args.query).eq("chatId", args.chatId)
      )
      .take(limit);
    
    return results.map(message => ({
      id: message._id,
      type: "message" as const,
      content: message.content,
      relevanceScore: 1.0, // Convex doesn't provide relevance scores yet
      context: message.content.substring(0, 200),
      timestamp: message.timestamp,
      chatId: message.chatId,
      userId: message.userId
    }));
  },
});

// Get thread context (recent messages for AI processing)
export const getThreadContext = query({
  args: {
    chatId: v.string(),
    messageCount: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const messageCount = args.messageCount ?? 10;
    
    return await ctx.db
      .query("messages")
      .withIndex("by_chat_timestamp", (q) => q.eq("chatId", args.chatId))
      .order("desc")
      .take(messageCount);
  },
});

// Update message with extracted decisions
export const updateMessageDecisions = mutation({
  args: {
    messageId: v.id("messages"),
    decisions: v.array(v.object({
      id: v.string(),
      content: v.string(),
      confidence: v.number(),
      context: v.string(),
      extractedAt: v.number(),
      status: v.union(
        v.literal("pending"),
        v.literal("confirmed"),
        v.literal("rejected")
      ),
      relatedMessages: v.array(v.string())
    }))
  },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId);
    if (!message) {
      throw new Error("Message not found");
    }
    
    await ctx.db.patch(args.messageId, {
      decisions: args.decisions
    });
    
    return args.messageId;
  },
});

// Update message with extracted action items
export const updateMessageActionItems = mutation({
  args: {
    messageId: v.id("messages"),
    actionItems: v.array(v.object({
      id: v.string(),
      title: v.string(),
      description: v.string(),
      assignee: v.optional(v.string()),
      dueDate: v.optional(v.number()),
      priority: v.union(
        v.literal("low"),
        v.literal("medium"),
        v.literal("high")
      ),
      status: v.union(
        v.literal("pending"),
        v.literal("in_progress"),
        v.literal("completed"),
        v.literal("cancelled")
      ),
      createdAt: v.number(),
      updatedAt: v.number(),
      relatedMessages: v.array(v.string())
    }))
  },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId);
    if (!message) {
      throw new Error("Message not found");
    }
    
    await ctx.db.patch(args.messageId, {
      actionItems: args.actionItems
    });
    
    return args.messageId;
  },
});

// Get messages by user
export const getMessagesByUser = query({
  args: {
    userId: v.string(),
    limit: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    
    return await ctx.db
      .query("messages")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(limit);
  },
});

// Get messages by thread
export const getMessagesByThread = query({
  args: {
    threadId: v.string(),
    limit: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    
    return await ctx.db
      .query("messages")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .order("desc")
      .take(limit);
  },
});

// Get messages with decisions
export const getMessagesWithDecisions = query({
  args: {
    chatId: v.string(),
    limit: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;
    
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_chat_timestamp", (q) => q.eq("chatId", args.chatId))
      .order("desc")
      .take(limit * 2); // Get more to filter
    
    return messages
      .filter(message => message.decisions && message.decisions.length > 0)
      .slice(0, limit);
  },
});

// Get messages with action items
export const getMessagesWithActionItems = query({
  args: {
    chatId: v.string(),
    limit: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 20;
    
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_chat_timestamp", (q) => q.eq("chatId", args.chatId))
      .order("desc")
      .take(limit * 2); // Get more to filter
    
    return messages
      .filter(message => message.actionItems && message.actionItems.length > 0)
      .slice(0, limit);
  },
});

// Get message statistics for a chat
export const getMessageStats = query({
  args: { chatId: v.string() },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_chat", (q) => q.eq("chatId", args.chatId))
      .collect();
    
    const totalMessages = messages.length;
    const messageTypes = messages.reduce((acc, message) => {
      acc[message.messageType] = (acc[message.messageType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const languages = messages.reduce((acc, message) => {
      acc[message.language] = (acc[message.language] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const totalDecisions = messages.reduce((acc, message) => {
      return acc + (message.decisions?.length || 0);
    }, 0);
    
    const totalActionItems = messages.reduce((acc, message) => {
      return acc + (message.actionItems?.length || 0);
    }, 0);
    
    const oldestMessage = messages.reduce((oldest, message) => {
      return !oldest || message.timestamp < oldest.timestamp ? message : oldest;
    }, null as any);
    
    const newestMessage = messages.reduce((newest, message) => {
      return !newest || message.timestamp > newest.timestamp ? message : newest;
    }, null as any);
    
    return {
      totalMessages,
      messageTypes,
      languages,
      totalDecisions,
      totalActionItems,
      dateRange: {
        oldest: oldestMessage?.timestamp,
        newest: newestMessage?.timestamp
      }
    };
  },
});

// Delete old messages (cleanup function)
export const deleteOldMessages = mutation({
  args: {
    chatId: v.string(),
    olderThan: v.number() // timestamp
  },
  handler: async (ctx, args) => {
    const oldMessages = await ctx.db
      .query("messages")
      .withIndex("by_chat_timestamp", (q) => q.eq("chatId", args.chatId))
      .filter((q) => q.lt(q.field("timestamp"), args.olderThan))
      .collect();
    
    let deletedCount = 0;
    for (const message of oldMessages) {
      await ctx.db.delete(message._id);
      deletedCount++;
    }
    
    return { deletedCount };
  },
});
