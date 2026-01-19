/**
 * JARVIS WORKER THREAD
 * 
 * Phase 8: Production Grade Performance
 * 
 * Heavy operations run here instead of the main process:
 * - XML parsing from device discovery
 * - Network scanning
 * - Large file processing
 * 
 * This prevents the UI from freezing when scanning 50+ devices.
 */

const { parentPort, workerData } = require('worker_threads');
const http = require('http');
const https = require('https');
const dgram = require('dgram');

// Message handlers
const handlers = {
  
  /**
   * Parse XML device description
   */
  parseXML: async (data) => {
    const { xml, deviceIp } = data;
    
    try {
      // Simple XML parser (no external dependencies)
      const getValue = (tag) => {
        const match = xml.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'i'));
        return match ? match[1].trim() : null;
      };
      
      const result = {
        friendlyName: getValue('friendlyName'),
        manufacturer: getValue('manufacturer'),
        modelName: getValue('modelName'),
        modelDescription: getValue('modelDescription'),
        modelNumber: getValue('modelNumber'),
        serialNumber: getValue('serialNumber'),
        UDN: getValue('UDN'),
        deviceType: getValue('deviceType'),
        presentationURL: getValue('presentationURL'),
      };
      
      // Identify device type
      result.identifiedType = identifyDeviceType(result, deviceIp);
      
      return { success: true, result };
      
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
  
  /**
   * Fetch XML from device URL
   */
  fetchXML: async (data) => {
    const { url, timeout = 5000 } = data;
    
    return new Promise((resolve) => {
      const protocol = url.startsWith('https') ? https : http;
      
      const req = protocol.get(url, { timeout }, (res) => {
        let body = '';
        
        res.on('data', (chunk) => {
          body += chunk;
        });
        
        res.on('end', () => {
          resolve({ success: true, xml: body });
        });
      });
      
      req.on('error', (err) => {
        resolve({ success: false, error: err.message });
      });
      
      req.on('timeout', () => {
        req.destroy();
        resolve({ success: false, error: 'Timeout' });
      });
    });
  },
  
  /**
   * SSDP network scan
   */
  ssdpScan: async (data) => {
    const { timeout = 5000 } = data;
    
    return new Promise((resolve) => {
      const devices = [];
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
          const device = parseSSDP(response, rinfo.address);
          
          if (device) {
            devices.push(device);
          }
        });
        
        socket.on('error', (err) => {
          console.error('[Worker] SSDP socket error:', err.message);
        });
        
        socket.bind(() => {
          socket.addMembership('239.255.255.250');
          socket.send(SSDP_SEARCH, 0, SSDP_SEARCH.length, 1900, '239.255.255.250');
        });
        
        // Wait for responses
        setTimeout(() => {
          socket.close();
          resolve({ success: true, devices });
        }, timeout);
        
      } catch (error) {
        resolve({ success: false, error: error.message });
      }
    });
  },
  
  /**
   * Enrich multiple devices with XML data (parallel)
   */
  enrichDevices: async (data) => {
    const { devices, timeout = 3000 } = data;
    
    const enriched = await Promise.all(
      devices.map(async (device) => {
        if (!device.location) return device;
        
        try {
          // Fetch XML
          const xmlResult = await handlers.fetchXML({ url: device.location, timeout });
          
          if (!xmlResult.success) return device;
          
          // Parse XML
          const parseResult = await handlers.parseXML({ 
            xml: xmlResult.xml, 
            deviceIp: device.ip 
          });
          
          if (!parseResult.success) return device;
          
          // Merge data
          return {
            ...device,
            ...parseResult.result,
            enriched: true,
          };
          
        } catch (err) {
          return device;
        }
      })
    );
    
    return { success: true, devices: enriched };
  },
};

/**
 * Parse SSDP response into device object
 */
function parseSSDP(response, ip) {
  const headers = {};
  const lines = response.split('\r\n');
  
  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.substring(0, colonIndex).toLowerCase().trim();
      const value = line.substring(colonIndex + 1).trim();
      headers[key] = value;
    }
  }
  
  // Skip if no useful info
  if (!headers.server && !headers.location && !headers.st) {
    return null;
  }
  
  return {
    ip,
    server: headers.server || 'Unknown',
    location: headers.location,
    st: headers.st,
    usn: headers.usn,
    discoveredAt: Date.now(),
  };
}

/**
 * Identify device type from parsed data
 */
function identifyDeviceType(data, ip) {
  const name = (data.friendlyName || '').toLowerCase();
  const manufacturer = (data.manufacturer || '').toLowerCase();
  const model = (data.modelName || '').toLowerCase();
  const type = (data.deviceType || '').toLowerCase();
  
  // Philips Hue
  if (manufacturer.includes('philips') && (name.includes('hue') || model.includes('hue'))) {
    return 'hue_bridge';
  }
  
  // Sonos
  if (manufacturer.includes('sonos') || name.includes('sonos')) {
    return 'sonos_speaker';
  }
  
  // Chromecast
  if (manufacturer.includes('google') && (name.includes('chromecast') || model.includes('chromecast'))) {
    return 'chromecast';
  }
  
  // Google Home / Nest
  if (manufacturer.includes('google') && (name.includes('home') || name.includes('nest'))) {
    return 'google_home';
  }
  
  // Roku
  if (manufacturer.includes('roku') || name.includes('roku')) {
    return 'roku';
  }
  
  // Samsung TV
  if (manufacturer.includes('samsung') && type.includes('tv')) {
    return 'samsung_tv';
  }
  
  // LG TV
  if (manufacturer.includes('lg') && type.includes('tv')) {
    return 'lg_tv';
  }
  
  // Generic media renderer
  if (type.includes('mediarenderer')) {
    return 'media_renderer';
  }
  
  // Generic media server
  if (type.includes('mediaserver')) {
    return 'media_server';
  }
  
  // Router/Gateway
  if (type.includes('gateway') || type.includes('router')) {
    return 'router';
  }
  
  return 'unknown';
}

// Listen for messages from main thread
parentPort.on('message', async (message) => {
  const { id, type, data } = message;
  
  const handler = handlers[type];
  
  if (!handler) {
    parentPort.postMessage({ 
      id, 
      success: false, 
      error: `Unknown message type: ${type}` 
    });
    return;
  }
  
  try {
    const result = await handler(data);
    parentPort.postMessage({ id, ...result });
  } catch (error) {
    parentPort.postMessage({ 
      id, 
      success: false, 
      error: error.message 
    });
  }
});

// Signal ready
parentPort.postMessage({ type: 'ready' });
