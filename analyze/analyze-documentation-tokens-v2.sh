#!/bin/bash

# Function to calculate token estimate from file
calculate_tokens() {
    local file="$1"
    if [ -f "$file" ]; then
        # Count characters and divide by 4 for token estimate
        chars=$(wc -m < "$file" 2>/dev/null || echo 0)
        tokens=$((chars / 4))
        echo $tokens
    else
        echo 0
    fi
}

# Function to find markdown files for a project
find_project_markdown() {
    local project_dir="$1"
    local project_name="$2"
    
    echo "## Project: $project_name"
    echo "Path: $project_dir"
    echo ""
    
    total_tokens=0
    file_count=0
    
    # Create temporary file for storing results
    tmpfile=$(mktemp)
    
    # Find all .md files in this project, excluding node_modules, .gems, and sub-projects
    while IFS= read -r file; do
        # Get relative path from project root
        rel_path="${file#$project_dir/}"
        
        # Skip if this file is in a sub-project (has .git in the path after project root)
        if [[ "$rel_path" =~ \.git/ ]]; then
            continue
        fi
        
        # Skip if in node_modules or .gems
        if [[ "$rel_path" =~ node_modules/ ]] || [[ "$rel_path" =~ \.gems/ ]]; then
            continue
        fi
        
        # Check if there's a .git directory between project root and file
        # This would mean the file is in a sub-project
        file_dir=$(dirname "$file")
        skip=false
        while [ "$file_dir" != "$project_dir" ] && [ "$file_dir" != "/" ]; do
            if [ -d "$file_dir/.git" ]; then
                skip=true
                break
            fi
            file_dir=$(dirname "$file_dir")
        done
        
        if [ "$skip" = true ]; then
            continue
        fi
        
        # Calculate tokens for this file
        tokens=$(calculate_tokens "$file")
        total_tokens=$((total_tokens + tokens))
        file_count=$((file_count + 1))
        
        echo "$tokens|$rel_path" >> "$tmpfile"
        
    done < <(find "$project_dir" -name "*.md" -type f | sort)
    
    # Sort by token count (descending) and display
    sort -t'|' -k1 -nr "$tmpfile" | while IFS='|' read tokens rel_path; do
        echo "- $rel_path: $tokens tokens"
    done
    
    rm -f "$tmpfile"
    
    echo ""
    echo "Total files: $file_count"
    echo "Total tokens: $total_tokens"
    echo "---"
    echo ""
    
    # Store total in global variable
    eval "${project_name//[^a-zA-Z0-9_]/_}_tokens=$total_tokens"
}

# Main analysis
echo "# Provider Search Documentation Token Analysis"
echo "Generated: $(date)"
echo ""

# Analyze main project
find_project_markdown "/Users/jeffk/Developement/provider-search" "provider_search_main"

# Analyze each sub-project
sub_projects=(
    "api-scanner"
    "backend-ai"
    "certificates"
    "claude"
    "claudia"
    "provider-search-flutter"
    "provider-search-mongo"
    "test-apps"
    "www"
)

grand_total=0
for project in "${sub_projects[@]}"; do
    find_project_markdown "/Users/jeffk/Developement/provider-search/$project" "${project//[^a-zA-Z0-9_]/_}"
    eval "tokens=\$${project//[^a-zA-Z0-9_]/_}_tokens"
    grand_total=$((grand_total + tokens))
done

# Also handle nested sub-project
find_project_markdown "/Users/jeffk/Developement/provider-search/test-apps/azure/provider-search-web-static" "provider_search_web_static"
grand_total=$((grand_total + provider_search_web_static_tokens))

echo "# Summary"
echo ""
echo "## Token Counts by Project:"
echo "- Main project (provider-search): $provider_search_main_tokens tokens"
echo "- api-scanner: $api_scanner_tokens tokens"
echo "- backend-ai: $backend_ai_tokens tokens"
echo "- certificates: $certificates_tokens tokens"
echo "- claude: $claude_tokens tokens"
echo "- claudia: $claudia_tokens tokens"
echo "- provider-search-flutter: $provider_search_flutter_tokens tokens"
echo "- provider-search-mongo: $provider_search_mongo_tokens tokens"
echo "- test-apps: $test_apps_tokens tokens"
echo "- www: $www_tokens tokens"
echo "- provider-search-web-static: $provider_search_web_static_tokens tokens"
echo ""
echo "## Totals:"
echo "- All sub-projects combined: $grand_total tokens"
echo "- Grand total if all projects were loaded: $((provider_search_main_tokens + grand_total)) tokens"
echo ""
echo "## Notes:"
echo "- Token estimates use 4 characters = 1 token"
echo "- Excludes node_modules and .gems directories"
echo "- Sub-projects (directories with .git) are analyzed separately"