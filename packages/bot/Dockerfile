# Multi-stage build for Buddian bot service
FROM node:18-alpine AS base

# Install system dependencies for PDF processing and image handling
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    musl-dev \
    giflib-dev \
    pixman-dev \
    pangomm-dev \
    libjpeg-turbo-dev \
    freetype-dev \
    curl

# Set working directory
WORKDIR /app

# Copy package files
COPY packages/bot/package*.json ./
COPY convex.json ./
COPY convex ./convex

# Install dependencies
FROM base AS dependencies
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm i --omit=dev; fi && npm cache clean --force

# Development stage
FROM base AS development
RUN if [ -f package-lock.json ]; then npm ci; else npm i; fi
COPY packages/bot/tsconfig.json ./
COPY packages/bot/src ./src
CMD ["npm", "run", "dev"]

# Build stage
FROM base AS build
RUN if [ -f package-lock.json ]; then npm ci; else npm i; fi
COPY packages/bot/tsconfig.json ./
COPY packages/bot/src ./src
COPY convex ./convex

# Create stub API file for build compatibility
RUN mkdir -p convex/_generated && \
    echo "Creating stub API file..." && \
    echo 'export const api = { health: { check: "health:check" as any, ping: "health:ping" as any, getStats: "health:getStats" as any }, messages: { create: "messages:create" as any, list: "messages:list" as any, get: "messages:get" as any, storeMessage: "messages:storeMessage" as any, getMessage: "messages:getMessage" as any, getMessages: "messages:getMessages" as any, searchMessages: "messages:searchMessages" as any, getThreadContext: "messages:getThreadContext" as any, updateMessageDecisions: "messages:updateMessageDecisions" as any, updateMessageActionItems: "messages:updateMessageActionItems" as any }, users: { create: "users:create" as any, getByDiscordId: "users:getByDiscordId" as any, list: "users:list" as any, createUser: "users:createUser" as any, getUser: "users:getUser" as any, getUserById: "users:getUserById" as any, updateUserPreferences: "users:updateUserPreferences" as any, updateLastActive: "users:updateLastActive" as any, getUserLanguage: "users:getUserLanguage" as any }, resources: { create: "resources:create" as any, list: "resources:list" as any, get: "resources:get" as any, storeResource: "resources:storeResource" as any, getResource: "resources:getResource" as any, getResources: "resources:getResources" as any, searchResources: "resources:searchResources" as any, updateResourceSummary: "resources:updateResourceSummary" as any }, threads: { createThread: "threads:createThread" as any, getThread: "threads:getThread" as any, getActiveThreads: "threads:getActiveThreads" as any, updateThreadActivity: "threads:updateThreadActivity" as any, updateThreadSummary: "threads:updateThreadSummary" as any }, search: { messages: "search:messages" as any, resources: "search:resources" as any, searchByKeywords: "search:searchByKeywords" as any, searchByContext: "search:searchByContext" as any, getRelatedContent: "search:getRelatedContent" as any } }; export default api;' > convex/_generated/api.ts

# Attempt Convex codegen (optional)
RUN echo "Attempting Convex codegen..." && \
    npx convex codegen || echo "Convex codegen failed or unavailable"

# Ensure codegen outputs take precedence over stubs for both types and runtime
# This prevents codegen-generated api.js from being overwritten by stub
RUN if [ -f convex/_generated/api.js ]; then \
      echo "Preferring codegen outputs" && \
      rm -f convex/_generated/api.ts; \
    else \
      echo "No codegen outputs found; creating runtime stub api.js" && \
      echo 'const api = { health: { check: "health:check", ping: "health:ping", getStats: "health:getStats" }, messages: { create: "messages:create", list: "messages:list", get: "messages:get", storeMessage: "messages:storeMessage", getMessage: "messages:getMessage", getMessages: "messages:getMessages", searchMessages: "messages:searchMessages", getThreadContext: "messages:getThreadContext", updateMessageDecisions: "messages:updateMessageDecisions", updateMessageActionItems: "messages:updateMessageActionItems" }, users: { create: "users:create", getByDiscordId: "users:getByDiscordId", list: "users:list", createUser: "users:createUser", getUser: "users:getUser", getUserById: "users:getUserById", updateUserPreferences: "users:updateUserPreferences", updateLastActive: "users:updateLastActive", getUserLanguage: "users:getUserLanguage" }, resources: { create: "resources:create", list: "resources:list", get: "resources:get", storeResource: "resources:storeResource", getResource: "resources:getResource", getResources: "resources:getResources", searchResources: "resources:searchResources", updateResourceSummary: "resources:updateResourceSummary" }, threads: { createThread: "threads:createThread", getThread: "threads:getThread", getActiveThreads: "threads:getActiveThreads", updateThreadActivity: "threads:updateThreadActivity", updateThreadSummary: "threads:updateThreadSummary" }, search: { messages: "search:messages", resources: "search:resources", searchByKeywords: "search:searchByKeywords", searchByContext: "search:searchByContext", getRelatedContent: "search:getRelatedContent" } }; module.exports = { api }; exports.api = api;' > convex/_generated/api.js; \
    fi


RUN npm run build

# Production stage
FROM node:18-alpine AS production

# Install runtime dependencies
RUN apk add --no-cache \
    cairo \
    jpeg \
    pango \
    musl \
    giflib \
    pixman \
    pangomm \
    libjpeg-turbo \
    freetype \
    curl \
    dumb-init

# Create app user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S buddian -u 1001

# Set working directory
WORKDIR /app

# Copy production dependencies
COPY --from=dependencies --chown=buddian:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=buddian:nodejs /app/dist ./dist
COPY --from=build --chown=buddian:nodejs /app/convex ./convex
COPY --chown=buddian:nodejs packages/bot/package.json ./

# Create necessary directories
RUN mkdir -p logs uploads && \
    chown -R buddian:nodejs logs uploads

# Switch to non-root user
USER buddian

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "-r", "tsconfig-paths/register", "dist/index.js"]
