#!/bin/bash

# Buddian Deployment Script
# Simplified, working deployment script that fixes all identified issues

# Initialize all variables with defaults to prevent unbound variable errors
DEPLOY_DEBUG="${DEPLOY_DEBUG:-false}"
DEPLOY_ENV="${DEPLOY_ENV:-production}"
DOCKER_BUILDKIT="${DOCKER_BUILDKIT:-1}"
COMPOSE_DOCKER_CLI_BUILD="${COMPOSE_DOCKER_CLI_BUILD:-1}"

# Set strict mode after initializing variables
set -euo pipefail

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

log_debug() {
    if [[ "$DEPLOY_DEBUG" == "true" ]]; then
        echo -e "${YELLOW}[DEBUG]${NC} $1"
    fi
}

# Function to check requirements
check_requirements() {
    log_info "Checking deployment requirements..."
    
    # Check if Docker is installed and running
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        log_error "Docker is not running. Please start Docker first."
        exit 1
    fi
    
    # Check if docker-compose is available
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        log_error "Docker Compose is not available. Please install Docker Compose."
        exit 1
    fi
    
    # Check if required files exist
    local required_files=("docker-compose.yml" "packages/bot/Dockerfile" "packages/bot/package.json")
    for file in "${required_files[@]}"; do
        if [[ ! -f "$file" ]]; then
            log_error "Required file not found: $file"
            exit 1
        fi
    done
    
    log_success "All requirements satisfied"
}

# Function to wait for container health with polling and timeout
wait_for_container_health() {
    local container_name="buddian-bot"
    local timeout=120  # 120 seconds timeout
    local interval=2   # Check every 2 seconds
    local elapsed=0
    
    log_info "Polling container health status (timeout: ${timeout}s)..."
    
    while [ $elapsed -lt $timeout ]; do
        # Check if container exists
        if ! docker ps -q -f name="$container_name" | grep -q .; then
            log_debug "Container '$container_name' not found, waiting..."
            sleep $interval
            elapsed=$((elapsed + interval))
            continue
        fi
        
        # Get health status
        local health_status
        health_status=$(docker inspect -f '{{ .State.Health.Status }}' "$container_name" 2>/dev/null || echo "no-health-check")
        
        log_debug "Container health status: $health_status (elapsed: ${elapsed}s)"
        
        case "$health_status" in
            "healthy")
                log_success "Container is healthy!"
                return 0
                ;;
            "unhealthy")
                log_error "Container is unhealthy!"
                return 1
                ;;
            "starting")
                log_debug "Container is starting, continuing to wait..."
                ;;
            "no-health-check")
                # If no health check is defined, check if container is running
                local container_status
                container_status=$(docker inspect -f '{{ .State.Status }}' "$container_name" 2>/dev/null || echo "unknown")
                if [ "$container_status" = "running" ]; then
                    log_info "Container is running (no health check defined)"
                    return 0
                else
                    log_debug "Container status: $container_status, continuing to wait..."
                fi
                ;;
            *)
                log_debug "Unknown health status: $health_status, continuing to wait..."
                ;;
        esac
        
        sleep $interval
        elapsed=$((elapsed + interval))
    done
    
    log_error "Timeout waiting for container to become healthy (${timeout}s elapsed)"
    return 1
}

# Function to create Convex API stub
create_convex_stub() {
    log_info "Creating Convex API stub with proper FunctionReference types..."
    
    local stub_dir="convex/_generated"
    local stub_file="$stub_dir/api.ts"
    local force_stub=false
    
    # Check for --force-stub flag
    if [[ "${1:-}" == "--force-stub" ]]; then
        force_stub=true
        log_info "Force stub creation enabled"
    fi
    
    # Create directory if it doesn't exist
    mkdir -p "$stub_dir"
    
    # Comment 1: Try npx convex codegen first
    log_info "Attempting Convex codegen..."
    if npx convex codegen 2>/dev/null; then
        # Verify that codegen created proper FunctionReference types
        if [[ -f "$stub_file" ]] && grep -q "FunctionReference" "$stub_file" 2>/dev/null; then
            log_success "Convex codegen succeeded with proper FunctionReference types"
            return 0
        else
            log_warning "Convex codegen succeeded but did not create proper FunctionReference types"
        fi
    else
        log_info "Convex codegen failed or unavailable, falling back to stub generation"
    fi
    
    # Comment 2: Use single authoritative stub generation script
    log_info "Using authoritative FunctionReference-based stub generation..."
    if [[ -f "scripts/gen-convex-stub.js" ]]; then
        if $force_stub; then
            node scripts/gen-convex-stub.js --force
        else
            node scripts/gen-convex-stub.js
        fi
        
        if [[ $? -eq 0 ]]; then
            log_success "Convex API stub created successfully using gen-convex-stub.js"
        else
            log_error "Failed to create stub using gen-convex-stub.js"
            return 1
        fi
    else
        log_error "gen-convex-stub.js script not found"
        return 1
    fi
}

# Function to build and deploy
deploy_application() {
    log_info "Starting application deployment..."
    
    # Set Docker build environment
    export DOCKER_BUILDKIT=1
    export COMPOSE_DOCKER_CLI_BUILD=1
    
    # Stop any existing containers
    log_info "Stopping existing containers..."
    if command -v docker-compose &> /dev/null; then
        docker-compose down --remove-orphans || true
    else
        docker compose down --remove-orphans || true
    fi
    
    # Build and start containers
    log_info "Building and starting containers..."
    if command -v docker-compose &> /dev/null; then
        docker-compose up --build -d
    else
        docker compose up --build -d
    fi
    
    # Wait for containers to be ready with health polling
    log_info "Waiting for containers to be ready..."
    wait_for_container_health
    
    # Check container status
    log_info "Checking container status..."
    if command -v docker-compose &> /dev/null; then
        docker-compose ps
    else
        docker compose ps
    fi
    
    log_success "Deployment completed successfully!"
}

# Function to show deployment status
show_status() {
    log_info "Deployment Status:"
    echo "===================="
    
    if command -v docker-compose &> /dev/null; then
        docker-compose ps
    else
        docker compose ps
    fi
    
    echo ""
    log_info "To view logs, run:"
    if command -v docker-compose &> /dev/null; then
        echo "  docker-compose logs -f"
    else
        echo "  docker compose logs -f"
    fi
    
    echo ""
    log_info "To stop the application, run:"
    if command -v docker-compose &> /dev/null; then
        echo "  docker-compose down"
    else
        echo "  docker compose down"
    fi
}

# Function to cleanup on failure
cleanup_on_failure() {
    log_warning "Deployment failed. Cleaning up..."
    
    if command -v docker-compose &> /dev/null; then
        docker-compose down --remove-orphans || true
    else
        docker compose down --remove-orphans || true
    fi
    
    log_info "Cleanup completed. You can try running the deployment again."
}

# Main deployment function
main() {
    log_info "Starting Buddian deployment process..."
    log_debug "Debug mode: $DEPLOY_DEBUG"
    log_debug "Environment: $DEPLOY_ENV"
    
    # Trap errors and cleanup
    trap cleanup_on_failure ERR
    
    # Run deployment steps
    check_requirements
    create_convex_stub
    deploy_application
    show_status
    
    log_success "Buddian has been deployed successfully!"
    log_info "The application should now be running and accessible."
}

# Handle script arguments
case "${1:-}" in
    "status")
        show_status
        ;;
    "stop")
        log_info "Stopping Buddian application..."
        if command -v docker-compose &> /dev/null; then
            docker-compose down
        else
            docker compose down
        fi
        log_success "Application stopped"
        ;;
    "logs")
        log_info "Showing application logs..."
        if command -v docker-compose &> /dev/null; then
            docker-compose logs -f
        else
            docker compose logs -f
        fi
        ;;
    "restart")
        log_info "Restarting Buddian application..."
        if command -v docker-compose &> /dev/null; then
            docker-compose restart
        else
            docker compose restart
        fi
        log_success "Application restarted"
        ;;
    *)
        main
        ;;
esac
