#!/bin/bash

# Quick Deploy Script for Buddian on Ubuntu 24.04
# This script provides a simple, reliable way to deploy Buddian

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check basic requirements
check_requirements() {
    log_info "Checking basic requirements..."
    
    # Check if Docker is installed
    if ! command_exists docker; then
        log_error "Docker is not installed. Please install Docker first:"
        echo "  sudo apt update"
        echo "  sudo apt install -y docker.io"
        echo "  sudo systemctl start docker"
        echo "  sudo systemctl enable docker"
        echo "  sudo usermod -aG docker \$USER"
        echo "  # Log out and back in for group changes to take effect"
        exit 1
    fi
    
    # Check if Docker is running
    if ! docker info >/dev/null 2>&1; then
        log_error "Docker daemon is not running. Please start Docker:"
        echo "  sudo systemctl start docker"
        exit 1
    fi
    
    # Check if Docker Compose is available
    if ! command_exists docker-compose && ! docker compose version >/dev/null 2>&1; then
        log_error "Docker Compose is not available. Please install Docker Compose:"
        echo "  sudo apt install -y docker-compose-plugin"
        exit 1
    fi
    
    log_success "Docker is installed and running"
}

# Validate environment
validate_environment() {
    log_info "Validating environment..."
    
    # Check if we're in the right directory
    if [ ! -f "docker-compose.yml" ]; then
        log_error "docker-compose.yml not found. Please run this script from the Buddian project root directory."
        exit 1
    fi
    
    # Check if .env file exists
    if [ ! -f ".env" ]; then
        log_warning ".env file not found"
        
        if [ -f ".env.example" ]; then
            log_info "Creating .env from .env.example..."
            cp .env.example .env
            log_warning "Please edit .env file with your actual configuration values before running again."
            log_info "Required variables:"
            echo "  - CONVEX_URL: Your Convex deployment URL"
            echo "  - CONVEX_DEPLOYMENT: Your deployment name"
            echo "  - CONVEX_ADMIN_KEY: Your Convex admin key"
            echo "  - TELEGRAM_BOT_TOKEN: Your Telegram bot token"
            echo "  - AZURE_OPENAI_ENDPOINT: Your Azure OpenAI endpoint"
            echo "  - AZURE_OPENAI_KEY: Your Azure OpenAI key"
            exit 1
        else
            log_error ".env.example file not found. Please create .env file manually."
            exit 1
        fi
    fi
    
    log_success "Environment validation completed"
}

# Create API stub
create_api_stub() {
    log_info "Creating Convex API stub..."
    
    # Create the directory if it doesn't exist
    mkdir -p convex/_generated
    
    # Check if API file already exists
    if [ -f "convex/_generated/api.ts" ]; then
        log_success "Convex API file already exists"
        return
    fi
    
    # Create the API stub file
    cat > convex/_generated/api.ts << 'EOF'
/**
 * Generated Convex API
 * This file contains the generated API exports for Convex functions
 */

// Health module functions
export const health = {
  check: "health:check" as any,
  ping: "health:ping" as any,
  getStats: "health:getStats" as any,
};

// Messages module functions  
export const messages = {
  list: "messages:list" as any,
  create: "messages:create" as any,
  update: "messages:update" as any,
  delete: "messages:delete" as any,
  storeMessage: "messages:storeMessage" as any,
  getMessage: "messages:getMessage" as any,
  getMessages: "messages:getMessages" as any,
  searchMessages: "messages:searchMessages" as any,
  getThreadContext: "messages:getThreadContext" as any,
  updateMessageDecisions: "messages:updateMessageDecisions" as any,
  updateMessageActionItems: "messages:updateMessageActionItems" as any,
};

// Users module functions
export const users = {
  get: "users:get" as any,
  create: "users:create" as any,
  update: "users:update" as any,
  list: "users:list" as any,
  createUser: "users:createUser" as any,
  getUser: "users:getUser" as any,
  getUserById: "users:getUserById" as any,
  updateUserPreferences: "users:updateUserPreferences" as any,
  updateLastActive: "users:updateLastActive" as any,
  getUserLanguage: "users:getUserLanguage" as any,
};

// Resources module functions
export const resources = {
  list: "resources:list" as any,
  create: "resources:create" as any,
  update: "resources:update" as any,
  delete: "resources:delete" as any,
  get: "resources:get" as any,
  storeResource: "resources:storeResource" as any,
  getResource: "resources:getResource" as any,
  getResources: "resources:getResources" as any,
  searchResources: "resources:searchResources" as any,
  updateResourceSummary: "resources:updateResourceSummary" as any,
};

// Threads module functions
export const threads = {
  list: "threads:list" as any,
  create: "threads:create" as any,
  update: "threads:update" as any,
  delete: "threads:delete" as any,
  get: "threads:get" as any,
  createThread: "threads:createThread" as any,
  getThread: "threads:getThread" as any,
  getActiveThreads: "threads:getActiveThreads" as any,
  updateThreadActivity: "threads:updateThreadActivity" as any,
  updateThreadSummary: "threads:updateThreadSummary" as any,
};

// Search module functions
export const search = {
  messages: "search:messages" as any,
  resources: "search:resources" as any,
  users: "search:users" as any,
  searchByKeywords: "search:searchByKeywords" as any,
  searchByContext: "search:searchByContext" as any,
  getRelatedContent: "search:getRelatedContent" as any,
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
EOF
    
    log_success "Convex API stub created successfully"
}

# Run Docker build
run_docker_build() {
    log_info "Running Docker build..."
    
    # Determine Docker Compose command
    COMPOSE_CMD="docker compose"
    if command_exists docker-compose; then 
        COMPOSE_CMD="docker-compose"
    fi
    
    # Stop any existing containers
    log_info "Stopping existing containers..."
    $COMPOSE_CMD down --remove-orphans || true
    
    # Build and start services
    log_info "Building and starting services..."
    if $COMPOSE_CMD up -d --build; then
        log_success "Services started successfully"
    else
        log_error "Failed to start services"
        log_info "Check logs with: $COMPOSE_CMD logs"
        exit 1
    fi
}

# Verify deployment
verify_deployment() {
    log_info "Verifying deployment..."
    
    # Wait a moment for services to start
    sleep 5
    
    # Determine Docker Compose command
    COMPOSE_CMD="docker compose"
    if command_exists docker-compose; then 
        COMPOSE_CMD="docker-compose"
    fi
    
    # Check if containers are running
    if $COMPOSE_CMD ps | grep -q "Up"; then
        log_success "Containers are running"
        
        # Show running services
        echo ""
        log_info "Running services:"
        $COMPOSE_CMD ps
        
    else
        log_error "Some containers are not running properly"
        log_info "Check logs with: $COMPOSE_CMD logs"
        return 1
    fi
    
    log_success "Deployment verification completed"
}

# Main function
main() {
    echo ""
    log_info "🚀 Quick Deploy - Buddian on Ubuntu 24.04"
    echo ""
    
    check_requirements
    validate_environment
    create_api_stub
    run_docker_build
    verify_deployment
    
    echo ""
    log_success "✅ Buddian deployed successfully!"
    echo ""
    log_info "Useful commands:"
    echo "  • View logs: docker-compose logs -f"
    echo "  • Restart services: docker-compose restart"
    echo "  • Stop services: docker-compose down"
    echo ""
    log_info "Next steps:"
    echo "  1. Configure your external nginx/reverse proxy"
    echo "  2. Set up SSL certificates (Let's Encrypt recommended)"
    echo "  3. Configure your Telegram bot webhook"
}

# Handle script interruption
trap 'log_error "Deployment interrupted"; exit 1' INT TERM

# Run main function
main "$@"
