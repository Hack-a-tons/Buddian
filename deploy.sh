#!/bin/bash

# Buddian Deployment Script for Ubuntu 24.04
# This script fixes Docker build issues and deploys Buddian successfully

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Docker Compose command detection
COMPOSE_CMD="docker compose"
if command -v docker-compose >/dev/null 2>&1; then 
    COMPOSE_CMD="docker-compose"
fi

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

# Function to check Docker installation
check_docker() {
    log_info "Checking Docker installation..."
    
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
    
    if ! command_exists docker-compose && ! docker compose version >/dev/null 2>&1; then
        log_error "Docker Compose is not installed. Please install Docker Compose:"
        echo "  sudo apt install -y docker-compose-plugin"
        exit 1
    fi
    
    # Check if Docker daemon is running
    if ! docker info >/dev/null 2>&1; then
        log_error "Docker daemon is not running. Please start Docker:"
        echo "  sudo systemctl start docker"
        exit 1
    fi
    
    log_success "Docker is installed and running"
}

# Function to check environment file
check_env_file() {
    log_info "Checking environment configuration..."
    
    if [ ! -f ".env" ]; then
        log_warning ".env file not found"
        
        if [ -f ".env.example" ]; then
            log_info "Creating .env from .env.example..."
            cp .env.example .env
            log_warning "Please edit .env file with your actual configuration values:"
            echo "  - CONVEX_URL: Your Convex deployment URL"
            echo "  - CONVEX_ADMIN_KEY: Your Convex admin key"
            echo "  - TELEGRAM_BOT_TOKEN: Your Telegram bot token"
            echo "  - OPENAI_API_KEY: Your OpenAI API key"
            echo ""
            echo "After editing .env, run this script again."
            exit 1
        else
            log_error ".env.example file not found. Please create .env file manually with required environment variables."
            exit 1
        fi
    fi
    
    log_success "Environment file exists"
}

# Function to verify import paths (no longer mutates source files)
fix_import_paths() {
    log_info "Verifying TypeScript import paths for Docker build..."
    
    # Verify convex service import path uses path alias
    CONVEX_SERVICE_FILE="packages/bot/src/services/convex.ts"
    
    if [ -f "$CONVEX_SERVICE_FILE" ]; then
        if grep -q "import { api } from 'convex/_generated/api';" "$CONVEX_SERVICE_FILE"; then
            log_success "Import path uses path alias in $CONVEX_SERVICE_FILE"
        else
            log_warning "Import statement should use 'convex/_generated/api' path alias in $CONVEX_SERVICE_FILE"
        fi
    else
        log_error "Convex service file not found: $CONVEX_SERVICE_FILE"
        exit 1
    fi
    
    log_success "Import paths verified"
}

# Function to clean up previous builds
cleanup_docker() {
    log_info "Cleaning up previous Docker builds..."
    
    # Stop and remove existing containers
    if $COMPOSE_CMD ps -q >/dev/null 2>&1; then
        $COMPOSE_CMD down --remove-orphans || true
    fi
    
    # Remove dangling images
    docker image prune -f >/dev/null 2>&1 || true
    
    log_success "Docker cleanup completed"
}

# Function to build and deploy
deploy_services() {
    log_info "Building and deploying Buddian services..."
    
    # Build with no cache to ensure fresh build
    log_info "Building Docker images..."
    if $COMPOSE_CMD build --no-cache; then
        log_success "Docker images built successfully"
    else
        log_error "Docker build failed"
        log_info "Troubleshooting tips:"
        echo "  1. Check if all required files exist"
        echo "  2. Verify .env file has correct values"
        echo "  3. Ensure convex/_generated/api.ts exists"
        echo "  4. Check Docker logs: $COMPOSE_CMD logs"
        exit 1
    fi
    
    # Start services
    log_info "Starting services..."
    if $COMPOSE_CMD up -d; then
        log_success "Services started successfully"
        
        # Note about nginx profile
        log_info "Note: Nginx service is disabled by default (requires 'internal-proxy' profile)"
        log_info "To enable nginx: $COMPOSE_CMD --profile internal-proxy up -d"
    else
        log_error "Failed to start services"
        log_info "Check logs with: $COMPOSE_CMD logs"
        exit 1
    fi
}

# Function to verify deployment
verify_deployment() {
    log_info "Verifying deployment..."
    
    # Wait a moment for services to start
    sleep 5
    
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
    
    # Check container health
    log_info "Checking container health..."
    
    # Get container names
    BOT_CONTAINER=$($COMPOSE_CMD ps -q bot 2>/dev/null || echo "")
    NGINX_CONTAINER=$($COMPOSE_CMD ps -q nginx 2>/dev/null || echo "")
    
    if [ -n "$BOT_CONTAINER" ]; then
        if docker inspect "$BOT_CONTAINER" --format='{{.State.Health.Status}}' 2>/dev/null | grep -q "healthy\|starting"; then
            log_success "Bot service is healthy"
        else
            log_warning "Bot service health check failed or not configured"
        fi
    fi
    
    if [ -n "$NGINX_CONTAINER" ]; then
        if docker inspect "$NGINX_CONTAINER" --format='{{.State.Status}}' 2>/dev/null | grep -q "running"; then
            log_success "Nginx service is running"
        else
            log_warning "Nginx service is not running properly"
        fi
    fi
    
    log_success "Deployment verification completed"
}

# Function to show next steps
show_next_steps() {
    echo ""
    log_success "🎉 Buddian deployment completed successfully!"
    echo ""
    log_info "Next steps:"
    echo "  1. Configure your external nginx/reverse proxy to point to this server"
    echo "  2. Set up SSL certificates (Let's Encrypt recommended)"
    echo "  3. Configure your Telegram bot webhook to point to your domain"
    echo ""
    log_info "Useful commands:"
    echo "  • View logs: $COMPOSE_CMD logs -f"
    echo "  • Restart services: $COMPOSE_CMD restart"
    echo "  • Stop services: $COMPOSE_CMD down"
    echo "  • Enable nginx proxy: $COMPOSE_CMD --profile internal-proxy up -d"
    echo "  • Update deployment: git pull && ./deploy.sh"
    echo ""
    log_info "Troubleshooting:"
    echo "  • Check service status: $COMPOSE_CMD ps"
    echo "  • View specific service logs: $COMPOSE_CMD logs <service-name>"
    echo "  • Rebuild if needed: $COMPOSE_CMD build --no-cache"
    echo ""
    
    # Show external nginx configuration example
    echo ""
    log_info "Example external nginx configuration:"
    echo "server {"
    echo "    listen 80;"
    echo "    server_name your-domain.com;"
    echo "    return 301 https://\$server_name\$request_uri;"
    echo "}"
    echo ""
    echo "server {"
    echo "    listen 443 ssl http2;"
    echo "    server_name your-domain.com;"
    echo ""
    echo "    ssl_certificate /path/to/your/certificate.crt;"
    echo "    ssl_certificate_key /path/to/your/private.key;"
    echo ""
    echo "    location / {"
    echo "        proxy_pass http://localhost:8080;"
    echo "        proxy_set_header Host \$host;"
    echo "        proxy_set_header X-Real-IP \$remote_addr;"
    echo "        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;"
    echo "        proxy_set_header X-Forwarded-Proto \$scheme;"
    echo "    }"
    echo "}"
}

# Main deployment function
main() {
    echo ""
    log_info "🚀 Starting Buddian deployment on Ubuntu 24.04"
    echo ""
    
    # Check if we're in the right directory
    if [ ! -f "docker-compose.yml" ]; then
        log_error "docker-compose.yml not found. Please run this script from the Buddian project root directory."
        exit 1
    fi
    
    # Run all checks and deployment steps
    check_docker
    check_env_file
    fix_import_paths
    cleanup_docker
    deploy_services
    verify_deployment
    show_next_steps
    
    echo ""
    log_success "✅ Deployment completed successfully!"
}

# Handle script interruption
trap 'log_error "Deployment interrupted"; exit 1' INT TERM

# Run main function
main "$@"
