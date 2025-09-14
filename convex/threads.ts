import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// Create a new conversation thread
export const createThread = mutation({
  args: {
    chatId: v.string(),
    topic: v.string(),
    participants: v.array(v.string()),
    tags: v.optional(v.array(v.string()))
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("threads", {
      chatId: args.chatId,
      topic: args.topic,
      participants: args.participants,
      messageCount: 0,
      lastActivity: now,
      createdAt: now,
      tags: args.tags || []
    });
  },
});

// Get threads by chat ID
export const getThreadsByChat = query({
  args: { 
    chatId: v.string(),
    limit: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("threads")
      .withIndex("by_chat_activity", (q) => q.eq("chatId", args.chatId))
      .order("desc")
      .take(args.limit || 50);
  },
});

// Get thread by ID
export const getThread = query({
  args: { threadId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.threadId as any);
  },
});

// Update thread activity
export const updateThreadActivity = mutation({
  args: { 
    threadId: v.string(),
    lastActivity: v.number()
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.threadId as any, {
      lastActivity: args.lastActivity
    });
  },
});

// Update thread summary
export const updateThreadSummary = mutation({
  args: {
    threadId: v.id("threads"),
    summary: v.string()
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.threadId, {
      summary: args.summary
    });
  },
});

// Add tags to thread
export const addThreadTags = mutation({
  args: {
    id: v.id("threads"),
    tags: v.array(v.string())
  },
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.id);
    if (!thread) return;

    const existingTags = new Set(thread.tags);
    args.tags.forEach(tag => existingTags.add(tag));

    await ctx.db.patch(args.id, {
      tags: Array.from(existingTags)
    });
  },
});

// Remove tags from thread
export const removeThreadTags = mutation({
  args: {
    id: v.id("threads"),
    tags: v.array(v.string())
  },
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.id);
    if (!thread) return;

    const tagsToRemove = new Set(args.tags);
    const filteredTags = thread.tags.filter(tag => !tagsToRemove.has(tag));

    await ctx.db.patch(args.id, {
      tags: filteredTags
    });
  },
});

// Search threads by topic
export const searchThreads = query({
  args: {
    chatId: v.string(),
    query: v.string(),
    limit: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("threads")
      .withSearchIndex("search_topic", (q) =>
        q.search("topic", args.query).eq("chatId", args.chatId)
      )
      .take(args.limit || 20);
  },
});

// Get active threads (with recent activity)
export const getActiveThreads = query({
  args: {
    chatId: v.string(),
    hours: v.optional(v.number()),
    limit: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const hoursAgo = Date.now() - ((args.hours || 24) * 60 * 60 * 1000);
    
    return await ctx.db
      .query("threads")
      .withIndex("by_chat_activity", (q) => q.eq("chatId", args.chatId))
      .filter((q) => q.gte(q.field("lastActivity"), hoursAgo))
      .order("desc")
      .take(args.limit || 20);
  },
});

// Get threads by tags
export const getThreadsByTags = query({
  args: {
    chatId: v.string(),
    tags: v.array(v.string()),
    limit: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const threads = await ctx.db
      .query("threads")
      .withIndex("by_chat", (q) => q.eq("chatId", args.chatId))
      .collect();

    // Filter threads that have any of the specified tags
    const filteredThreads = threads.filter(thread =>
      args.tags.some(tag => thread.tags.includes(tag))
    );

    // Sort by last activity
    filteredThreads.sort((a, b) => b.lastActivity - a.lastActivity);

    return filteredThreads.slice(0, args.limit || 20);
  },
});

// Get thread statistics
export const getThreadStats = query({
  args: { chatId: v.string() },
  handler: async (ctx, args) => {
    const threads = await ctx.db
      .query("threads")
      .withIndex("by_chat", (q) => q.eq("chatId", args.chatId))
      .collect();

    const now = Date.now();
    const dayAgo = now - (24 * 60 * 60 * 1000);
    const weekAgo = now - (7 * 24 * 60 * 60 * 1000);

    const stats = {
      total: threads.length,
      activeToday: 0,
      activeThisWeek: 0,
      totalMessages: 0,
      averageMessagesPerThread: 0,
      topTags: [] as Array<{ tag: string; count: number }>
    };

    const tagCount = new Map<string, number>();

    threads.forEach(thread => {
      stats.totalMessages += thread.messageCount;
      
      if (thread.lastActivity >= dayAgo) {
        stats.activeToday++;
      }
      if (thread.lastActivity >= weekAgo) {
        stats.activeThisWeek++;
      }

      // Count tags
      thread.tags.forEach(tag => {
        tagCount.set(tag, (tagCount.get(tag) || 0) + 1);
      });
    });

    if (stats.total > 0) {
      stats.averageMessagesPerThread = stats.totalMessages / stats.total;
    }

    // Get top tags
    stats.topTags = Array.from(tagCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag, count]) => ({ tag, count }));

    return stats;
  },
});

// Delete thread
export const deleteThread = mutation({
  args: { id: v.id("threads") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

// Get messages in thread
export const getThreadMessages = query({
  args: {
    threadId: v.id("threads"),
    limit: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("messages")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .order("asc")
      .take(args.limit || 100);
  },
});

// Assign message to thread
export const assignMessageToThread = mutation({
  args: {
    messageId: v.id("messages"),
    threadId: v.id("threads")
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.messageId, {
      threadId: args.threadId
    });

    // Update thread activity and message count
    await updateThreadActivity(ctx, {
      id: args.threadId,
      incrementMessageCount: true
    });
  },
});
