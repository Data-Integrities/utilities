const express = require('express');
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.CAPTURE_SERVER_PORT || 3030;

// Validate required environment variables
if (!process.env.MYBSWHEALTH_USERNAME || !process.env.MYBSWHEALTH_PASSWORD) {
  console.error('\n❌ Error: Missing credentials!');
  console.error('   Please set environment variables:');
  console.error('   - MYBSWHEALTH_USERNAME');
  console.error('   - MYBSWHEALTH_PASSWORD\n');
  console.error('   See README.md for setup instructions.\n');
  process.exit(1);
}

const MYBSWHEALTH_URL = process.env.MYBSWHEALTH_URL || 'https://my.bswhealth.com';
const MYBSWHEALTH_USERNAME = process.env.MYBSWHEALTH_USERNAME;
const MYBSWHEALTH_PASSWORD = process.env.MYBSWHEALTH_PASSWORD;

// Serve static files
app.use(express.static('public'));
app.use(express.json());

// Store browser instance
let browserInstance = null;
let captureInProgress = false;

// Homepage route
app.get('/', (req, res) => {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Baylor UI Capture Tool</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 1200px;
      margin: 0 auto;
      padding: 40px 20px;
      background: #f5f5f5;
    }
    
    h1 {
      color: #333;
      margin-bottom: 40px;
    }
    
    .section {
      background: white;
      padding: 30px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      margin-bottom: 30px;
    }
    
    .capture-button {
      background: #28a745;
      color: white;
      border: none;
      padding: 15px 30px;
      font-size: 18px;
      border-radius: 5px;
      cursor: pointer;
      font-weight: 600;
    }
    
    .capture-button:hover {
      background: #218838;
    }
    
    .capture-button:disabled {
      background: #6c757d;
      cursor: not-allowed;
    }
    
    .captures-list {
      list-style: none;
      padding: 0;
    }
    
    .capture-item {
      padding: 15px;
      margin: 10px 0;
      background: #f8f9fa;
      border-radius: 5px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .capture-item:hover {
      background: #e9ecef;
    }
    
    .capture-name {
      font-weight: 500;
      color: #333;
    }
    
    .capture-date {
      color: #666;
      font-size: 14px;
    }
    
    .view-link {
      color: #007bff;
      text-decoration: none;
      padding: 5px 15px;
      border: 1px solid #007bff;
      border-radius: 3px;
    }
    
    .view-link:hover {
      background: #007bff;
      color: white;
    }
    
    .status {
      margin-top: 20px;
      padding: 15px;
      border-radius: 5px;
      display: none;
    }
    
    .status.info {
      background: #d1ecf1;
      color: #0c5460;
      border: 1px solid #bee5eb;
    }
    
    .status.success {
      background: #d4edda;
      color: #155724;
      border: 1px solid #c3e6cb;
    }
    
    .status.error {
      background: #f8d7da;
      color: #721c24;
      border: 1px solid #f5c6cb;
    }
  </style>
</head>
<body>
  <h1>Baylor UI Capture Tool</h1>
  
  <div class="section">
    <h2>Capture Control</h2>
    <button id="startCapture" class="capture-button" onclick="startCapture()">
      Start Capture
    </button>
    <button id="exitServer" class="capture-button" style="background: #dc3545; margin-left: 20px;" onclick="exitServer()">
      Exit Server
    </button>
    <div id="status" class="status"></div>
  </div>
  
  <div class="section">
    <h2>Available Captures</h2>
    <ul id="capturesList" class="captures-list">
      <li>Loading captures...</li>
    </ul>
  </div>
  
  <script>
    function showStatus(message, type = 'info') {
      const status = document.getElementById('status');
      status.className = 'status ' + type;
      status.textContent = message;
      status.style.display = 'block';
    }
    
    async function startCapture() {
      const button = document.getElementById('startCapture');
      button.disabled = true;
      button.textContent = 'Starting...';
      
      try {
        showStatus('Starting Playwright browser...', 'info');
        const response = await fetch('/api/start-capture', { method: 'POST' });
        const data = await response.json();
        
        if (data.success) {
          showStatus('Browser launched! Navigate to pages and use the capture buttons.', 'success');
          button.textContent = 'Capture in Progress';
        } else {
          showStatus('Failed to start capture: ' + data.error, 'error');
          button.disabled = false;
          button.textContent = 'Start Capture';
        }
      } catch (error) {
        showStatus('Error: ' + error.message, 'error');
        button.disabled = false;
        button.textContent = 'Start Capture';
      }
    }
    
    async function exitServer() {
      if (confirm('Are you sure you want to exit the server?')) {
        showStatus('Shutting down server...', 'info');
        try {
          await fetch('/api/exit', { method: 'POST' });
        } catch (error) {
          // Server is shutting down, so connection error is expected
        }
        setTimeout(() => {
          showStatus('Server has been shut down. You can close this window.', 'info');
        }, 1000);
      }
    }
    
    async function loadCaptures() {
      try {
        const response = await fetch('/api/captures');
        const captures = await response.json();
        
        const list = document.getElementById('capturesList');
        
        if (captures.length === 0) {
          list.innerHTML = '<li>No captures found</li>';
          return;
        }
        
        list.innerHTML = captures.map((capture, index) => \`
          <li class="capture-item">
            <div style="flex: 1;">
              <div class="capture-name" 
                   id="capture-name-\${index}" 
                   onclick="editCaptureName('\${capture.folder}', '\${capture.name.replace(/'/g, "\\\\'")}', \${index})"
                   style="cursor: pointer; padding: 2px;"
                   title="Click to rename">
                \${capture.name}
              </div>
              <div class="capture-date">\${capture.date}</div>
              <div style="margin-top: 8px; display: flex; gap: 20px;">
                <span style="display: flex; align-items: center; gap: 5px; font-size: 14px;">
                  \${capture.breakpointsSelected 
                    ? '<span style="color: #28a745;">✓</span> Breakpoints selected' 
                    : '<span style="color: #dc3545;">✗</span> Breakpoints not selected'}
                </span>
                <span style="display: flex; align-items: center; gap: 5px; font-size: 14px;">
                  \${capture.screenBuilt 
                    ? '<span style="color: #28a745;">✓</span> Screen built' 
                    : '<span style="color: #dc3545;">✗</span> Screen not built'}
                </span>
              </div>
            </div>
            <a href="/viewer/\${capture.folder}" target="_blank" class="view-link">
              View Breakpoints
            </a>
          </li>
        \`).join('');
      } catch (error) {
        console.error('Error loading captures:', error);
      }
    }
    
    // Variable to track if we're editing
    let isEditing = false;
    
    // Function to edit capture name
    window.editCaptureName = function(folder, currentName, index) {
      isEditing = true; // Stop refreshing while editing
      
      const nameDiv = document.getElementById(\`capture-name-\${index}\`);
      const input = document.createElement('input');
      input.type = 'text';
      input.value = currentName;
      input.style.cssText = 'font-size: inherit; font-weight: inherit; width: 100%; padding: 2px;';
      
      input.onblur = async function() {
        isEditing = false; // Resume refreshing
        const newName = input.value.trim();
        if (newName && newName !== currentName) {
          try {
            const response = await fetch('/api/rename-capture', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ folder, newName })
            });
            
            const result = await response.json();
            if (result.success) {
              loadCaptures();
            } else {
              alert('Failed to rename: ' + result.error);
              nameDiv.textContent = currentName;
            }
          } catch (error) {
            alert('Error renaming capture: ' + error.message);
            nameDiv.textContent = currentName;
          }
        } else {
          nameDiv.textContent = currentName;
        }
      };
      
      input.onkeydown = function(e) {
        if (e.key === 'Enter') {
          input.blur();
        } else if (e.key === 'Escape') {
          isEditing = false; // Resume refreshing
          nameDiv.textContent = currentName;
        }
      };
      
      nameDiv.textContent = '';
      nameDiv.appendChild(input);
      input.focus();
      input.select();
    };
    
    // Load captures on page load
    loadCaptures();
    
    // Refresh captures every 5 seconds (but not while editing)
    setInterval(() => {
      if (!isEditing) {
        loadCaptures();
      }
    }, 5000);
    
    // Check capture status
    setInterval(async () => {
      try {
        const response = await fetch('/api/capture-status');
        const data = await response.json();
        
        const button = document.getElementById('startCapture');
        if (!data.inProgress && button.disabled) {
          button.disabled = false;
          button.textContent = 'Start Capture';
          showStatus('Capture session ended', 'info');
          loadCaptures();
        }
      } catch (error) {
        console.error('Error checking status:', error);
      }
    }, 2000);
  </script>
</body>
</html>
  `;
  res.send(html);
});

// API endpoint to start capture
app.post('/api/start-capture', async (req, res) => {
  if (captureInProgress) {
    return res.json({ success: false, error: 'Capture already in progress' });
  }
  
  try {
    captureInProgress = true;
    
    // Launch browser
    browserInstance = await chromium.launch({ 
      headless: false,
      args: ['--start-maximized']
    });
    
    const context = await browserInstance.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    });
    
    const page = await context.newPage();
    
    // Function to inject buttons into the page
    async function injectButtons() {
      await page.evaluate(() => {
        // Remove any existing buttons
        const existingContainer = document.getElementById('claude-button-container');
        if (existingContainer) existingContainer.remove();
        
        
        // Function to extract CSS breakpoints (both width and height)
        function getCSSBreakpoints() {
          const widthBreakpoints = new Set();
          const heightBreakpoints = new Set();
          
          // Get all stylesheets
          for (const sheet of document.styleSheets) {
            try {
              const rules = sheet.cssRules || sheet.rules;
              if (!rules) continue;
              
              // Look for media queries
              for (const rule of rules) {
                if (rule.type === CSSRule.MEDIA_RULE) {
                  const mediaText = rule.media.mediaText;
                  
                  // Extract width values
                  const minWidthMatch = mediaText.match(/min-width:\s*(\d+)px/);
                  const maxWidthMatch = mediaText.match(/max-width:\s*(\d+)px/);
                  
                  if (minWidthMatch) {
                    widthBreakpoints.add(parseInt(minWidthMatch[1]));
                  }
                  if (maxWidthMatch) {
                    widthBreakpoints.add(parseInt(maxWidthMatch[1]));
                  }
                  
                  // Extract height values
                  const minHeightMatch = mediaText.match(/min-height:\s*(\d+)px/);
                  const maxHeightMatch = mediaText.match(/max-height:\s*(\d+)px/);
                  
                  if (minHeightMatch) {
                    heightBreakpoints.add(parseInt(minHeightMatch[1]));
                  }
                  if (maxHeightMatch) {
                    heightBreakpoints.add(parseInt(maxHeightMatch[1]));
                  }
                }
              }
            } catch (e) {
              // Skip cross-origin stylesheets
            }
          }
          
          // Convert to sorted arrays
          const widthArray = Array.from(widthBreakpoints).sort((a, b) => a - b);
          const heightArray = Array.from(heightBreakpoints).sort((a, b) => a - b);
          
          // Add some standard sizes if we didn't find many breakpoints
          const standardWidths = [375, 768, 1024, 1366, 1920];
          const standardHeights = [667, 768, 900, 1080];
          
          standardWidths.forEach(size => {
            if (!widthArray.includes(size)) {
              widthArray.push(size);
            }
          });
          
          standardHeights.forEach(size => {
            if (!heightArray.includes(size)) {
              heightArray.push(size);
            }
          });
          
          return {
            widths: widthArray.sort((a, b) => a - b),
            heights: heightArray.sort((a, b) => a - b)
          };
        }
        
        // Create button container
        const buttonContainer = document.createElement('div');
        buttonContainer.id = 'claude-button-container';
        buttonContainer.style.cssText = `
          position: fixed;
          top: 10px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 999999;
          display: flex;
          gap: 10px;
        `;
        
        // Create capture button
        const captureBtn = document.createElement('button');
        captureBtn.id = 'claude-capture-btn';
        captureBtn.textContent = '📸 Capture Smart Breakpoints';
        captureBtn.style.cssText = `
          padding: 10px 20px;
          background: #28a745;
          color: white;
          border: none;
          border-radius: 25px;
          font-weight: bold;
          cursor: pointer;
          box-shadow: 0 4px 6px rgba(0,0,0,0.2);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        `;
        
        // Create done button
        const doneBtn = document.createElement('button');
        doneBtn.id = 'claude-done-btn';
        doneBtn.textContent = '✅ Done';
        doneBtn.style.cssText = `
          padding: 10px 20px;
          background: #dc3545;
          color: white;
          border: none;
          border-radius: 25px;
          font-weight: bold;
          cursor: pointer;
          box-shadow: 0 4px 6px rgba(0,0,0,0.2);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        `;
        
        doneBtn.onclick = () => {
          window.__DONE_CAPTURING__ = true;
          doneBtn.textContent = '👋 Closing...';
          doneBtn.disabled = true;
        };
        
        captureBtn.onclick = () => {
          const breakpoints = getCSSBreakpoints();
          
          // Store breakpoints and current page info
          window.__CAPTURE_INFO__ = {
            widthBreakpoints: breakpoints.widths,
            heightBreakpoints: breakpoints.heights,
            currentWidth: window.innerWidth,
            currentHeight: window.innerHeight,
            screenWidth: window.screen.width,
            screenHeight: window.screen.height,
            title: document.title,
            url: window.location.href,
            ready: true
          };
          
          const totalCaptures = breakpoints.widths.length + breakpoints.heights.length;
          captureBtn.textContent = `📐 Found ${breakpoints.widths.length} widths + ${breakpoints.heights.length} heights = ${totalCaptures} captures`;
          captureBtn.style.background = '#17a2b8';
          
          setTimeout(() => {
            captureBtn.textContent = '⏳ Starting smart capture...';
            captureBtn.disabled = true;
          }, 2000);
        };
        
        buttonContainer.appendChild(captureBtn);
        buttonContainer.appendChild(doneBtn);
        
        // Add to body
        if (document.body) {
          document.body.appendChild(buttonContainer);
        }
        
        // Flag for tracking
        window.__DONE_CAPTURING__ = window.__DONE_CAPTURING__ || false;
      });
    }
    
    // Inject buttons after every navigation
    page.on('load', async () => {
      await injectButtons();
    });
    
    await page.goto(MYBSWHEALTH_URL);

    // Try to auto-fill login credentials using Playwright's fill method
    try {
      await page.waitForSelector('input#username', { timeout: 5000 });
      console.log('Found login form, auto-filling credentials...');
      await page.fill('input#username', MYBSWHEALTH_USERNAME);
      await page.fill('input#password', MYBSWHEALTH_PASSWORD);
      console.log('Credentials auto-filled successfully!');
    } catch (error) {
      console.log('Login form not found or already logged in');
    }
    
    // Also inject buttons after initial navigation in case 'load' event already fired
    await page.waitForTimeout(1000); // Give page a moment to fully render
    await injectButtons();
    console.log('Browser launched!');
    
    // Monitor for captures
    let captureCount = 0;
    const checkInterval = setInterval(async () => {
      try {
        const isDone = await page.evaluate(() => window.__DONE_CAPTURING__);
        if (isDone) {
          console.log('\n👋 Done capturing! Closing browser...');
          clearInterval(checkInterval);
          await browserInstance.close();
          browserInstance = null;
          captureInProgress = false;
          return;
        }
        
        const captureInfo = await page.evaluate(() => window.__CAPTURE_INFO__);
        
        if (captureInfo && captureInfo.ready) {
          captureCount++;
          // Convert page title to folder name (lowercase, spaces to dashes, remove special chars)
          const pageTitle = captureInfo.title
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
            .replace(/\s+/g, '-')          // Replace spaces with dashes
            .replace(/-+/g, '-')           // Replace multiple dashes with single dash
            .replace(/^-|-$/g, '');        // Remove leading/trailing dashes
          
          const pageName = pageTitle || `page-${captureCount}`; // Fallback if no title
          
          console.log(`\n📐 Detected breakpoints:`);
          console.log(`   Width breakpoints: ${captureInfo.widthBreakpoints.length}`);
          console.log(`   Height breakpoints: ${captureInfo.heightBreakpoints.length}`);
          console.log(`   Total captures: ${captureInfo.widthBreakpoints.length + captureInfo.heightBreakpoints.length}`);
          console.log(`📄 Page: ${captureInfo.title}`);
          console.log(`🔗 URL: ${captureInfo.url}\n`);
          
          const captureDir = path.join(__dirname, 'captures', pageName);
          if (!fs.existsSync(captureDir)) {
            fs.mkdirSync(captureDir, { recursive: true });
          }
          
          // Calculate max viewport dimensions (capped by screen size)
          const maxAvailableWidth = Math.min(
            Math.max(...captureInfo.widthBreakpoints, 1920),
            captureInfo.screenWidth || 1920
          );
          const maxAvailableHeight = Math.min(
            Math.max(...captureInfo.heightBreakpoints, 1080),
            captureInfo.screenHeight || 1080
          );
          
          console.log(`📏 Using max dimensions: ${maxAvailableWidth}×${maxAvailableHeight} (capped by screen)\n`);
          
          // Save breakpoint info
          const breakpointData = {
            url: captureInfo.url,
            title: captureInfo.title,
            widthBreakpoints: captureInfo.widthBreakpoints,
            heightBreakpoints: captureInfo.heightBreakpoints,
            maxWidth: maxAvailableWidth,
            maxHeight: maxAvailableHeight,
            timestamp: new Date().toISOString(),
            captures: []
          };
          
          // Clear the flag
          await page.evaluate(() => { window.__CAPTURE_INFO__.ready = false; });
          
          // Hide buttons during capture
          await page.evaluate(() => {
            const container = document.getElementById('claude-button-container');
            if (container) container.style.display = 'none';
          });
          
          // Capture width breakpoints at max height
          console.log(`📸 Capturing ${captureInfo.widthBreakpoints.length} width breakpoints at height=${maxAvailableHeight}px...`);
          for (const width of captureInfo.widthBreakpoints) {
            process.stdout.write(`   ${width}×${maxAvailableHeight}... `);
            
            await page.setViewportSize({ width: width, height: maxAvailableHeight });
            await page.waitForTimeout(500);
            
            const capturePath = path.join(captureDir, `width-${width}px.png`);
            await page.screenshot({ 
              path: capturePath, 
              fullPage: false
            });
            
            breakpointData.captures.push({
              type: 'width',
              width: width,
              height: maxAvailableHeight,
              filename: `width-${width}px.png`
            });
            
            process.stdout.write(`✓\n`);
          }
          
          // Capture height breakpoints at max width
          console.log(`\n📸 Capturing ${captureInfo.heightBreakpoints.length} height breakpoints at width=${maxAvailableWidth}px...`);
          for (const height of captureInfo.heightBreakpoints) {
            process.stdout.write(`   ${maxAvailableWidth}×${height}... `);
            
            await page.setViewportSize({ width: maxAvailableWidth, height: height });
            await page.waitForTimeout(500);
            
            const capturePath = path.join(captureDir, `height-${height}px.png`);
            await page.screenshot({ 
              path: capturePath, 
              fullPage: false
            });
            
            breakpointData.captures.push({
              type: 'height',
              width: maxAvailableWidth,
              height: height,
              filename: `height-${height}px.png`
            });
            
            process.stdout.write(`✓\n`);
          }
          
          // Save updated breakpoint data
          fs.writeFileSync(
            path.join(captureDir, 'breakpoints.json'), 
            JSON.stringify(breakpointData, null, 2)
          );
          
          // Restore original size
          await page.setViewportSize({ 
            width: captureInfo.currentWidth, 
            height: captureInfo.currentHeight 
          });
          
          // No need to generate static viewer anymore - using dynamic route
          
          // Show buttons again
          await page.evaluate(() => {
            const container = document.getElementById('claude-button-container');
            if (container) container.style.display = 'flex';
            const btn = document.getElementById('claude-capture-btn');
            if (btn) {
              btn.textContent = '📸 Capture Smart Breakpoints';
              btn.disabled = false;
            }
          });
          
          console.log(`\n✅ Captured all breakpoints smartly!`);
          console.log(`📁 Saved to: ${captureDir}`);
          console.log(`🌐 View breakpoints at: http://localhost:${PORT}/viewer/${pageName}\n`);
        }
      } catch (error) {
        console.error('Error during capture check:', error);
        if (error.message.includes('Execution context was destroyed')) {
          // Browser was closed
          clearInterval(checkInterval);
          browserInstance = null;
          captureInProgress = false;
        }
      }
    }, 1000);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error starting capture:', error);
    captureInProgress = false;
    res.json({ success: false, error: error.message });
  }
});

// API endpoint to get captures
app.get('/api/captures', (req, res) => {
  const capturesDir = path.join(__dirname, 'captures');
  const readyDir = path.join(capturesDir, 'ready');
  
  if (!fs.existsSync(capturesDir)) {
    return res.json([]);
  }
  
  const captures = [];
  const folders = fs.readdirSync(capturesDir);
  
  folders.forEach(folder => {
    if (folder === 'ready' || folder.startsWith('.')) return;
    
    const folderPath = path.join(capturesDir, folder);
    const stat = fs.statSync(folderPath);
    
    if (stat.isDirectory()) {
      const breakpointsFile = path.join(folderPath, 'breakpoints.json');
      if (fs.existsSync(breakpointsFile)) {
        try {
          const data = JSON.parse(fs.readFileSync(breakpointsFile, 'utf8'));
          
          // Check if breakpoints have been selected (JSON exists in ready folder)
          const readyJsonPath = path.join(readyDir, `${folder}.json`);
          const breakpointsSelected = fs.existsSync(readyJsonPath);
          
          // Check if screen has been built (JSON.done exists)
          const doneJsonPath = path.join(readyDir, `${folder}.json.done`);
          const screenBuilt = fs.existsSync(doneJsonPath);
          
          captures.push({
            folder: folder,
            name: data.title || folder,
            date: new Date(data.timestamp).toLocaleString(),
            timestamp: data.timestamp,
            breakpointsSelected: breakpointsSelected || screenBuilt,
            screenBuilt: screenBuilt
          });
        } catch (e) {
          captures.push({
            folder: folder,
            name: folder,
            date: stat.mtime.toLocaleString(),
            timestamp: stat.mtime.toISOString(),
            breakpointsSelected: false,
            screenBuilt: false
          });
        }
      }
    }
  });
  
  // Sort by timestamp, newest first
  captures.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  
  res.json(captures);
});

// API endpoint to check capture status
app.get('/api/capture-status', (req, res) => {
  res.json({ inProgress: captureInProgress });
});

// API endpoint to export selected breakpoints
app.post('/api/export-breakpoints', (req, res) => {
  try {
    const exportData = req.body;
    const folderName = exportData.folderName || 'export';
    
    // Create ready folder if it doesn't exist
    const readyDir = path.join(__dirname, 'captures', 'ready');
    if (!fs.existsSync(readyDir)) {
      fs.mkdirSync(readyDir, { recursive: true });
    }
    
    // Save with the same naming convention as folders
    const filename = `${folderName}.json`;
    const filepath = path.join(readyDir, filename);
    
    // Write the JSON file
    fs.writeFileSync(filepath, JSON.stringify(exportData, null, 2));
    
    console.log(`✅ Exported breakpoints to: ${filepath}`);
    res.json({ 
      success: true, 
      filename: filename,
      path: filepath
    });
  } catch (error) {
    console.error('Export error:', error);
    res.json({ 
      success: false, 
      error: error.message 
    });
  }
});

// API endpoint to rename capture
app.post('/api/rename-capture', (req, res) => {
  const { folder, newName } = req.body;
  
  if (!folder || !newName) {
    return res.json({ success: false, error: 'Missing folder or new name' });
  }
  
  try {
    const oldPath = path.join(__dirname, 'captures', folder);
    
    // Convert new name to folder format
    const newFolder = newName
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    
    const newPath = path.join(__dirname, 'captures', newFolder);
    
    // Check if source exists
    if (!fs.existsSync(oldPath)) {
      return res.json({ success: false, error: 'Capture folder not found' });
    }
    
    // Check if target already exists
    if (fs.existsSync(newPath) && oldPath !== newPath) {
      return res.json({ success: false, error: 'A capture with that name already exists' });
    }
    
    // Update breakpoints.json with new title
    const breakpointsFile = path.join(oldPath, 'breakpoints.json');
    if (fs.existsSync(breakpointsFile)) {
      const data = JSON.parse(fs.readFileSync(breakpointsFile, 'utf8'));
      data.title = newName;
      fs.writeFileSync(breakpointsFile, JSON.stringify(data, null, 2));
    }
    
    // Rename folder if needed
    if (oldPath !== newPath) {
      fs.renameSync(oldPath, newPath);
      
      // Also check if there's an export in ready folder to rename
      const oldReadyPath = path.join(__dirname, 'captures', 'ready', `${folder}.json`);
      const newReadyPath = path.join(__dirname, 'captures', 'ready', `${newFolder}.json`);
      
      if (fs.existsSync(oldReadyPath)) {
        fs.renameSync(oldReadyPath, newReadyPath);
      }
      
      // Check for .done file too
      const oldDonePath = `${oldReadyPath}.done`;
      const newDonePath = `${newReadyPath}.done`;
      
      if (fs.existsSync(oldDonePath)) {
        fs.renameSync(oldDonePath, newDonePath);
      }
    }
    
    console.log(`✏️ Renamed capture: "${folder}" → "${newFolder}"`);
    res.json({ success: true, newFolder });
  } catch (error) {
    console.error('Error renaming capture:', error);
    res.json({ success: false, error: error.message });
  }
});

// API endpoint to exit server
app.post('/api/exit', async (req, res) => {
  console.log('\n🛑 Exit requested via web interface...');
  
  // Send response before shutting down
  res.json({ success: true, message: 'Server shutting down' });
  
  // Clean up browser if running
  if (browserInstance) {
    try {
      await browserInstance.close();
    } catch (error) {
      console.error('Error closing browser:', error);
    }
  }
  
  // Give response time to send
  setTimeout(() => {
    console.log('👋 Goodbye!');
    process.exit(0);
  }, 500);
});

// Serve screenshot files
app.use('/screenshots', express.static(path.join(__dirname, 'captures')));

// Dynamic breakpoint viewer route
app.get('/viewer/:folder', (req, res) => {
  const folder = req.params.folder;
  const folderPath = path.join(__dirname, 'captures', folder);
  const breakpointsFile = path.join(folderPath, 'breakpoints.json');
  
  if (!fs.existsSync(breakpointsFile)) {
    return res.status(404).send('Breakpoints file not found');
  }
  
  try {
    const breakpointData = JSON.parse(fs.readFileSync(breakpointsFile, 'utf8'));
    
    // Check if there's an existing export in the ready folder
    const readyJsonPath = path.join(__dirname, 'captures', 'ready', `${folder}.json`);
    let previousSelection = null;
    if (fs.existsSync(readyJsonPath)) {
      try {
        const exportedData = JSON.parse(fs.readFileSync(readyJsonPath, 'utf8'));
        previousSelection = exportedData.selectedCaptures || [];
      } catch (e) {
        console.error('Error reading previous selection:', e);
      }
    }
    
    const viewerHTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Smart Breakpoint Viewer - ${breakpointData.title}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f5f5f5;
    }
    
    .header {
      background: white;
      padding: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      position: sticky;
      top: 0;
      z-index: 100;
    }
    
    .controls {
      display: flex;
      gap: 20px;
      align-items: center;
      margin-top: 15px;
    }
    
    .section {
      margin: 20px;
    }
    
    .section-title {
      font-size: 24px;
      font-weight: 600;
      margin-bottom: 20px;
      color: #333;
    }
    
    .breakpoint-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 20px;
      margin-bottom: 40px;
    }
    
    .breakpoint-card {
      background: white;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      transition: transform 0.2s, box-shadow 0.2s;
      cursor: pointer;
    }
    
    .breakpoint-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 16px rgba(0,0,0,0.15);
    }
    
    .breakpoint-card.selected {
      border: 3px solid #28a745;
    }
    
    .breakpoint-card.excluded {
      opacity: 0.5;
    }
    
    .breakpoint-image {
      width: 100%;
      height: 200px;
      object-fit: contain;
      background: #f0f0f0;
    }
    
    .breakpoint-info {
      padding: 15px;
    }
    
    .breakpoint-size {
      font-size: 18px;
      font-weight: 600;
      color: #333;
    }
    
    .breakpoint-type {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
      margin-bottom: 8px;
    }
    
    .breakpoint-type.width {
      background: #e3f2fd;
      color: #1976d2;
    }
    
    .breakpoint-type.height {
      background: #f3e5f5;
      color: #7b1fa2;
    }
    
    .breakpoint-checkbox {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 10px;
    }
    
    .viewer-modal {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.9);
      z-index: 1000;
    }
    
    .viewer-modal.active {
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .viewer-content {
      position: relative;
      max-width: 90vw;
      max-height: 90vh;
    }
    
    .viewer-image {
      max-width: 100%;
      max-height: 90vh;
      object-fit: contain;
    }
    
    .viewer-nav {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      background: rgba(255,255,255,0.9);
      border: none;
      padding: 20px;
      cursor: pointer;
      font-size: 24px;
    }
    
    .viewer-nav.prev {
      left: 20px;
    }
    
    .viewer-nav.next {
      right: 20px;
    }
    
    .viewer-info {
      position: absolute;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0,0,0,0.8);
      color: white;
      padding: 10px 20px;
      border-radius: 20px;
    }
    
    .viewer-controls {
      position: absolute;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0,0,0,0.8);
      color: white;
      padding: 15px 25px;
      border-radius: 25px;
      display: flex;
      align-items: center;
      gap: 15px;
    }
    
    .viewer-controls input[type="checkbox"] {
      width: 20px;
      height: 20px;
      cursor: pointer;
    }
    
    .viewer-controls label {
      cursor: pointer;
      font-size: 16px;
      font-weight: 500;
    }
    
    .export-btn {
      background: #28a745;
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 5px;
      font-size: 16px;
      cursor: pointer;
    }
    
    .export-btn:hover {
      background: #218838;
    }
    
    .stats {
      background: #f8f9fa;
      padding: 10px 20px;
      border-radius: 5px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Smart Breakpoint Viewer: ${breakpointData.title}</h1>
    <p>URL: ${breakpointData.url}</p>
    <p>Max viewport used: ${breakpointData.maxWidth}×${breakpointData.maxHeight}px</p>
    ${previousSelection ? '<p style="color: #28a745; font-weight: 500;">✓ Restored previous selection from ready folder</p>' : ''}
    <div class="controls">
      <div class="stats">
        <span id="selectedCount">0</span> / ${breakpointData.captures.length} selected
      </div>
      <button class="export-btn" onclick="exportSelection()">Export Selected Breakpoints</button>
      <button class="export-btn" onclick="selectAll()">Select All</button>
      <button class="export-btn" onclick="deselectAll()">Deselect All</button>
    </div>
  </div>
  
  <div class="section">
    <h2 class="section-title">Width Breakpoints (${breakpointData.widthBreakpoints.length})</h2>
    <div class="breakpoint-grid">
      ${breakpointData.captures.filter(c => c.type === 'width').map((capture, index) => {
        // Check if this capture was previously selected
        const isSelected = previousSelection ? 
          previousSelection.some(sel => 
            sel.type === capture.type && 
            sel.width === capture.width && 
            sel.height === capture.height &&
            sel.filename === capture.filename
          ) : true; // Default to checked if no previous selection
        
        return `
        <div class="breakpoint-card" data-index="${index}" onclick="viewImage(${index})">
          <img src="/screenshots/${folder}/${capture.filename}" alt="${capture.width}×${capture.height}" class="breakpoint-image">
          <div class="breakpoint-info">
            <div class="breakpoint-type width">WIDTH</div>
            <div class="breakpoint-size">${capture.width}px</div>
            <div style="color: #666; font-size: 14px;">Height: ${capture.height}px</div>
            <div class="breakpoint-checkbox" onclick="event.stopPropagation()">
              <input type="checkbox" id="bp-${index}" ${isSelected ? 'checked' : ''} onchange="updateSelection()">
              <label for="bp-${index}">Include this breakpoint</label>
            </div>
          </div>
        </div>
      `;}).join('')}
    </div>
  </div>
  
  <div class="section">
    <h2 class="section-title">Height Breakpoints (${breakpointData.heightBreakpoints.length})</h2>
    <div class="breakpoint-grid">
      ${breakpointData.captures.filter(c => c.type === 'height').map((capture, index) => {
        const actualIndex = breakpointData.captures.indexOf(capture);
        
        // Check if this capture was previously selected
        const isSelected = previousSelection ? 
          previousSelection.some(sel => 
            sel.type === capture.type && 
            sel.width === capture.width && 
            sel.height === capture.height &&
            sel.filename === capture.filename
          ) : true; // Default to checked if no previous selection
        
        return `
        <div class="breakpoint-card" data-index="${actualIndex}" onclick="viewImage(${actualIndex})">
          <img src="/screenshots/${folder}/${capture.filename}" alt="${capture.width}×${capture.height}" class="breakpoint-image">
          <div class="breakpoint-info">
            <div class="breakpoint-type height">HEIGHT</div>
            <div class="breakpoint-size">${capture.height}px</div>
            <div style="color: #666; font-size: 14px;">Width: ${capture.width}px</div>
            <div class="breakpoint-checkbox" onclick="event.stopPropagation()">
              <input type="checkbox" id="bp-${actualIndex}" ${isSelected ? 'checked' : ''} onchange="updateSelection()">
              <label for="bp-${actualIndex}">Include this breakpoint</label>
            </div>
          </div>
        </div>
      `;}).join('')}
    </div>
  </div>
  
  <div class="viewer-modal" id="viewer">
    <button class="viewer-nav prev" onclick="navigate(-1)">‹</button>
    <div class="viewer-content">
      <div class="viewer-controls">
        <input type="checkbox" id="viewerCheckbox" onchange="toggleCurrentBreakpoint()">
        <label for="viewerCheckbox">Include this breakpoint</label>
      </div>
      <img id="viewerImage" class="viewer-image">
      <div class="viewer-info" id="viewerInfo"></div>
    </div>
    <button class="viewer-nav next" onclick="navigate(1)">›</button>
  </div>
  
  <script>
    const captures = ${JSON.stringify(breakpointData.captures)};
    const folder = '${folder}';
    let currentIndex = 0;
    
    function viewImage(index) {
      currentIndex = index;
      const capture = captures[index];
      document.getElementById('viewerImage').src = '/captures/' + folder + '/' + capture.filename;
      const info = capture.type === 'width' 
        ? \`Width: \${capture.width}px (at height \${capture.height}px)\`
        : \`Height: \${capture.height}px (at width \${capture.width}px)\`;
      document.getElementById('viewerInfo').textContent = info;
      
      // Sync checkbox state with the grid checkbox
      const gridCheckbox = document.getElementById(\`bp-\${index}\`);
      const viewerCheckbox = document.getElementById('viewerCheckbox');
      viewerCheckbox.checked = gridCheckbox.checked;
      
      document.getElementById('viewer').classList.add('active');
    }
    
    function navigate(direction) {
      currentIndex = (currentIndex + direction + captures.length) % captures.length;
      viewImage(currentIndex);
    }
    
    function toggleCurrentBreakpoint() {
      const viewerCheckbox = document.getElementById('viewerCheckbox');
      const gridCheckbox = document.getElementById(\`bp-\${currentIndex}\`);
      
      // Sync the grid checkbox with the viewer checkbox
      gridCheckbox.checked = viewerCheckbox.checked;
      
      // Update the visual state in the grid
      updateSelection();
    }
    
    function updateSelection() {
      // Only count grid checkboxes, not the viewer checkbox
      const checkboxes = document.querySelectorAll('.breakpoint-checkbox input[type="checkbox"]');
      let selectedCount = 0;
      checkboxes.forEach((cb) => {
        const index = cb.id.replace('bp-', '');
        const card = document.querySelector(\`[data-index="\${index}"]\`);
        if (cb.checked) {
          selectedCount++;
          if (card) card.classList.remove('excluded');
        } else {
          if (card) card.classList.add('excluded');
        }
      });
      document.getElementById('selectedCount').textContent = selectedCount;
    }
    
    function selectAll() {
      document.querySelectorAll('.breakpoint-checkbox input[type="checkbox"]').forEach(cb => cb.checked = true);
      updateSelection();
    }
    
    function deselectAll() {
      document.querySelectorAll('.breakpoint-checkbox input[type="checkbox"]').forEach(cb => cb.checked = false);
      updateSelection();
    }
    
    async function exportSelection() {
      const selected = [];
      document.querySelectorAll('.breakpoint-checkbox input[type="checkbox"]').forEach((cb) => {
        if (cb.checked) {
          const index = parseInt(cb.id.replace('bp-', ''));
          selected.push(captures[index]);
        }
      });
      
      const exportData = {
        ...${JSON.stringify(breakpointData)},
        selectedCaptures: selected,
        folderName: '${folder}'
      };
      
      try {
        const response = await fetch('/api/export-breakpoints', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(exportData)
        });
        
        const result = await response.json();
        if (result.success) {
          alert('Breakpoints exported to: screenshots/ready/' + result.filename);
        } else {
          alert('Export failed: ' + result.error);
        }
      } catch (error) {
        alert('Export error: ' + error.message);
      }
    }
    
    // Close viewer on click outside or ESC
    document.getElementById('viewer').addEventListener('click', (e) => {
      if (e.target.id === 'viewer') {
        document.getElementById('viewer').classList.remove('active');
      }
    });
    
    document.addEventListener('keydown', (e) => {
      if (document.getElementById('viewer').classList.contains('active')) {
        if (e.key === 'Escape') {
          document.getElementById('viewer').classList.remove('active');
        } else if (e.key === 'ArrowLeft') {
          navigate(-1);
        } else if (e.key === 'ArrowRight') {
          navigate(1);
        }
      }
    });
    
    // Initialize count
    updateSelection();
  </script>
</body>
</html>`;
    
    res.send(viewerHTML);
  } catch (error) {
    console.error('Error loading breakpoints:', error);
    res.status(500).send('Error loading breakpoints');
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 Screen capture server running at http://localhost:${PORT}`);
  console.log(`📁 Captures will be saved to: ${path.join(__dirname, 'captures')}`);
  console.log('📌 Open in your browser to start capturing\n');
});


// Clean shutdown
process.on('SIGINT', async () => {
  console.log('\n\n🛑 Shutting down server...');
  if (browserInstance) {
    await browserInstance.close();
  }
  process.exit(0);
});