#!/bin/bash

# Documentation Status Report Script
# Shows the documentation cleanup status for all provider-search sub-projects

PROVIDER_SEARCH_ROOT="/Users/jeffk/Developement/provider-search"

echo "# Provider Search Documentation Status Report"
echo "Generated: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""
echo "## Summary"
echo ""

# Count completed and incomplete projects
completed=0
incomplete=0

# Create arrays to store project info
declare -a completed_projects
declare -a incomplete_projects

# Find all projects with .git directories
while IFS= read -r gitdir; do
  project_dir=$(dirname "$gitdir")
  project_name=$(basename "$project_dir")
  
  # Skip the .git directory itself
  if [[ "$project_name" == ".git" ]]; then
    continue
  fi
  
  # Skip Ruby gem dependencies (like fastlane-e5dfe9e69f79)
  if [[ "$project_dir" =~ \.gems/ruby/.*/bundler/gems/ ]]; then
    continue
  fi
  
  # Check for completion marker
  if [ -f "$project_dir/DOCUMENTATION_CLEANUP_COMPLETE.md" ]; then
    status="✓ COMPLETE"
    ((completed++))
    completed_projects+=("$project_name")
  else
    status="✗ Not complete"
    ((incomplete++))
    incomplete_projects+=("$project_name")
  fi
  
  # Check for CLAUDE.md
  if [ -f "$project_dir/CLAUDE.md" ]; then
    claude_md="Has CLAUDE.md"
  else
    claude_md="No CLAUDE.md"
  fi
  
  # Check if in SessionStart hook
  if grep -q "${project_name}\*\|${project_name} \&\&\|${project_name} project detected" ~/.claude/settings.local.json 2>/dev/null; then
    hook="Has Hook"
  else
    hook="No Hook"
  fi
  
  # Store for detailed output later
  echo "$project_name|$status|$claude_md|$hook" >> /tmp/doc_status_temp.txt
  
done < <(find "$PROVIDER_SEARCH_ROOT" -name ".git" -type d -not -path "*/node_modules/*" -prune | sort)

echo "- **Total Projects**: $((completed + incomplete))"
echo "- **Completed**: $completed"
echo "- **Remaining**: $incomplete"
echo "- **Completion Rate**: $(( (completed * 100) / (completed + incomplete) ))%"
echo ""

echo "## Completed Projects ($completed)"
echo ""
for project in "${completed_projects[@]}"; do
  echo "1. **$project** ✓"
done
echo ""

echo "## Remaining Incomplete Projects ($incomplete)"
echo ""
i=1
for project in "${incomplete_projects[@]}"; do
  echo "$i. **$project**"
  ((i++))
done
echo ""

echo "## Detailed Status"
echo ""
echo "| Project | Status | CLAUDE.md | SessionStart Hook |"
echo "|---------|--------|-----------|-------------------|"

# Read and display the detailed status
while IFS='|' read -r name status claude hook; do
  echo "| $name | $status | $claude | $hook |"
done < /tmp/doc_status_temp.txt | sort

# Cleanup temp file
rm -f /tmp/doc_status_temp.txt

echo ""
echo "## Next Steps"
echo ""
if [ $incomplete -gt 0 ]; then
  echo "Projects that need documentation cleanup:"
  echo ""
  while IFS='|' read -r name status claude hook; do
    if [[ "$status" == "✗ Not complete" ]]; then
      echo "- **$name**"
      if [[ "$claude" == "No CLAUDE.md" ]]; then
        echo "  - Create CLAUDE.md"
      fi
      echo "  - Apply documentation hierarchy pattern"
      echo "  - Create DOCUMENTATION_CLEANUP_COMPLETE.md"
      if [[ "$hook" == "No Hook" ]]; then
        echo "  - Add SessionStart hook"
      fi
    fi
  done < <(find "$PROVIDER_SEARCH_ROOT" -name ".git" -type d -not -path "*/node_modules/*" -prune | sort | while read gitdir; do
    project_dir=$(dirname "$gitdir")
    project_name=$(basename "$project_dir")
    
    # Skip Ruby gem dependencies
    if [[ "$project_dir" =~ \.gems/ruby/.*/bundler/gems/ ]]; then
      continue
    fi
    
    if [ -f "$project_dir/DOCUMENTATION_CLEANUP_COMPLETE.md" ]; then
      status="✓ COMPLETE"
    else
      status="✗ Not complete"
    fi
    
    if [ -f "$project_dir/CLAUDE.md" ]; then
      claude_md="Has CLAUDE.md"
    else
      claude_md="No CLAUDE.md"
    fi
    
    if grep -q "${project_name}\*" ~/.claude/settings.local.json 2>/dev/null; then
      hook="Has Hook"
    else
      hook="No Hook"
    fi
    
    echo "$project_name|$status|$claude_md|$hook"
  done)
else
  echo "All projects have completed documentation cleanup! 🎉"
fi

echo ""
echo "---"
echo "*Run this script anytime with: \`bash $0\`*"