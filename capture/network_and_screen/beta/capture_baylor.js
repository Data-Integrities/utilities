#!/usr/bin/env node

/**
 * Baylor Capture Suite
 * Unified interface for capturing both UI breakpoints and network traffic
 * from MyBSWHealth for reverse engineering purposes
 */

const express = require('express');
const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3030;

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Global state
let browserInstance = null;
let captureInProgress = false;
let captureType = null; // 'ui' or 'network'
let networkCapture = {
    allRequests: [],
    targetEndpoint: null,
    targetFound: false
};

// Ensure capture directories exist
async function ensureDirectories() {
    const dirs = [
        path.join(__dirname, 'captures'),
        path.join(__dirname, 'captures', 'ui'),
        path.join(__dirname, 'captures', 'network'),
        path.join(__dirname, 'captures', 'ui', 'screenshots'),
        path.join(__dirname, 'captures', 'ui', 'ready'),
        path.join(__dirname, 'captures', 'network', 'raw'),
        path.join(__dirname, 'captures', 'network', 'analysis')
    ];
    
    for (const dir of dirs) {
        await fs.mkdir(dir, { recursive: true });
    }
}

// Homepage with split interface
app.get('/', (req, res) => {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Baylor Capture Suite</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #1a1a1a;
            height: 100vh;
            overflow: hidden;
        }
        
        .app-container {
            height: 100vh;
            display: flex;
            flex-direction: column;
        }
        
        .header {
            background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
            color: white;
            padding: 20px 30px;
            text-align: center;
            flex-shrink: 0;
            box-shadow: 0 2px 10px rgba(0,0,0,0.3);
            position: relative;
        }
        
        .header h1 {
            font-size: 2.2em;
            margin-bottom: 5px;
            font-weight: 700;
        }
        
        .header p {
            font-size: 1em;
            opacity: 0.9;
        }
        
        .server-status {
            position: absolute;
            top: 15px;
            right: 20px;
            background: rgba(255,255,255,0.9);
            padding: 8px 15px;
            border-radius: 20px;
            font-size: 13px;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .status-dot {
            width: 8px;
            height: 8px;
            background: #28a745;
            border-radius: 50%;
            animation: pulse 2s infinite;
        }
        
        .status-dot.busy {
            background: #ffc107;
        }
        
        @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: 0.5; }
            100% { opacity: 1; }
        }
        
        .main-split {
            flex: 1;
            display: flex;
            height: calc(100vh - 85px);
        }
        
        /* Left Side - UI Captures */
        .ui-section {
            flex: 1;
            background: #f5f5f5;
            display: flex;
            flex-direction: column;
            border-right: 3px solid #333;
        }
        
        .ui-header {
            background: linear-gradient(135deg, #4a90e2 0%, #7cb9e8 100%);
            color: white;
            padding: 25px;
            text-align: center;
        }
        
        .ui-header h2 {
            font-size: 1.8em;
            margin-bottom: 10px;
        }
        
        .ui-header .icon {
            font-size: 3em;
            margin-bottom: 10px;
        }
        
        .capture-button-container {
            padding: 20px;
            background: white;
            border-bottom: 1px solid #dee2e6;
        }
        
        .capture-btn {
            width: 100%;
            background: linear-gradient(135deg, #4a90e2 0%, #7cb9e8 100%);
            color: white;
            border: none;
            padding: 15px 25px;
            font-size: 16px;
            font-weight: 600;
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.3s ease;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        
        .capture-btn:hover:not(:disabled) {
            transform: translateY(-2px);
            box-shadow: 0 8px 20px rgba(74,144,226,0.3);
        }
        
        .capture-btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }
        
        .capture-features {
            padding: 15px 20px;
            background: #e8f4fd;
            font-size: 14px;
            color: #2c5282;
            text-align: center;
            line-height: 1.6;
        }
        
        .ui-captures-list {
            flex: 1;
            overflow-y: auto;
            padding: 20px;
            background: #f8f9fa;
        }
        
        /* Right Side - Network Captures */
        .network-section {
            flex: 1;
            background: #f5f5f5;
            display: flex;
            flex-direction: column;
        }
        
        .network-header {
            background: linear-gradient(135deg, #ff6b6b 0%, #ffa500 100%);
            color: white;
            padding: 25px;
            text-align: center;
        }
        
        .network-header h2 {
            font-size: 1.8em;
            margin-bottom: 10px;
        }
        
        .network-header .icon {
            font-size: 3em;
            margin-bottom: 10px;
        }
        
        .endpoint-input-container {
            padding: 20px;
            background: white;
            border-bottom: 1px solid #dee2e6;
        }
        
        .endpoint-input {
            width: 100%;
            padding: 12px 15px;
            border: 2px solid #dee2e6;
            border-radius: 8px;
            font-size: 16px;
            margin-bottom: 15px;
            transition: border-color 0.3s;
        }
        
        .endpoint-input:focus {
            outline: none;
            border-color: #ff6b6b;
        }
        
        .capture-btn.network {
            background: linear-gradient(135deg, #ff6b6b 0%, #ffa500 100%);
        }
        
        .capture-btn.network:hover:not(:disabled) {
            box-shadow: 0 8px 20px rgba(255,107,107,0.3);
        }
        
        .network-features {
            padding: 15px 20px;
            background: #fff5f5;
            font-size: 14px;
            color: #9b2c2c;
            text-align: center;
            line-height: 1.6;
        }
        
        .network-captures-list {
            flex: 1;
            overflow-y: auto;
            padding: 20px;
            background: #f8f9fa;
        }
        
        /* Capture Cards */
        .capture-card {
            background: white;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 15px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            transition: all 0.3s ease;
            border-left: 4px solid transparent;
        }
        
        .ui-captures-list .capture-card {
            border-left-color: #4a90e2;
        }
        
        .network-captures-list .capture-card {
            border-left-color: #ff6b6b;
        }
        
        .capture-card:hover {
            transform: translateX(5px);
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }
        
        .capture-title {
            font-size: 1.2em;
            font-weight: 600;
            margin-bottom: 8px;
            color: #333;
            cursor: pointer;
            padding: 2px;
        }
        
        .capture-title:hover {
            background: #f0f0f0;
            border-radius: 4px;
        }
        
        .capture-meta {
            color: #666;
            font-size: 13px;
            margin-bottom: 12px;
        }
        
        .capture-stats {
            display: flex;
            gap: 20px;
            margin-bottom: 15px;
            font-size: 14px;
            color: #555;
        }
        
        .stat-item {
            display: flex;
            align-items: center;
            gap: 5px;
        }
        
        .capture-actions {
            display: flex;
            gap: 10px;
        }
        
        .action-btn {
            flex: 1;
            padding: 8px 15px;
            border: 1px solid;
            background: white;
            border-radius: 5px;
            cursor: pointer;
            font-size: 14px;
            transition: all 0.3s;
        }
        
        .ui-captures-list .action-btn {
            border-color: #4a90e2;
            color: #4a90e2;
        }
        
        .ui-captures-list .action-btn:hover {
            background: #4a90e2;
            color: white;
        }
        
        .network-captures-list .action-btn {
            border-color: #ff6b6b;
            color: #ff6b6b;
        }
        
        .network-captures-list .action-btn:hover {
            background: #ff6b6b;
            color: white;
        }
        
        .list-empty {
            text-align: center;
            padding: 40px;
            color: #999;
        }
        
        /* Scrollbar styling */
        .ui-captures-list::-webkit-scrollbar,
        .network-captures-list::-webkit-scrollbar {
            width: 8px;
        }
        
        .ui-captures-list::-webkit-scrollbar-track,
        .network-captures-list::-webkit-scrollbar-track {
            background: #f1f1f1;
        }
        
        .ui-captures-list::-webkit-scrollbar-thumb {
            background: #4a90e2;
            border-radius: 4px;
        }
        
        .network-captures-list::-webkit-scrollbar-thumb {
            background: #ff6b6b;
            border-radius: 4px;
        }
        
        /* Loading spinner */
        .spinner {
            border: 3px solid #f3f3f3;
            border-top: 3px solid #3498db;
            border-radius: 50%;
            width: 20px;
            height: 20px;
            animation: spin 1s linear infinite;
            display: inline-block;
            margin-left: 10px;
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    </style>
</head>
<body>
    <div class="app-container">
        <div class="header">
            <h1>🏥 Baylor Capture Suite</h1>
            <p>Reverse Engineering Tools for MyBSWHealth</p>
            <div class="server-status">
                <div class="status-dot" id="statusDot"></div>
                <span id="statusText">Server Ready</span>
            </div>
        </div>
        
        <div class="main-split">
            <!-- Left Side - UI Captures -->
            <div class="ui-section">
                <div class="ui-header">
                    <div class="icon">📱</div>
                    <h2>UI Breakpoint Capture</h2>
                    <p>Capture responsive layouts and visual designs</p>
                </div>
                
                <div class="capture-button-container">
                    <button class="capture-btn ui" id="uiCaptureBtn" onclick="startUICapture()">
                        🚀 Start UI Capture Session
                    </button>
                </div>
                
                <div class="capture-features">
                    ✓ Injects capture buttons • ✓ Auto-detects breakpoints • ✓ All viewport sizes
                </div>
                
                <div class="ui-captures-list" id="uiCapturesList">
                    <div class="list-empty">No UI captures yet</div>
                </div>
            </div>
            
            <!-- Right Side - Network Captures -->
            <div class="network-section">
                <div class="network-header">
                    <div class="icon">🌐</div>
                    <h2>Network Endpoint Capture</h2>
                    <p>Capture API calls and authentication flows</p>
                </div>
                
                <div class="endpoint-input-container">
                    <input type="text" 
                           class="endpoint-input" 
                           id="endpointInput"
                           placeholder="Target endpoint (e.g. GetCoverages)" 
                           value="GetCoverages">
                    <button class="capture-btn network" id="networkCaptureBtn" onclick="startNetworkCapture()">
                        🎯 Start Network Capture
                    </button>
                </div>
                
                <div class="network-features">
                    ✓ All requests/responses • ✓ Cookies & headers • ✓ Auto-stops at endpoint
                </div>
                
                <div class="network-captures-list" id="networkCapturesList">
                    <div class="list-empty">No network captures yet</div>
                </div>
            </div>
        </div>
    </div>
    
    <script>
        let isEditing = false;
        
        function updateStatus(text, isBusy = false) {
            document.getElementById('statusText').textContent = text;
            document.getElementById('statusDot').className = 'status-dot' + (isBusy ? ' busy' : '');
        }
        
        async function startUICapture() {
            const btn = document.getElementById('uiCaptureBtn');
            btn.disabled = true;
            btn.innerHTML = '⏳ Starting...';
            updateStatus('Starting UI capture...', true);
            
            try {
                const response = await fetch('/api/start-ui-capture', { method: 'POST' });
                const data = await response.json();
                
                if (data.success) {
                    btn.innerHTML = '📸 Capture in Progress';
                    updateStatus('UI capture active', true);
                } else {
                    btn.disabled = false;
                    btn.innerHTML = '🚀 Start UI Capture Session';
                    updateStatus('Server Ready');
                    alert('Failed to start UI capture: ' + data.error);
                }
            } catch (error) {
                btn.disabled = false;
                btn.innerHTML = '🚀 Start UI Capture Session';
                updateStatus('Server Ready');
                alert('Error: ' + error.message);
            }
        }
        
        async function startNetworkCapture() {
            const endpoint = document.getElementById('endpointInput').value.trim();
            if (!endpoint) {
                alert('Please enter a target endpoint');
                return;
            }
            
            const btn = document.getElementById('networkCaptureBtn');
            btn.disabled = true;
            btn.innerHTML = '⏳ Starting...';
            updateStatus('Starting network capture...', true);
            
            try {
                const response = await fetch('/api/start-network-capture', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ endpoint })
                });
                const data = await response.json();
                
                if (data.success) {
                    btn.innerHTML = '🎯 Capturing Until ' + endpoint;
                    updateStatus('Network capture active', true);
                } else {
                    btn.disabled = false;
                    btn.innerHTML = '🎯 Start Network Capture';
                    updateStatus('Server Ready');
                    alert('Failed to start network capture: ' + data.error);
                }
            } catch (error) {
                btn.disabled = false;
                btn.innerHTML = '🎯 Start Network Capture';
                updateStatus('Server Ready');
                alert('Error: ' + error.message);
            }
        }
        
        async function renameCapture(type, id, currentName, element) {
            if (isEditing) return;
            isEditing = true;
            
            const input = document.createElement('input');
            input.type = 'text';
            input.value = currentName;
            input.style.cssText = 'font-size: inherit; font-weight: inherit; width: 100%; padding: 2px;';
            
            input.onblur = async function() {
                isEditing = false;
                const newName = input.value.trim();
                if (newName && newName !== currentName) {
                    try {
                        const response = await fetch('/api/rename-capture', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ type, id, newName })
                        });
                        
                        const result = await response.json();
                        if (result.success) {
                            loadCaptures();
                        } else {
                            element.textContent = currentName;
                            alert('Failed to rename: ' + result.error);
                        }
                    } catch (error) {
                        element.textContent = currentName;
                        alert('Error: ' + error.message);
                    }
                } else {
                    element.textContent = currentName;
                }
            };
            
            input.onkeydown = function(e) {
                if (e.key === 'Enter') {
                    input.blur();
                } else if (e.key === 'Escape') {
                    isEditing = false;
                    element.textContent = currentName;
                }
            };
            
            element.textContent = '';
            element.appendChild(input);
            input.focus();
            input.select();
        }
        
        async function loadCaptures() {
            try {
                const response = await fetch('/api/captures');
                const data = await response.json();
                
                // Update UI captures list
                const uiList = document.getElementById('uiCapturesList');
                if (data.ui.length === 0) {
                    uiList.innerHTML = '<div class="list-empty">No UI captures yet</div>';
                } else {
                    uiList.innerHTML = data.ui.map(capture => \`
                        <div class="capture-card">
                            <div class="capture-title" onclick="renameCapture('ui', '\${capture.id}', '\${capture.name.replace(/'/g, "\\\\'")}', this)">
                                \${capture.name}
                            </div>
                            <div class="capture-meta">
                                📅 \${capture.date}<br>
                                🔗 \${capture.url || 'N/A'}
                            </div>
                            <div class="capture-stats">
                                \${capture.stats || ''}
                            </div>
                            <div class="capture-actions">
                                <button class="action-btn" onclick="viewCapture('ui', '\${capture.id}')">View</button>
                                <button class="action-btn" onclick="exportCapture('ui', '\${capture.id}')">Export</button>
                            </div>
                        </div>
                    \`).join('');
                }
                
                // Update Network captures list
                const networkList = document.getElementById('networkCapturesList');
                if (data.network.length === 0) {
                    networkList.innerHTML = '<div class="list-empty">No network captures yet</div>';
                } else {
                    networkList.innerHTML = data.network.map(capture => \`
                        <div class="capture-card">
                            <div class="capture-title" onclick="renameCapture('network', '\${capture.id}', '\${capture.name.replace(/'/g, "\\\\'")}', this)">
                                \${capture.name}
                            </div>
                            <div class="capture-meta">
                                📅 \${capture.date}<br>
                                🎯 Stopped at: \${capture.endpoint}
                            </div>
                            <div class="capture-stats">
                                \${capture.stats || ''}
                            </div>
                            <div class="capture-actions">
                                <button class="action-btn" onclick="viewCapture('network', '\${capture.id}')">View</button>
                                <button class="action-btn" onclick="analyzeCapture('\${capture.id}')">Analyze</button>
                            </div>
                        </div>
                    \`).join('');
                }
            } catch (error) {
                console.error('Error loading captures:', error);
            }
        }
        
        function viewCapture(type, id) {
            if (type === 'ui') {
                window.open('/ui-viewer/' + id, '_blank');
            } else {
                window.open('/network-viewer/' + id, '_blank');
            }
        }
        
        function exportCapture(type, id) {
            window.location.href = '/api/export/' + type + '/' + id;
        }
        
        function analyzeCapture(id) {
            window.open('/network-analyzer/' + id, '_blank');
        }
        
        // Check status periodically
        setInterval(async () => {
            try {
                const response = await fetch('/api/status');
                const data = await response.json();
                
                const uiBtn = document.getElementById('uiCaptureBtn');
                const networkBtn = document.getElementById('networkCaptureBtn');
                
                if (!data.captureInProgress) {
                    uiBtn.disabled = false;
                    networkBtn.disabled = false;
                    
                    if (uiBtn.innerHTML.includes('Progress')) {
                        uiBtn.innerHTML = '🚀 Start UI Capture Session';
                        loadCaptures();
                    }
                    if (networkBtn.innerHTML.includes('Capturing')) {
                        networkBtn.innerHTML = '🎯 Start Network Capture';
                        loadCaptures();
                    }
                    
                    updateStatus('Server Ready');
                } else {
                    if (data.captureType === 'ui') {
                        uiBtn.disabled = true;
                        networkBtn.disabled = true;
                    } else if (data.captureType === 'network') {
                        uiBtn.disabled = true;
                        networkBtn.disabled = true;
                    }
                }
            } catch (error) {
                console.error('Status check error:', error);
            }
        }, 2000);
        
        // Load captures on page load
        loadCaptures();
        
        // Refresh captures periodically
        setInterval(() => {
            if (!isEditing) {
                loadCaptures();
            }
        }, 5000);
    </script>
</body>
</html>`;
    
    res.send(html);
});

// API endpoints
app.get('/api/status', (req, res) => {
    res.json({
        captureInProgress,
        captureType,
        browserActive: browserInstance !== null
    });
});

app.get('/api/captures', async (req, res) => {
    try {
        const uiCaptures = await loadUICaptures();
        const networkCaptures = await loadNetworkCaptures();
        
        res.json({
            ui: uiCaptures,
            network: networkCaptures
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Load UI captures from disk
async function loadUICaptures() {
    const captures = [];
    const screenshotsDir = path.join(__dirname, 'captures', 'ui', 'screenshots');
    
    try {
        const folders = await fs.readdir(screenshotsDir);
        
        for (const folder of folders) {
            if (folder.startsWith('.')) continue;
            
            const folderPath = path.join(screenshotsDir, folder);
            const stat = await fs.stat(folderPath);
            
            if (stat.isDirectory()) {
                const metaFile = path.join(folderPath, 'breakpoints.json');
                
                if (await fs.access(metaFile).then(() => true).catch(() => false)) {
                    const meta = JSON.parse(await fs.readFile(metaFile, 'utf8'));
                    
                    captures.push({
                        id: folder,
                        name: meta.title || folder,
                        date: new Date(meta.timestamp).toLocaleString(),
                        url: meta.url,
                        stats: `<div class="stat-item">📐 ${meta.captures?.length || 0} breakpoints</div>`
                    });
                }
            }
        }
    } catch (error) {
        console.error('Error loading UI captures:', error);
    }
    
    return captures.sort((a, b) => new Date(b.date) - new Date(a.date));
}

// Load network captures from disk
async function loadNetworkCaptures() {
    const captures = [];
    const networkDir = path.join(__dirname, 'captures', 'network', 'raw');
    
    try {
        const files = await fs.readdir(networkDir);
        
        for (const file of files) {
            if (!file.endsWith('.json')) continue;
            
            const filePath = path.join(networkDir, file);
            const stat = await fs.stat(filePath);
            
            // Read first few lines to get metadata
            const content = await fs.readFile(filePath, 'utf8');
            const data = JSON.parse(content);
            
            // Extract metadata from filename and content
            const match = file.match(/captured-all-until-(.+?)-(\d+)\.json/);
            const endpoint = match ? match[1].replace(/-/g, ' ') : 'Unknown';
            
            // Count requests and cookies
            const requests = data.filter(item => item.type === 'request');
            const requestsWithCookies = requests.filter(r => r.data.cookies);
            
            captures.push({
                id: file.replace('.json', ''),
                name: endpoint,
                date: new Date(stat.mtime).toLocaleString(),
                endpoint: endpoint,
                stats: `<div class="stat-item">🌐 ${requests.length} requests</div>
                        <div class="stat-item">🍪 ${requestsWithCookies.length} with cookies</div>`,
                file: file
            });
        }
    } catch (error) {
        console.error('Error loading network captures:', error);
    }
    
    return captures.sort((a, b) => new Date(b.date) - new Date(a.date));
}

// Start UI capture session
app.post('/api/start-ui-capture', async (req, res) => {
    if (captureInProgress) {
        return res.json({ success: false, error: 'Another capture is already in progress' });
    }
    
    try {
        captureInProgress = true;
        captureType = 'ui';
        
        // This will launch browser with UI capture mode
        // Implementation continues in Part 2...
        
        res.json({ success: true, message: 'UI capture started' });
        
        // Actually start the capture
        startUIBrowserCapture();
        
    } catch (error) {
        captureInProgress = false;
        captureType = null;
        res.json({ success: false, error: error.message });
    }
});

// Start network capture session
app.post('/api/start-network-capture', async (req, res) => {
    if (captureInProgress) {
        return res.json({ success: false, error: 'Another capture is already in progress' });
    }
    
    const { endpoint } = req.body;
    
    if (!endpoint) {
        return res.json({ success: false, error: 'Target endpoint is required' });
    }
    
    try {
        captureInProgress = true;
        captureType = 'network';
        networkCapture.targetEndpoint = endpoint;
        networkCapture.allRequests = [];
        networkCapture.targetFound = false;
        
        res.json({ success: true, message: 'Network capture started' });
        
        // Actually start the capture
        startNetworkBrowserCapture(endpoint);
        
    } catch (error) {
        captureInProgress = false;
        captureType = null;
        res.json({ success: false, error: error.message });
    }
});

// UI Capture Browser Logic
async function startUIBrowserCapture() {
    try {
        browserInstance = await chromium.launch({ 
            headless: false,
            args: ['--start-maximized']
        });
        
        const context = await browserInstance.newContext({
            viewport: { width: 1920, height: 1080 }
        });
        
        const page = await context.newPage();
        
        // Function to inject capture buttons into page
        async function injectButtons() {
            await page.evaluate(() => {
                // Remove any existing buttons
                const existingContainer = document.getElementById('baylor-capture-container');
                if (existingContainer) existingContainer.remove();
                
                // Function to extract CSS breakpoints
                function getCSSBreakpoints() {
                    const widthBreakpoints = new Set();
                    const heightBreakpoints = new Set();
                    
                    for (const sheet of document.styleSheets) {
                        try {
                            const rules = sheet.cssRules || sheet.rules;
                            if (!rules) continue;
                            
                            for (const rule of rules) {
                                if (rule.type === CSSRule.MEDIA_RULE) {
                                    const mediaText = rule.media.mediaText;
                                    
                                    const minWidthMatch = mediaText.match(/min-width:\s*(\d+)px/);
                                    const maxWidthMatch = mediaText.match(/max-width:\s*(\d+)px/);
                                    const minHeightMatch = mediaText.match(/min-height:\s*(\d+)px/);
                                    const maxHeightMatch = mediaText.match(/max-height:\s*(\d+)px/);
                                    
                                    if (minWidthMatch) widthBreakpoints.add(parseInt(minWidthMatch[1]));
                                    if (maxWidthMatch) widthBreakpoints.add(parseInt(maxWidthMatch[1]));
                                    if (minHeightMatch) heightBreakpoints.add(parseInt(minHeightMatch[1]));
                                    if (maxHeightMatch) heightBreakpoints.add(parseInt(maxHeightMatch[1]));
                                }
                            }
                        } catch (e) {
                            // Skip cross-origin stylesheets
                        }
                    }
                    
                    const widthArray = Array.from(widthBreakpoints).sort((a, b) => a - b);
                    const heightArray = Array.from(heightBreakpoints).sort((a, b) => a - b);
                    
                    // Add standard sizes if needed
                    const standardWidths = [375, 768, 1024, 1366, 1920];
                    const standardHeights = [667, 768, 900, 1080];
                    
                    standardWidths.forEach(size => {
                        if (!widthArray.includes(size)) widthArray.push(size);
                    });
                    
                    standardHeights.forEach(size => {
                        if (!heightArray.includes(size)) heightArray.push(size);
                    });
                    
                    return {
                        widths: widthArray.sort((a, b) => a - b),
                        heights: heightArray.sort((a, b) => a - b)
                    };
                }
                
                // Create button container
                const buttonContainer = document.createElement('div');
                buttonContainer.id = 'baylor-capture-container';
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
                captureBtn.id = 'baylor-capture-btn';
                captureBtn.textContent = '📸 Capture Breakpoints';
                captureBtn.style.cssText = `
                    padding: 10px 20px;
                    background: #4a90e2;
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
                doneBtn.id = 'baylor-done-btn';
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
                    window.__BAYLOR_DONE_CAPTURING__ = true;
                    doneBtn.textContent = '👋 Closing...';
                    doneBtn.disabled = true;
                };
                
                captureBtn.onclick = () => {
                    const breakpoints = getCSSBreakpoints();
                    
                    window.__BAYLOR_CAPTURE_INFO__ = {
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
                    captureBtn.textContent = `📐 Found ${totalCaptures} breakpoints`;
                    captureBtn.style.background = '#17a2b8';
                    
                    setTimeout(() => {
                        captureBtn.textContent = '⏳ Capturing...';
                        captureBtn.disabled = true;
                    }, 2000);
                };
                
                buttonContainer.appendChild(captureBtn);
                buttonContainer.appendChild(doneBtn);
                
                if (document.body) {
                    document.body.appendChild(buttonContainer);
                }
                
                window.__BAYLOR_DONE_CAPTURING__ = false;
            });
        }
        
        // Inject buttons after every navigation
        page.on('load', async () => {
            await injectButtons();
        });
        
        await page.goto('https://mychart.bswhealth.com/DT/Authentication/Login');
        
        // Auto-fill credentials
        try {
            await page.waitForSelector('input#username', { timeout: 5000 });
            await page.fill('input#username', 'jkelling@hotmail.com');
            await page.fill('input#password', '2LetJeffIn!');
            console.log('✅ Credentials auto-filled');
        } catch (e) {
            console.log('ℹ️ Login form not found or already logged in');
        }
        
        // Wait a bit then inject buttons
        await page.waitForTimeout(1000);
        await injectButtons();
        
        // Monitor for captures
        let captureCount = 0;
        const checkInterval = setInterval(async () => {
            try {
                const isDone = await page.evaluate(() => window.__BAYLOR_DONE_CAPTURING__);
                if (isDone) {
                    console.log('\n👋 Done capturing! Closing browser...');
                    clearInterval(checkInterval);
                    await browserInstance.close();
                    browserInstance = null;
                    captureInProgress = false;
                    captureType = null;
                    return;
                }
                
                const captureInfo = await page.evaluate(() => window.__BAYLOR_CAPTURE_INFO__);
                
                if (captureInfo && captureInfo.ready) {
                    captureCount++;
                    
                    // Convert page title to folder name
                    const pageTitle = captureInfo.title
                        .toLowerCase()
                        .replace(/[^a-z0-9\s-]/g, '')
                        .replace(/\s+/g, '-')
                        .replace(/-+/g, '-')
                        .replace(/^-|-$/g, '');
                    
                    const pageName = pageTitle || `page-${captureCount}`;
                    
                    console.log(`\n📐 Capturing breakpoints for: ${captureInfo.title}`);
                    console.log(`   Width breakpoints: ${captureInfo.widthBreakpoints.length}`);
                    console.log(`   Height breakpoints: ${captureInfo.heightBreakpoints.length}`);
                    
                    const screenshotDir = path.join(__dirname, 'captures', 'ui', 'screenshots', pageName);
                    await fs.mkdir(screenshotDir, { recursive: true });
                    
                    // Save breakpoint metadata
                    const breakpointData = {
                        url: captureInfo.url,
                        title: captureInfo.title,
                        widthBreakpoints: captureInfo.widthBreakpoints,
                        heightBreakpoints: captureInfo.heightBreakpoints,
                        timestamp: new Date().toISOString(),
                        captures: []
                    };
                    
                    // Clear the ready flag
                    await page.evaluate(() => { window.__BAYLOR_CAPTURE_INFO__.ready = false; });
                    
                    // Hide buttons during capture
                    await page.evaluate(() => {
                        const container = document.getElementById('baylor-capture-container');
                        if (container) container.style.display = 'none';
                    });
                    
                    // Capture screenshots at breakpoints
                    const maxWidth = Math.min(Math.max(...captureInfo.widthBreakpoints, 1920), captureInfo.screenWidth || 1920);
                    const maxHeight = Math.min(Math.max(...captureInfo.heightBreakpoints, 1080), captureInfo.screenHeight || 1080);
                    
                    // Capture width breakpoints
                    for (const width of captureInfo.widthBreakpoints) {
                        await page.setViewportSize({ width, height: maxHeight });
                        await page.waitForTimeout(500);
                        
                        const screenshotPath = path.join(screenshotDir, `width-${width}px.png`);
                        await page.screenshot({ path: screenshotPath, fullPage: false });
                        
                        breakpointData.captures.push({
                            type: 'width',
                            width: width,
                            height: maxHeight,
                            filename: `width-${width}px.png`
                        });
                        
                        console.log(`   ✓ Captured ${width}×${maxHeight}`);
                    }
                    
                    // Save metadata
                    await fs.writeFile(
                        path.join(screenshotDir, 'breakpoints.json'),
                        JSON.stringify(breakpointData, null, 2)
                    );
                    
                    // Restore viewport
                    await page.setViewportSize({ 
                        width: captureInfo.currentWidth, 
                        height: captureInfo.currentHeight 
                    });
                    
                    // Show buttons again
                    await page.evaluate(() => {
                        const container = document.getElementById('baylor-capture-container');
                        if (container) container.style.display = 'flex';
                        const btn = document.getElementById('baylor-capture-btn');
                        if (btn) {
                            btn.textContent = '📸 Capture Breakpoints';
                            btn.disabled = false;
                            btn.style.background = '#4a90e2';
                        }
                    });
                    
                    console.log(`✅ Saved to: ${screenshotDir}\n`);
                }
            } catch (error) {
                if (error.message.includes('Target closed') || error.message.includes('Execution context')) {
                    clearInterval(checkInterval);
                    browserInstance = null;
                    captureInProgress = false;
                    captureType = null;
                }
            }
        }, 1000);
        
    } catch (error) {
        console.error('UI capture error:', error);
        browserInstance = null;
        captureInProgress = false;
        captureType = null;
    }
}

// Network Capture Browser Logic  
async function startNetworkBrowserCapture(targetEndpoint) {
    try {
        browserInstance = await chromium.launch({ 
            headless: false,
            devtools: false
        });
        
        const context = await browserInstance.newContext();
        const page = await context.newPage();
        
        // Remove timeouts
        page.setDefaultTimeout(0);
        page.setDefaultNavigationTimeout(0);
        
        console.log(`🎯 Capturing until endpoint: ${targetEndpoint}`);
        
        // Monitor ALL network activity
        page.on('request', async (request) => {
            const url = request.url();
            
            // Get ALL headers including cookies
            const allHeaders = await request.allHeaders();
            
            const requestData = {
                url: url,
                method: request.method(),
                headers: request.headers(),
                allHeaders: allHeaders,
                cookies: allHeaders.cookie || null,
                postData: request.postData(),
                timestamp: new Date().toISOString(),
                resourceType: request.resourceType()
            };
            
            networkCapture.allRequests.push({
                type: 'request',
                data: requestData
            });
            
            // Log important requests
            if (url.includes('api/') || url.includes(targetEndpoint)) {
                console.log(`📥 ${request.method()} ${url.substring(0, 100)}...`);
                if (allHeaders.cookie) {
                    const cookieCount = allHeaders.cookie.split('; ').length;
                    console.log(`   🍪 ${cookieCount} cookies sent`);
                }
            }
            
            // Check if this is our target
            if (url.includes(targetEndpoint)) {
                console.log(`\n🎯 FOUND TARGET ENDPOINT: ${targetEndpoint}`);
                networkCapture.targetFound = true;
                
                // Wait for response then save
                setTimeout(async () => {
                    await saveNetworkCapture();
                    await browserInstance.close();
                    browserInstance = null;
                    captureInProgress = false;
                    captureType = null;
                }, 2000);
            }
        });
        
        // Capture responses with all headers
        page.on('response', async (response) => {
            const url = response.url();
            
            if (url.includes('api/') || url.includes(targetEndpoint)) {
                let responseBody = null;
                try {
                    if (response.headers()['content-type']?.includes('json')) {
                        responseBody = await response.json();
                    } else if (response.headers()['content-type']?.includes('text')) {
                        responseBody = await response.text();
                    }
                } catch (e) {
                    responseBody = `[Parse Error: ${e.message}]`;
                }
                
                const responseData = {
                    url: url,
                    status: response.status(),
                    statusText: response.statusText(),
                    headers: response.headers(),
                    setCookies: response.headers()['set-cookie'] || null,
                    body: responseBody,
                    timestamp: new Date().toISOString()
                };
                
                networkCapture.allRequests.push({
                    type: 'response',
                    data: responseData
                });
                
                console.log(`📤 Response ${response.status()} for ${url.substring(0, 80)}...`);
            }
        });
        
        // Navigate to login
        await page.goto('https://mychart.bswhealth.com/DT/Authentication/Login');
        
        // Auto-fill credentials
        try {
            await page.waitForSelector('input#username', { timeout: 5000 });
            await page.fill('input#username', 'jkelling@hotmail.com');
            await page.fill('input#password', '2LetJeffIn!');
            console.log('✅ Login fields pre-populated');
        } catch (e) {
            console.log('ℹ️ Login form not found or already logged in');
        }
        
        console.log('\n' + '='.repeat(60));
        console.log('📋 INSTRUCTIONS:');
        console.log('1. Click login button');
        console.log('2. Navigate to the page with your target endpoint');
        console.log(`3. Capture will stop when "${targetEndpoint}" is detected`);
        console.log('='.repeat(60) + '\n');
        
    } catch (error) {
        console.error('Network capture error:', error);
        browserInstance = null;
        captureInProgress = false;
        captureType = null;
    }
}

// Save network capture to disk
async function saveNetworkCapture() {
    const filename = `captured-all-until-${networkCapture.targetEndpoint.replace(/[^a-zA-Z0-9]/g, '-')}-${Date.now()}.json`;
    const filepath = path.join(__dirname, 'captures', 'network', 'raw', filename);
    
    await fs.writeFile(
        filepath,
        JSON.stringify(networkCapture.allRequests, null, 2)
    );
    
    console.log(`✅ Network capture saved to: ${filename}`);
    console.log(`📊 Total captured: ${networkCapture.allRequests.length} items`);
    
    // Generate analysis summary
    const requestsWithCookies = networkCapture.allRequests.filter(r => 
        r.type === 'request' && r.data.cookies
    );
    
    console.log(`🍪 Requests with cookies: ${requestsWithCookies.length}`);
}

// Rename capture endpoint
app.post('/api/rename-capture', async (req, res) => {
    const { type, id, newName } = req.body;
    
    try {
        if (type === 'ui') {
            const oldPath = path.join(__dirname, 'captures', 'ui', 'screenshots', id);
            const metaFile = path.join(oldPath, 'breakpoints.json');
            
            if (await fs.access(metaFile).then(() => true).catch(() => false)) {
                const meta = JSON.parse(await fs.readFile(metaFile, 'utf8'));
                meta.title = newName;
                await fs.writeFile(metaFile, JSON.stringify(meta, null, 2));
                res.json({ success: true });
            } else {
                res.json({ success: false, error: 'Capture not found' });
            }
        } else if (type === 'network') {
            // For network captures, update a metadata file
            const metaFile = path.join(__dirname, 'captures', 'network', 'analysis', `${id}.meta.json`);
            await fs.writeFile(metaFile, JSON.stringify({ name: newName, renamed: true }, null, 2));
            res.json({ success: true });
        }
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// Network viewer - shows raw capture data
app.get('/network-viewer/:id', async (req, res) => {
    const captureId = req.params.id;
    const filePath = path.join(__dirname, 'captures', 'network', 'raw', `${captureId}.json`);
    
    try {
        const data = JSON.parse(await fs.readFile(filePath, 'utf8'));
        
        // Separate requests and responses
        const requests = data.filter(item => item.type === 'request');
        const responses = data.filter(item => item.type === 'response');
        
        const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Network Viewer - ${captureId}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #1a1a1a;
            margin: 0;
            padding: 0;
            color: #e0e0e0;
        }
        
        .header {
            background: linear-gradient(135deg, #ff6b6b 0%, #ffa500 100%);
            color: white;
            padding: 20px 30px;
            position: sticky;
            top: 0;
            z-index: 100;
            box-shadow: 0 2px 10px rgba(0,0,0,0.3);
        }
        
        .header h1 {
            margin: 0;
            font-size: 1.8em;
        }
        
        .header p {
            margin: 5px 0 0 0;
            opacity: 0.9;
            font-size: 0.9em;
        }
        
        .controls {
            background: #2a2a2a;
            padding: 15px 30px;
            position: sticky;
            top: 70px;
            z-index: 90;
            display: flex;
            gap: 15px;
            align-items: center;
            border-bottom: 1px solid #444;
        }
        
        .search-box {
            flex: 1;
            padding: 10px 15px;
            background: #1a1a1a;
            border: 1px solid #444;
            color: white;
            border-radius: 5px;
            font-size: 14px;
        }
        
        .filter-btn {
            padding: 10px 20px;
            background: #4a90e2;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-weight: 500;
        }
        
        .filter-btn.active {
            background: #28a745;
        }
        
        .stats-bar {
            background: #2a2a2a;
            padding: 10px 30px;
            display: flex;
            gap: 30px;
            font-size: 14px;
            border-bottom: 1px solid #444;
        }
        
        .stat {
            color: #999;
        }
        
        .stat strong {
            color: #fff;
        }
        
        .request-list {
            padding: 20px 30px;
        }
        
        .request-item {
            background: #2a2a2a;
            border: 1px solid #444;
            border-radius: 8px;
            margin-bottom: 15px;
            overflow: hidden;
            transition: all 0.3s ease;
        }
        
        .request-item:hover {
            border-color: #ff6b6b;
            transform: translateX(5px);
        }
        
        .request-header {
            padding: 15px 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            cursor: pointer;
            background: #333;
        }
        
        .request-header:hover {
            background: #3a3a3a;
        }
        
        .request-method {
            padding: 4px 10px;
            border-radius: 4px;
            font-weight: 600;
            font-size: 12px;
            text-transform: uppercase;
        }
        
        .method-GET { background: #28a745; }
        .method-POST { background: #ffc107; color: #000; }
        .method-PUT { background: #17a2b8; }
        .method-DELETE { background: #dc3545; }
        
        .request-url {
            flex: 1;
            margin: 0 15px;
            font-family: 'Monaco', monospace;
            font-size: 13px;
            color: #4a90e2;
            word-break: break-all;
        }
        
        .request-status {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .status-code {
            padding: 4px 10px;
            border-radius: 4px;
            font-weight: 600;
            font-size: 12px;
        }
        
        .status-2xx { background: #28a745; }
        .status-3xx { background: #17a2b8; }
        .status-4xx { background: #ffc107; color: #000; }
        .status-5xx { background: #dc3545; }
        
        .request-details {
            display: none;
            padding: 20px;
            background: #1a1a1a;
            border-top: 1px solid #444;
        }
        
        .request-item.expanded .request-details {
            display: block;
        }
        
        .detail-section {
            margin-bottom: 20px;
        }
        
        .detail-title {
            color: #ff6b6b;
            font-weight: 600;
            margin-bottom: 10px;
            font-size: 14px;
            text-transform: uppercase;
        }
        
        .headers-table {
            background: #2a2a2a;
            border-radius: 5px;
            padding: 10px;
            font-size: 13px;
        }
        
        .header-row {
            display: flex;
            padding: 5px 0;
            border-bottom: 1px solid #333;
        }
        
        .header-row:last-child {
            border-bottom: none;
        }
        
        .header-name {
            width: 200px;
            color: #4a90e2;
            font-weight: 500;
        }
        
        .header-value {
            flex: 1;
            color: #999;
            word-break: break-all;
            font-family: 'Monaco', monospace;
            font-size: 12px;
        }
        
        .cookie-highlight {
            color: #ffc107;
            font-weight: 600;
        }
        
        .body-content {
            background: #2a2a2a;
            border-radius: 5px;
            padding: 15px;
            font-family: 'Monaco', monospace;
            font-size: 12px;
            white-space: pre-wrap;
            word-break: break-all;
            max-height: 400px;
            overflow-y: auto;
            color: #999;
        }
        
        .expand-icon {
            margin-left: 10px;
            transition: transform 0.3s;
        }
        
        .request-item.expanded .expand-icon {
            transform: rotate(90deg);
        }
        
        .timestamp {
            color: #666;
            font-size: 12px;
        }
        
        .no-data {
            color: #666;
            font-style: italic;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🌐 Network Capture Viewer</h1>
        <p>${captureId}</p>
    </div>
    
    <div class="controls">
        <input type="text" class="search-box" id="searchBox" placeholder="Search URLs, headers, cookies, or response data...">
        <button class="filter-btn active" data-filter="all">All (${data.length})</button>
        <button class="filter-btn" data-filter="api">API Only</button>
        <button class="filter-btn" data-filter="cookies">With Cookies</button>
        <button class="filter-btn" data-filter="errors">Errors</button>
    </div>
    
    <div class="stats-bar">
        <div class="stat">Total Requests: <strong>${requests.length}</strong></div>
        <div class="stat">Total Responses: <strong>${responses.length}</strong></div>
        <div class="stat">With Cookies: <strong>${requests.filter(r => r.data.cookies).length}</strong></div>
        <div class="stat">API Calls: <strong>${requests.filter(r => r.data.url.includes('api/')).length}</strong></div>
    </div>
    
    <div class="request-list" id="requestList">
        ${requests.map((request, idx) => {
            // Find matching response
            const response = responses.find(r => r.data.url === request.data.url);
            const hasCookies = request.data.cookies ? 'has-cookies' : '';
            const isApi = request.data.url.includes('api/') ? 'is-api' : '';
            const isError = response && response.data.status >= 400 ? 'is-error' : '';
            
            return `
            <div class="request-item ${hasCookies} ${isApi} ${isError}" data-index="${idx}">
                <div class="request-header" onclick="toggleRequest(${idx})">
                    <span class="request-method method-${request.data.method}">${request.data.method}</span>
                    <span class="request-url">${request.data.url}</span>
                    <div class="request-status">
                        ${response ? `<span class="status-code status-${Math.floor(response.data.status/100)}xx">${response.data.status}</span>` : '<span class="status-code">Pending</span>'}
                        <span class="timestamp">${new Date(request.data.timestamp).toLocaleTimeString()}</span>
                        <span class="expand-icon">▶</span>
                    </div>
                </div>
                <div class="request-details">
                    <div class="detail-section">
                        <div class="detail-title">Request Headers</div>
                        <div class="headers-table">
                            ${Object.entries(request.data.allHeaders || request.data.headers).map(([name, value]) => `
                                <div class="header-row">
                                    <div class="header-name">${name}</div>
                                    <div class="header-value ${name.toLowerCase() === 'cookie' ? 'cookie-highlight' : ''}">${value}</div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    
                    ${request.data.postData ? `
                    <div class="detail-section">
                        <div class="detail-title">Request Body</div>
                        <div class="body-content">${request.data.postData}</div>
                    </div>
                    ` : ''}
                    
                    ${response ? `
                    <div class="detail-section">
                        <div class="detail-title">Response Headers</div>
                        <div class="headers-table">
                            ${Object.entries(response.data.headers).map(([name, value]) => `
                                <div class="header-row">
                                    <div class="header-name">${name}</div>
                                    <div class="header-value ${name.toLowerCase() === 'set-cookie' ? 'cookie-highlight' : ''}">${value}</div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    
                    ${response.data.body ? `
                    <div class="detail-section">
                        <div class="detail-title">Response Body</div>
                        <div class="body-content">${typeof response.data.body === 'object' ? JSON.stringify(response.data.body, null, 2) : response.data.body}</div>
                    </div>
                    ` : '<div class="no-data">No response body</div>'}
                    ` : '<div class="no-data">No response captured</div>'}
                </div>
            </div>
            `;
        }).join('')}
    </div>
    
    <script>
        function toggleRequest(index) {
            const item = document.querySelector(\`[data-index="\${index}"]\`);
            item.classList.toggle('expanded');
        }
        
        // Search functionality
        document.getElementById('searchBox').addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const items = document.querySelectorAll('.request-item');
            
            items.forEach(item => {
                const text = item.textContent.toLowerCase();
                item.style.display = text.includes(searchTerm) ? 'block' : 'none';
            });
        });
        
        // Filter buttons
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                const filter = btn.dataset.filter;
                const items = document.querySelectorAll('.request-item');
                
                items.forEach(item => {
                    if (filter === 'all') {
                        item.style.display = 'block';
                    } else if (filter === 'api') {
                        item.style.display = item.classList.contains('is-api') ? 'block' : 'none';
                    } else if (filter === 'cookies') {
                        item.style.display = item.classList.contains('has-cookies') ? 'block' : 'none';
                    } else if (filter === 'errors') {
                        item.style.display = item.classList.contains('is-error') ? 'block' : 'none';
                    }
                });
            });
        });
    </script>
</body>
</html>`;
        
        res.send(html);
    } catch (error) {
        res.status(404).send('Capture not found: ' + error.message);
    }
});

// Network analyzer view
app.get('/network-analyzer/:id', async (req, res) => {
    const captureId = req.params.id;
    const filePath = path.join(__dirname, 'captures', 'network', 'raw', `${captureId}.json`);
    
    try {
        const data = JSON.parse(await fs.readFile(filePath, 'utf8'));
        
        // Analyze the capture
        const analysis = analyzeNetworkCapture(data);
        
        const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Network Analysis - ${captureId}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f5f5f5;
            margin: 0;
            padding: 20px;
        }
        
        .header {
            background: linear-gradient(135deg, #ff6b6b 0%, #ffa500 100%);
            color: white;
            padding: 30px;
            border-radius: 10px;
            margin-bottom: 30px;
        }
        
        .section {
            background: white;
            padding: 25px;
            border-radius: 8px;
            margin-bottom: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        
        .section h2 {
            color: #333;
            margin-bottom: 20px;
            border-bottom: 2px solid #ff6b6b;
            padding-bottom: 10px;
        }
        
        .auth-flow {
            display: flex;
            align-items: center;
            gap: 20px;
            padding: 15px;
            background: #f8f9fa;
            border-radius: 8px;
            margin-bottom: 15px;
        }
        
        .auth-step {
            flex: 1;
            padding: 15px;
            background: white;
            border-radius: 8px;
            border-left: 4px solid #28a745;
        }
        
        .cookie-list {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 15px;
        }
        
        .cookie-item {
            padding: 12px;
            background: #f8f9fa;
            border-radius: 6px;
            border-left: 3px solid #007bff;
        }
        
        .cookie-name {
            font-weight: 600;
            color: #333;
        }
        
        .cookie-value {
            font-size: 12px;
            color: #666;
            word-break: break-all;
        }
        
        .curl-command {
            background: #2d2d2d;
            color: #f8f8f2;
            padding: 20px;
            border-radius: 8px;
            font-family: 'Monaco', 'Menlo', monospace;
            font-size: 13px;
            overflow-x: auto;
            position: relative;
        }
        
        .copy-btn {
            position: absolute;
            top: 10px;
            right: 10px;
            background: #4a90e2;
            color: white;
            border: none;
            padding: 8px 15px;
            border-radius: 5px;
            cursor: pointer;
        }
        
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 20px;
        }
        
        .stat-card {
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border-radius: 8px;
            text-align: center;
        }
        
        .stat-value {
            font-size: 2em;
            font-weight: 700;
        }
        
        .stat-label {
            font-size: 0.9em;
            opacity: 0.9;
            margin-top: 5px;
        }
        
        .request-timeline {
            max-height: 400px;
            overflow-y: auto;
            border: 1px solid #dee2e6;
            border-radius: 8px;
        }
        
        .timeline-item {
            padding: 12px 15px;
            border-bottom: 1px solid #eee;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .timeline-item:hover {
            background: #f8f9fa;
        }
        
        .timeline-url {
            flex: 1;
            color: #333;
            font-size: 14px;
        }
        
        .timeline-method {
            padding: 4px 8px;
            background: #28a745;
            color: white;
            border-radius: 4px;
            font-size: 12px;
            margin-right: 10px;
        }
        
        .timeline-status {
            padding: 4px 8px;
            background: #17a2b8;
            color: white;
            border-radius: 4px;
            font-size: 12px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>📊 Network Capture Analysis</h1>
        <p>${captureId}</p>
    </div>
    
    <div class="stats-grid">
        <div class="stat-card">
            <div class="stat-value">${analysis.totalRequests}</div>
            <div class="stat-label">Total Requests</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${analysis.cookieCount}</div>
            <div class="stat-label">Unique Cookies</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${analysis.apiCalls}</div>
            <div class="stat-label">API Calls</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${analysis.authTokens}</div>
            <div class="stat-label">Auth Tokens</div>
        </div>
    </div>
    
    <div class="section">
        <h2>🔐 Authentication Flow</h2>
        ${analysis.authFlow}
    </div>
    
    <div class="section">
        <h2>🍪 Cookies Captured</h2>
        <div class="cookie-list">
            ${analysis.cookies}
        </div>
    </div>
    
    <div class="section">
        <h2>📋 Ready-to-use cURL Command</h2>
        <div class="curl-command">
            <button class="copy-btn" onclick="copyCurl()">Copy</button>
            <pre id="curlCommand">${analysis.curlCommand}</pre>
        </div>
    </div>
    
    <div class="section">
        <h2>📈 Request Timeline</h2>
        <div class="request-timeline">
            ${analysis.timeline}
        </div>
    </div>
    
    <script>
        function copyCurl() {
            const curl = document.getElementById('curlCommand').textContent;
            navigator.clipboard.writeText(curl);
            alert('cURL command copied to clipboard!');
        }
    </script>
</body>
</html>`;
        
        res.send(html);
    } catch (error) {
        res.status(404).send('Capture not found');
    }
});

// Analyze network capture data
function analyzeNetworkCapture(data) {
    const requests = data.filter(item => item.type === 'request');
    const responses = data.filter(item => item.type === 'response');
    
    // Extract cookies
    const allCookies = new Map();
    requests.forEach(req => {
        if (req.data.cookies) {
            const cookies = req.data.cookies.split('; ');
            cookies.forEach(cookie => {
                const [name, value] = cookie.split('=');
                if (name && value) {
                    allCookies.set(name, value);
                }
            });
        }
    });
    
    // Find auth tokens
    const authTokens = [];
    allCookies.forEach((value, name) => {
        if (name.toLowerCase().includes('token') || 
            name.toLowerCase().includes('auth') ||
            name.toLowerCase().includes('session')) {
            authTokens.push(name);
        }
    });
    
    // Build auth flow
    const authFlow = requests
        .filter(req => req.data.url.includes('OAuth') || 
                      req.data.url.includes('Login') ||
                      req.data.url.includes('authenticate'))
        .slice(0, 3)
        .map((req, idx) => `
            <div class="auth-step">
                <strong>Step ${idx + 1}</strong><br>
                ${req.data.method} ${req.data.url.replace('https://mychart.bswhealth.com/', '')}
            </div>
        `).join('') || '<p>No authentication flow detected</p>';
    
    // Build cookie list HTML
    const cookiesHtml = Array.from(allCookies.entries())
        .slice(0, 12)
        .map(([name, value]) => `
            <div class="cookie-item">
                <div class="cookie-name">${name}</div>
                <div class="cookie-value">${value.substring(0, 50)}...</div>
            </div>
        `).join('');
    
    // Generate cURL command for the last API request
    const lastApiRequest = requests
        .filter(req => req.data.url.includes('api/'))
        .pop();
    
    let curlCommand = 'No API requests found';
    if (lastApiRequest) {
        const cookies = allCookies.size > 0 
            ? Array.from(allCookies.entries()).map(([k, v]) => `${k}=${v}`).join('; ')
            : '';
        
        curlCommand = `curl -X ${lastApiRequest.data.method} '${lastApiRequest.data.url}' \\
  -H 'Cookie: ${cookies.substring(0, 200)}...' \\
  -H 'Content-Type: application/json' \\
  -H 'X-Requested-With: XMLHttpRequest'`;
        
        if (lastApiRequest.data.postData) {
            curlCommand += ` \\
  --data '${lastApiRequest.data.postData}'`;
        }
    }
    
    // Build timeline
    const timeline = requests.slice(0, 20).map(req => `
        <div class="timeline-item">
            <span class="timeline-method">${req.data.method}</span>
            <span class="timeline-url">${req.data.url.replace('https://mychart.bswhealth.com/', '').substring(0, 60)}...</span>
            <span class="timeline-status">→</span>
        </div>
    `).join('');
    
    return {
        totalRequests: requests.length,
        cookieCount: allCookies.size,
        apiCalls: requests.filter(r => r.data.url.includes('api/')).length,
        authTokens: authTokens.length,
        authFlow: authFlow,
        cookies: cookiesHtml,
        curlCommand: curlCommand,
        timeline: timeline
    };
}

// Initialize and start server
async function init() {
    await ensureDirectories();
    
    app.listen(PORT, () => {
        console.log(`\n🏥 Baylor Capture Suite`);
        console.log(`🚀 Server running at http://localhost:${PORT}`);
        console.log(`📁 Captures saved to: ${path.join(__dirname, 'captures')}`);
        console.log('\nOpen in your browser to start capturing!\n');
    });
}

// Clean shutdown
process.on('SIGINT', async () => {
    console.log('\n\n🛑 Shutting down...');
    if (browserInstance) {
        await browserInstance.close();
    }
    process.exit(0);
});

// Start the server
init().catch(console.error);