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

# Copy the stub generation script
COPY scripts/gen-convex-stub.js ./scripts/

# Create stub files using the same authoritative approach as deploy.sh
RUN echo "Creating Convex API stub with proper FunctionReference types..." && \
    mkdir -p convex/_generated && \
    echo "Attempting Convex codegen..." && \
    if npx convex codegen 2>/dev/null && [ -f "convex/_generated/api.ts" ] && grep -q "FunctionReference" "convex/_generated/api.ts" 2>/dev/null; then \
        echo "Convex codegen succeeded with proper FunctionReference types"; \
    else \
        echo "Convex codegen failed or unavailable, using authoritative stub generation..." && \
        node scripts/gen-convex-stub.js --force; \
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
