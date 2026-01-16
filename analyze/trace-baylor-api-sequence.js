import { chromium } from 'playwright';
import fs from 'fs/promises';

const CREDENTIALS = {
    username: 'jkelling@hotmail.com',
    password: '1NeedAccess!'
};

async function traceBaylorAPISequence() {
    console.log('Starting Baylor API sequence trace...\n');
    
    const browser = await chromium.launch({ 
        headless: false,
        devtools: true 
    });
    
    const context = await browser.newContext({
        // Disable images to speed up loading
        // But keep everything else to see exact behavior
    });
    
    const page = await context.newPage();
    
    // Object to store all API details
    const apiTrace = {
        timestamp: new Date().toISOString(),
        steps: []
    };
    
    // Listen to all requests and responses
    page.on('request', request => {
        const url = request.url();
        // Track specific API endpoints we care about
        if (url.includes('/OAuth/Token') || 
            url.includes('/tm/appUpdate') || 
            url.includes('/logon/IsLoggedInPost2') ||
            url.includes('/communication-center') ||
            url.includes('/api/conversations/GetConversationList')) {
            
            console.log(`\n📤 REQUEST: ${request.method()} ${url}`);
            console.log('Headers:', request.headers());
            
            // Store in our trace
            const step = {
                type: 'request',
                method: request.method(),
                url: url,
                headers: request.headers(),
                timestamp: new Date().toISOString()
            };
            
            if (request.method() === 'POST') {
                step.postData = request.postData();
            }
            
            apiTrace.steps.push(step);
        }
    });
    
    page.on('response', response => {
        const url = response.url();
        // Track responses for our specific endpoints
        if (url.includes('/OAuth/Token') || 
            url.includes('/tm/appUpdate') || 
            url.includes('/logon/IsLoggedInPost2') ||
            url.includes('/communication-center') ||
            url.includes('/api/conversations/GetConversationList')) {
            
            console.log(`\n📥 RESPONSE: ${response.status()} ${url}`);
            console.log('Headers:', response.headers());
            
            // Store response details
            const step = {
                type: 'response',
                status: response.status(),
                url: url,
                headers: response.headers(),
                timestamp: new Date().toISOString()
            };
            
            apiTrace.steps.push(step);
        }
    });
    
    try {
        // Step 1: Navigate to login page
        console.log('\n=== STEP 1: Navigate to Baylor Login ===');
        await page.goto('https://sso.bswhealth.com/login', { 
            waitUntil: 'networkidle' 
        });
        
        // Step 2: Perform login
        console.log('\n=== STEP 2: Login ===');
        await page.fill('input[name="userNameOrEmail"]', CREDENTIALS.username);
        await page.fill('input[name="password"]', CREDENTIALS.password);
        await page.click('button[type="submit"]');
        
        // Wait for navigation after login
        await page.waitForNavigation({ waitUntil: 'networkidle' });
        console.log('Login successful, landed on:', page.url());
        
        // Get all cookies after login
        const cookiesAfterLogin = await context.cookies();
        console.log('\n=== Cookies After Login ===');
        cookiesAfterLogin.forEach(cookie => {
            console.log(`${cookie.name}: ${cookie.value.substring(0, 50)}...`);
        });
        apiTrace.cookiesAfterLogin = cookiesAfterLogin;
        
        // Step 3: Navigate to communication center
        console.log('\n=== STEP 3: Navigate to Communication Center ===');
        await page.goto('https://mychart.bswhealth.com/DT/app/communication-center', {
            waitUntil: 'networkidle'
        });
        
        // Get cookies after communication center
        const cookiesAfterCommCenter = await context.cookies();
        console.log('\n=== Cookies After Communication Center ===');
        cookiesAfterCommCenter.forEach(cookie => {
            console.log(`${cookie.name}: ${cookie.value.substring(0, 50)}...`);
        });
        apiTrace.cookiesAfterCommCenter = cookiesAfterCommCenter;
        
        // Step 4: Wait for GetConversationList to be called automatically
        console.log('\n=== STEP 4: Waiting for GetConversationList ===');
        console.log('The page should automatically call GetConversationList...');
        
        // Wait a bit to capture any automatic API calls
        await page.waitForTimeout(5000);
        
        // Try to find and extract PageNonce from the page
        const pageNonce = await page.evaluate(() => {
            // Check various possible locations
            if (window.PageNonce) return window.PageNonce;
            
            // Check meta tags
            const metaNonce = document.querySelector('meta[name="pagenonce"]');
            if (metaNonce) return metaNonce.content;
            
            // Check data attributes
            const dataElement = document.querySelector('[data-pagenonce]');
            if (dataElement) return dataElement.dataset.pagenonce;
            
            // Search in scripts
            const scripts = Array.from(document.scripts);
            for (const script of scripts) {
                const match = script.textContent.match(/PageNonce["']?\s*[:=]\s*["']([a-fA-F0-9]{32})["']/i);
                if (match) return match[1];
            }
            
            return null;
        });
        
        if (pageNonce) {
            console.log('\n🔑 Found PageNonce:', pageNonce);
            apiTrace.pageNonce = pageNonce;
        }
        
        // Get final cookies
        const finalCookies = await context.cookies();
        apiTrace.finalCookies = finalCookies;
        
        // Save the trace
        await fs.writeFile(
            'baylor-api-trace.json', 
            JSON.stringify(apiTrace, null, 2)
        );
        
        console.log('\n✅ API trace saved to baylor-api-trace.json');
        
        // Keep browser open for manual inspection
        console.log('\n⏸️  Browser will stay open for 30 seconds for inspection...');
        await page.waitForTimeout(30000);
        
    } catch (error) {
        console.error('Error during trace:', error);
        apiTrace.error = error.message;
        await fs.writeFile(
            'baylor-api-trace-error.json', 
            JSON.stringify(apiTrace, null, 2)
        );
    } finally {
        await browser.close();
    }
}

// Run the trace
traceBaylorAPISequence().catch(console.error);