# Screen Capture Tool

## Overview

This tool captures responsive breakpoints from the Baylor MyBSWHealth website for Flutter UI development. It uses Playwright to automate browser interactions and intelligently detect CSS breakpoints for comprehensive screen captures.

## Features

- **Smart Breakpoint Detection**: Automatically detects CSS media queries for width and height
- **Interactive Browser**: Launch browser with injected capture controls
- **Visual Breakpoint Selection**: Web UI for reviewing and selecting captured breakpoints
- **Three-State Workflow**: Capture → Select → Build (tracked with JSON markers)
- **Export for Flutter**: Generates JSON files ready for Flutter responsive screen generation

## Prerequisites

1. **Node.js** (v16 or higher)
2. **Playwright** installed with Chromium browser
3. **Environment Variables** configured (see Setup section)

## Setup

### 1. Install Dependencies

```bash
npm install
```

If you get errors about missing browsers:

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

**Optional: Use .env file** (not recommended for security - never commit!)
```bash
cp .env.example .env
# Edit .env with your credentials
```

### 3. Verify Setup

The script validates credentials on startup. If missing, you'll see:
```
❌ Error: Missing credentials!
   Please set environment variables:
   - MYBSWHEALTH_USERNAME
   - MYBSWHEALTH_PASSWORD
```

## Usage

### Starting the Server

**macOS/Linux:**
```bash
./capture-screen
```

**Windows (Command Prompt):**
```cmd
capture-screen.bat
```

**Windows (PowerShell):**
```powershell
.\capture-screen.ps1
```

The helper scripts:
- Work from any directory
- Navigate to the correct folder automatically
- Load credentials from .env if present
- Return you to your original directory when done

### Capture Workflow

The tool implements a **three-state workflow**:

#### State 1: CAPTURED (Initial State)

- Browser launches to https://my.bswhealth.com
- Login credentials are pre-filled (click login button)
- Navigate to the page you want to capture
- Click "📸 Capture Smart Breakpoints" button
- Tool detects CSS breakpoints and captures screenshots
- Saves to `./captures/{page-name}/`
- Creates `breakpoints.json` with capture metadata

**Indicators:**
- Folder exists in `./captures/`
- Contains `breakpoints.json` and screenshot PNG files
- No files in `./captures/ready/`

#### State 2: BREAKPOINTS SELECTED

- Open web interface at http://localhost:3030
- Click "View Breakpoints" for any capture
- Review all captured breakpoints
- Deselect unnecessary breakpoints
- Click "Export Selected Breakpoints"
- Creates `./captures/ready/{page-name}.json`

**Indicators:**
- File exists: `./captures/ready/{page-name}.json`
- No file: `./captures/ready/{page-name}.json.done`
- Web UI shows "✓ Breakpoints selected"

#### State 3: SCREEN BUILT

- External Flutter screen generation tool processes the JSON
- Generates responsive Flutter widget code
- Creates marker file: `./captures/ready/{page-name}.json.done`

**Indicators:**
- File exists: `./captures/ready/{page-name}.json.done`
- Web UI shows "✓ Screen built"

### Web Interface

Access the web interface at: **http://localhost:3030**

**Features:**
- View all captures with status indicators
- Launch new capture sessions
- Review and select breakpoints
- Rename captures (click on name to edit)
- Track workflow state (Captured → Selected → Built)

## Output

### Directory Structure

```
captures/
├── {page-name}/
│   ├── breakpoints.json          # Capture metadata
│   ├── width-375px.png           # Width breakpoint captures
│   ├── width-768px.png
│   ├── width-1024px.png
│   ├── height-667px.png          # Height breakpoint captures
│   └── height-1080px.png
└── ready/
    ├── {page-name}.json          # Selected breakpoints (State 2)
    └── {page-name}.json.done     # Build complete marker (State 3)
```

### Breakpoint Detection Logic

The tool extracts breakpoints from CSS:

1. **Scans all stylesheets** for media queries
2. **Extracts min-width, max-width** values → width breakpoints
3. **Extracts min-height, max-height** values → height breakpoints
4. **Adds standard sizes** if few breakpoints found:
   - Widths: 375, 768, 1024, 1366, 1920
   - Heights: 667, 768, 900, 1080

**Capture Strategy:**
- **Width breakpoints**: Captured at maximum available height
- **Height breakpoints**: Captured at maximum available width
- **Viewport capped** by screen resolution to prevent errors

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

### Capture Buttons Not Appearing

- Wait a moment for page to fully load
- Check browser console for JavaScript errors
- Try refreshing the page after login

### Wrong Directory Error

```
Cannot find module './capture_server.js'
```
**Solution:** Use the helper scripts (capture-screen, capture-screen.bat, capture-screen.ps1)

### Port Already in Use

```
Error: listen EADDRINUSE: address already in use :::3030
```
**Solution:** 
- Kill existing server process
- Or set `CAPTURE_SERVER_PORT` to different port

## Advanced Usage

### Custom Port

```bash
export CAPTURE_SERVER_PORT=3040
./capture-screen
```

### Different MyBSWHealth URL

```bash
export MYBSWHEALTH_URL=https://test.bswhealth.com
./capture-screen
```

### Programmatic Access

The server exposes these API endpoints:

- `POST /api/start-capture` - Launch browser capture session
- `GET /api/captures` - List all captures with status
- `GET /api/capture-status` - Check if capture in progress
- `POST /api/export-breakpoints` - Export selected breakpoints
- `POST /api/rename-capture` - Rename a capture
- `POST /api/exit` - Shutdown server
- `GET /viewer/{folder}` - View/select breakpoints for capture

## Security Notes

⚠️ **NEVER commit credentials to git!**
- Always use environment variables
- If using .env file, add it to .gitignore (already included)
- Don't share captured files - they may contain authentication tokens
- Captured screens may contain sensitive patient data

## Files in This Directory

- `capture_server.js` - Main Express server with Playwright automation
- `capture-screen` - macOS/Linux helper script
- `capture-screen.bat` - Windows Command Prompt helper
- `capture-screen.ps1` - Windows PowerShell helper
- `package.json` - Node.js dependencies
- `.env.example` - Credential template (copy to .env)
- `.gitignore` - Excludes credentials and captures from git
- `README.md` - This file
- `FLUTTER_GENERATION.md` - Technical guide for Flutter code generation

## Related Documentation

See `FLUTTER_GENERATION.md` for details on:
- Interpreting selected breakpoints JSON format
- Building responsive Flutter screens from captures
- Code generation patterns and best practices

## Support

For questions or issues:
1. Check the console output for error messages
2. Verify environment variables are set correctly
3. Ensure Playwright and Chromium are installed
4. Review the web interface at http://localhost:3030
5. Check `./captures/` directory for output files
