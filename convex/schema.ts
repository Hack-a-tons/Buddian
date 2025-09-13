import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Messages table - stores all conversation messages
  messages: defineTable({
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
    decisions: v.optional(v.array(v.object({
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
    }))),
    actionItems: v.optional(v.array(v.object({
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
    }))),
    threadId: v.optional(v.string())
  })
    .index("by_chat", ["chatId"])
    .index("by_user", ["userId"])
    .index("by_timestamp", ["timestamp"])
    .index("by_chat_timestamp", ["chatId", "timestamp"])
    .index("by_thread", ["threadId"])
    .searchIndex("search_content", {
      searchField: "content",
      filterFields: ["chatId", "userId", "language", "messageType"]
    }),

  // Users table - stores user information and preferences
  users: defineTable({
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
    }),
    createdAt: v.number(),
    lastActiveAt: v.number()
  })
    .index("by_telegram_id", ["telegramId"])
    .index("by_username", ["username"])
    .index("by_last_active", ["lastActiveAt"]),

  // Resources table - stores analyzed files, documents, and URLs
  resources: defineTable({
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
  })
    .index("by_chat", ["chatId"])
    .index("by_user", ["userId"])
    .index("by_type", ["type"])
    .index("by_chat_type", ["chatId", "type"])
    .index("by_extracted_at", ["extractedAt"])
    .searchIndex("search_content", {
      searchField: "content",
      filterFields: ["chatId", "userId", "type"]
    })
    .searchIndex("search_summary", {
      searchField: "summary",
      filterFields: ["chatId", "userId", "type"]
    }),

  // Conversation threads table - groups related messages by topic
  threads: defineTable({
    chatId: v.string(),
    topic: v.string(),
    participants: v.array(v.string()),
    messageCount: v.number(),
    lastActivity: v.number(),
    createdAt: v.number(),
    summary: v.optional(v.string()),
    tags: v.array(v.string())
  })
    .index("by_chat", ["chatId"])
    .index("by_last_activity", ["lastActivity"])
    .index("by_chat_activity", ["chatId", "lastActivity"])
    .searchIndex("search_topic", {
      searchField: "topic",
      filterFields: ["chatId"]
    }),

  // Plugins table - stores plugin configurations and state
  plugins: defineTable({
    name: v.string(),
    version: v.string(),
    description: v.string(),
    author: v.string(),
    config: v.object({
      commands: v.array(v.object({
        name: v.string(),
        description: v.string(),
        usage: v.string(),
        parameters: v.array(v.object({
          name: v.string(),
          type: v.union(
            v.literal("string"),
            v.literal("number"),
            v.literal("boolean"),
            v.literal("array"),
            v.literal("object")
          ),
          required: v.boolean(),
          description: v.string(),
          default: v.optional(v.any())
        })),
        examples: v.optional(v.array(v.string())),
        category: v.optional(v.string())
      })),
      permissions: v.array(v.string()),
      settings: v.any(),
      apiKeys: v.optional(v.any()),
      rateLimit: v.optional(v.object({
        requests: v.number(),
        window: v.number()
      })),
      timeout: v.optional(v.number())
    }),
    active: v.boolean(),
    installedAt: v.number(),
    lastUsed: v.optional(v.number()),
    stats: v.optional(v.object({
      executions: v.number(),
      errors: v.number(),
      lastExecution: v.number(),
      averageExecutionTime: v.number()
    }))
  })
    .index("by_name", ["name"])
    .index("by_active", ["active"])
    .index("by_installed_at", ["installedAt"]),

  // Plugin executions table - logs plugin command executions
  pluginExecutions: defineTable({
    pluginId: v.id("plugins"),
    command: v.string(),
    parameters: v.any(),
    result: v.object({
      success: v.boolean(),
      data: v.optional(v.any()),
      message: v.optional(v.string()),
      error: v.optional(v.string()),
      metadata: v.optional(v.any())
    }),
    executionTime: v.number(),
    timestamp: v.number(),
    userId: v.string(),
    chatId: v.string()
  })
    .index("by_plugin", ["pluginId"])
    .index("by_user", ["userId"])
    .index("by_chat", ["chatId"])
    .index("by_timestamp", ["timestamp"])
    .index("by_plugin_timestamp", ["pluginId", "timestamp"]),

  // Search index table - for advanced search functionality
  searchIndex: defineTable({
    type: v.union(
      v.literal("message"),
      v.literal("resource"),
      v.literal("decision"),
      v.literal("action_item")
    ),
    sourceId: v.string(),
    content: v.string(),
    keywords: v.array(v.string()),
    embedding: v.optional(v.array(v.number())), // For semantic search
    chatId: v.string(),
    userId: v.string(),
    timestamp: v.number(),
    metadata: v.optional(v.any())
  })
    .index("by_type", ["type"])
    .index("by_chat", ["chatId"])
    .index("by_user", ["userId"])
    .index("by_source", ["sourceId"])
    .index("by_chat_type", ["chatId", "type"])
    .searchIndex("search_content", {
      searchField: "content",
      filterFields: ["chatId", "userId", "type"]
    })
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1536, // OpenAI embedding dimensions
      filterFields: ["chatId", "userId", "type"]
    }),

  // Analytics table - stores usage analytics and metrics
  analytics: defineTable({
    type: v.union(
      v.literal("message_count"),
      v.literal("command_usage"),
      v.literal("plugin_usage"),
      v.literal("user_activity"),
      v.literal("error_rate"),
      v.literal("response_time")
    ),
    metric: v.string(),
    value: v.number(),
    dimensions: v.optional(v.object({
      userId: v.optional(v.string()),
      chatId: v.optional(v.string()),
      command: v.optional(v.string()),
      plugin: v.optional(v.string()),
      language: v.optional(v.string())
    })),
    timestamp: v.number(),
    period: v.union(
      v.literal("hour"),
      v.literal("day"),
      v.literal("week"),
      v.literal("month")
    )
  })
    .index("by_type", ["type"])
    .index("by_metric", ["metric"])
    .index("by_timestamp", ["timestamp"])
    .index("by_type_timestamp", ["type", "timestamp"])
    .index("by_period", ["period"]),

  // System health table - stores system health metrics
  systemHealth: defineTable({
    component: v.string(),
    status: v.union(
      v.literal("healthy"),
      v.literal("degraded"),
      v.literal("unhealthy")
    ),
    metrics: v.object({
      responseTime: v.optional(v.number()),
      errorRate: v.optional(v.number()),
      throughput: v.optional(v.number()),
      memoryUsage: v.optional(v.number()),
      cpuUsage: v.optional(v.number())
    }),
    timestamp: v.number(),
    details: v.optional(v.string())
  })
    .index("by_component", ["component"])
    .index("by_status", ["status"])
    .index("by_timestamp", ["timestamp"])
    .index("by_component_timestamp", ["component", "timestamp"]),

  // Scheduled tasks table - for cron jobs and scheduled operations
  scheduledTasks: defineTable({
    name: v.string(),
    type: v.union(
      v.literal("reminder"),
      v.literal("summary"),
      v.literal("cleanup"),
      v.literal("analytics"),
      v.literal("plugin_task")
    ),
    schedule: v.string(), // Cron expression
    payload: v.any(),
    nextRun: v.number(),
    lastRun: v.optional(v.number()),
    enabled: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number()
  })
    .index("by_name", ["name"])
    .index("by_type", ["type"])
    .index("by_next_run", ["nextRun"])
    .index("by_enabled", ["enabled"])
    .index("by_enabled_next_run", ["enabled", "nextRun"])
});
