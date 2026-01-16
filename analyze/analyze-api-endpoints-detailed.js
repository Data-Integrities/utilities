#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Function to extract path from URL without query parameters
function extractPath(url) {
    try {
        const urlObj = new URL(url);
        return urlObj.pathname;
    } catch (e) {
        const pathMatch = url.match(/^https?:\/\/[^\/]+([^?#]*)/);
        return pathMatch ? pathMatch[1] : url;
    }
}

// Function to categorize endpoints
function categorizeEndpoint(endpoint) {
    if (endpoint.includes('/api/')) return 'API';
    if (endpoint.match(/\/v\d+\//)) return 'Versioned API';
    if (endpoint.includes('/services/')) return 'Services';
    if (endpoint.includes('/ajax/')) return 'AJAX';
    if (endpoint.includes('/DT/')) return 'DT System';
    if (endpoint.includes('/epic/') || endpoint.includes('/Epic/')) return 'Epic Integration';
    if (endpoint.includes('/ehr/')) return 'EHR';
    if (endpoint.includes('.js') || endpoint.includes('.css')) return 'Static Assets';
    if (endpoint.includes('.png') || endpoint.includes('.jpg') || endpoint.includes('.gif')) return 'Images';
    return 'Other';
}

// Function to analyze a HAR file
function analyzeHarFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const har = JSON.parse(content);
    
    const endpoints = new Map(); // endpoint -> { count, methods }
    
    const entries = har.log?.entries || [];
    
    entries.forEach(entry => {
        if (entry.request && entry.request.url) {
            const endpoint = extractPath(entry.request.url);
            const method = entry.request.method;
            
            if (!endpoints.has(endpoint)) {
                endpoints.set(endpoint, { count: 0, methods: new Set() });
            }
            
            const data = endpoints.get(endpoint);
            data.count++;
            data.methods.add(method);
        }
    });
    
    return { entries: entries.length, endpoints };
}

// Main function
function main() {
    const file1 = '/Users/jeffk/Developement/provider-search/baylor-login.json';
    const file2 = '/Users/jeffk/Developement/provider-search/baylor-1.json';
    
    console.log('Detailed API Endpoint Analysis');
    console.log('='.repeat(80));
    
    // Analyze files
    const result1 = analyzeHarFile(file1);
    const result2 = analyzeHarFile(file2);
    
    // Combine results
    const combined = new Map();
    
    // Add from file1
    for (const [endpoint, data] of result1.endpoints) {
        combined.set(endpoint, {
            count: data.count,
            methods: new Set(data.methods),
            files: ['baylor-login.json']
        });
    }
    
    // Add from file2
    for (const [endpoint, data] of result2.endpoints) {
        if (combined.has(endpoint)) {
            const existing = combined.get(endpoint);
            existing.count += data.count;
            data.methods.forEach(m => existing.methods.add(m));
            existing.files.push('baylor-1.json');
        } else {
            combined.set(endpoint, {
                count: data.count,
                methods: new Set(data.methods),
                files: ['baylor-1.json']
            });
        }
    }
    
    // Summary
    console.log('\nSUMMARY:');
    console.log(`├─ baylor-login.json: ${result1.endpoints.size} distinct endpoints (${result1.entries} requests)`);
    console.log(`├─ baylor-1.json: ${result2.endpoints.size} distinct endpoints (${result2.entries} requests)`);
    console.log(`└─ Combined: ${combined.size} distinct endpoints\n`);
    
    // Categorize endpoints
    const categories = {};
    for (const [endpoint, data] of combined) {
        const category = categorizeEndpoint(endpoint);
        if (!categories[category]) {
            categories[category] = [];
        }
        categories[category].push({ endpoint, ...data });
    }
    
    // Show endpoints by category
    console.log('ENDPOINTS BY CATEGORY:');
    console.log('='.repeat(80));
    
    const importantCategories = ['API', 'Versioned API', 'Epic Integration', 'EHR', 'Services', 'DT System'];
    
    for (const category of importantCategories) {
        if (categories[category] && categories[category].length > 0) {
            console.log(`\n${category} (${categories[category].length} endpoints):`);
            console.log('-'.repeat(80));
            
            // Sort by count descending
            categories[category].sort((a, b) => b.count - a.count);
            
            categories[category].forEach(({ endpoint, count, methods, files }) => {
                const methodStr = Array.from(methods).sort().join(', ');
                const fileStr = files.length === 2 ? 'both files' : files[0];
                console.log(`  ${count.toString().padStart(4)}x │ ${methodStr.padEnd(20)} │ ${endpoint}`);
                if (count > 10) {
                    console.log(`       │ ${' '.repeat(20)} └─ Found in: ${fileStr}`);
                }
            });
        }
    }
    
    // Show most frequently called endpoints
    console.log('\n\nTOP 20 MOST FREQUENTLY CALLED ENDPOINTS:');
    console.log('='.repeat(80));
    
    const sortedEndpoints = Array.from(combined.entries())
        .map(([endpoint, data]) => ({ endpoint, ...data }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20);
    
    sortedEndpoints.forEach(({ endpoint, count, methods, files }) => {
        const methodStr = Array.from(methods).sort().join(', ');
        const category = categorizeEndpoint(endpoint);
        console.log(`  ${count.toString().padStart(4)}x │ ${methodStr.padEnd(20)} │ ${endpoint} [${category}]`);
    });
    
    // Export to JSON for further analysis
    const exportData = {
        summary: {
            'baylor-login.json': {
                distinctEndpoints: result1.endpoints.size,
                totalRequests: result1.entries
            },
            'baylor-1.json': {
                distinctEndpoints: result2.endpoints.size,
                totalRequests: result2.entries
            },
            combined: {
                distinctEndpoints: combined.size,
                totalRequests: result1.entries + result2.entries
            }
        },
        endpoints: Array.from(combined.entries()).map(([endpoint, data]) => ({
            endpoint,
            count: data.count,
            methods: Array.from(data.methods),
            category: categorizeEndpoint(endpoint),
            files: data.files
        })).sort((a, b) => b.count - a.count)
    };
    
    fs.writeFileSync(
        '/Users/jeffk/Developement/provider-search/api-endpoints-analysis.json',
        JSON.stringify(exportData, null, 2)
    );
    
    console.log('\n\nDetailed analysis exported to: api-endpoints-analysis.json');
}

// Run the analysis
main();