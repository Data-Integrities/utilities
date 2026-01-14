# Network Capture Tool

## Overview

This tool captures network traffic from the Baylor MyBSWHealth website for analysis and debugging. It uses Playwright to automate browser interactions and Chrome DevTools Protocol to capture detailed request/response data.

## Features

- **Comprehensive Network Capture**: Captures all HTTP requests and responses
- **Cookie Tracking**: Records request and response cookies
- **POST Data**: Captures POST request bodies
- **Response Bodies**: Saves response bodies for analysis
- **Smart Exit**: Automatically stops when target endpoint is reached
- **Filtered Output**: Excludes analytics and media files

## Prerequisites

1. **Node.js** (v16 or higher)
2. **Playwright** installed with Chromium browser
3. **Environment Variables** configured (see Setup section)

## Setup

### 1. Install Dependencies

```bash
npm install playwright
```

If you get errors about missing browsers, install Chromium:

```bash
npx playwright install chromium
```

### 2. Configure Credentials

Set your MyBSWHealth login credentials as environment variables:

**macOS/Linux:**
```bash
export MYBSWHEALTH_USERNAME="your-email@example.com"
export MYBSWHEALTH_PASSWORD="your-password"
```

**Windows (Command Prompt):**
```cmd
set MYBSWHEALTH_USERNAME=your-email@example.com
set MYBSWHEALTH_PASSWORD=your-password
```

**Windows (PowerShell):**
```powershell
$env:MYBSWHEALTH_USERNAME="your-email@example.com"
$env:MYBSWHEALTH_PASSWORD="your-password"
```

**Optional: Use .env file** (not recommended for security - never commit this file!)
```bash
# Create .env file (add to .gitignore!)
echo "MYBSWHEALTH_USERNAME=your-email@example.com" > .env
echo "MYBSWHEALTH_PASSWORD=your-password" >> .env
```

### 3. Verify Setup

The script will validate credentials on startup. If credentials are missing, you'll see:
```
❌ Error: Missing credentials!
   Please set environment variables:
   - MYBSWHEALTH_USERNAME
   - MYBSWHEALTH_PASSWORD
```

## Usage

### Basic Usage

Run the script with a URL pattern to stop at:

```bash
node capture-endpoint.js "GetDetails"
```

This will:
1. Open https://my.bswhealth.com
2. Pre-fill your login credentials (you'll need to click the login button)
3. Capture all network traffic
4. Stop and save when it sees a response containing "GetDetails"

### Using Helper Scripts

For convenience, use the platform-specific helper scripts:

**macOS/Linux:**
```bash
./capture-network "GetDetails"
```

**Windows (Command Prompt):**
```cmd
capture-network.bat "GetDetails"
```

**Windows (PowerShell):**
```powershell
.\capture-network.ps1 "GetDetails"
```

The helper scripts:
- Work from any directory
- Navigate to the correct folder automatically
- Return you to your original directory when done

### Common URL Patterns

- `"GetDetails"` - Test result details
- `"LoadListData"` - List data endpoints
- `"dashboard"` - Dashboard data
- `"/DT/Clinical/Allergies"` - Allergies endpoint
- `"GetDashboardData"` - Dashboard API call

## Output

Captured data is saved to the `./captures/` directory:

### Files Created

1. **Main Capture** - `cn-{pattern}-{timestamp}.json`
   - Complete capture with all exchanges
   - Request and response details
   - Timing information

2. **All Exchanges** - `cn-{pattern}-{timestamp}-all.json`
   - All network exchanges (including ignored ones)
   - Full details for debugging

3. **Cookies** - `cn-{pattern}-{timestamp}-cookies.json`
   - Cookie flow analysis
   - Set-Cookie headers
   - Cookie blocking information

4. **Response Bodies** - `./captures/bodies/`
   - Individual response bodies
   - Named by URL or content-type
   - JSON, HTML, JS, CSS files

### Example Output Structure

```
captures/
├── cn-GetDetails-1234567890.json          # Main capture
├── cn-GetDetails-1234567890-all.json      # All exchanges
├── cn-GetDetails-1234567890-cookies.json  # Cookie analysis
└── bodies/
    ├── GetDetails.json                     # API response
    ├── profile.json                        # User profile
    └── index.js                            # JavaScript files
```

## What Gets Captured

### ✅ Captured
- API requests and responses
- Cookies (request and response)
- POST request bodies
- Response bodies (JSON, HTML, JS, CSS)
- Request and response headers
- Timing information
- Redirect chains

### ❌ Filtered Out
- Analytics requests (Google Analytics, etc.)
- Media files (images, videos)
- Font files
- Common CDN resources
- Third-party tracking scripts

## Workflow

1. **Start the script** with your target URL pattern
2. **Browser opens** automatically to https://my.bswhealth.com
3. **Login pre-filled** - Click the login button when ready
4. **Navigate** to the section you want to capture
5. **Script auto-exits** when it sees your target URL pattern
6. **Data saved** to `./captures/` directory

## Troubleshooting

### Missing Credentials Error
```
❌ Error: Missing credentials!
```
**Solution:** Set `MYBSWHEALTH_USERNAME` and `MYBSWHEALTH_PASSWORD` environment variables

### Browser Not Found
```
Error: Executable doesn't exist at ...
```
**Solution:** Install Chromium: `npx playwright install chromium`

### Script Doesn't Exit
- The URL pattern might not be matching
- Try a more specific or less specific pattern
- Check the console output to see what URLs are being captured

### Wrong Directory
```
Cannot find module './exchange-lib.js'
```
**Solution:** Make sure you're running from the correct directory or use the helper scripts

## Advanced Usage

### Capture Multiple Patterns
Run the script multiple times with different patterns to capture different endpoints.

### Analyze Captures
Use the captured JSON files to:
- Debug authentication issues
- Analyze cookie flow
- Understand API request/response structure
- Identify missing headers or cookies

### Custom Exit Patterns
You can use any string that appears in the URL:
- Full URLs: `"https://my.bswhealth.com/DT/Clinical/Allergies"`
- Partial paths: `"/DT/Clinical/"`
- Query parameters: `"?pageSize=20"`
- API endpoints: `"GetDashboardData"`

## Security Notes

⚠️ **NEVER commit credentials to git!**
- Always use environment variables
- If using .env file, add it to .gitignore
- Don't share captured files that contain authentication tokens
- Captured files may contain sensitive patient data

## Files in This Directory

- `capture-endpoint.js` - Main capture script
- `exchange-lib.js` - Network exchange library
- `README.md` - This file
- `capture-network` - macOS/Linux helper script
- `capture-network.bat` - Windows Command Prompt helper
- `capture-network.ps1` - Windows PowerShell helper
- `.env.example` - Template for credentials (optional)
- `.gitignore` - Excludes credentials and captures from git

## Support

For questions or issues:
1. Check the console output for error messages
2. Verify environment variables are set correctly
3. Ensure Playwright and Chromium are installed
4. Review the captured data in `./captures/` directory
