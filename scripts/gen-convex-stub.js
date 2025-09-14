#!/usr/bin/env node

/**
 * Generate Convex API stub with proper FunctionReference types
 * This script creates a TypeScript-compatible stub that matches what convex.ts expects
 */

const fs = require('fs');
const path = require('path');

const STUB_DIR = 'convex/_generated';
const API_TS_FILE = path.join(STUB_DIR, 'api.ts');
const API_DTS_FILE = path.join(STUB_DIR, 'api.d.ts');

// Ensure the directory exists
if (!fs.existsSync(STUB_DIR)) {
  fs.mkdirSync(STUB_DIR, { recursive: true });
}

// FunctionReference-based TypeScript stub content
const API_TS_CONTENT = `/**
 * Generated Convex API stub with proper FunctionReference types
 * This file provides TypeScript-compatible API structure for deployment
 */

import { FunctionReference } from "convex/server";

// Helper functions to create properly typed FunctionReference objects
function q(name: string): FunctionReference<"query"> {
  return {
    _type: "query",
    _name: name,
    _visibility: "public",
    _args: {},
    _returnType: {},
    _componentPath: undefined
  } as FunctionReference<"query">;
}

function m(name: string): FunctionReference<"mutation"> {
  return {
    _type: "mutation", 
    _name: name,
    _visibility: "public",
    _args: {},
    _returnType: {},
    _componentPath: undefined
  } as FunctionReference<"mutation">;
}

// Health module functions
export const health = {
  checkConnection: q("health:checkConnection"),
  ping: q("health:ping"),
  getStats: q("health:getStats"),
  recordHealthMetrics: m("health:recordHealthMetrics"),
  getSystemHealth: q("health:getSystemHealth"),
  getComponentHealth: q("health:getComponentHealth"),
  getOverallStatus: q("health:getOverallStatus"),
  cleanupHealthRecords: m("health:cleanupHealthRecords"),
  getHealthMetricsSummary: q("health:getHealthMetricsSummary"),
};

// Messages module functions  
export const messages = {
  storeMessage: m("messages:storeMessage"),
  getMessage: q("messages:getMessage"),
  getMessages: q("messages:getMessages"),
  searchMessages: q("messages:searchMessages"),
  getThreadContext: q("messages:getThreadContext"),
  updateMessageDecisions: m("messages:updateMessageDecisions"),
  updateMessageActionItems: m("messages:updateMessageActionItems"),
  getMessagesByUser: q("messages:getMessagesByUser"),
  getMessagesByThread: q("messages:getMessagesByThread"),
  getMessagesWithDecisions: q("messages:getMessagesWithDecisions"),
  getMessagesWithActionItems: q("messages:getMessagesWithActionItems"),
  getMessageStats: q("messages:getMessageStats"),
  deleteOldMessages: m("messages:deleteOldMessages"),
};

// Users module functions
export const users = {
  getUser: q("users:getUser"),
  getUserById: q("users:getUserById"),
  createUser: m("users:createUser"),
  updateUserPreferences: m("users:updateUserPreferences"),
  updateLastActive: m("users:updateLastActive"),
  getUserLanguage: q("users:getUserLanguage"),
  getActiveUsers: q("users:getActiveUsers"),
  getUserStats: q("users:getUserStats"),
};

// Resources module functions
export const resources = {
  storeResource: m("resources:storeResource"),
  getResources: q("resources:getResources"),
  getResourcesByUser: q("resources:getResourcesByUser"),
  searchResources: q("resources:searchResources"),
  getResource: q("resources:getResource"),
  updateResourceSummary: m("resources:updateResourceSummary"),
  deleteResource: m("resources:deleteResource"),
  getRecentResources: q("resources:getRecentResources"),
  getResourceStats: q("resources:getResourceStats"),
};

// Threads module functions
export const threads = {
  createThread: m("threads:createThread"),
  getThreadsByChat: q("threads:getThreadsByChat"),
  getThread: q("threads:getThread"),
  updateThreadActivity: m("threads:updateThreadActivity"),
  updateThreadSummary: m("threads:updateThreadSummary"),
  addThreadTags: m("threads:addThreadTags"),
  removeThreadTags: m("threads:removeThreadTags"),
  searchThreads: q("threads:searchThreads"),
  getActiveThreads: q("threads:getActiveThreads"),
  getThreadsByTags: q("threads:getThreadsByTags"),
  getThreadStats: q("threads:getThreadStats"),
  deleteThread: m("threads:deleteThread"),
  getThreadMessages: q("threads:getThreadMessages"),
  assignMessageToThread: m("threads:assignMessageToThread"),
};

// Search module functions
export const search = {
  searchByKeywords: q("search:searchByKeywords"),
  searchByContext: q("search:searchByContext"),
  getRelatedContent: q("search:getRelatedContent"),
  indexContent: m("search:indexContent"),
  searchAll: q("search:searchAll"),
  getSearchSuggestions: q("search:getSearchSuggestions"),
  getPopularSearchTerms: q("search:getPopularSearchTerms"),
};

// Main API export
export const api = {
  health,
  messages,
  users,
  resources,
  threads,
  search,
};

export default api;
`;

// Type definitions content
const API_DTS_CONTENT = `/* eslint-disable */
/**
 * Generated \`api\` utility stub for deployment.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED FOR DEPLOYMENT.
 *
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * \`\`\`js
 * const myFunctionReference = api.myModule.myFunction;
 * \`\`\`
 */
declare const fullApi: ApiFromModules<{
  health: any;
  messages: any;
  resources: any;
  search: any;
  threads: any;
  users: any;
}>;

export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
`;

function writeStubFiles() {
  console.log('Creating Convex API stub files...');
  
  // Write the TypeScript stub
  fs.writeFileSync(API_TS_FILE, API_TS_CONTENT);
  console.log(`✓ Created ${API_TS_FILE}`);
  
  // Write the type definitions
  fs.writeFileSync(API_DTS_FILE, API_DTS_CONTENT);
  console.log(`✓ Created ${API_DTS_FILE}`);
  
  console.log('Convex API stub files created successfully!');
}

// Check if we should skip creation if files exist and contain proper content
function shouldSkipCreation() {
  if (!fs.existsSync(API_TS_FILE)) {
    return false;
  }
  
  const content = fs.readFileSync(API_TS_FILE, 'utf8');
  return content.includes('FunctionReference') && content.includes('export const api');
}

// Main execution
if (require.main === module) {
  const forceFlag = process.argv.includes('--force');
  
  if (!forceFlag && shouldSkipCreation()) {
    console.log('Convex API stub already exists with proper format - skipping creation');
    process.exit(0);
  }
  
  try {
    writeStubFiles();
    process.exit(0);
  } catch (error) {
    console.error('Error creating Convex API stub:', error);
    process.exit(1);
  }
}

module.exports = { writeStubFiles, shouldSkipCreation };
