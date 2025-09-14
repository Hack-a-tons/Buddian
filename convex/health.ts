import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// Check database connection health
export const checkConnection = query({
  args: {},
  handler: async (ctx, args) => {
    try {
      // Simple query to test database connectivity
      await ctx.db.query("systemHealth").take(1);
      return true;
    } catch (error) {
      return false;
    }
  },
});

// Simple ping endpoint
export const ping = query({
  args: {},
  handler: async (ctx, args) => {
    return true;
  },
});

// Get basic stats
export const getStats = query({
  args: {},
  handler: async (ctx, args) => {
    try {
      // Count total users
      const userCount = await ctx.db.query("users").collect().then(users => users.length);
      
      // Count total messages
      const messageCount = await ctx.db.query("messages").collect().then(messages => messages.length);
      
      // Count total resources
      const resourceCount = await ctx.db.query("resources").collect().then(resources => resources.length);
      
      return {
        users: userCount,
        messages: messageCount,
        resources: resourceCount,
        timestamp: Date.now()
      };
    } catch (error) {
      return {
        users: 0,
        messages: 0,
        resources: 0,
        timestamp: Date.now(),
        error: 'Failed to fetch stats'
      };
    }
  },
});

// Record system health metrics
export const recordHealthMetrics = mutation({
  args: {
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
    details: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("systemHealth", {
      component: args.component,
      status: args.status,
      metrics: args.metrics,
      timestamp: Date.now(),
      details: args.details
    });
  },
});

// Get latest health status for all components
export const getSystemHealth = query({
  args: {},
  handler: async (ctx, args) => {
    // Get the latest health record for each component
    const allHealthRecords = await ctx.db
      .query("systemHealth")
      .withIndex("by_timestamp")
      .order("desc")
      .take(100);

    // Group by component and get the latest for each
    const componentHealth = new Map();
    
    allHealthRecords.forEach(record => {
      if (!componentHealth.has(record.component)) {
        componentHealth.set(record.component, record);
      }
    });

    return Array.from(componentHealth.values());
  },
});

// Get health history for a specific component
export const getComponentHealth = query({
  args: {
    component: v.string(),
    hours: v.optional(v.number()),
    limit: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const hoursAgo = Date.now() - ((args.hours || 24) * 60 * 60 * 1000);
    
    return await ctx.db
      .query("systemHealth")
      .withIndex("by_component_timestamp", (q) => 
        q.eq("component", args.component).gte("timestamp", hoursAgo)
      )
      .order("desc")
      .take(args.limit || 100);
  },
});

// Get overall system status
export const getOverallStatus = query({
  args: {},
  handler: async (ctx, args) => {
    const componentHealths = await getSystemHealth(ctx, {});
    
    let overallStatus = "healthy";
    let healthyCount = 0;
    let degradedCount = 0;
    let unhealthyCount = 0;

    componentHealths.forEach(health => {
      switch (health.status) {
        case "healthy":
          healthyCount++;
          break;
        case "degraded":
          degradedCount++;
          if (overallStatus === "healthy") {
            overallStatus = "degraded";
          }
          break;
        case "unhealthy":
          unhealthyCount++;
          overallStatus = "unhealthy";
          break;
      }
    });

    return {
      status: overallStatus,
      totalComponents: componentHealths.length,
      healthy: healthyCount,
      degraded: degradedCount,
      unhealthy: unhealthyCount,
      components: componentHealths
    };
  },
});

// Clean up old health records
export const cleanupHealthRecords = mutation({
  args: {
    olderThanDays: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const daysAgo = Date.now() - ((args.olderThanDays || 30) * 24 * 60 * 60 * 1000);
    
    const oldRecords = await ctx.db
      .query("systemHealth")
      .withIndex("by_timestamp", (q) => q.lt("timestamp", daysAgo))
      .collect();

    let deletedCount = 0;
    for (const record of oldRecords) {
      await ctx.db.delete(record._id);
      deletedCount++;
    }

    return { deletedCount };
  },
});

// Get health metrics summary
export const getHealthMetricsSummary = query({
  args: {
    component: v.optional(v.string()),
    hours: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const hoursAgo = Date.now() - ((args.hours || 24) * 60 * 60 * 1000);
    
    let query = ctx.db
      .query("systemHealth")
      .withIndex("by_timestamp", (q) => q.gte("timestamp", hoursAgo));

    if (args.component) {
      query = query.filter((q) => q.eq(q.field("component"), args.component));
    }

    const records = await query.collect();

    if (records.length === 0) {
      return {
        averageResponseTime: 0,
        averageErrorRate: 0,
        averageThroughput: 0,
        averageMemoryUsage: 0,
        averageCpuUsage: 0,
        recordCount: 0
      };
    }

    let totalResponseTime = 0;
    let totalErrorRate = 0;
    let totalThroughput = 0;
    let totalMemoryUsage = 0;
    let totalCpuUsage = 0;
    let responseTimeCount = 0;
    let errorRateCount = 0;
    let throughputCount = 0;
    let memoryUsageCount = 0;
    let cpuUsageCount = 0;

    records.forEach(record => {
      if (record.metrics.responseTime !== undefined) {
        totalResponseTime += record.metrics.responseTime;
        responseTimeCount++;
      }
      if (record.metrics.errorRate !== undefined) {
        totalErrorRate += record.metrics.errorRate;
        errorRateCount++;
      }
      if (record.metrics.throughput !== undefined) {
        totalThroughput += record.metrics.throughput;
        throughputCount++;
      }
      if (record.metrics.memoryUsage !== undefined) {
        totalMemoryUsage += record.metrics.memoryUsage;
        memoryUsageCount++;
      }
      if (record.metrics.cpuUsage !== undefined) {
        totalCpuUsage += record.metrics.cpuUsage;
        cpuUsageCount++;
      }
    });

    return {
      averageResponseTime: responseTimeCount > 0 ? totalResponseTime / responseTimeCount : 0,
      averageErrorRate: errorRateCount > 0 ? totalErrorRate / errorRateCount : 0,
      averageThroughput: throughputCount > 0 ? totalThroughput / throughputCount : 0,
      averageMemoryUsage: memoryUsageCount > 0 ? totalMemoryUsage / memoryUsageCount : 0,
      averageCpuUsage: cpuUsageCount > 0 ? totalCpuUsage / cpuUsageCount : 0,
      recordCount: records.length
    };
  },
});
