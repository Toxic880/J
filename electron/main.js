/**
 * JARVIS Electron Main Process
 * 
 * Creates a desktop application with:
 * - System tray integration
 * - Global hotkeys
 * - Auto-start on login
 * - Native notifications
 * - Background server management
 * 
 * === PHASE 3: SYSTEM INTEGRATION ===
 * Added "The Hands" - direct OS control:
 * - Launch/close applications
 * - Power management (lock, sleep, shutdown)
 * - Volume/media control
 * - System info (battery, CPU, memory)
 * - Clipboard access
 * 
 * === PHASE 6: THE REFLEX SYSTEM ===
 * Added instant command execution:
 * - DeviceRegistry for persistent device management
 * - The Pulse: real-time device state polling
 * - Reflex Engine: regex-based instant commands (no LLM latency)
 * 
 * === PHASE 8: PRODUCTION GRADE ===
 * - Worker threads for heavy operations (no UI freeze)
 * - Piper TTS for human-sounding voice
 * - AEC improvements for self-hearing prevention
 * 
 * === PHASE 10: 30-SECOND EXPERIENCE ===
 * - First launch wizard
 * - Auto-download dependencies (Piper, voice models)
 * - Zero-config startup
 */

const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, nativeImage, Notification, shell, clipboard } = require('electron');
const path = require('path');
const { spawn, exec, execSync } = require('child_process');
const { Worker } = require('worker_threads');
const fs = require('fs');
const os = require('os');

// Phase 6: Device Registry & Reflex Engine
const { DeviceRegistry, ReflexEngine } = require('./services/DeviceRegistry');

// Phase 10: Dependency Downloader
let DependencyDownloader = null;
try {
  const setup = require('./setup/DependencyDownloader');
  DependencyDownloader = setup.DependencyDownloader;
} catch (e) {
  console.log('[Main] DependencyDownloader not available');
}

// Phase 8: Piper TTS
let piperTTS = null;
try {
  const { PiperTTS } = require('./tts/PiperTTS');
  piperTTS = new PiperTTS();
} catch (e) {
  console.log('[Main] Piper TTS not available, will use fallback');
}

// Phase 8: Worker thread for heavy operations
let deviceWorker = null;
let workerMessageId = 0;
const workerCallbacks = new Map();

function initWorker() {
  const workerPath = path.join(__dirname, 'workers', 'deviceWorker.js');
  
  if (!fs.existsSync(workerPath)) {
    console.log('[Main] Worker not found, heavy operations will run on main thread');
    return;
  }
  
  deviceWorker = new Worker(workerPath);
  
  deviceWorker.on('message', (message) => {
    if (message.type === 'ready') {
      console.log('[Main] Device worker ready');
      return;
    }
    
    const callback = workerCallbacks.get(message.id);
    if (callback) {
      callback(message);
      workerCallbacks.delete(message.id);
    }
  });
  
  deviceWorker.on('error', (err) => {
    console.error('[Main] Worker error:', err);
  });
  
  deviceWorker.on('exit', (code) => {
    if (code !== 0) {
      console.error('[Main] Worker exited with code:', code);
    }
    deviceWorker = null;
  });
}

function workerCall(type, data) {
  return new Promise((resolve) => {
    if (!deviceWorker) {
      // Fallback: run on main thread (blocks UI briefly)
      resolve({ success: false, error: 'Worker not available' });
      return;
    }
    
    const id = ++workerMessageId;
    workerCallbacks.set(id, resolve);
    deviceWorker.postMessage({ id, type, data });
    
    // Timeout after 30s
    setTimeout(() => {
      if (workerCallbacks.has(id)) {
        workerCallbacks.delete(id);
        resolve({ success: false, error: 'Timeout' });
      }
    }, 30000);
  });
}

// =============================================================================
// CONFIGURATION
// =============================================================================

// Use app.isPackaged to detect if running from built exe or dev
const isDev = !app.isPackaged;
const APP_NAME = 'JARVIS';
const SERVER_PORT = 3001;
// Vite dev server runs on 3000
const UI_PORT = 3000;

// =============================================================================
// GLOBAL STATE
// =============================================================================

let mainWindow = null;
let tray = null;
let serverProcess = null;
let isQuitting = false;

// Phase 6: Global instances
let deviceRegistry = null;
let reflexEngine = null;

// =============================================================================
// WINDOW MANAGEMENT
// =============================================================================

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 400,
    minHeight: 600,
    title: APP_NAME,
    icon: getIconPath(),
    backgroundColor: '#0a0a0a',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    show: false, // Don't show until ready
  });

  // Load the UI
  if (isDev) {
    mainWindow.loadURL(`http://localhost:${UI_PORT}`);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Show when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    
    // Show welcome notification on first launch
    const firstLaunch = !fs.existsSync(getConfigPath());
    if (firstLaunch) {
      showNotification('Welcome to JARVIS', 'Press Ctrl+Shift+J to activate voice control');
    }
  });

  // Minimize to tray instead of closing
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      
      // Show tray notification on first minimize
      const hideNotified = store.get('hideNotified', false);
      if (!hideNotified) {
        showNotification('JARVIS is still running', 'Click the tray icon to open');
        store.set('hideNotified', true);
      }
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function showWindow() {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  } else {
    createWindow();
  }
}

function toggleWindow() {
  if (mainWindow && mainWindow.isVisible()) {
    mainWindow.hide();
  } else {
    showWindow();
  }
}

// =============================================================================
// SYSTEM TRAY
// =============================================================================

function createTray() {
  const icon = nativeImage.createFromPath(getTrayIconPath());
  
  // Resize for tray (16x16 on most systems)
  const trayIcon = icon.resize({ width: 16, height: 16 });
  
  tray = new Tray(trayIcon);
  tray.setToolTip(APP_NAME);
  
  updateTrayMenu();
  
  // Double-click to show window
  tray.on('double-click', () => {
    showWindow();
  });
}

function updateTrayMenu(serverRunning = true) {
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open JARVIS',
      click: showWindow,
    },
    {
      type: 'separator',
    },
    {
      label: 'Voice Activation',
      accelerator: 'CmdOrCtrl+Shift+J',
      click: () => {
        showWindow();
        mainWindow?.webContents.send('voice-activate');
      },
    },
    {
      label: 'Quick Command...',
      accelerator: 'CmdOrCtrl+Shift+K',
      click: showQuickCommand,
    },
    {
      type: 'separator',
    },
    {
      label: serverRunning ? '● Server Running' : '○ Server Stopped',
      enabled: false,
    },
    {
      label: serverRunning ? 'Restart Server' : 'Start Server',
      click: () => {
        stopServer();
        startServer();
      },
    },
    {
      type: 'separator',
    },
    {
      label: 'Start at Login',
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (menuItem) => {
        app.setLoginItemSettings({
          openAtLogin: menuItem.checked,
          openAsHidden: true,
        });
      },
    },
    {
      label: 'Settings',
      click: () => {
        showWindow();
        mainWindow?.webContents.send('open-settings');
      },
    },
    {
      type: 'separator',
    },
    {
      label: 'Quit JARVIS',
      accelerator: 'CmdOrCtrl+Q',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);
  
  tray.setContextMenu(contextMenu);
}

// =============================================================================
// QUICK COMMAND (Mini command prompt)
// =============================================================================

let quickCommandWindow = null;

function showQuickCommand() {
  if (quickCommandWindow) {
    quickCommandWindow.focus();
    return;
  }
  
  quickCommandWindow = new BrowserWindow({
    width: 600,
    height: 80,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  
  // Center on screen
  const { screen } = require('electron');
  const display = screen.getPrimaryDisplay();
  const { width, height } = display.workAreaSize;
  quickCommandWindow.setPosition(
    Math.round((width - 600) / 2),
    Math.round(height / 4)
  );
  
  quickCommandWindow.loadFile(path.join(__dirname, 'quick-command.html'));
  
  quickCommandWindow.on('blur', () => {
    quickCommandWindow?.close();
  });
  
  quickCommandWindow.on('closed', () => {
    quickCommandWindow = null;
  });
}

// =============================================================================
// SERVER MANAGEMENT
// =============================================================================

function startServer() {
  if (serverProcess) {
    console.log('[Electron] Server already running');
    return;
  }
  
  const serverPath = isDev 
    ? path.join(__dirname, '../server')
    : path.join(process.resourcesPath, 'server');
  
  // Check if we can run the server
  const serverEntry = path.join(serverPath, 'dist/index.js');
  if (!fs.existsSync(serverEntry)) {
    // Server not built - that's OK, it's optional
    console.log('[Electron] Server not available (optional) - JARVIS will work without it');
    console.log('[Electron] Server is only needed for OAuth tokens and ElevenLabs TTS');
    return;
  }
  
  console.log('[Electron] Starting server from:', serverPath);
  
  serverProcess = spawn('node', [serverEntry], {
    cwd: serverPath,
    env: {
      ...process.env,
      NODE_ENV: isDev ? 'development' : 'production',
      PORT: SERVER_PORT.toString(),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  
  serverProcess.stdout.on('data', (data) => {
    console.log('[Server]', data.toString().trim());
  });
  
  serverProcess.stderr.on('data', (data) => {
    console.error('[Server Error]', data.toString().trim());
  });
  
  serverProcess.on('close', (code) => {
    console.log('[Electron] Server exited with code:', code);
    serverProcess = null;
    updateTrayMenu(false);
  });
  
  serverProcess.on('error', (err) => {
    console.error('[Electron] Server error:', err);
    serverProcess = null;
    updateTrayMenu(false);
  });
  
  // Update tray after a moment to show running status
  setTimeout(() => {
    updateTrayMenu(serverProcess !== null);
  }, 2000);
}

function stopServer() {
  if (serverProcess) {
    console.log('[Electron] Stopping server...');
    serverProcess.kill();
    serverProcess = null;
    updateTrayMenu(false);
  }
}

// =============================================================================
// GLOBAL SHORTCUTS
// =============================================================================

function registerShortcuts() {
  // Voice activation
  globalShortcut.register('CommandOrControl+Shift+J', () => {
    showWindow();
    mainWindow?.webContents.send('voice-activate');
  });
  
  // Quick command
  globalShortcut.register('CommandOrControl+Shift+K', () => {
    showQuickCommand();
  });
  
  // Toggle window
  globalShortcut.register('CommandOrControl+Shift+H', () => {
    toggleWindow();
  });
}

// =============================================================================
// IPC HANDLERS
// =============================================================================

function setupIPC() {
  // Get server status
  ipcMain.handle('get-server-status', () => {
    return {
      running: serverProcess !== null,
      port: SERVER_PORT,
    };
  });
  
  // Restart server
  ipcMain.handle('restart-server', () => {
    stopServer();
    startServer();
    return true;
  });
  
  // Get app info
  ipcMain.handle('get-app-info', () => {
    return {
      version: app.getVersion(),
      platform: process.platform,
      isDev,
    };
  });
  
  // Show notification
  ipcMain.handle('show-notification', (_, { title, body }) => {
    showNotification(title, body);
  });
  
  // Open external link
  ipcMain.handle('open-external', (_, url) => {
    shell.openExternal(url);
  });
  
  // =========================================================================
  // PHASE 3: SYSTEM CONTROL HANDLERS
  // =========================================================================
  
  // --- GENERIC COMMAND EXECUTION ---
  ipcMain.handle('system:exec', async (_, command) => {
    return new Promise((resolve) => {
      exec(command, { timeout: 30000 }, (error, stdout, stderr) => {
        resolve({ 
          success: !error, 
          output: stdout || stderr,
          error: error?.message 
        });
      });
    });
  });
  
  // --- APPLICATION CONTROL ---
  ipcMain.handle('system:launch-app', async (_, appName) => {
    const platform = os.platform();
    let cmd = '';
    
    // Normalize common app names
    const appMap = {
      'spotify': platform === 'win32' ? 'Spotify' : platform === 'darwin' ? 'Spotify' : 'spotify',
      'chrome': platform === 'win32' ? 'chrome' : platform === 'darwin' ? 'Google Chrome' : 'google-chrome',
      'firefox': platform === 'win32' ? 'firefox' : platform === 'darwin' ? 'Firefox' : 'firefox',
      'vscode': platform === 'win32' ? 'code' : platform === 'darwin' ? 'Visual Studio Code' : 'code',
      'terminal': platform === 'win32' ? 'cmd' : platform === 'darwin' ? 'Terminal' : 'gnome-terminal',
      'explorer': platform === 'win32' ? 'explorer' : platform === 'darwin' ? 'Finder' : 'nautilus',
      'notepad': platform === 'win32' ? 'notepad' : platform === 'darwin' ? 'TextEdit' : 'gedit',
      'calculator': platform === 'win32' ? 'calc' : platform === 'darwin' ? 'Calculator' : 'gnome-calculator',
      'settings': platform === 'win32' ? 'ms-settings:' : platform === 'darwin' ? 'System Preferences' : 'gnome-control-center',
    };
    
    const resolvedApp = appMap[appName.toLowerCase()] || appName;
    
    try {
      if (platform === 'win32') {
        // Windows: try start command
        cmd = `start "" "${resolvedApp}"`;
      } else if (platform === 'darwin') {
        // macOS: use open -a
        cmd = `open -a "${resolvedApp}"`;
      } else {
        // Linux: try various methods
        cmd = `xdg-open "${resolvedApp}" || ${resolvedApp} &`;
      }
      
      exec(cmd);
      console.log(`[System] Launched: ${appName}`);
      return { success: true, app: appName };
    } catch (error) {
      console.error(`[System] Failed to launch ${appName}:`, error);
      return { success: false, error: error.message };
    }
  });
  
  ipcMain.handle('system:close-app', async (_, appName) => {
    const platform = os.platform();
    try {
      if (platform === 'win32') {
        exec(`taskkill /IM "${appName}.exe" /F`);
      } else if (platform === 'darwin') {
        exec(`osascript -e 'quit app "${appName}"'`);
      } else {
        exec(`pkill -f "${appName}"`);
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
  
  ipcMain.handle('system:get-active-window', async () => {
    const platform = os.platform();
    try {
      if (platform === 'win32') {
        // Would need powershell or external tool
        return { title: 'Unknown', app: 'Unknown' };
      } else if (platform === 'darwin') {
        const result = execSync(`osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true'`);
        return { app: result.toString().trim() };
      } else {
        const result = execSync(`xdotool getactivewindow getwindowname`);
        return { title: result.toString().trim() };
      }
    } catch {
      return { title: 'Unknown', app: 'Unknown' };
    }
  });
  
  ipcMain.handle('system:get-running-apps', async () => {
    const platform = os.platform();
    try {
      if (platform === 'win32') {
        const result = execSync('tasklist /FO CSV /NH');
        const apps = result.toString().split('\n')
          .slice(0, 20)
          .map(line => line.split(',')[0]?.replace(/"/g, ''))
          .filter(Boolean);
        return apps;
      } else if (platform === 'darwin') {
        const result = execSync(`ps -eo comm | head -20`);
        return result.toString().split('\n').filter(Boolean);
      } else {
        const result = execSync(`ps -eo comm | head -20`);
        return result.toString().split('\n').filter(Boolean);
      }
    } catch {
      return [];
    }
  });
  
  // --- MEDIA CONTROL ---
  ipcMain.handle('system:set-volume', async (_, level) => {
    const platform = os.platform();
    const vol = Math.max(0, Math.min(100, level));
    
    try {
      if (platform === 'win32') {
        // Windows: Use PowerShell
        exec(`powershell -c "(New-Object -ComObject WScript.Shell).SendKeys([char]173)"`, () => {
          // Workaround: set volume via nircmd if available, otherwise use powershell audio
          exec(`powershell -c "$vol = [math]::Round(${vol} * 65535 / 100); (Get-WmiObject -Query 'Select * from Win32_SoundDevice').SetVolume($vol)"`);
        });
      } else if (platform === 'darwin') {
        exec(`osascript -e 'set volume output volume ${vol}'`);
      } else {
        exec(`amixer set Master ${vol}%`);
      }
      return { success: true, level: vol };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
  
  ipcMain.handle('system:get-volume', async () => {
    const platform = os.platform();
    try {
      if (platform === 'darwin') {
        const result = execSync(`osascript -e 'output volume of (get volume settings)'`);
        return { level: parseInt(result.toString().trim()) };
      } else if (platform === 'linux') {
        const result = execSync(`amixer get Master | grep -oP '\\d+%' | head -1`);
        return { level: parseInt(result.toString()) };
      }
      return { level: 50 }; // Default fallback
    } catch {
      return { level: 50 };
    }
  });
  
  ipcMain.handle('system:mute', async () => {
    const platform = os.platform();
    if (platform === 'win32') {
      exec(`powershell -c "(New-Object -ComObject WScript.Shell).SendKeys([char]173)"`);
    } else if (platform === 'darwin') {
      exec(`osascript -e 'set volume with output muted'`);
    } else {
      exec(`amixer set Master mute`);
    }
    return { success: true };
  });
  
  ipcMain.handle('system:unmute', async () => {
    const platform = os.platform();
    if (platform === 'darwin') {
      exec(`osascript -e 'set volume without output muted'`);
    } else if (platform === 'linux') {
      exec(`amixer set Master unmute`);
    }
    return { success: true };
  });
  
  ipcMain.handle('system:media-play-pause', async () => {
    const platform = os.platform();
    if (platform === 'win32') {
      exec(`powershell -c "(New-Object -ComObject WScript.Shell).SendKeys([char]179)"`);
    } else if (platform === 'darwin') {
      exec(`osascript -e 'tell application "System Events" to key code 16 using command down'`);
    } else {
      exec(`dbus-send --print-reply --dest=org.mpris.MediaPlayer2.spotify /org/mpris/MediaPlayer2 org.mpris.MediaPlayer2.Player.PlayPause`);
    }
    return { success: true };
  });
  
  ipcMain.handle('system:media-next', async () => {
    const platform = os.platform();
    if (platform === 'win32') {
      exec(`powershell -c "(New-Object -ComObject WScript.Shell).SendKeys([char]176)"`);
    } else if (platform === 'darwin') {
      exec(`osascript -e 'tell application "System Events" to key code 17 using command down'`);
    } else {
      exec(`dbus-send --print-reply --dest=org.mpris.MediaPlayer2.spotify /org/mpris/MediaPlayer2 org.mpris.MediaPlayer2.Player.Next`);
    }
    return { success: true };
  });
  
  ipcMain.handle('system:media-prev', async () => {
    const platform = os.platform();
    if (platform === 'win32') {
      exec(`powershell -c "(New-Object -ComObject WScript.Shell).SendKeys([char]177)"`);
    } else if (platform === 'darwin') {
      exec(`osascript -e 'tell application "System Events" to key code 18 using command down'`);
    } else {
      exec(`dbus-send --print-reply --dest=org.mpris.MediaPlayer2.spotify /org/mpris/MediaPlayer2 org.mpris.MediaPlayer2.Player.Previous`);
    }
    return { success: true };
  });
  
  // --- POWER MANAGEMENT ---
  ipcMain.handle('system:lock', async () => {
    const platform = os.platform();
    console.log('[System] Locking workstation...');
    
    if (platform === 'win32') {
      exec('rundll32.exe user32.dll,LockWorkStation');
    } else if (platform === 'darwin') {
      exec('pmset displaysleepnow');
    } else {
      exec('loginctl lock-session || gnome-screensaver-command -l');
    }
    return { success: true };
  });
  
  ipcMain.handle('system:sleep', async () => {
    const platform = os.platform();
    console.log('[System] Entering sleep mode...');
    
    if (platform === 'win32') {
      exec('rundll32.exe powrprof.dll,SetSuspendState 0,1,0');
    } else if (platform === 'darwin') {
      exec('pmset sleepnow');
    } else {
      exec('systemctl suspend');
    }
    return { success: true };
  });
  
  ipcMain.handle('system:shutdown', async () => {
    const platform = os.platform();
    console.log('[System] Initiating shutdown...');
    
    if (platform === 'win32') {
      exec('shutdown /s /t 60 /c "JARVIS: System shutdown in 60 seconds"');
    } else if (platform === 'darwin') {
      exec('osascript -e \'tell app "System Events" to shut down\'');
    } else {
      exec('shutdown -h +1');
    }
    return { success: true, message: 'Shutdown scheduled in 60 seconds' };
  });
  
  ipcMain.handle('system:restart', async () => {
    const platform = os.platform();
    console.log('[System] Initiating restart...');
    
    if (platform === 'win32') {
      exec('shutdown /r /t 60 /c "JARVIS: System restart in 60 seconds"');
    } else if (platform === 'darwin') {
      exec('osascript -e \'tell app "System Events" to restart\'');
    } else {
      exec('shutdown -r +1');
    }
    return { success: true, message: 'Restart scheduled in 60 seconds' };
  });
  
  // --- DISPLAY CONTROL ---
  ipcMain.handle('system:set-brightness', async (_, level) => {
    const platform = os.platform();
    const brightness = Math.max(0, Math.min(100, level));
    
    try {
      if (platform === 'darwin') {
        exec(`osascript -e 'tell application "System Events" to set brightness to ${brightness / 100}'`);
      } else if (platform === 'linux') {
        exec(`xrandr --output $(xrandr | grep " connected" | cut -d" " -f1) --brightness ${brightness / 100}`);
      }
      // Windows requires external tools or WMI
      return { success: true, level: brightness };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
  
  ipcMain.handle('system:get-brightness', async () => {
    return { level: 100 }; // Placeholder - real impl needs platform-specific code
  });
  
  // --- HARDWARE INFO ---
  ipcMain.handle('system:get-battery', async () => {
    const platform = os.platform();
    try {
      if (platform === 'darwin') {
        const result = execSync(`pmset -g batt | grep -Eo '\\d+%'`);
        const level = parseInt(result.toString());
        const charging = execSync(`pmset -g batt`).toString().includes('AC Power');
        return { level, charging, hasBattery: true };
      } else if (platform === 'linux') {
        const level = parseInt(fs.readFileSync('/sys/class/power_supply/BAT0/capacity', 'utf8'));
        const status = fs.readFileSync('/sys/class/power_supply/BAT0/status', 'utf8').trim();
        return { level, charging: status === 'Charging', hasBattery: true };
      } else if (platform === 'win32') {
        const result = execSync('WMIC Path Win32_Battery Get EstimatedChargeRemaining');
        const level = parseInt(result.toString().match(/\d+/)?.[0] || '100');
        return { level, charging: false, hasBattery: true };
      }
    } catch {
      return { level: 100, charging: true, hasBattery: false };
    }
    return { level: 100, charging: true, hasBattery: false };
  });
  
  ipcMain.handle('system:get-info', async () => {
    return {
      platform: os.platform(),
      arch: os.arch(),
      hostname: os.hostname(),
      username: os.userInfo().username,
      homedir: os.homedir(),
      cpus: os.cpus().length,
      totalMemory: Math.round(os.totalmem() / (1024 * 1024 * 1024)), // GB
      freeMemory: Math.round(os.freemem() / (1024 * 1024 * 1024)), // GB
      uptime: Math.round(os.uptime() / 3600), // Hours
    };
  });
  
  ipcMain.handle('system:get-cpu', async () => {
    const cpus = os.cpus();
    const avgLoad = os.loadavg()[0]; // 1 minute load average
    return {
      cores: cpus.length,
      model: cpus[0]?.model || 'Unknown',
      speed: cpus[0]?.speed || 0,
      loadAverage: avgLoad,
      usage: Math.min(100, Math.round((avgLoad / cpus.length) * 100)),
    };
  });
  
  ipcMain.handle('system:get-memory', async () => {
    const total = os.totalmem();
    const free = os.freemem();
    const used = total - free;
    return {
      total: Math.round(total / (1024 * 1024 * 1024)),
      free: Math.round(free / (1024 * 1024 * 1024)),
      used: Math.round(used / (1024 * 1024 * 1024)),
      usagePercent: Math.round((used / total) * 100),
    };
  });
  
  // --- CLIPBOARD ---
  ipcMain.handle('system:clipboard-write', async (_, text) => {
    clipboard.writeText(text);
    return { success: true };
  });
  
  ipcMain.handle('system:clipboard-read', async () => {
    return { text: clipboard.readText() };
  });
  
  // --- FILE SYSTEM ---
  ipcMain.handle('system:open-file', async (_, filePath) => {
    try {
      await shell.openPath(filePath);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
  
  ipcMain.handle('system:open-folder', async (_, folderPath) => {
    try {
      shell.showItemInFolder(folderPath);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
  
  // --- NOTIFICATIONS ---
  ipcMain.handle('system:notification', async (_, { title, body, icon }) => {
    showNotification(title, body);
    return { success: true };
  });
  
  // =========================================================================
  // PHASE 7: BARGE-IN & DESKTOP VISION
  // =========================================================================
  
  // Store original volume for ducking
  let originalVolume = null;
  
  /**
   * AUDIO DUCKING - Lower system volume when JARVIS is listening
   * Called when wake word detected -> duck to 20%
   * Called when interaction ends -> restore to original
   */
  ipcMain.handle('system:duck-audio', async (_, shouldDuck) => {
    const platform = process.platform;
    
    try {
      if (shouldDuck) {
        // Save original volume first (only if we haven't already)
        if (originalVolume === null) {
          if (platform === 'win32') {
            // Windows: Use nircmd or PowerShell
            try {
              const result = execSync('powershell -command "(Get-AudioDevice -PlaybackVolume).Volume"', { encoding: 'utf8' });
              originalVolume = parseInt(result.trim()) || 100;
            } catch (e) {
              originalVolume = 100;
            }
          } else if (platform === 'darwin') {
            // macOS: Use osascript
            try {
              const result = execSync('osascript -e "output volume of (get volume settings)"', { encoding: 'utf8' });
              originalVolume = parseInt(result.trim()) || 100;
            } catch (e) {
              originalVolume = 100;
            }
          } else {
            // Linux: Use amixer
            try {
              const result = execSync("amixer get Master | grep -oP '\\d+%' | head -1 | tr -d '%'", { encoding: 'utf8' });
              originalVolume = parseInt(result.trim()) || 100;
            } catch (e) {
              originalVolume = 100;
            }
          }
        }
        
        // Duck to 20%
        const duckLevel = 20;
        
        if (platform === 'win32') {
          exec(`powershell -command "(Get-AudioDevice -PlaybackVolume).Volume = ${duckLevel}"`);
        } else if (platform === 'darwin') {
          execSync(`osascript -e "set volume output volume ${duckLevel}"`);
        } else {
          execSync(`amixer set Master ${duckLevel}%`);
        }
        
        console.log(`[Audio] Ducked to ${duckLevel}% (was ${originalVolume}%)`);
        return { success: true, ducked: true, level: duckLevel };
        
      } else {
        // Restore original volume
        if (originalVolume !== null) {
          if (platform === 'win32') {
            exec(`powershell -command "(Get-AudioDevice -PlaybackVolume).Volume = ${originalVolume}"`);
          } else if (platform === 'darwin') {
            execSync(`osascript -e "set volume output volume ${originalVolume}"`);
          } else {
            execSync(`amixer set Master ${originalVolume}%`);
          }
          
          console.log(`[Audio] Restored to ${originalVolume}%`);
          const restored = originalVolume;
          originalVolume = null;
          return { success: true, ducked: false, level: restored };
        }
        
        return { success: true, ducked: false };
      }
    } catch (error) {
      console.error('[Audio] Ducking failed:', error.message);
      return { success: false, error: error.message };
    }
  });
  
  /**
   * SCREEN CAPTURE - Capture the active window or entire screen
   * Used for desktop vision ("What's on my screen?" / "How do I fix this error?")
   */
  ipcMain.handle('system:capture-screen', async (_, options = {}) => {
    const { desktopCapturer } = require('electron');
    
    try {
      // Get available sources
      const sources = await desktopCapturer.getSources({
        types: options.type === 'window' ? ['window'] : ['screen'],
        thumbnailSize: { 
          width: options.width || 1920, 
          height: options.height || 1080 
        },
        fetchWindowIcons: true,
      });
      
      if (sources.length === 0) {
        return { success: false, error: 'No capture sources available' };
      }
      
      // If capturing active window, try to find it
      let source = sources[0];
      
      if (options.type === 'window' && options.activeOnly) {
        // Try to find the focused window (not our own app)
        const focused = sources.find(s => 
          s.name !== 'JARVIS' && 
          s.name !== 'Electron' &&
          !s.name.includes('JARVIS')
        );
        if (focused) source = focused;
      }
      
      // Get the thumbnail as base64
      const thumbnail = source.thumbnail.toDataURL();
      
      // Get additional info
      const result = {
        success: true,
        image: thumbnail,
        sourceName: source.name,
        sourceId: source.id,
        width: source.thumbnail.getSize().width,
        height: source.thumbnail.getSize().height,
        capturedAt: Date.now(),
      };
      
      console.log(`[Vision] Captured screen: ${source.name} (${result.width}x${result.height})`);
      return result;
      
    } catch (error) {
      console.error('[Vision] Screen capture failed:', error);
      return { success: false, error: error.message };
    }
  });
  
  /**
   * Get list of capturable windows
   */
  ipcMain.handle('system:get-capture-sources', async (_, options = {}) => {
    const { desktopCapturer } = require('electron');
    
    try {
      const sources = await desktopCapturer.getSources({
        types: ['window', 'screen'],
        thumbnailSize: { width: 320, height: 180 },
        fetchWindowIcons: true,
      });
      
      return {
        success: true,
        sources: sources.map(s => ({
          id: s.id,
          name: s.name,
          thumbnail: s.thumbnail.toDataURL(),
          isScreen: s.id.startsWith('screen'),
        })),
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
  
  /**
   * HARDWARE INTERRUPT - Immediately stop all speech and cancel LLM generation
   * Called when user says "Stop" or wake word during speech
   */
  ipcMain.handle('system:hard-interrupt', async () => {
    console.log('[Interrupt] HARD INTERRUPT triggered');
    
    // Stop any audio playback
    if (mainWindow && !mainWindow.isDestroyed()) {
      // Send interrupt signal to renderer
      mainWindow.webContents.send('jarvis-interrupt');
    }
    
    return { success: true, timestamp: Date.now() };
  });

  // =========================================================================
  // PHASE 8: NATIVE SOUND FEEDBACK
  // =========================================================================
  
  /**
   * Play a sound effect natively (bypasses browser audio restrictions)
   * Uses system beep as fallback, or custom sounds if available
   */
  ipcMain.handle('system:play-sound', async (_, soundType) => {
    const platform = process.platform;
    
    try {
      // Define sound commands for each platform
      const soundCommands = {
        win32: {
          wake: 'powershell -c "[console]::beep(523,100);[console]::beep(659,150)"',
          processing: 'powershell -c "[console]::beep(120,50)"',
          success: 'powershell -c "[console]::beep(440,80);[console]::beep(554,80);[console]::beep(659,120)"',
          error: 'powershell -c "[console]::beep(440,150);[console]::beep(349,200)"',
          sleep: 'powershell -c "[console]::beep(392,200);[console]::beep(329,300)"',
          interrupt: 'powershell -c "[console]::beep(880,50)"',
        },
        darwin: {
          wake: 'afplay /System/Library/Sounds/Tink.aiff',
          processing: 'afplay /System/Library/Sounds/Pop.aiff',
          success: 'afplay /System/Library/Sounds/Glass.aiff',
          error: 'afplay /System/Library/Sounds/Basso.aiff',
          sleep: 'afplay /System/Library/Sounds/Purr.aiff',
          interrupt: 'afplay /System/Library/Sounds/Morse.aiff',
        },
        linux: {
          wake: 'paplay /usr/share/sounds/freedesktop/stereo/message.oga || beep -f 523 -l 100',
          processing: 'paplay /usr/share/sounds/freedesktop/stereo/dialog-information.oga || beep',
          success: 'paplay /usr/share/sounds/freedesktop/stereo/complete.oga || beep -f 659 -l 100',
          error: 'paplay /usr/share/sounds/freedesktop/stereo/dialog-error.oga || beep -f 200 -l 200',
          sleep: 'paplay /usr/share/sounds/freedesktop/stereo/suspend-error.oga || beep -f 329 -l 300',
          interrupt: 'beep -f 880 -l 50',
        },
      };
      
      const commands = soundCommands[platform] || soundCommands.linux;
      const command = commands[soundType];
      
      if (command) {
        exec(command, { timeout: 2000 }, (error) => {
          if (error) {
            console.warn(`[Sound] Failed to play ${soundType}:`, error.message);
          }
        });
      }
      
      return { success: true, soundType };
      
    } catch (error) {
      console.error('[Sound] Playback error:', error);
      return { success: false, error: error.message };
    }
  });

  // =========================================================================
  // PHASE 9: BULLETPROOF - HEALTH MONITORING & AUTO-RECOVERY
  // =========================================================================
  
  // Store for LM Studio config
  let lmStudioConfig = {
    url: 'http://127.0.0.1:1234',
    path: '', // Will be auto-detected or configured
  };
  
  /**
   * Auto-detect LM Studio installation path
   */
  function detectLMStudioPath() {
    const platform = process.platform;
    const possiblePaths = [];
    
    if (platform === 'win32') {
      possiblePaths.push(
        path.join(process.env.LOCALAPPDATA || '', 'LM Studio', 'LM Studio.exe'),
        path.join(process.env.PROGRAMFILES || '', 'LM Studio', 'LM Studio.exe'),
        'C:\\Program Files\\LM Studio\\LM Studio.exe',
      );
    } else if (platform === 'darwin') {
      possiblePaths.push(
        '/Applications/LM Studio.app/Contents/MacOS/LM Studio',
        path.join(os.homedir(), 'Applications', 'LM Studio.app', 'Contents', 'MacOS', 'LM Studio'),
      );
    } else {
      // Linux - AppImage or installed
      possiblePaths.push(
        path.join(os.homedir(), 'Applications', 'LM-Studio.AppImage'),
        '/usr/bin/lm-studio',
        '/opt/lm-studio/lm-studio',
      );
    }
    
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        console.log('[Health] Found LM Studio at:', p);
        return p;
      }
    }
    
    console.log('[Health] LM Studio path not auto-detected');
    return '';
  }
  
  // Auto-detect on startup
  lmStudioConfig.path = detectLMStudioPath();
  
  /**
   * Configure LM Studio connection
   */
  ipcMain.handle('health:configure-lm-studio', async (_, config) => {
    if (config.url) lmStudioConfig.url = config.url;
    if (config.path) lmStudioConfig.path = config.path;
    return { success: true, config: lmStudioConfig };
  });
  
  /**
   * Check if LM Studio is running
   */
  ipcMain.handle('health:check-lm-studio', async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(`${lmStudioConfig.url}/v1/models`, {
        signal: controller.signal,
      });
      
      clearTimeout(timeout);
      
      if (response.ok) {
        const data = await response.json();
        return { 
          healthy: true, 
          models: data.data || [],
          url: lmStudioConfig.url,
        };
      }
      
      return { healthy: false, error: `HTTP ${response.status}` };
      
    } catch (error) {
      return { 
        healthy: false, 
        error: error.message || 'Connection failed',
      };
    }
  });
  
  /**
   * Restart LM Studio
   */
  ipcMain.handle('health:restart-lm-studio', async () => {
    const platform = process.platform;
    
    // First, try to kill any existing LM Studio process
    try {
      if (platform === 'win32') {
        execSync('taskkill /F /IM "LM Studio.exe" 2>nul', { stdio: 'ignore' });
      } else if (platform === 'darwin') {
        execSync('pkill -9 "LM Studio" 2>/dev/null || true', { stdio: 'ignore' });
      } else {
        execSync('pkill -9 lm-studio 2>/dev/null || killall lm-studio 2>/dev/null || true', { stdio: 'ignore' });
      }
    } catch (e) {
      // Process might not be running, that's fine
    }
    
    // Wait a moment for process to fully terminate
    await new Promise(r => setTimeout(r, 1000));
    
    // Now start LM Studio
    if (!lmStudioConfig.path) {
      // Try to detect again
      lmStudioConfig.path = detectLMStudioPath();
    }
    
    if (!lmStudioConfig.path) {
      return { 
        success: false, 
        error: 'LM Studio path not configured. Please start it manually.',
      };
    }
    
    try {
      console.log('[Health] Starting LM Studio:', lmStudioConfig.path);
      
      // Start LM Studio in background
      const child = spawn(lmStudioConfig.path, [], {
        detached: true,
        stdio: 'ignore',
        shell: platform === 'win32',
      });
      
      child.unref();
      
      return { success: true, message: 'LM Studio starting...' };
      
    } catch (error) {
      console.error('[Health] Failed to start LM Studio:', error);
      return { 
        success: false, 
        error: `Failed to start: ${error.message}`,
      };
    }
  });
  
  /**
   * Get LM Studio configuration
   */
  ipcMain.handle('health:get-lm-studio-config', async () => {
    return {
      url: lmStudioConfig.url,
      path: lmStudioConfig.path,
      detected: !!lmStudioConfig.path,
    };
  });
  
  /**
   * Check backend server health
   */
  ipcMain.handle('health:check-backend', async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      
      const response = await fetch('http://localhost:3001/health', {
        signal: controller.signal,
      });
      
      clearTimeout(timeout);
      
      if (response.ok) {
        const data = await response.json();
        return { healthy: true, data };
      }
      
      return { healthy: false, error: `HTTP ${response.status}` };
      
    } catch (error) {
      return { healthy: false, error: error.message || 'Connection failed' };
    }
  });

  // =========================================================================
  // PHASE 10: DEPENDENCY MANAGEMENT - 30-Second Experience
  // =========================================================================
  
  // Create dependency downloader instance
  let dependencyDownloader = null;
  if (DependencyDownloader) {
    dependencyDownloader = new DependencyDownloader(app.getAppPath());
  }
  
  /**
   * Get status of optional dependencies
   */
  ipcMain.handle('setup:get-status', async () => {
    if (!dependencyDownloader) {
      return { error: 'Dependency manager not available' };
    }
    return dependencyDownloader.getStatus();
  });
  
  /**
   * Check if Piper TTS is installed
   */
  ipcMain.handle('setup:check-piper', async () => {
    if (!dependencyDownloader) {
      return { installed: false, error: 'Dependency manager not available' };
    }
    
    const status = dependencyDownloader.getStatus();
    return {
      installed: status.piper.installed,
      path: status.piper.path,
    };
  });
  
  /**
   * Download and install Piper TTS
   * Sends progress updates to renderer
   */
  ipcMain.handle('setup:install-piper', async (event) => {
    if (!dependencyDownloader) {
      return { success: false, error: 'Dependency manager not available' };
    }
    
    try {
      await dependencyDownloader.installPiper((progress) => {
        // Send progress to renderer
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('setup:piper-progress', progress);
        }
      });
      
      // Re-initialize Piper TTS
      try {
        const { PiperTTS } = require('./tts/PiperTTS');
        piperTTS = new PiperTTS();
        if (piperTTS.available()) {
          console.log('[Setup] Piper TTS initialized after download');
        }
      } catch (e) {
        console.warn('[Setup] Could not initialize Piper after download:', e.message);
      }
      
      return { success: true };
      
    } catch (error) {
      console.error('[Setup] Piper installation failed:', error);
      return { success: false, error: error.message };
    }
  });
  
  /**
   * Check if this is first launch (setup not complete)
   */
  ipcMain.handle('setup:is-first-launch', async () => {
    const configPath = path.join(app.getPath('userData'), 'setup-complete.json');
    return { firstLaunch: !fs.existsSync(configPath) };
  });
  
  /**
   * Mark setup as complete
   */
  ipcMain.handle('setup:mark-complete', async () => {
    const configPath = path.join(app.getPath('userData'), 'setup-complete.json');
    fs.writeFileSync(configPath, JSON.stringify({ 
      completedAt: new Date().toISOString(),
      version: '2.0.0',
    }));
    return { success: true };
  });

  // =========================================================================
  // PHASE 8: PIPER TTS (Neural Voice)
  // =========================================================================
  
  /**
   * Speak text using Piper TTS (local, fast, human-sounding)
   * Falls back to returning { fallback: true } if Piper unavailable
   */
  ipcMain.handle('tts:speak-piper', async (_, text, options = {}) => {
    if (!piperTTS || !piperTTS.available()) {
      return { success: false, fallback: true, reason: 'Piper not available' };
    }
    
    try {
      await piperTTS.speak(text, options);
      return { success: true };
    } catch (error) {
      console.error('[TTS] Piper error:', error.message);
      return { success: false, fallback: true, error: error.message };
    }
  });
  
  /**
   * Stop current Piper speech
   */
  ipcMain.handle('tts:stop-piper', async () => {
    if (piperTTS) {
      piperTTS.stop();
    }
    return { success: true };
  });
  
  /**
   * Check if Piper is available
   */
  ipcMain.handle('tts:piper-available', async () => {
    return { 
      available: piperTTS?.available() || false,
      voices: piperTTS?.getVoices() || [],
    };
  });
  
  /**
   * Set Piper voice
   */
  ipcMain.handle('tts:set-piper-voice', async (_, voiceId) => {
    if (!piperTTS) {
      return { success: false, error: 'Piper not available' };
    }
    
    const success = piperTTS.setVoice(voiceId);
    return { success };
  });

  // =========================================================================
  // PHASE 6: UNIFIED DEVICE SYSTEM (DeviceRegistry + Reflex Engine)
  // =========================================================================
  // 
  // This replaces the old Phase 4/5 code with a unified system that:
  // - Uses DeviceRegistry for all device operations
  // - Provides "The Pulse" - real-time state updates
  // - Enables "Spinal Reflexes" - instant command execution
  // 
  // === PHASE 8: Uses Worker Thread for heavy XML parsing ===
  
  const dgram = require('dgram');
  
  /**
   * Scan local network for smart devices using SSDP
   * Phase 8: Uses worker thread for XML enrichment (no UI freeze)
   */
  ipcMain.handle('system:scan-network', async () => {
    // First, try using the worker for the entire scan
    if (deviceWorker) {
      const workerResult = await workerCall('ssdpScan', { timeout: 5000 });
      
      if (workerResult.success && workerResult.devices) {
        // Enrich devices with XML data (also in worker)
        const enrichResult = await workerCall('enrichDevices', { 
          devices: workerResult.devices,
          timeout: 3000,
        });
        
        if (enrichResult.success) {
          // Register discovered devices
          for (const device of enrichResult.devices) {
            if (device.enriched) {
              deviceRegistry.registerDevice(device);
            }
          }
          
          return enrichResult.devices;
        }
        
        return workerResult.devices;
      }
    }
    
    // Fallback: run on main thread (original code)
    return new Promise(async (resolve) => {
      const rawDevices = [];
      const seenIPs = new Set();
      
      try {
        const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
        
        const SSDP_SEARCH = 
          'M-SEARCH * HTTP/1.1\r\n' +
          'HOST: 239.255.255.250:1900\r\n' +
          'MAN: "ssdp:discover"\r\n' +
          'MX: 3\r\n' +
          'ST: ssdp:all\r\n' +
          '\r\n';

        socket.on('message', (msg, rinfo) => {
          if (seenIPs.has(rinfo.address)) return;
          seenIPs.add(rinfo.address);
          
          const response = msg.toString();
          const headers = {};
          
          response.split('\r\n').forEach(line => {
            const colonIndex = line.indexOf(':');
            if (colonIndex > 0) {
              const key = line.substring(0, colonIndex).toUpperCase().trim();
              const value = line.substring(colonIndex + 1).trim();
              headers[key] = value;
            }
          });

          rawDevices.push({
            ip: rinfo.address,
            port: rinfo.port,
            headers,
            location: headers['LOCATION'] || null,
          });
          
          console.log(`[Discovery] SSDP response from ${rinfo.address}`);
        });

        socket.on('error', (err) => {
          console.error('[Discovery] Socket error:', err);
          socket.close();
        });

        socket.bind(() => {
          socket.setBroadcast(true);
          socket.setMulticastTTL(4);
          
          socket.send(SSDP_SEARCH, 0, SSDP_SEARCH.length, 1900, '239.255.255.250');
          setTimeout(() => {
            socket.send(SSDP_SEARCH, 0, SSDP_SEARCH.length, 1900, '239.255.255.250');
          }, 500);
        });

        // After 4 seconds, enrich with XML and register devices
        setTimeout(async () => {
          try { socket.close(); } catch (e) {}
          
          console.log(`[Discovery] SSDP complete. ${rawDevices.length} raw devices. Enriching...`);
          
          // Use DeviceRegistry for XML enrichment
          const enrichedDevices = [];
          
          for (const raw of rawDevices) {
            try {
              const enriched = await deviceRegistry.enrichDevice(raw);
              
              // Register in registry (persists to disk)
              deviceRegistry.registerDevice(enriched);
              
              // Check pairing status for Hue bridges
              if (enriched.type === 'hue_bridge') {
                const pairStatus = await deviceRegistry.hueCheckPaired(enriched.ip);
                enriched.paired = pairStatus.paired;
                
                // Update reflex engine with bridge IP
                if (reflexEngine) {
                  reflexEngine.setHueBridgeIP(enriched.ip);
                }
              }
              
              enrichedDevices.push(enriched);
            } catch (e) {
              console.warn(`[Discovery] Failed to enrich ${raw.ip}:`, e.message);
            }
          }
          
          // Start polling if we have paired devices
          if (deviceRegistry.getPairedDevices().length > 0) {
            deviceRegistry.startPolling(2000);
          }
          
          console.log(`[Discovery] Complete. ${enrichedDevices.length} devices identified.`);
          resolve(enrichedDevices);
        }, 4000);
        
      } catch (error) {
        console.error('[Discovery] Scan failed:', error);
        resolve([]);
      }
    });
  });
  
  /**
   * Probe a specific IP for common smart home ports
   */
  ipcMain.handle('system:probe-device', async (_, ip) => {
    const net = require('net');
    
    const ports = [
      { port: 80, service: 'HTTP' },
      { port: 443, service: 'HTTPS' },
      { port: 8080, service: 'HTTP Alt' },
      { port: 8123, service: 'Home Assistant' },
      { port: 1400, service: 'Sonos' },
      { port: 8008, service: 'Chromecast' },
      { port: 9197, service: 'Hue Bridge' },
      { port: 55443, service: 'Yeelight' },
    ];
    
    const probePort = (port, service) => {
      return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(1000);
        
        socket.on('connect', () => {
          socket.destroy();
          resolve({ port, service, open: true });
        });
        
        socket.on('timeout', () => {
          socket.destroy();
          resolve({ port, service, open: false });
        });
        
        socket.on('error', () => {
          resolve({ port, service, open: false });
        });
        
        socket.connect(port, ip);
      });
    };
    
    const probes = await Promise.all(ports.map(p => probePort(p.port, p.service)));
    return probes.filter(p => p.open);
  });
  
  /**
   * Get local network info
   */
  ipcMain.handle('system:get-network-info', async () => {
    const interfaces = os.networkInterfaces();
    const networks = [];
    
    for (const [name, addrs] of Object.entries(interfaces)) {
      for (const addr of addrs) {
        if (addr.family === 'IPv4' && !addr.internal) {
          networks.push({
            interface: name,
            ip: addr.address,
            netmask: addr.netmask,
            mac: addr.mac,
          });
        }
      }
    }
    
    return networks;
  });
  
  // =========================================================================
  // PHILIPS HUE BRIDGE - Using DeviceRegistry
  // =========================================================================
  
  ipcMain.handle('system:hue-check-paired', async (_, ip) => {
    return deviceRegistry.hueCheckPaired(ip);
  });
  
  ipcMain.handle('system:hue-start-pairing', async (_, ip) => {
    console.log(`[Main] Starting Hue pairing for ${ip}`);
    return {
      status: 'awaiting_action',
      message: 'Press the link button on your Philips Hue Bridge within 30 seconds.',
      actionRequired: 'PRESS_HUE_LINK_BUTTON',
      ip,
      expiresAt: Date.now() + 30000,
    };
  });
  
  ipcMain.handle('system:hue-complete-pairing', async (_, ip) => {
    const result = await deviceRegistry.hueCompletePairing(ip);
    
    // If successful, start polling
    if (result.status === 'success') {
      deviceRegistry.startPolling(2000);
      
      // Update reflex engine
      if (reflexEngine) {
        reflexEngine.setHueBridgeIP(ip);
      }
    }
    
    return result;
  });
  
  ipcMain.handle('system:hue-get-lights', async (_, ip) => {
    return deviceRegistry.hueGetLights(ip);
  });
  
  ipcMain.handle('system:hue-set-light', async (_, { ip, lightId, state }) => {
    return deviceRegistry.hueSetLight(ip, lightId, state);
  });
  
  ipcMain.handle('system:hue-get-groups', async (_, ip) => {
    return deviceRegistry.hueGetGroups(ip);
  });
  
  ipcMain.handle('system:hue-set-group', async (_, { ip, groupId, state }) => {
    return deviceRegistry.hueSetGroup(ip, groupId, state);
  });
  
  // =========================================================================
  // THE REFLEX SYSTEM - Instant Command Execution (No LLM Latency)
  // =========================================================================
  
  /**
   * Try to match and execute a reflex command
   * Returns { handled: boolean, response: string } or null if no match
   * 
   * This is the FAST PATH - bypasses the LLM entirely for known commands
   */
  ipcMain.handle('reflex:try', async (_, text) => {
    if (!reflexEngine) {
      return null;
    }
    
    const result = await reflexEngine.tryReflex(text);
    
    if (result?.handled) {
      console.log(`[Main] Reflex handled in ${result.latencyMs}ms: "${text}"`);
    }
    
    return result;
  });
  
  // =========================================================================
  // THE PULSE - Real-time Device State
  // =========================================================================
  
  /**
   * Get all current device states (from cache)
   */
  ipcMain.handle('device:get-all-states', async () => {
    return deviceRegistry.getAllStates();
  });
  
  /**
   * Get all registered devices
   */
  ipcMain.handle('device:get-all-devices', async () => {
    return deviceRegistry.getAllDevices();
  });
  
  /**
   * Start/stop real-time polling
   */
  ipcMain.handle('device:start-polling', async (_, intervalMs = 2000) => {
    deviceRegistry.startPolling(intervalMs);
    return { success: true, interval: intervalMs };
  });
  
  ipcMain.handle('device:stop-polling', async () => {
    deviceRegistry.stopPolling();
    return { success: true };
  });
  
  /**
   * Force an immediate state poll
   */
  ipcMain.handle('device:poll-now', async () => {
    const states = await deviceRegistry.pollAllStates();
    return states;
  });
}


// =============================================================================
// NOTIFICATIONS
// =============================================================================

function showNotification(title, body) {
  if (Notification.isSupported()) {
    new Notification({
      title,
      body,
      icon: getIconPath(),
    }).show();
  }
}

// =============================================================================
// PATHS & HELPERS
// =============================================================================

function getIconPath() {
  if (process.platform === 'darwin') {
    return path.join(__dirname, '../assets/icon.icns');
  } else if (process.platform === 'win32') {
    return path.join(__dirname, '../assets/icon.ico');
  } else {
    return path.join(__dirname, '../assets/icon.png');
  }
}

function getTrayIconPath() {
  if (process.platform === 'darwin') {
    return path.join(__dirname, '../assets/tray-icon.png');
  } else if (process.platform === 'win32') {
    return path.join(__dirname, '../assets/tray-icon.ico');
  } else {
    return path.join(__dirname, '../assets/tray-icon.png');
  }
}

function getConfigPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

// Simple store for settings
const store = {
  data: {},
  init() {
    try {
      const configPath = getConfigPath();
      if (fs.existsSync(configPath)) {
        this.data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      }
    } catch (e) {
      this.data = {};
    }
  },
  get(key, defaultValue) {
    return this.data[key] ?? defaultValue;
  },
  set(key, value) {
    this.data[key] = value;
    try {
      fs.writeFileSync(getConfigPath(), JSON.stringify(this.data, null, 2));
    } catch (e) {
      console.error('Failed to save config:', e);
    }
  },
};

// =============================================================================
// APP LIFECYCLE
// =============================================================================

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // Someone tried to run a second instance, focus our window
    showWindow();
  });
  
  app.whenReady().then(() => {
    store.init();
    
    // === PHASE 8: Initialize Worker Thread ===
    initWorker();
    
    // === PHASE 6: Initialize Device Registry & Reflex Engine ===
    const dataDir = path.join(app.getPath('userData'), 'jarvis-data');
    deviceRegistry = new DeviceRegistry(dataDir);
    reflexEngine = new ReflexEngine(deviceRegistry);
    
    // Find any already-registered Hue bridges and set them in the reflex engine
    const hueBridges = deviceRegistry.getDevicesByType('hue_bridge');
    if (hueBridges.length > 0) {
      reflexEngine.setHueBridgeIP(hueBridges[0].ip);
      console.log(`[Main] Found existing Hue Bridge at ${hueBridges[0].ip}`);
    }
    
    // Log Piper TTS status
    if (piperTTS && piperTTS.available()) {
      console.log('[Main] Piper TTS available - using neural voice');
    } else {
      console.log('[Main] Piper TTS not available - will use browser fallback');
    }
    
    createTray();
    createWindow();
    registerShortcuts();
    setupIPC();
    
    // Start the backend server (optional - JARVIS works without it)
    // The server is only needed for OAuth token storage and TTS proxy
    try {
      startServer();
    } catch (e) {
      console.log('[Main] Server not started (optional):', e.message);
    }
    
    // === THE PULSE: Start real-time device state polling ===
    deviceRegistry.onStateChange((states) => {
      // Push state updates to frontend
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('device-state-update', states);
      }
    });
    
    // Start polling after a short delay (let devices settle)
    setTimeout(() => {
      if (deviceRegistry.getPairedDevices().length > 0) {
        deviceRegistry.startPolling(2000); // Poll every 2 seconds
        console.log('[Main] The Pulse activated - polling device states');
      }
    }, 3000);
  });
  
  app.on('activate', () => {
    // macOS: Re-create window when dock icon clicked
    if (mainWindow === null) {
      createWindow();
    } else {
      showWindow();
    }
  });
  
  app.on('window-all-closed', () => {
    // Don't quit on macOS
    if (process.platform !== 'darwin') {
      // Actually, keep running in tray
      // app.quit();
    }
  });
  
  app.on('before-quit', () => {
    isQuitting = true;
    
    // Stop device polling
    if (deviceRegistry) {
      deviceRegistry.stopPolling();
    }
    
    stopServer();
    globalShortcut.unregisterAll();
  });
}
