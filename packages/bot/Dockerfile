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
RUN npx convex codegen || echo "Convex codegen failed, continuing..."
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
