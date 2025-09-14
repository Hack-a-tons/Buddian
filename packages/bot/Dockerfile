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

# Create stub files if they don't exist or don't match FunctionReference format
RUN mkdir -p convex/_generated && \
    if [ ! -f "convex/_generated/api.ts" ] || ! grep -q "FunctionReference" "convex/_generated/api.ts" 2>/dev/null; then \
        echo "Creating FunctionReference-based Convex API stub for Docker build..." && \
        echo 'import { FunctionReference } from "convex/server";' > convex/_generated/api.ts && \
        echo 'function q(name: string): FunctionReference<"query"> { return { _type: "query", _name: name, _visibility: "public", _args: {}, _returnType: {}, _componentPath: undefined } as FunctionReference<"query">; }' >> convex/_generated/api.ts && \
        echo 'function m(name: string): FunctionReference<"mutation"> { return { _type: "mutation", _name: name, _visibility: "public", _args: {}, _returnType: {}, _componentPath: undefined } as FunctionReference<"mutation">; }' >> convex/_generated/api.ts && \
        echo 'export const health = { checkConnection: q("health:checkConnection"), ping: q("health:ping"), getStats: q("health:getStats") };' >> convex/_generated/api.ts && \
        echo 'export const messages = { storeMessage: m("messages:storeMessage"), getMessage: q("messages:getMessage"), getMessages: q("messages:getMessages") };' >> convex/_generated/api.ts && \
        echo 'export const users = { getUser: q("users:getUser"), createUser: m("users:createUser") };' >> convex/_generated/api.ts && \
        echo 'export const resources = { storeResource: m("resources:storeResource"), getResources: q("resources:getResources") };' >> convex/_generated/api.ts && \
        echo 'export const threads = { createThread: m("threads:createThread"), getActiveThreads: q("threads:getActiveThreads") };' >> convex/_generated/api.ts && \
        echo 'export const search = { searchByKeywords: q("search:searchByKeywords"), searchByContext: q("search:searchByContext") };' >> convex/_generated/api.ts && \
        echo 'export const api = { health, messages, users, resources, threads, search }; export default api;' >> convex/_generated/api.ts; \
    fi && \
    if [ ! -f "convex/_generated/api.d.ts" ]; then \
        echo "Creating Convex API type definitions for Docker build..." && \
        echo 'import type { ApiFromModules, FilterApi, FunctionReference } from "convex/server";' > convex/_generated/api.d.ts && \
        echo 'declare const fullApi: ApiFromModules<{ health: any; messages: any; resources: any; search: any; threads: any; users: any; }>;' >> convex/_generated/api.d.ts && \
        echo 'export declare const api: FilterApi<typeof fullApi, FunctionReference<any, "public">>;' >> convex/_generated/api.d.ts && \
        echo 'export declare const internal: FilterApi<typeof fullApi, FunctionReference<any, "internal">>;' >> convex/_generated/api.d.ts; \
    fi

# Attempt Convex codegen
RUN echo "Attempting Convex codegen..." && \
    npx convex codegen || echo "Convex codegen failed or unavailable"

# If codegen succeeded, remove the container's stub; otherwise rely on container's stub
RUN if [ -f convex/_generated/api.js ] && [ -f convex/_generated/api.d.ts ]; then \
      echo "Codegen succeeded - removing container's stub" && \
      rm -f convex/_generated/api.ts; \
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
CMD ["node", "dist/index.js"]
