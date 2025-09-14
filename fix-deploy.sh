#!/usr/bin/env bash

# Re-exec under bash if not already running under bash
if [ -z "$BASH_VERSION" ]; then
    exec bash "$0" "$@"
fi

# fix-deploy.sh - Diagnostic and fix script for deploy.sh issues
# This script addresses common causes of "main: command not found" error

# Enable strict mode
set -Eeuo pipefail

# Safe IFS
IFS=$'\n\t'

# ERR trap for clear failures
trap 'echo "ERROR: Script failed at line $LINENO with exit code $?" >&2; exit 1' ERR

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script configuration - resolve paths relative to script location
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="$SCRIPT_DIR/deploy.sh"
BACKUP_SUFFIX=".backup.$(date +%Y%m%d_%H%M%S)"

echo -e "${BLUE}=== Deploy.sh Diagnostic and Fix Script ===${NC}"
echo "This script will diagnose and fix common issues with deploy.sh"
echo "Script directory: $SCRIPT_DIR"
echo "Target script: $TARGET"
echo

# Function to print status messages
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if deploy.sh exists
check_deploy_script_exists() {
    print_status "Checking if $TARGET exists..."
    if [[ ! -f "$TARGET" ]]; then
        print_error "$TARGET not found"
        exit 1
    fi
    print_success "$TARGET found"
}

# Function to create backup with idempotency check
create_backup() {
    print_status "Creating backup of $TARGET..."
    
    # Check if a recent backup already exists (within last hour)
    local recent_backup=""
    if ls "${TARGET}.backup."* >/dev/null 2>&1; then
        recent_backup=$(ls -t "${TARGET}.backup."* 2>/dev/null | head -n1)
        if [[ -n "$recent_backup" ]]; then
            local backup_time=$(stat -f%m "$recent_backup" 2>/dev/null || stat -c%Y "$recent_backup" 2>/dev/null)
            local current_time=$(date +%s)
            local time_diff=$((current_time - backup_time))
            
            if [[ $time_diff -lt 3600 ]]; then
                print_status "Recent backup exists: $recent_backup (created ${time_diff}s ago)"
                print_status "Skipping backup creation to avoid clutter"
                return 0
            fi
        fi
    fi
    
    cp "$TARGET" "${TARGET}${BACKUP_SUFFIX}"
    print_success "Backup created: ${TARGET}${BACKUP_SUFFIX}"
}

# Function to check and display current file information
check_file_info() {
    print_status "Checking current file information..."
    
    echo "File: $TARGET"
    echo "Size: $(stat -f%z "$TARGET" 2>/dev/null || stat -c%s "$TARGET" 2>/dev/null || echo "unknown") bytes"
    echo "Permissions: $(ls -la "$TARGET" | awk '{print $1}')"
    echo "Owner: $(ls -la "$TARGET" | awk '{print $3":"$4}')"
    
    # Check line endings
    if command -v file >/dev/null 2>&1; then
        local file_info=$(file "$TARGET")
        echo "File type: $file_info"
        
        if echo "$file_info" | grep -q "CRLF"; then
            print_warning "File has Windows (CRLF) line endings"
            return 1
        elif echo "$file_info" | grep -q "text"; then
            print_success "File has Unix (LF) line endings"
        fi
    fi
    
    return 0
}

# Function to check file permissions
check_permissions() {
    print_status "Checking file permissions..."
    
    if [[ -x "$TARGET" ]]; then
        print_success "File has execute permissions"
        return 0
    else
        print_warning "File does not have execute permissions"
        return 1
    fi
}

# Function to fix file permissions and restore executable bit
fix_permissions() {
    print_status "Fixing file permissions..."
    chmod +x "$TARGET"
    print_success "Execute permissions added to $TARGET"
    
    # Verify executable bit was set
    if [[ -x "$TARGET" ]]; then
        print_success "Executable bit verified"
    else
        print_error "Failed to set executable bit"
        return 1
    fi
}

# Function to ensure Unix line endings with dos2unix fallback
ensure_unix_line_endings() {
    print_status "Ensuring Unix line endings..."
    
    # Try dos2unix first
    if command -v dos2unix >/dev/null 2>&1; then
        print_status "Using dos2unix to convert line endings..."
        dos2unix "$TARGET" >/dev/null 2>&1
        print_success "Line endings converted using dos2unix"
        
        # Verify conversion
        if command -v file >/dev/null 2>&1; then
            local file_info=$(file "$TARGET")
            if echo "$file_info" | grep -q "CRLF"; then
                print_warning "dos2unix conversion may have failed, trying fallback method"
            else
                print_success "Line ending conversion verified"
                return 0
            fi
        fi
    else
        print_status "dos2unix not found, using perl fallback..."
    fi
    
    # Fallback to perl
    if command -v perl >/dev/null 2>&1; then
        print_status "Using perl to convert line endings..."
        perl -pi -e 's/\r$//' "$TARGET"
        print_success "Line endings converted using perl"
        
        # Verify conversion
        if command -v file >/dev/null 2>&1; then
            local file_info=$(file "$TARGET")
            if echo "$file_info" | grep -q "CRLF"; then
                print_warning "perl conversion may have failed, trying sed fallback"
            else
                print_success "Line ending conversion verified with perl"
                return 0
            fi
        fi
    else
        print_status "perl not found, using sed fallback..."
    fi
    
    # Final fallback to sed
    print_status "Using sed to convert line endings..."
    # Temporarily disable strict mode for sed operation
    set +e
    sed -i 's/\r$//' "$TARGET" 2>/dev/null
    local sed_result=$?
    set -e
    
    if [[ $sed_result -eq 0 ]]; then
        print_success "Line endings converted using sed"
    else
        print_warning "sed conversion may have failed"
    fi
    
    # Final verification
    if command -v file >/dev/null 2>&1; then
        local file_info=$(file "$TARGET")
        if echo "$file_info" | grep -q "CRLF"; then
            print_error "All line ending conversion methods failed"
            return 1
        else
            print_success "Line ending conversion verified"
        fi
    fi
    
    return 0
}

# Function to detect root/sudo and handle package installations with opt-in
handle_package_installation() {
    print_status "Checking package installation requirements..."
    
    # Check if dos2unix is available
    if command -v dos2unix >/dev/null 2>&1; then
        print_success "dos2unix is already available"
        return 0
    fi
    
    # Check if FIX_ALLOW_INSTALL is set
    if [[ "${FIX_ALLOW_INSTALL:-}" != "1" ]]; then
        print_warning "dos2unix not found and package installation is disabled"
        print_status "To enable package installation, set: FIX_ALLOW_INSTALL=1"
        print_status "Manual installation commands:"
        echo "  sudo apt update"
        echo "  sudo apt install -y dos2unix"
        echo "  # or"
        echo "  sudo yum install -y dos2unix"
        echo "  # or"
        echo "  sudo dnf install -y dos2unix"
        return 0
    fi
    
    print_status "Package installation is enabled (FIX_ALLOW_INSTALL=1)"
    
    # Detect if running as root or with sudo
    local install_cmd=""
    if [[ $EUID -eq 0 ]]; then
        print_status "Running as root"
        install_cmd="apt-get"
    elif command -v sudo >/dev/null 2>&1; then
        print_status "Using sudo for package installation"
        install_cmd="sudo apt-get"
    else
        print_error "Neither root nor sudo available for package installation"
        print_status "Manual installation required:"
        echo "  apt-get update && apt-get install -y dos2unix"
        return 1
    fi
    
    # Install dos2unix
    print_status "Installing dos2unix..."
    # Temporarily disable strict mode for package installation
    set +e
    $install_cmd update >/dev/null 2>&1
    local update_result=$?
    $install_cmd install -y dos2unix >/dev/null 2>&1
    local install_result=$?
    set -e
    
    if [[ $install_result -eq 0 ]]; then
        print_success "dos2unix installed successfully"
    else
        print_warning "Package installation failed (exit code: $install_result)"
        print_status "You may need to install dos2unix manually"
    fi
    
    return 0
}

# Function to validate shell compatibility and add validation steps
validate_shell_compatibility() {
    print_status "Validating shell compatibility..."
    
    # Check if script has proper shebang
    local first_line=$(head -n1 "$TARGET")
    if [[ "$first_line" =~ ^#!.*bash ]]; then
        print_success "Script has bash shebang: $first_line"
    elif [[ "$first_line" =~ ^#!/bin/sh ]]; then
        print_warning "Script uses /bin/sh, may have compatibility issues"
    else
        print_warning "Script may be missing proper shebang"
    fi
    
    # Always run bash syntax check
    print_status "Running bash syntax validation (bash -n)..."
    if bash -n "$TARGET"; then
        print_success "Script syntax is valid (bash -n passed)"
    else
        print_error "Script has syntax errors (bash -n failed)"
        return 1
    fi
    
    # Opportunistically run shellcheck if available
    if command -v shellcheck >/dev/null 2>&1; then
        print_status "Running shellcheck validation..."
        # Temporarily disable strict mode for shellcheck
        set +e
        local shellcheck_output=$(shellcheck "$TARGET" 2>&1)
        local shellcheck_result=$?
        set -e
        
        if [[ $shellcheck_result -eq 0 ]]; then
            print_success "shellcheck validation passed"
        else
            print_warning "shellcheck found issues:"
            echo "$shellcheck_output" | head -20  # Show first 20 lines
            print_status "Note: shellcheck issues are informational and may not prevent execution"
        fi
    else
        print_status "shellcheck not available (install with: apt install shellcheck)"
        print_status "Skipping shellcheck validation"
    fi
    
    return 0
}

# Function to check for main function
check_main_function() {
    print_status "Checking for main function definition and call..."
    
    if grep -q "^main()" "$TARGET" || grep -q "^function main" "$TARGET"; then
        print_success "Main function definition found"
    else
        print_warning "Main function definition not found"
    fi
    
    if grep -q "^main " "$TARGET" || grep -q "main \"\$@\"" "$TARGET"; then
        print_success "Main function call found"
    else
        print_warning "Main function call not found"
    fi
}

# Function to test script execution with opt-in
test_script_execution() {
    print_status "Testing script execution..."
    
    # Only run actual execution test if FIX_RUN_TEST is set
    if [[ "${FIX_RUN_TEST:-}" != "1" ]]; then
        print_status "Script execution test disabled (set FIX_RUN_TEST=1 to enable)"
        print_status "Performing safe syntax-only test..."
        
        # Safe syntax test
        if timeout 5s bash -n "$TARGET"; then
            print_success "Syntax validation passed"
            return 0
        else
            print_error "Syntax validation failed"
            return 1
        fi
    fi
    
    print_status "Script execution test enabled (FIX_RUN_TEST=1)"
    
    # Test with --help or similar safe option if available
    if grep -q "\--help\|\-h" "$TARGET"; then
        print_status "Testing with --help option..."
        # Temporarily disable strict mode for test execution
        set +e
        local help_output=$(timeout 10s bash "$TARGET" --help 2>&1)
        local help_result=$?
        set -e
        
        if [[ $help_result -eq 0 ]]; then
            print_success "Script executes without errors (--help test passed)"
            return 0
        else
            print_warning "Script execution test failed with --help (exit code: $help_result)"
        fi
    fi
    
    # Test with --dry-run if available
    if grep -q "\--dry-run" "$TARGET"; then
        print_status "Testing with --dry-run option..."
        # Temporarily disable strict mode for test execution
        set +e
        local dryrun_output=$(timeout 30s bash "$TARGET" --dry-run 2>&1)
        local dryrun_result=$?
        set -e
        
        if [[ $dryrun_result -eq 0 ]]; then
            print_success "Script executes without errors (--dry-run test passed)"
            return 0
        else
            print_warning "Script execution test failed with --dry-run (exit code: $dryrun_result)"
        fi
    fi
    
    print_warning "No safe execution test options found"
    print_status "Consider adding --help or --dry-run support to the script"
    return 1
}

# Function to provide troubleshooting information
provide_troubleshooting() {
    echo
    print_status "Troubleshooting Information:"
    echo
    echo "If the script still fails with 'main: command not found', try:"
    echo "1. Run with explicit bash: bash $TARGET"
    echo "2. Check for hidden characters: cat -A $TARGET | head -20"
    echo "3. Verify the main function is properly defined and called"
    echo "4. Check environment variables: env | grep -E '(SHELL|PATH)'"
    echo "5. Run with debugging: bash -x $TARGET"
    echo "6. Check system compatibility: uname -a"
    echo
    echo "Common solutions:"
    echo "- Ensure you're on a Unix-like system (Linux/macOS)"
    echo "- Verify bash is installed: which bash"
    echo "- Check if running as correct user with proper permissions"
    echo "- Ensure all dependencies are installed"
    echo
    echo "Environment variables for this script:"
    echo "- FIX_ALLOW_INSTALL=1  : Allow package installations"
    echo "- FIX_RUN_TEST=1       : Enable actual script execution tests"
    echo
}

# Main execution
main() {
    echo "Starting diagnostic and fix process..."
    echo
    
    # Step 1: Check if deploy.sh exists
    check_deploy_script_exists
    
    # Step 2: Handle package installation (with opt-in)
    handle_package_installation
    
    # Step 3: Create backup (with idempotency)
    create_backup
    
    # Step 4: Display current file info
    local line_endings_ok=true
    check_file_info || line_endings_ok=false
    
    # Step 5: Check and fix permissions
    local permissions_ok=true
    check_permissions || permissions_ok=false
    
    # Step 6: Fix line endings if needed
    if [[ "$line_endings_ok" == false ]]; then
        ensure_unix_line_endings
    fi
    
    # Step 7: Fix permissions if needed and restore executable bit
    if [[ "$permissions_ok" == false ]]; then
        fix_permissions
    else
        # Always ensure executable bit is set after any modifications
        chmod +x "$TARGET"
        print_status "Executable bit verified/restored"
    fi
    
    # Step 8: Validate shell compatibility and run validation steps
    local syntax_ok=true
    validate_shell_compatibility || syntax_ok=false
    
    # Step 9: Check main function
    check_main_function
    
    # Step 10: Test execution (with opt-in)
    local execution_ok=true
    test_script_execution || execution_ok=false
    
    echo
    print_status "=== Summary ==="
    
    if [[ "$permissions_ok" == true && "$line_endings_ok" == true && "$syntax_ok" == true && "$execution_ok" == true ]]; then
        print_success "All checks passed! The deploy.sh script should now work properly."
        echo
        print_status "You can now run: $TARGET"
    else
        print_warning "Some issues were found and fixed. Please test the script manually."
        provide_troubleshooting
    fi
    
    echo
    print_status "Backup saved as: ${TARGET}${BACKUP_SUFFIX}"
    print_status "Fix script completed."
}

# Run main function with all arguments
main "$@"
