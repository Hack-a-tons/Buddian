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

# Create FunctionReference-compatible API stub for Convex v1.8.0 if not already present
RUN mkdir -p convex/_generated && \
    if [ ! -f convex/_generated/api.ts ]; then \
      echo "Creating Convex v1.8.0 compatible API stub..." && \
      echo 'import type { FunctionReference, DefaultFunctionArgs } from "convex/server"; const createQueryRef = <Args extends DefaultFunctionArgs, Return>(name: string): FunctionReference<"query", "public", Args, Return> => ({ _type: "query" as const, _name: name, _visibility: "public" as const, _args: {} as Args, _returnType: {} as Return, _componentPath: undefined, } as any); const createMutationRef = <Args extends DefaultFunctionArgs, Return>(name: string): FunctionReference<"mutation", "public", Args, Return> => ({ _type: "mutation" as const, _name: name, _visibility: "public" as const, _args: {} as Args, _returnType: {} as Return, _componentPath: undefined, } as any); export const api = { health: { check: createQueryRef<{}, any>("health:check"), ping: createQueryRef<{}, string>("health:ping"), getStats: createQueryRef<{}, any>("health:getStats"), }, messages: { create: createMutationRef<any, any>("messages:create"), list: createQueryRef<{}, any[]>("messages:list"), get: createQueryRef<any, any>("messages:get"), storeMessage: createMutationRef<any, string>("messages:storeMessage"), getMessage: createQueryRef<any, any>("messages:getMessage"), getMessages: createQueryRef<any, any[]>("messages:getMessages"), searchMessages: createQueryRef<any, any[]>("messages:searchMessages"), getThreadContext: createQueryRef<any, any[]>("messages:getThreadContext"), updateMessageDecisions: createMutationRef<any, any>("messages:updateMessageDecisions"), updateMessageActionItems: createMutationRef<any, any>("messages:updateMessageActionItems"), }, users: { create: createMutationRef<any, any>("users:create"), getByDiscordId: createQueryRef<any, any>("users:getByDiscordId"), list: createQueryRef<{}, any[]>("users:list"), createUser: createMutationRef<any, string>("users:createUser"), getUser: createQueryRef<any, any>("users:getUser"), getUserById: createQueryRef<any, any>("users:getUserById"), updateUserPreferences: createMutationRef<any, any>("users:updateUserPreferences"), updateLastActive: createMutationRef<any, any>("users:updateLastActive"), getUserLanguage: createQueryRef<any, string>("users:getUserLanguage"), }, resources: { create: createMutationRef<any, any>("resources:create"), list: createQueryRef<{}, any[]>("resources:list"), get: createQueryRef<any, any>("resources:get"), storeResource: createMutationRef<any, string>("resources:storeResource"), getResource: createQueryRef<any, any>("resources:getResource"), getResources: createQueryRef<any, any[]>("resources:getResources"), searchResources: createQueryRef<any, any[]>("resources:searchResources"), updateResourceSummary: createMutationRef<any, any>("resources:updateResourceSummary"), }, threads: { createThread: createMutationRef<any, string>("threads:createThread"), getThread: createQueryRef<any, any>("threads:getThread"), getActiveThreads: createQueryRef<any, any[]>("threads:getActiveThreads"), updateThreadActivity: createMutationRef<any, any>("threads:updateThreadActivity"), updateThreadSummary: createMutationRef<any, any>("threads:updateThreadSummary"), }, search: { messages: createQueryRef<any, any[]>("search:messages"), resources: createQueryRef<any, any[]>("search:resources"), searchByKeywords: createQueryRef<any, any[]>("search:searchByKeywords"), searchByContext: createQueryRef<any, any[]>("search:searchByContext"), getRelatedContent: createQueryRef<any, any[]>("search:getRelatedContent"), }, }; export default api;' > convex/_generated/api.ts; \
    fi

# Attempt Convex codegen (optional)
RUN echo "Attempting Convex codegen..." && \
    npx convex codegen || echo "Convex codegen failed or unavailable"

# Ensure codegen outputs take precedence over stubs for both types and runtime
# This prevents codegen-generated api.js from being overwritten by stub
RUN if [ -f convex/_generated/api.js ] && [ -f convex/_generated/api.d.ts ]; then \
      echo "Preferring codegen outputs" && \
      rm -f convex/_generated/api.ts; \
    else \
      echo "No codegen outputs found; creating runtime stub api.js" && \
      echo 'const q=n=>({_type:"query",_name:n,_visibility:"public"}); const m=n=>({_type:"mutation",_name:n,_visibility:"public"}); const api={ health:{ check:q("health:check"), ping:q("health:ping"), getStats:q("health:getStats") }, messages:{ create:m("messages:create"), list:q("messages:list"), get:q("messages:get"), storeMessage:m("messages:storeMessage"), getMessage:q("messages:getMessage"), getMessages:q("messages:getMessages"), searchMessages:q("messages:searchMessages"), getThreadContext:q("messages:getThreadContext"), updateMessageDecisions:m("messages:updateMessageDecisions"), updateMessageActionItems:m("messages:updateMessageActionItems") }, users:{ create:m("users:create"), getByDiscordId:q("users:getByDiscordId"), list:q("users:list"), createUser:m("users:createUser"), getUser:q("users:getUser"), getUserById:q("users:getUserById"), updateUserPreferences:m("users:updateUserPreferences"), updateLastActive:m("users:updateLastActive"), getUserLanguage:q("users:getUserLanguage") }, resources:{ create:m("resources:create"), list:q("resources:list"), get:q("resources:get"), storeResource:m("resources:storeResource"), getResource:q("resources:getResource"), getResources:q("resources:getResources"), searchResources:q("resources:searchResources"), updateResourceSummary:m("resources:updateResourceSummary") }, threads:{ createThread:m("threads:createThread"), getThread:q("threads:getThread"), getActiveThreads:q("threads:getActiveThreads"), updateThreadActivity:m("threads:updateThreadActivity"), updateThreadSummary:m("threads:updateThreadSummary") }, search:{ messages:q("search:messages"), resources:q("search:resources"), searchByKeywords:q("search:searchByKeywords"), searchByContext:q("search:searchByContext"), getRelatedContent:q("search:getRelatedContent") } }; module.exports={api}; exports.api=api;' > convex/_generated/api.js; \
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
