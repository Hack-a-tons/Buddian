import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// Store a new resource
export const storeResource = mutation({
  args: {
    type: v.union(
      v.literal("pdf"),
      v.literal("image"),
      v.literal("url"),
      v.literal("video"),
      v.literal("audio")
    ),
    url: v.optional(v.string()),
    filename: v.optional(v.string()),
    content: v.string(),
    summary: v.string(),
    metadata: v.object({
      size: v.optional(v.number()),
      mimeType: v.optional(v.string()),
      pages: v.optional(v.number()),
      duration: v.optional(v.number()),
      dimensions: v.optional(v.object({
        width: v.number(),
        height: v.number()
      })),
      language: v.optional(v.string()),
      title: v.optional(v.string()),
      author: v.optional(v.string())
    }),
    extractedAt: v.number(),
    chatId: v.string(),
    userId: v.string()
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("resources", args);
  },
});

// Get resources - unified function that handles both chat filtering and type filtering
export const getResources = query({
  args: { 
    chatId: v.string(),
    type: v.optional(v.union(
      v.literal("pdf"),
      v.literal("image"),
      v.literal("url"),
      v.literal("video"),
      v.literal("audio")
    )),
    limit: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    if (args.type) {
      // Filter by both chat and type
      return await ctx.db
        .query("resources")
        .withIndex("by_chat_type", (q) => 
          q.eq("chatId", args.chatId).eq("type", args.type)
        )
        .order("desc")
        .take(args.limit || 50);
    } else {
      // Filter by chat only
      return await ctx.db
        .query("resources")
        .withIndex("by_chat", (q) => q.eq("chatId", args.chatId))
        .order("desc")
        .take(args.limit || 50);
    }
  },
});

// Get resources by user ID
export const getResourcesByUser = query({
  args: { 
    userId: v.string(),
    limit: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("resources")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(args.limit || 50);
  },
});

// Search resources by content
export const searchResources = query({
  args: {
    chatId: v.string(),
    query: v.string(),
    limit: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const results = await ctx.db
      .query("resources")
      .withSearchIndex("search_content", (q) =>
        q.search("content", args.query).eq("chatId", args.chatId)
      )
      .take(args.limit || 20);

    // Also search summaries
    const summaryResults = await ctx.db
      .query("resources")
      .withSearchIndex("search_summary", (q) =>
        q.search("summary", args.query).eq("chatId", args.chatId)
      )
      .take(args.limit || 20);

    // Combine and deduplicate results
    const combined = [...results, ...summaryResults];
    const unique = combined.filter((resource, index, self) =>
      index === self.findIndex(r => r._id === resource._id)
    );

    // Map to SearchResult format
    return unique.slice(0, args.limit || 20).map((resource) => ({
      id: resource._id,
      type: 'resource' as const,
      content: resource.content,
      relevanceScore: 0.8, // Static placeholder as requested
      context: resource.summary,
      timestamp: resource.extractedAt,
      chatId: resource.chatId,
      userId: resource.userId
    }));
  },
});

// Get resource by ID
export const getResource = query({
  args: { resourceId: v.id("resources") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.resourceId);
  },
});

// Update resource summary
export const updateResourceSummary = mutation({
  args: {
    resourceId: v.id("resources"),
    summary: v.string()
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.resourceId, {
      summary: args.summary
    });
  },
});

// Delete resource
export const deleteResource = mutation({
  args: { id: v.id("resources") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

// Get recent resources
export const getRecentResources = query({
  args: {
    chatId: v.string(),
    days: v.optional(v.number()),
    limit: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const daysAgo = Date.now() - ((args.days || 7) * 24 * 60 * 60 * 1000);
    
    return await ctx.db
      .query("resources")
      .withIndex("by_extracted_at", (q) => q.gte("extractedAt", daysAgo))
      .filter((q) => q.eq(q.field("chatId"), args.chatId))
      .order("desc")
      .take(args.limit || 20);
  },
});

// Get resource statistics
export const getResourceStats = query({
  args: { chatId: v.string() },
  handler: async (ctx, args) => {
    const resources = await ctx.db
      .query("resources")
      .withIndex("by_chat", (q) => q.eq("chatId", args.chatId))
      .collect();

    const stats = {
      total: resources.length,
      byType: {
        pdf: 0,
        image: 0,
        url: 0,
        video: 0,
        audio: 0
      },
      totalSize: 0,
      averageSize: 0
    };

    resources.forEach(resource => {
      stats.byType[resource.type]++;
      if (resource.metadata.size) {
        stats.totalSize += resource.metadata.size;
      }
    });

    if (stats.total > 0) {
      stats.averageSize = stats.totalSize / stats.total;
    }

    return stats;
  },
});
