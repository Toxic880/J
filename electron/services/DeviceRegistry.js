/**
 * DEVICE REGISTRY - Persistent Smart Home Device Management
 * 
 * Phase 6: "The Reflex System"
 * 
 * This runs INSIDE Electron's main process (CommonJS).
 * NOT in the server folder. NOT in TypeScript land.
 * Direct, fast, no build step required.
 * 
 * Features:
 * - Persists discovered devices to disk (survives restarts)
 * - Fetches XML descriptions from SSDP LOCATION headers
 * - Handles Philips Hue Bridge pairing (button press flow)
 * - Real-time state polling (The Pulse)
 * - Stores API credentials for each device
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

// =============================================================================
// DEVICE REGISTRY CLASS
// =============================================================================

class DeviceRegistry {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.devicesPath = path.join(dataDir, 'devices.json');
    this.credentialsPath = path.join(dataDir, 'device-credentials.json');
    
    // In-memory state
    this.devices = new Map();
    this.credentials = {};
    this.deviceStates = new Map(); // Real-time state cache
    this.pollInterval = null;
    this.stateListeners = [];
    
    // Ensure data directory exists
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    this.loadFromDisk();
    console.log(`[DeviceRegistry] Initialized with ${this.devices.size} devices`);
  }

  // ===========================================================================
  // PERSISTENCE
  // ===========================================================================

  loadFromDisk() {
    // Load devices
    try {
      if (fs.existsSync(this.devicesPath)) {
        const data = JSON.parse(fs.readFileSync(this.devicesPath, 'utf8'));
        for (const device of data.devices || []) {
          this.devices.set(device.id, device);
        }
        console.log(`[DeviceRegistry] Loaded ${this.devices.size} devices from disk`);
      }
    } catch (e) {
      console.warn('[DeviceRegistry] Failed to load devices:', e.message);
    }
    
    // Load credentials
    try {
      if (fs.existsSync(this.credentialsPath)) {
        this.credentials = JSON.parse(fs.readFileSync(this.credentialsPath, 'utf8'));
        console.log(`[DeviceRegistry] Loaded credentials for ${Object.keys(this.credentials).length} devices`);
      }
    } catch (e) {
      console.warn('[DeviceRegistry] Failed to load credentials:', e.message);
    }
  }

  saveDevices() {
    try {
      const data = {
        devices: Array.from(this.devices.values()),
        lastUpdated: Date.now(),
        version: 1,
      };
      fs.writeFileSync(this.devicesPath, JSON.stringify(data, null, 2));
    } catch (e) {
      console.error('[DeviceRegistry] Failed to save devices:', e.message);
    }
  }

  saveCredentials() {
    try {
      fs.writeFileSync(this.credentialsPath, JSON.stringify(this.credentials, null, 2));
      console.log('[DeviceRegistry] Credentials saved');
    } catch (e) {
      console.error('[DeviceRegistry] Failed to save credentials:', e.message);
    }
  }

  // ===========================================================================
  // DEVICE MANAGEMENT
  // ===========================================================================

  /**
   * Register or update a device
   */
  registerDevice(device) {
    const id = device.id || `${device.type}-${device.ip.replace(/\./g, '-')}`;
    
    const existing = this.devices.get(id);
    const merged = {
      ...existing,
      ...device,
      id,
      lastSeen: Date.now(),
      paired: existing?.paired || false,
    };
    
    this.devices.set(id, merged);
    this.saveDevices();
    
    console.log(`[DeviceRegistry] Registered: ${merged.name} (${merged.type}) at ${merged.ip}`);
    return merged;
  }

  getDevice(id) {
    return this.devices.get(id);
  }

  getDeviceByIP(ip) {
    return Array.from(this.devices.values()).find(d => d.ip === ip);
  }

  getAllDevices() {
    return Array.from(this.devices.values());
  }

  getDevicesByType(type) {
    return this.getAllDevices().filter(d => d.type === type);
  }

  getPairedDevices() {
    return this.getAllDevices().filter(d => d.paired);
  }

  // ===========================================================================
  // XML DESCRIPTION FETCHING (The Real SSDP Enrichment)
  // ===========================================================================

  /**
   * Fetch XML device description from LOCATION URL
   */
  async fetchDeviceXML(url) {
    if (!url) return null;
    
    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(null), 5000);
      
      try {
        const protocol = url.startsWith('https') ? https : http;
        
        const req = protocol.get(url, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            clearTimeout(timeout);
            resolve(data);
          });
        });
        
        req.on('error', () => {
          clearTimeout(timeout);
          resolve(null);
        });
        
        req.setTimeout(5000, () => {
          req.destroy();
          resolve(null);
        });
      } catch (e) {
        clearTimeout(timeout);
        resolve(null);
      }
    });
  }

  /**
   * Parse XML to extract device info
   */
  parseDeviceXML(xml) {
    if (!xml) return null;
    
    const extract = (tag) => {
      const regex = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'i');
      const match = xml.match(regex);
      return match ? match[1].trim() : null;
    };
    
    return {
      friendlyName: extract('friendlyName'),
      manufacturer: extract('manufacturer'),
      modelName: extract('modelName'),
      modelNumber: extract('modelNumber'),
      serialNumber: extract('serialNumber'),
      UDN: extract('UDN'),
      deviceType: extract('deviceType'),
    };
  }

  /**
   * Enrich a raw SSDP device with XML data
   */
  async enrichDevice(rawDevice) {
    let xmlInfo = null;
    
    if (rawDevice.location) {
      console.log(`[DeviceRegistry] Fetching XML from: ${rawDevice.location}`);
      const xml = await this.fetchDeviceXML(rawDevice.location);
      xmlInfo = this.parseDeviceXML(xml);
      
      if (xmlInfo?.friendlyName) {
        console.log(`[DeviceRegistry] Got friendlyName: ${xmlInfo.friendlyName}`);
      }
    }
    
    // Identify device type
    const typeInfo = this.identifyDeviceType(rawDevice.headers || {}, xmlInfo);
    
    // Generate unique ID
    const id = xmlInfo?.serialNumber || 
               xmlInfo?.UDN || 
               `${typeInfo.type}-${rawDevice.ip.replace(/\./g, '-')}`;
    
    return {
      id,
      ip: rawDevice.ip,
      port: rawDevice.port,
      type: typeInfo.type,
      category: typeInfo.category,
      name: xmlInfo?.friendlyName || typeInfo.name,
      manufacturer: xmlInfo?.manufacturer || typeInfo.manufacturer,
      model: xmlInfo?.modelName || xmlInfo?.modelNumber,
      serialNumber: xmlInfo?.serialNumber,
      location: rawDevice.location,
      requiresPairing: typeInfo.requiresPairing,
      discoveredAt: Date.now(),
    };
  }

  /**
   * Identify device type from headers and XML data
   */
  identifyDeviceType(headers, xmlInfo) {
    const server = (headers['SERVER'] || '').toLowerCase();
    const st = (headers['ST'] || '').toLowerCase();
    const location = (headers['LOCATION'] || '').toLowerCase();
    const manufacturer = (xmlInfo?.manufacturer || '').toLowerCase();
    const modelName = (xmlInfo?.modelName || '').toLowerCase();
    const friendlyName = (xmlInfo?.friendlyName || '').toLowerCase();
    
    // Philips Hue Bridge
    if (
      manufacturer.includes('philips') ||
      friendlyName.includes('hue') ||
      modelName.includes('bsb') ||
      (location.includes('/description.xml') && server.includes('linux') && !server.includes('sonos'))
    ) {
      return { 
        type: 'hue_bridge', 
        category: 'light',
        name: 'Philips Hue Bridge', 
        manufacturer: 'Philips',
        requiresPairing: true,
      };
    }
    
    // Sonos
    if (server.includes('sonos') || manufacturer.includes('sonos') || friendlyName.includes('sonos')) {
      return { 
        type: 'sonos_speaker', 
        category: 'speaker',
        name: xmlInfo?.friendlyName || 'Sonos Speaker', 
        manufacturer: 'Sonos',
        requiresPairing: false,
      };
    }
    
    // Chromecast
    if (server.includes('chromecast') || server.includes('eureka') || manufacturer.includes('google')) {
      return { 
        type: 'chromecast', 
        category: 'media',
        name: xmlInfo?.friendlyName || 'Google Chromecast', 
        manufacturer: 'Google',
        requiresPairing: false,
      };
    }
    
    // Home Assistant
    if (server.includes('homeassistant') || location.includes(':8123')) {
      return { 
        type: 'home_assistant', 
        category: 'hub',
        name: 'Home Assistant', 
        manufacturer: 'Home Assistant',
        requiresPairing: true,
      };
    }
    
    // WeMo
    if (server.includes('wemo') || manufacturer.includes('belkin')) {
      return { 
        type: 'wemo_switch', 
        category: 'switch',
        name: xmlInfo?.friendlyName || 'Belkin WeMo', 
        manufacturer: 'Belkin',
        requiresPairing: false,
      };
    }
    
    // Roku
    if (server.includes('roku') || manufacturer.includes('roku')) {
      return { 
        type: 'roku', 
        category: 'media',
        name: xmlInfo?.friendlyName || 'Roku', 
        manufacturer: 'Roku',
        requiresPairing: false,
      };
    }
    
    // Amazon Echo
    if (manufacturer.includes('amazon') || friendlyName.includes('echo')) {
      return { 
        type: 'echo', 
        category: 'speaker',
        name: xmlInfo?.friendlyName || 'Amazon Echo', 
        manufacturer: 'Amazon',
        requiresPairing: false,
      };
    }
    
    // LIFX
    if (manufacturer.includes('lifx')) {
      return { 
        type: 'lifx_light', 
        category: 'light',
        name: xmlInfo?.friendlyName || 'LIFX Light', 
        manufacturer: 'LIFX',
        requiresPairing: false,
      };
    }
    
    // Generic UPnP
    return { 
      type: 'unknown', 
      category: 'network',
      name: xmlInfo?.friendlyName || headers['SERVER']?.substring(0, 50) || 'Network Device', 
      manufacturer: xmlInfo?.manufacturer,
      requiresPairing: false,
    };
  }

  // ===========================================================================
  // PHILIPS HUE BRIDGE PAIRING & CONTROL
  // ===========================================================================

  /**
   * Check if a Hue Bridge is already paired
   */
  async hueCheckPaired(ip) {
    const creds = this.credentials[`hue-${ip}`];
    
    if (creds?.username) {
      try {
        const result = await this.httpGet(`http://${ip}/api/${creds.username}/config`);
        const data = JSON.parse(result);
        
        if (data.name) {
          return { paired: true, bridgeName: data.name, username: creds.username };
        }
      } catch (e) {
        // Credentials invalid, remove them
        delete this.credentials[`hue-${ip}`];
        this.saveCredentials();
      }
    }
    
    return { paired: false };
  }

  /**
   * Attempt Hue pairing (user must press link button)
   */
  async hueCompletePairing(ip) {
    console.log(`[DeviceRegistry] Attempting Hue pairing for ${ip}`);
    
    try {
      const response = await this.httpPost(`http://${ip}/api`, {
        devicetype: 'jarvis#desktop',
        generateclientkey: true,
      });
      
      const result = JSON.parse(response);
      console.log('[DeviceRegistry] Hue API response:', JSON.stringify(result));
      
      // Check for success
      if (Array.isArray(result) && result[0]?.success) {
        const username = result[0].success.username;
        const clientkey = result[0].success.clientkey;
        
        // Store credentials
        this.credentials[`hue-${ip}`] = { 
          username, 
          clientkey, 
          pairedAt: Date.now() 
        };
        this.saveCredentials();
        
        // Update device as paired
        const device = this.getDeviceByIP(ip);
        if (device) {
          device.paired = true;
          this.devices.set(device.id, device);
          this.saveDevices();
        }
        
        console.log(`[DeviceRegistry] SUCCESS! Hue paired with username: ${username}`);
        
        return {
          status: 'success',
          message: 'Successfully paired with your Philips Hue Bridge!',
          username,
        };
      }
      
      // Check for "link button not pressed" error (type 101)
      if (Array.isArray(result) && result[0]?.error) {
        const errorType = result[0].error.type;
        const errorDesc = result[0].error.description;
        
        if (errorType === 101) {
          return {
            status: 'awaiting_action',
            message: 'Please press the link button on your Hue Bridge.',
            actionRequired: 'PRESS_HUE_LINK_BUTTON',
          };
        }
        
        return { status: 'failed', message: `Hue error: ${errorDesc}` };
      }
      
      return { status: 'failed', message: 'Unexpected response from Hue Bridge' };
      
    } catch (error) {
      console.error('[DeviceRegistry] Hue pairing error:', error);
      return { status: 'failed', message: `Connection error: ${error.message}` };
    }
  }

  /**
   * Get all lights from a paired Hue Bridge
   */
  async hueGetLights(ip) {
    const creds = this.credentials[`hue-${ip}`];
    if (!creds?.username) {
      return { error: 'Bridge not paired' };
    }
    
    try {
      const result = await this.httpGet(`http://${ip}/api/${creds.username}/lights`);
      return { lights: JSON.parse(result) };
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Control a Hue light
   */
  async hueSetLight(ip, lightId, state) {
    const creds = this.credentials[`hue-${ip}`];
    if (!creds?.username) {
      return { error: 'Bridge not paired' };
    }
    
    try {
      const result = await this.httpPut(
        `http://${ip}/api/${creds.username}/lights/${lightId}/state`,
        state
      );
      return { result: JSON.parse(result) };
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Get all groups/rooms from a paired Hue Bridge
   */
  async hueGetGroups(ip) {
    const creds = this.credentials[`hue-${ip}`];
    if (!creds?.username) {
      return { error: 'Bridge not paired' };
    }
    
    try {
      const result = await this.httpGet(`http://${ip}/api/${creds.username}/groups`);
      return { groups: JSON.parse(result) };
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Control a Hue group/room
   */
  async hueSetGroup(ip, groupId, state) {
    const creds = this.credentials[`hue-${ip}`];
    if (!creds?.username) {
      return { error: 'Bridge not paired' };
    }
    
    try {
      const result = await this.httpPut(
        `http://${ip}/api/${creds.username}/groups/${groupId}/action`,
        state
      );
      return { result: JSON.parse(result) };
    } catch (error) {
      return { error: error.message };
    }
  }

  // ===========================================================================
  // THE PULSE - REAL-TIME STATE POLLING
  // ===========================================================================

  /**
   * Start polling device states
   */
  startPolling(intervalMs = 2000) {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }
    
    console.log(`[DeviceRegistry] Starting state polling every ${intervalMs}ms`);
    
    this.pollInterval = setInterval(async () => {
      await this.pollAllStates();
    }, intervalMs);
    
    // Poll immediately
    this.pollAllStates();
  }

  /**
   * Stop polling
   */
  stopPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
      console.log('[DeviceRegistry] Stopped state polling');
    }
  }

  /**
   * Poll all paired devices for their current state
   */
  async pollAllStates() {
    const states = {};
    const pairedDevices = this.getPairedDevices();
    
    for (const device of pairedDevices) {
      try {
        if (device.type === 'hue_bridge') {
          const lightStates = await this.pollHueState(device.ip);
          if (lightStates) {
            states[device.id] = {
              type: 'hue_bridge',
              ip: device.ip,
              name: device.name,
              lights: lightStates.lights,
              groups: lightStates.groups,
              lastPolled: Date.now(),
            };
          }
        }
        // Add more device types here as needed
      } catch (e) {
        console.warn(`[DeviceRegistry] Failed to poll ${device.name}:`, e.message);
      }
    }
    
    // Update cache
    for (const [id, state] of Object.entries(states)) {
      this.deviceStates.set(id, state);
    }
    
    // Notify listeners
    if (Object.keys(states).length > 0) {
      this.notifyStateListeners(states);
    }
    
    return states;
  }

  /**
   * Poll Hue Bridge for current light/group states
   */
  async pollHueState(ip) {
    const creds = this.credentials[`hue-${ip}`];
    if (!creds?.username) return null;
    
    try {
      const [lightsResult, groupsResult] = await Promise.all([
        this.httpGet(`http://${ip}/api/${creds.username}/lights`),
        this.httpGet(`http://${ip}/api/${creds.username}/groups`),
      ]);
      
      const lights = JSON.parse(lightsResult);
      const groups = JSON.parse(groupsResult);
      
      // Simplify for frontend
      const simplifiedLights = {};
      for (const [id, light] of Object.entries(lights)) {
        simplifiedLights[id] = {
          name: light.name,
          on: light.state.on,
          bri: light.state.bri,
          reachable: light.state.reachable,
        };
      }
      
      const simplifiedGroups = {};
      for (const [id, group] of Object.entries(groups)) {
        simplifiedGroups[id] = {
          name: group.name,
          type: group.type,
          on: group.state?.any_on || false,
          allOn: group.state?.all_on || false,
          bri: group.action?.bri,
        };
      }
      
      return { lights: simplifiedLights, groups: simplifiedGroups };
    } catch (e) {
      console.warn('[DeviceRegistry] Hue poll failed:', e.message);
      return null;
    }
  }

  /**
   * Register a state change listener
   */
  onStateChange(callback) {
    this.stateListeners.push(callback);
    return () => {
      this.stateListeners = this.stateListeners.filter(cb => cb !== callback);
    };
  }

  /**
   * Notify all state listeners
   */
  notifyStateListeners(states) {
    for (const listener of this.stateListeners) {
      try {
        listener(states);
      } catch (e) {
        console.error('[DeviceRegistry] State listener error:', e);
      }
    }
  }

  /**
   * Get cached state for a device
   */
  getDeviceState(deviceId) {
    return this.deviceStates.get(deviceId);
  }

  /**
   * Get all cached states
   */
  getAllStates() {
    const states = {};
    for (const [id, state] of this.deviceStates) {
      states[id] = state;
    }
    return states;
  }

  // ===========================================================================
  // HTTP HELPERS
  // ===========================================================================

  httpGet(url) {
    return new Promise((resolve, reject) => {
      http.get(url, { timeout: 5000 }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
      }).on('error', reject);
    });
  }

  httpPost(url, body) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(body);
      const urlObj = new URL(url);
      
      const req = http.request({
        hostname: urlObj.hostname,
        port: urlObj.port || 80,
        path: urlObj.pathname,
        method: 'POST',
        timeout: 5000,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
      }, (res) => {
        let result = '';
        res.on('data', chunk => result += chunk);
        res.on('end', () => resolve(result));
      });
      
      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }

  httpPut(url, body) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(body);
      const urlObj = new URL(url);
      
      const req = http.request({
        hostname: urlObj.hostname,
        port: urlObj.port || 80,
        path: urlObj.pathname,
        method: 'PUT',
        timeout: 5000,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
      }, (res) => {
        let result = '';
        res.on('data', chunk => result += chunk);
        res.on('end', () => resolve(result));
      });
      
      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }
}

// =============================================================================
// REFLEX ENGINE - INSTANT COMMAND MATCHING (NO LLM NEEDED)
// =============================================================================

class ReflexEngine {
  constructor(registry) {
    this.registry = registry;
    this.hueBridgeIP = null;
    
    // The Spinal Reflexes - Regex patterns for instant response
    this.reflexes = [
      // Lights ON/OFF
      {
        pattern: /^(turn|switch|put)\s+(on|off)\s+(the\s+)?(all\s+)?(lights?|lamps?)/i,
        handler: async (match) => {
          const on = match[2].toLowerCase() === 'on';
          return this.controlAllLights(on);
        },
      },
      // Room lights ON/OFF
      {
        pattern: /^(turn|switch|put)\s+(on|off)\s+(the\s+)?(.+?)\s+(lights?|lamps?)/i,
        handler: async (match) => {
          const on = match[2].toLowerCase() === 'on';
          const room = match[4].trim();
          return this.controlRoomLights(room, on);
        },
      },
      // Brightness percentage
      {
        pattern: /^(set|dim|change)\s+(the\s+)?(lights?|lamps?|brightness)\s+(to\s+)?(\d+)\s*%?/i,
        handler: async (match) => {
          const brightness = parseInt(match[5], 10);
          return this.setBrightness(brightness);
        },
      },
      // Room brightness
      {
        pattern: /^(set|dim|change)\s+(the\s+)?(.+?)\s+(lights?|lamps?)\s+(to\s+)?(\d+)\s*%?/i,
        handler: async (match) => {
          const room = match[3].trim();
          const brightness = parseInt(match[6], 10);
          return this.setBrightness(brightness, room);
        },
      },
      // "Lights off" / "Lights on" (simple)
      {
        pattern: /^(all\s+)?(lights?|lamps?)\s+(on|off)$/i,
        handler: async (match) => {
          const on = match[3].toLowerCase() === 'on';
          return this.controlAllLights(on);
        },
      },
      // "Dim the lights"
      {
        pattern: /^dim\s+(the\s+)?(lights?|lamps?)$/i,
        handler: async () => {
          return this.setBrightness(30);
        },
      },
      // "Brighten the lights"
      {
        pattern: /^(brighten|bright)\s+(the\s+)?(lights?|lamps?)$/i,
        handler: async () => {
          return this.setBrightness(100);
        },
      },
    ];
  }

  /**
   * Set the Hue Bridge IP (called when discovered)
   */
  setHueBridgeIP(ip) {
    this.hueBridgeIP = ip;
    console.log(`[ReflexEngine] Hue Bridge IP set: ${ip}`);
  }

  /**
   * Try to match and execute a reflex
   * Returns { handled: boolean, response: string } or null if no match
   */
  async tryReflex(text) {
    const normalizedText = text.trim();
    
    for (const reflex of this.reflexes) {
      const match = normalizedText.match(reflex.pattern);
      if (match) {
        console.log(`[ReflexEngine] REFLEX MATCH: "${normalizedText}"`);
        const startTime = Date.now();
        
        try {
          const response = await reflex.handler(match);
          const elapsed = Date.now() - startTime;
          console.log(`[ReflexEngine] Reflex executed in ${elapsed}ms`);
          
          return { handled: true, response, latencyMs: elapsed };
        } catch (error) {
          console.error('[ReflexEngine] Reflex error:', error);
          return { handled: true, response: `I had trouble with that: ${error.message}`, error: true };
        }
      }
    }
    
    return null; // No reflex matched - fall through to LLM
  }

  /**
   * Control all lights
   */
  async controlAllLights(on) {
    if (!this.hueBridgeIP) {
      return "I don't have a Hue Bridge connected. Say 'scan for devices' first.";
    }
    
    const paired = await this.registry.hueCheckPaired(this.hueBridgeIP);
    if (!paired.paired) {
      return "The Hue Bridge isn't paired yet. Would you like me to pair with it?";
    }
    
    await this.registry.hueSetGroup(this.hueBridgeIP, '0', { on });
    return on ? "All lights are now on, Sir." : "All lights are now off, Sir.";
  }

  /**
   * Control lights in a specific room
   */
  async controlRoomLights(roomName, on) {
    if (!this.hueBridgeIP) {
      return "I don't have a Hue Bridge connected.";
    }
    
    const paired = await this.registry.hueCheckPaired(this.hueBridgeIP);
    if (!paired.paired) {
      return "The Hue Bridge isn't paired yet.";
    }
    
    const groups = await this.registry.hueGetGroups(this.hueBridgeIP);
    if (groups.error) {
      return `Couldn't access lights: ${groups.error}`;
    }
    
    // Find the room
    const roomLower = roomName.toLowerCase();
    let groupId = null;
    
    for (const [id, group] of Object.entries(groups.groups)) {
      if (group.name.toLowerCase().includes(roomLower)) {
        groupId = id;
        break;
      }
    }
    
    if (!groupId) {
      return `I couldn't find a room called "${roomName}". Available rooms: ${Object.values(groups.groups).map(g => g.name).join(', ')}`;
    }
    
    await this.registry.hueSetGroup(this.hueBridgeIP, groupId, { on });
    return on ? `${roomName} lights are now on, Sir.` : `${roomName} lights are now off, Sir.`;
  }

  /**
   * Set brightness (0-100)
   */
  async setBrightness(percent, roomName = null) {
    if (!this.hueBridgeIP) {
      return "I don't have a Hue Bridge connected.";
    }
    
    const paired = await this.registry.hueCheckPaired(this.hueBridgeIP);
    if (!paired.paired) {
      return "The Hue Bridge isn't paired yet.";
    }
    
    // Convert 0-100 to 0-254
    const bri = Math.round((Math.min(100, Math.max(0, percent)) / 100) * 254);
    
    let groupId = '0'; // All lights by default
    
    if (roomName) {
      const groups = await this.registry.hueGetGroups(this.hueBridgeIP);
      if (!groups.error) {
        const roomLower = roomName.toLowerCase();
        for (const [id, group] of Object.entries(groups.groups)) {
          if (group.name.toLowerCase().includes(roomLower)) {
            groupId = id;
            break;
          }
        }
      }
    }
    
    await this.registry.hueSetGroup(this.hueBridgeIP, groupId, { on: true, bri });
    
    const target = roomName || 'All';
    return `${target} lights set to ${percent}%, Sir.`;
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = { DeviceRegistry, ReflexEngine };
