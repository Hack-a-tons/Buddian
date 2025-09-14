import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// Get user by Telegram ID
export const getUser = query({
  args: { telegramId: v.number() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_telegram_id", (q) => q.eq("telegramId", args.telegramId))
      .first();
  },
});

// Get user by ID
export const getUserById = query({
  args: { id: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// Create new user
export const createUser = mutation({
  args: {
    telegramId: v.number(),
    firstName: v.string(),
    lastName: v.optional(v.string()),
    username: v.optional(v.string()),
    languageCode: v.optional(v.string()),
    preferences: v.object({
      language: v.string(),
      timezone: v.string(),
      notifications: v.boolean(),
      reminderFrequency: v.union(
        v.literal("never"),
        v.literal("daily"),
        v.literal("weekly")
      ),
      summaryFrequency: v.union(
        v.literal("never"),
        v.literal("daily"),
        v.literal("weekly")
      ),
      pluginsEnabled: v.array(v.string())
    })
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("users", {
      ...args,
      createdAt: now,
      lastActiveAt: now
    });
  },
});

// Update user preferences
export const updatePreferences = mutation({
  args: {
    id: v.id("users"),
    preferences: v.object({
      language: v.string(),
      timezone: v.string(),
      notifications: v.boolean(),
      reminderFrequency: v.union(
        v.literal("never"),
        v.literal("daily"),
        v.literal("weekly")
      ),
      summaryFrequency: v.union(
        v.literal("never"),
        v.literal("daily"),
        v.literal("weekly")
      ),
      pluginsEnabled: v.array(v.string())
    })
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      preferences: args.preferences
    });
  },
});

// Update last active timestamp
export const updateLastActive = mutation({
  args: { id: v.id("users") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      lastActiveAt: Date.now()
    });
  },
});

// Get active users (active in last 30 days)
export const getActiveUsers = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    return await ctx.db
      .query("users")
      .withIndex("by_last_active", (q) => q.gte("lastActiveAt", thirtyDaysAgo))
      .order("desc")
      .take(args.limit || 100);
  },
});

// Get user statistics
export const getUserStats = query({
  args: { id: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.id);
    if (!user) return null;

    // Count messages
    const messageCount = await ctx.db
      .query("messages")
      .withIndex("by_user", (q) => q.eq("userId", args.id))
      .collect()
      .then(messages => messages.length);

    // Count resources
    const resourceCount = await ctx.db
      .query("resources")
      .withIndex("by_user", (q) => q.eq("userId", args.id))
      .collect()
      .then(resources => resources.length);

    return {
      user,
      messageCount,
      resourceCount,
      joinedAt: user.createdAt,
      lastActiveAt: user.lastActiveAt
    };
  },
});
