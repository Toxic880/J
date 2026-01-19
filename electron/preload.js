/**
 * Electron Preload Script
 * 
 * Exposes a secure API to the renderer process
 * 
 * === PHASE 3: SYSTEM INTEGRATION ===
 * Added jarvisHost API for direct OS control:
 * - Launch applications
 * - Lock/Sleep/Shutdown
 * - Volume control
 * - Execute commands
 * - File system access
 */

const { contextBridge, ipcRenderer } = require('electron');

// =============================================================================
// JARVIS SERVER API (Existing)
// =============================================================================
contextBridge.exposeInMainWorld('jarvis', {
  // Server management
  getServerStatus: () => ipcRenderer.invoke('get-server-status'),
  restartServer: () => ipcRenderer.invoke('restart-server'),
  
  // App info
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  
  // Notifications
  showNotification: (title, body) => ipcRenderer.invoke('show-notification', { title, body }),
  
  // External links
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  
  // Listen for events from main process
  onVoiceActivate: (callback) => {
    ipcRenderer.on('voice-activate', callback);
    return () => ipcRenderer.removeListener('voice-activate', callback);
  },
  
  onOpenSettings: (callback) => {
    ipcRenderer.on('open-settings', callback);
    return () => ipcRenderer.removeListener('open-settings', callback);
  },
  
  // Platform info
  platform: process.platform,
  isElectron: true,
});

// =============================================================================
// JARVIS HOST API (Phase 3: System Control)
// =============================================================================
contextBridge.exposeInMainWorld('jarvisHost', {
  // --- SYSTEM COMMANDS ---
  // Execute arbitrary shell command (use with caution!)
  exec: (command) => ipcRenderer.invoke('system:exec', command),
  
  // --- APPLICATION CONTROL ---
  launchApp: (appName) => ipcRenderer.invoke('system:launch-app', appName),
  closeApp: (appName) => ipcRenderer.invoke('system:close-app', appName),
  getActiveWindow: () => ipcRenderer.invoke('system:get-active-window'),
  getRunningApps: () => ipcRenderer.invoke('system:get-running-apps'),
  
  // --- MEDIA CONTROL ---
  setVolume: (level) => ipcRenderer.invoke('system:set-volume', level),
  getVolume: () => ipcRenderer.invoke('system:get-volume'),
  mute: () => ipcRenderer.invoke('system:mute'),
  unmute: () => ipcRenderer.invoke('system:unmute'),
  playPause: () => ipcRenderer.invoke('system:media-play-pause'),
  nextTrack: () => ipcRenderer.invoke('system:media-next'),
  prevTrack: () => ipcRenderer.invoke('system:media-prev'),
  
  // --- POWER MANAGEMENT ---
  shutdown: () => ipcRenderer.invoke('system:shutdown'),
  restart: () => ipcRenderer.invoke('system:restart'),
  lock: () => ipcRenderer.invoke('system:lock'),
  sleep: () => ipcRenderer.invoke('system:sleep'),
  
  // --- DISPLAY CONTROL ---
  setBrightness: (level) => ipcRenderer.invoke('system:set-brightness', level),
  getBrightness: () => ipcRenderer.invoke('system:get-brightness'),
  
  // --- HARDWARE INFO ---
  getBattery: () => ipcRenderer.invoke('system:get-battery'),
  getSystemInfo: () => ipcRenderer.invoke('system:get-info'),
  getCpuUsage: () => ipcRenderer.invoke('system:get-cpu'),
  getMemoryUsage: () => ipcRenderer.invoke('system:get-memory'),
  
  // --- CLIPBOARD ---
  copyToClipboard: (text) => ipcRenderer.invoke('system:clipboard-write', text),
  readClipboard: () => ipcRenderer.invoke('system:clipboard-read'),
  
  // --- FILE SYSTEM ---
  openFile: (filePath) => ipcRenderer.invoke('system:open-file', filePath),
  openFolder: (folderPath) => ipcRenderer.invoke('system:open-folder', folderPath),
  
  // --- NOTIFICATIONS ---
  showSystemNotification: (title, body, icon) => 
    ipcRenderer.invoke('system:notification', { title, body, icon }),
  
  // --- PHASE 4: NETWORK DISCOVERY ---
  scanNetwork: () => ipcRenderer.invoke('system:scan-network'),
  probeDevice: (ip) => ipcRenderer.invoke('system:probe-device', ip),
  getNetworkInfo: () => ipcRenderer.invoke('system:get-network-info'),
  
  // --- PHASE 5: DEVICE PAIRING ---
  // Philips Hue Bridge
  hueCheckPaired: (ip) => ipcRenderer.invoke('system:hue-check-paired', ip),
  hueStartPairing: (ip) => ipcRenderer.invoke('system:hue-start-pairing', ip),
  hueCompletePairing: (ip) => ipcRenderer.invoke('system:hue-complete-pairing', ip),
  hueGetLights: (ip) => ipcRenderer.invoke('system:hue-get-lights', ip),
  hueSetLight: (ip, lightId, state) => ipcRenderer.invoke('system:hue-set-light', { ip, lightId, state }),
  hueGetGroups: (ip) => ipcRenderer.invoke('system:hue-get-groups', ip),
  hueSetGroup: (ip, groupId, state) => ipcRenderer.invoke('system:hue-set-group', { ip, groupId, state }),
  
  // --- PHASE 6: THE REFLEX SYSTEM ---
  // Instant command execution (no LLM latency)
  tryReflex: (text) => ipcRenderer.invoke('reflex:try', text),
  
  // --- PHASE 6: THE PULSE (Real-time Device State) ---
  getAllDeviceStates: () => ipcRenderer.invoke('device:get-all-states'),
  getAllDevices: () => ipcRenderer.invoke('device:get-all-devices'),
  startDevicePolling: (intervalMs) => ipcRenderer.invoke('device:start-polling', intervalMs),
  stopDevicePolling: () => ipcRenderer.invoke('device:stop-polling'),
  pollDevicesNow: () => ipcRenderer.invoke('device:poll-now'),
  
  // Subscribe to real-time device state updates
  onDeviceStateUpdate: (callback) => {
    const handler = (_, states) => callback(states);
    ipcRenderer.on('device-state-update', handler);
    // Return unsubscribe function
    return () => ipcRenderer.removeListener('device-state-update', handler);
  },
  
  // --- PHASE 7: BARGE-IN & DESKTOP VISION ---
  // Audio ducking (lower volume when listening)
  duckAudio: (shouldDuck) => ipcRenderer.invoke('system:duck-audio', shouldDuck),
  
  // Screen capture for desktop vision
  captureScreen: (options) => ipcRenderer.invoke('system:capture-screen', options),
  getCaptureSources: (options) => ipcRenderer.invoke('system:get-capture-sources', options),
  
  // Hardware interrupt (stop everything NOW)
  hardInterrupt: () => ipcRenderer.invoke('system:hard-interrupt'),
  
  // Listen for interrupt signals from main process
  onInterrupt: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('jarvis-interrupt', handler);
    return () => ipcRenderer.removeListener('jarvis-interrupt', handler);
  },
  
  // --- PHASE 8: NATIVE SOUND FEEDBACK ---
  playSound: (soundType) => ipcRenderer.invoke('system:play-sound', soundType),
  
  // --- PHASE 8: PIPER TTS (Neural Voice) ---
  speakPiper: (text, options) => ipcRenderer.invoke('tts:speak-piper', text, options),
  stopPiper: () => ipcRenderer.invoke('tts:stop-piper'),
  piperAvailable: () => ipcRenderer.invoke('tts:piper-available'),
  setPiperVoice: (voiceId) => ipcRenderer.invoke('tts:set-piper-voice', voiceId),
  
  // --- PHASE 9: HEALTH MONITORING & AUTO-RECOVERY ---
  // LM Studio health
  checkLMStudio: () => ipcRenderer.invoke('health:check-lm-studio'),
  restartLMStudio: () => ipcRenderer.invoke('health:restart-lm-studio'),
  configureLMStudio: (config) => ipcRenderer.invoke('health:configure-lm-studio', config),
  getLMStudioConfig: () => ipcRenderer.invoke('health:get-lm-studio-config'),
  
  // Backend health
  checkBackend: () => ipcRenderer.invoke('health:check-backend'),
  
  // --- PHASE 10: FIRST LAUNCH WIZARD & DEPENDENCY MANAGEMENT ---
  // Setup status
  getSetupStatus: () => ipcRenderer.invoke('setup:get-status'),
  isFirstLaunch: () => ipcRenderer.invoke('setup:is-first-launch'),
  markSetupComplete: () => ipcRenderer.invoke('setup:mark-complete'),
  
  // Piper installation
  checkPiperInstalled: () => ipcRenderer.invoke('setup:check-piper'),
  installPiper: () => ipcRenderer.invoke('setup:install-piper'),
  onPiperProgress: (callback) => {
    const handler = (_, progress) => callback(progress);
    ipcRenderer.on('setup:piper-progress', handler);
    return () => ipcRenderer.removeListener('setup:piper-progress', handler);
  },
});

// Expose API URL
contextBridge.exposeInMainWorld('JARVIS_API_URL', 'http://localhost:3001');
