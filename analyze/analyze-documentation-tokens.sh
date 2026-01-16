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
        
        echo "- $rel_path: $tokens tokens"
        
    done < <(find "$project_dir" -name "*.md" -type f | sort)
    
    echo ""
    echo "Total files: $file_count"
    echo "Total tokens: $total_tokens"
    echo "---"
    echo ""
    
    return $total_tokens
}

# Main analysis
echo "# Provider Search Documentation Token Analysis"
echo "Generated: $(date)"
echo ""

# Analyze main project
find_project_markdown "/Users/jeffk/Developement/provider-search" "provider-search (main)"
main_tokens=$?

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
    find_project_markdown "/Users/jeffk/Developement/provider-search/$project" "$project"
    project_tokens=$?
    grand_total=$((grand_total + project_tokens))
done

# Also handle nested sub-project
find_project_markdown "/Users/jeffk/Developement/provider-search/test-apps/azure/provider-search-web-static" "provider-search-web-static"
nested_tokens=$?
grand_total=$((grand_total + nested_tokens))

echo "# Summary"
echo ""
echo "Main project tokens: $main_tokens"
echo "All sub-projects tokens: $grand_total"
echo "Grand total if all projects were loaded: $((main_tokens + grand_total))"