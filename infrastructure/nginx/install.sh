#!/bin/bash
# Kaivalo nginx configuration installation script
# Run with: sudo bash infrastructure/nginx/install.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_SOURCE="$SCRIPT_DIR/kaivalo.com"
CONFIG_DEST="/etc/nginx/sites-available/kaivalo.com"
LINK_DEST="/etc/nginx/sites-enabled/kaivalo.com"

echo "=== Kaivalo nginx Configuration Installer ==="
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "Error: Please run with sudo"
    exit 1
fi

# Check if nginx is installed
if ! command -v nginx &> /dev/null; then
    echo "Error: nginx is not installed"
    exit 1
fi

# Check if source config exists
if [ ! -f "$CONFIG_SOURCE" ]; then
    echo "Error: Config file not found at $CONFIG_SOURCE"
    exit 1
fi

# Copy config to sites-available
echo "Copying config to $CONFIG_DEST..."
cp "$CONFIG_SOURCE" "$CONFIG_DEST"

# Create symlink if it doesn't exist
if [ ! -L "$LINK_DEST" ]; then
    echo "Creating symlink in sites-enabled..."
    ln -s "$CONFIG_DEST" "$LINK_DEST"
else
    echo "Symlink already exists at $LINK_DEST"
fi

# Test nginx configuration
echo ""
echo "Testing nginx configuration..."
if nginx -t; then
    echo ""
    echo "✓ nginx configuration is valid"
    echo ""
    echo "To apply changes, run:"
    echo "  sudo systemctl reload nginx"
else
    echo ""
    echo "✗ nginx configuration test failed"
    echo "Removing config files..."
    rm -f "$LINK_DEST"
    rm -f "$CONFIG_DEST"
    exit 1
fi

echo ""
echo "=== Installation Complete ==="
echo ""
echo "Next steps:"
echo "1. Ensure kaivalo.com domain is registered and DNS is pointed"
echo "2. Run: sudo systemctl reload nginx"
echo "3. Run certbot for SSL: sudo certbot --nginx -d kaivalo.com -d www.kaivalo.com -d mechai.kaivalo.com"
