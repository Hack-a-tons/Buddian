import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// Search by keywords across messages and resources
export const searchByKeywords = query({
  args: {
    chatId: v.string(),
    keywords: v.array(v.string()),
    limit: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 20;
    const searchString = args.keywords.join(' ');
    
    // Search messages
    const messageResults = await ctx.db
      .query("messages")
      .withSearchIndex("search_content", (q) =>
        q.search("content", searchString).eq("chatId", args.chatId)
      )
      .take(Math.floor(limit / 2));

    // Search resources
    const resourceResults = await ctx.db
      .query("resources")
      .withSearchIndex("search_content", (q) =>
        q.search("content", searchString).eq("chatId", args.chatId)
      )
      .take(Math.floor(limit / 2));

    // Convert to SearchResult format
    const results: any[] = [];
    
    messageResults.forEach(msg => {
      results.push({
        id: msg._id,
        type: 'message',
        content: msg.content,
        relevanceScore: 0.8, // Placeholder score
        context: `Message from ${msg.userId}`,
        timestamp: msg.timestamp,
        chatId: msg.chatId,
        userId: msg.userId
      });
    });

    resourceResults.forEach(resource => {
      results.push({
        id: resource._id,
        type: 'resource',
        content: resource.content,
        relevanceScore: 0.7, // Placeholder score
        context: `${resource.type} resource`,
        timestamp: resource.extractedAt,
        chatId: resource.chatId,
        userId: resource.userId
      });
    });

    // Sort by relevance score
    results.sort((a, b) => b.relevanceScore - a.relevanceScore);

    return results.slice(0, limit);
  },
});

// Search by context (semantic search placeholder)
export const searchByContext = query({
  args: {
    chatId: v.string(),
    context: v.string(),
    limit: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 10;
    
    // Extract key terms from context for search
    const searchTerms = args.context
      .toLowerCase()
      .split(/\s+/)
      .filter(term => term.length > 3)
      .slice(0, 5)
      .join(" ");

    if (!searchTerms) {
      return [];
    }

    // Search messages
    const messageResults = await ctx.db
      .query("messages")
      .withSearchIndex("search_content", (q) =>
        q.search("content", searchTerms).eq("chatId", args.chatId)
      )
      .take(Math.floor(limit / 2));

    // Search resources
    const resourceResults = await ctx.db
      .query("resources")
      .withSearchIndex("search_content", (q) =>
        q.search("content", searchTerms).eq("chatId", args.chatId)
      )
      .take(Math.floor(limit / 2));

    // Convert to SearchResult format
    const results: any[] = [];
    
    messageResults.forEach(msg => {
      results.push({
        id: msg._id,
        type: 'message',
        content: msg.content,
        relevanceScore: 0.7,
        context: `Context search result`,
        timestamp: msg.timestamp,
        chatId: msg.chatId,
        userId: msg.userId
      });
    });

    resourceResults.forEach(resource => {
      results.push({
        id: resource._id,
        type: 'resource',
        content: resource.content,
        relevanceScore: 0.6,
        context: `${resource.type} resource`,
        timestamp: resource.extractedAt,
        chatId: resource.chatId,
        userId: resource.userId
      });
    });

    return results.slice(0, limit);
  },
});

// Get related content based on message ID
export const getRelatedContent = query({
  args: {
    messageId: v.string(),
    limit: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId as any);
    if (!message) {
      return [];
    }

    const limit = args.limit || 10;
    
    // Extract keywords from the message content
    const keywords = message.content
      .toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 3)
      .slice(0, 5)
      .join(" ");

    if (!keywords) {
      return [];
    }

    // Find related messages (excluding the original)
    const relatedMessages = await ctx.db
      .query("messages")
      .withSearchIndex("search_content", (q) =>
        q.search("content", keywords).eq("chatId", message.chatId)
      )
      .filter((q) => q.neq(q.field("_id"), args.messageId as any))
      .take(Math.floor(limit / 2));

    // Find related resources
    const relatedResources = await ctx.db
      .query("resources")
      .withSearchIndex("search_content", (q) =>
        q.search("content", keywords).eq("chatId", message.chatId)
      )
      .take(Math.floor(limit / 2));

    // Convert to SearchResult format
    const results: any[] = [];
    
    relatedMessages.forEach(msg => {
      results.push({
        id: msg._id,
        type: 'message',
        content: msg.content,
        relevanceScore: 0.6,
        context: `Related to message`,
        timestamp: msg.timestamp,
        chatId: msg.chatId,
        userId: msg.userId
      });
    });

    relatedResources.forEach(resource => {
      results.push({
        id: resource._id,
        type: 'resource',
        content: resource.content,
        relevanceScore: 0.5,
        context: `Related ${resource.type}`,
        timestamp: resource.extractedAt,
        chatId: resource.chatId,
        userId: resource.userId
      });
    });

    return results.slice(0, limit);
  },
});

// Create or update search index entry
export const indexContent = mutation({
  args: {
    type: v.union(
      v.literal("message"),
      v.literal("resource"),
      v.literal("decision"),
      v.literal("action_item")
    ),
    sourceId: v.string(),
    content: v.string(),
    keywords: v.array(v.string()),
    chatId: v.string(),
    userId: v.string(),
    metadata: v.optional(v.any())
  },
  handler: async (ctx, args) => {
    // Check if index entry already exists
    const existing = await ctx.db
      .query("searchIndex")
      .withIndex("by_source", (q) => q.eq("sourceId", args.sourceId))
      .first();

    const indexData = {
      ...args,
      timestamp: Date.now()
    };

    if (existing) {
      await ctx.db.patch(existing._id, indexData);
      return existing._id;
    } else {
      return await ctx.db.insert("searchIndex", indexData);
    }
  },
});

// Search across all indexed content
export const searchAll = query({
  args: {
    chatId: v.string(),
    query: v.string(),
    type: v.optional(v.union(
      v.literal("message"),
      v.literal("resource"),
      v.literal("decision"),
      v.literal("action_item")
    )),
    limit: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 20;
    
    let searchQuery = ctx.db
      .query("searchIndex")
      .withSearchIndex("search_content", (q) =>
        q.search("content", args.query).eq("chatId", args.chatId)
      );

    if (args.type) {
      searchQuery = searchQuery.filter((q) => q.eq(q.field("type"), args.type));
    }

    const results = await searchQuery.take(limit);

    return {
      results,
      total: results.length
    };
  },
});

// Get search suggestions based on partial query
export const getSearchSuggestions = query({
  args: {
    chatId: v.string(),
    partialQuery: v.string(),
    limit: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    if (args.partialQuery.length < 2) {
      return [];
    }

    const limit = args.limit || 5;
    
    // Get recent search terms from messages
    const recentMessages = await ctx.db
      .query("messages")
      .withIndex("by_chat_timestamp", (q) => q.eq("chatId", args.chatId))
      .order("desc")
      .take(100);

    // Extract common words/phrases
    const words = new Set<string>();
    recentMessages.forEach(message => {
      const messageWords = message.content
        .toLowerCase()
        .split(/\s+/)
        .filter(word => 
          word.length > 2 && 
          word.startsWith(args.partialQuery.toLowerCase())
        );
      messageWords.forEach(word => words.add(word));
    });

    return Array.from(words).slice(0, limit);
  },
});

// Get popular search terms
export const getPopularSearchTerms = query({
  args: {
    chatId: v.string(),
    limit: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 10;
    
    // Get recent messages to analyze common terms
    const recentMessages = await ctx.db
      .query("messages")
      .withIndex("by_chat_timestamp", (q) => q.eq("chatId", args.chatId))
      .order("desc")
      .take(200);

    // Count word frequency
    const wordCount = new Map<string, number>();
    
    recentMessages.forEach(message => {
      const words = message.content
        .toLowerCase()
        .split(/\s+/)
        .filter(word => word.length > 3 && /^[a-zA-Z]+$/.test(word));
      
      words.forEach(word => {
        wordCount.set(word, (wordCount.get(word) || 0) + 1);
      });
    });

    // Sort by frequency and return top terms
    const sortedTerms = Array.from(wordCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([term, count]) => ({ term, count }));

    return sortedTerms;
  },
});
