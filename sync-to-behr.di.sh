#!/bin/bash

# Sync script: care-connect/utilities → baylor/behr/utilities
# Uses exclusions for flexibility and maintainability
# NOTE: This script is excluded from sync - it only exists in care-connect/utilities

SOURCE="/Users/jeffk/dev/data-integrities/care-connect/utilities/"
DEST="/Users/jeffk/dev/baylor/behr/utilities/"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Syncing: care-connect/utilities → baylor/behr/utilities${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Dry run first to show what will be synced
echo -e "${YELLOW}DRY RUN - Showing what will be synced:${NC}"
echo ""

rsync -avh --dry-run \
  --exclude='.git/' \
  --exclude='.github/' \
  --exclude='node_modules/' \
  --exclude='*.log' \
  --exclude='.DS_Store' \
  --exclude='.claude/' \
  --exclude='captures/' \
  --exclude='*.tmp' \
  --exclude='.gemini-clipboard/' \
  --exclude='.playwright-mcp/' \
  --exclude='__tests__/' \
  --exclude='*.di*' \
  --exclude='*.local*' \
  "$SOURCE" "$DEST"

echo ""
echo -e "${YELLOW}========================================${NC}"
read -p "Proceed with actual sync? (y/n): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    echo -e "${GREEN}Running actual sync...${NC}"
    echo ""

    rsync -avh \
      --exclude='.git/' \
      --exclude='.github/' \
      --exclude='node_modules/' \
      --exclude='*.log' \
      --exclude='.DS_Store' \
      --exclude='.claude/' \
      --exclude='captures/' \
      --exclude='*.tmp' \
      --exclude='.gemini-clipboard/' \
      --exclude='.playwright-mcp/' \
      --exclude='__tests__/' \
      --exclude='*.di*' \
      --exclude='*.local*' \
      "$SOURCE" "$DEST"

    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}✅ Sync completed successfully!${NC}"
    echo -e "${GREEN}========================================${NC}"
else
    echo ""
    echo -e "${YELLOW}Sync cancelled.${NC}"
fi
