#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Function to extract path from URL without query parameters
function extractPath(url) {
    try {
        const urlObj = new URL(url);
        return urlObj.pathname;
    } catch (e) {
        // If URL parsing fails, try basic string manipulation
        const pathMatch = url.match(/^https?:\/\/[^\/]+([^?#]*)/);
        return pathMatch ? pathMatch[1] : url;
    }
}

// Function to analyze a HAR file and extract endpoints
function analyzeHarFile(filePath) {
    console.log(`\nAnalyzing: ${path.basename(filePath)}`);
    console.log('='.repeat(50));
    
    const content = fs.readFileSync(filePath, 'utf8');
    const har = JSON.parse(content);
    
    const endpoints = new Set();
    const endpointCounts = {};
    
    // Extract entries from the HAR file
    const entries = har.log?.entries || [];
    
    entries.forEach(entry => {
        if (entry.request && entry.request.url) {
            const endpoint = extractPath(entry.request.url);
            endpoints.add(endpoint);
            
            // Count occurrences
            endpointCounts[endpoint] = (endpointCounts[endpoint] || 0) + 1;
        }
    });
    
    console.log(`Total requests: ${entries.length}`);
    console.log(`Distinct endpoints: ${endpoints.size}`);
    
    // Show top 10 most common endpoints
    const sortedEndpoints = Object.entries(endpointCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
    
    console.log('\nTop 10 most common endpoints:');
    sortedEndpoints.forEach(([endpoint, count]) => {
        console.log(`  ${count.toString().padStart(4)} - ${endpoint}`);
    });
    
    return { endpoints, endpointCounts };
}

// Main function
function main() {
    const file1 = '/Users/jeffk/Developement/provider-search/baylor-login.json';
    const file2 = '/Users/jeffk/Developement/provider-search/baylor-1.json';
    
    console.log('API Endpoint Analysis');
    console.log('='.repeat(50));
    
    // Analyze first file
    const result1 = analyzeHarFile(file1);
    
    // Analyze second file
    const result2 = analyzeHarFile(file2);
    
    // Combine and analyze
    console.log('\nCombined Analysis');
    console.log('='.repeat(50));
    
    const combinedEndpoints = new Set([...result1.endpoints, ...result2.endpoints]);
    const combinedCounts = {};
    
    // Merge counts from both files
    for (const [endpoint, count] of Object.entries(result1.endpointCounts)) {
        combinedCounts[endpoint] = count;
    }
    for (const [endpoint, count] of Object.entries(result2.endpointCounts)) {
        combinedCounts[endpoint] = (combinedCounts[endpoint] || 0) + count;
    }
    
    console.log(`Total distinct endpoints (combined): ${combinedEndpoints.size}`);
    console.log(`Endpoints only in ${path.basename(file1)}: ${[...result1.endpoints].filter(e => !result2.endpoints.has(e)).length}`);
    console.log(`Endpoints only in ${path.basename(file2)}: ${[...result2.endpoints].filter(e => !result1.endpoints.has(e)).length}`);
    console.log(`Endpoints in both files: ${[...result1.endpoints].filter(e => result2.endpoints.has(e)).length}`);
    
    // Show top 15 most common endpoints across both files
    const sortedCombined = Object.entries(combinedCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15);
    
    console.log('\nTop 15 most common endpoints (combined):');
    sortedCombined.forEach(([endpoint, count]) => {
        console.log(`  ${count.toString().padStart(4)} - ${endpoint}`);
    });
    
    // Show API-specific endpoints (those that look like API paths)
    const apiEndpoints = [...combinedEndpoints].filter(endpoint => 
        endpoint.includes('/api/') || 
        endpoint.includes('/v1/') || 
        endpoint.includes('/v2/') ||
        endpoint.includes('/services/') ||
        endpoint.includes('/ajax/')
    );
    
    console.log(`\nAPI-specific endpoints found: ${apiEndpoints.length}`);
    if (apiEndpoints.length > 0) {
        console.log('Sample API endpoints:');
        apiEndpoints.slice(0, 20).forEach(endpoint => {
            const count = combinedCounts[endpoint];
            console.log(`  ${count.toString().padStart(4)} - ${endpoint}`);
        });
    }
}

// Run the analysis
main();