/**
 * Local Convex API endpoints definition
 * This eliminates TS6059 by keeping all imports within rootDir (src/)
 * while maintaining functional Convex calls using string-based endpoints.
 * 
 * This mirrors the structure from convex/_generated/api.ts but is defined
 * locally to avoid importing files outside the TypeScript rootDir.
 */

// Local constant with string endpoint names (mirrors convex/_generated/api.js)
export const convexApi = {
  health: {
    check: "health:check",
    ping: "health:ping",
    getStats: "health:getStats",
  },
  messages: {
    create: "messages:create",
    list: "messages:list",
    get: "messages:get",
    storeMessage: "messages:storeMessage",
    getMessage: "messages:getMessage",
    getMessages: "messages:getMessages",
    searchMessages: "messages:searchMessages",
    getThreadContext: "messages:getThreadContext",
    updateMessageDecisions: "messages:updateMessageDecisions",
    updateMessageActionItems: "messages:updateMessageActionItems",
  },
  users: {
    create: "users:create",
    getByDiscordId: "users:getByDiscordId",
    list: "users:list",
    createUser: "users:createUser",
    getUser: "users:getUser",
    getUserById: "users:getUserById",
    updateUserPreferences: "users:updateUserPreferences",
    updateLastActive: "users:updateLastActive",
    getUserLanguage: "users:getUserLanguage",
  },
  resources: {
    create: "resources:create",
    list: "resources:list",
    get: "resources:get",
    storeResource: "resources:storeResource",
    getResource: "resources:getResource",
    getResources: "resources:getResources",
    searchResources: "resources:searchResources",
    updateResourceSummary: "resources:updateResourceSummary",
  },
  threads: {
    createThread: "threads:createThread",
    getThread: "threads:getThread",
    getActiveThreads: "threads:getActiveThreads",
    updateThreadActivity: "threads:updateThreadActivity",
    updateThreadSummary: "threads:updateThreadSummary",
  },
  search: {
    messages: "search:messages",
    resources: "search:resources",
    searchByKeywords: "search:searchByKeywords",
    searchByContext: "search:searchByContext",
    getRelatedContent: "search:getRelatedContent",
  },
};

export default convexApi;
