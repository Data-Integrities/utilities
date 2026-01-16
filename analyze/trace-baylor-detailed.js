import { chromium } from 'playwright';
import fs from 'fs/promises';

const CREDENTIALS = {
    username: 'jkelling@hotmail.com',
    password: '1NeedAccess!'
};

async function traceBaylorAPISequence() {
    console.log('Starting detailed Baylor API sequence trace...\n');
    
    const browser = await chromium.launch({ 
        headless: false,
        devtools: true 
    });
    
    const context = await browser.newContext();
    const page = await context.newPage();
    
    // Detailed trace object
    const detailedTrace = {
        timestamp: new Date().toISOString(),
        apiCalls: {}
    };
    
    // Track API calls by endpoint
    const endpoints = {
        'IsLoggedInPost2': '/logon/IsLoggedInPost2',
        'OAuth': '/OAuth/Token',
        'appUpdate': '/tm/appUpdate',
        'communicationCenter': '/communication-center',
        'GetConversationList': '/api/conversations/GetConversationList'
    };
    
    // Intercept requests and responses
    await page.route('**/*', async (route, request) => {
        const url = request.url();
        
        // Check if this is one of our tracked endpoints
        let endpointName = null;
        for (const [name, path] of Object.entries(endpoints)) {
            if (url.includes(path)) {
                endpointName = name;
                break;
            }
        }
        
        if (endpointName) {
            console.log(`\n📤 ${endpointName} REQUEST`);
            console.log(`URL: ${url}`);
            console.log(`Method: ${request.method()}`);
            
            const headers = request.headers();
            console.log('Headers:');
            Object.entries(headers).forEach(([key, value]) => {
                if (key.toLowerCase() === 'cookie') {
                    console.log(`  ${key}:`);
                    // Parse and display cookies nicely
                    const cookies = value.split('; ');
                    cookies.forEach(cookie => {
                        const [name] = cookie.split('=');
                        console.log(`    - ${name}`);
                    });
                } else if (key.toLowerCase() !== 'user-agent') {
                    console.log(`  ${key}: ${value}`);
                }
            });
            
            // Store request details
            if (!detailedTrace.apiCalls[endpointName]) {
                detailedTrace.apiCalls[endpointName] = [];
            }
            
            const callDetails = {
                request: {
                    url: url,
                    method: request.method(),
                    headers: headers,
                    timestamp: new Date().toISOString()
                }
            };
            
            if (request.method() === 'POST') {
                const postData = request.postData();
                callDetails.request.body = postData;
                console.log('Body:', postData);
            }
            
            // Continue the request and capture response
            const response = await route.fetch();
            
            console.log(`\n📥 ${endpointName} RESPONSE`);
            console.log(`Status: ${response.status()}`);
            
            const responseHeaders = response.headers();
            console.log('Response Headers:');
            Object.entries(responseHeaders).forEach(([key, value]) => {
                if (key.toLowerCase() === 'set-cookie') {
                    console.log(`  ${key}: ${value}`);
                } else if (key.toLowerCase().includes('csp') || key.toLowerCase().includes('nonce')) {
                    console.log(`  ${key}: ${value}`);
                }
            });
            
            // Extract PageNonce from CSP if present
            const csp = responseHeaders['content-security-policy'] || 
                       responseHeaders['content-security-policy-report-only'];
            if (csp) {
                const nonceMatch = csp.match(/'nonce-([a-fA-F0-9]+)'/);
                if (nonceMatch) {
                    console.log(`  🔑 PageNonce found: ${nonceMatch[1]}`);
                    callDetails.pageNonce = nonceMatch[1];
                }
            }
            
            callDetails.response = {
                status: response.status(),
                headers: responseHeaders,
                timestamp: new Date().toISOString()
            };
            
            // For certain endpoints, capture the response body
            if (endpointName === 'OAuth' || endpointName === 'GetConversationList') {
                try {
                    const body = await response.text();
                    if (body && body.length < 10000) { // Don't store huge responses
                        callDetails.response.body = body;
                    }
                } catch (e) {
                    // Ignore body read errors
                }
            }
            
            detailedTrace.apiCalls[endpointName].push(callDetails);
            
            // Complete the route
            await route.fulfill({ response });
        } else {
            // Continue all other requests normally
            await route.continue();
        }
    });
    
    try {
        // Step 1: Navigate to login
        console.log('\n=== STEP 1: Navigate to Login ===');
        await page.goto('https://sso.bswhealth.com/login');
        await page.waitForLoadState('networkidle');
        
        // Capture initial cookies
        detailedTrace.initialCookies = await context.cookies();
        console.log(`Initial cookies: ${detailedTrace.initialCookies.length}`);
        
        // Step 2: Login
        console.log('\n=== STEP 2: Perform Login ===');
        await page.fill('input[name="userNameOrEmail"]', CREDENTIALS.username);
        await page.fill('input[name="password"]', CREDENTIALS.password);
        
        // Click login and wait for navigation
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle' }),
            page.click('button[type="submit"]')
        ]);
        
        console.log('Logged in, current URL:', page.url());
        
        // Capture cookies after login
        detailedTrace.cookiesAfterLogin = await context.cookies();
        console.log(`Cookies after login: ${detailedTrace.cookiesAfterLogin.length}`);
        
        // Step 3: Navigate to communication center
        console.log('\n=== STEP 3: Navigate to Communication Center ===');
        await page.goto('https://mychart.bswhealth.com/DT/app/communication-center');
        await page.waitForLoadState('networkidle');
        
        // Capture cookies after communication center
        detailedTrace.cookiesAfterCommCenter = await context.cookies();
        console.log(`Cookies after comm center: ${detailedTrace.cookiesAfterCommCenter.length}`);
        
        // Extract PageNonce from the page
        const pageNonce = await page.evaluate(() => {
            // Try multiple methods to find PageNonce
            if (window.PageNonce) return { source: 'window.PageNonce', value: window.PageNonce };
            
            // Check in page content
            const pageContent = document.documentElement.innerHTML;
            const matches = [
                { regex: /PageNonce["']?\s*[:=]\s*["']([a-fA-F0-9]{32})["']/i, source: 'inline script' },
                { regex: /data-pagenonce=["']([a-fA-F0-9]{32})["']/i, source: 'data attribute' },
                { regex: /"PageNonce":\s*"([a-fA-F0-9]{32})"/i, source: 'JSON' }
            ];
            
            for (const { regex, source } of matches) {
                const match = pageContent.match(regex);
                if (match) return { source, value: match[1] };
            }
            
            return null;
        });
        
        if (pageNonce) {
            console.log(`\n🔑 PageNonce found via ${pageNonce.source}: ${pageNonce.value}`);
            detailedTrace.pageNonce = pageNonce;
        }
        
        // Wait for any automatic API calls
        console.log('\n=== Waiting for automatic API calls ===');
        await page.waitForTimeout(5000);
        
        // Save the detailed trace
        await fs.writeFile(
            'baylor-api-detailed-trace.json',
            JSON.stringify(detailedTrace, null, 2)
        );
        
        console.log('\n✅ Detailed trace saved to baylor-api-detailed-trace.json');
        
        // Generate a summary
        const summary = {
            endpoints: {}
        };
        
        for (const [endpoint, calls] of Object.entries(detailedTrace.apiCalls)) {
            if (calls.length > 0) {
                const lastCall = calls[calls.length - 1];
                summary.endpoints[endpoint] = {
                    url: lastCall.request.url,
                    method: lastCall.request.method,
                    requiredCookies: lastCall.request.headers.cookie ? 
                        lastCall.request.headers.cookie.split('; ').map(c => c.split('=')[0]) : [],
                    requiredHeaders: Object.keys(lastCall.request.headers).filter(h => 
                        !['cookie', 'user-agent', 'accept-encoding'].includes(h.toLowerCase())
                    ),
                    responseStatus: lastCall.response.status,
                    setCookies: lastCall.response.headers['set-cookie'] || null,
                    pageNonce: lastCall.pageNonce || null
                };
            }
        }
        
        await fs.writeFile(
            'baylor-api-summary.json',
            JSON.stringify(summary, null, 2)
        );
        
        console.log('✅ Summary saved to baylor-api-summary.json');
        
        // Keep browser open briefly
        console.log('\n⏸️  Keeping browser open for 15 seconds...');
        await page.waitForTimeout(15000);
        
    } catch (error) {
        console.error('Error:', error);
        detailedTrace.error = {
            message: error.message,
            stack: error.stack
        };
        
        await fs.writeFile(
            'baylor-api-trace-error.json',
            JSON.stringify(detailedTrace, null, 2)
        );
    } finally {
        await browser.close();
    }
}

// Run the trace
traceBaylorAPISequence().catch(console.error);