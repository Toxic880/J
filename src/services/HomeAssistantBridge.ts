/**
 * HOME ASSISTANT NATIVE BRIDGE
 * 
 * Phase 8: Production Grade
 * 
 * Instead of writing individual integrations for Hue, Wemo, Lifx, etc.,
 * we let Home Assistant handle device compatibility and just talk to HA.
 * 
 * This instantly gives JARVIS access to 2000+ device types.
 * 
 * Flow:
 *   1. User enters HA URL and token
 *   2. We fetch all entities from HA
 *   3. We expose them as JARVIS devices
 *   4. Commands go through HA's service calls
 */

export interface HAEntity {
  entity_id: string;
  state: string;
  attributes: {
    friendly_name?: string;
    device_class?: string;
    icon?: string;
    supported_features?: number;
    brightness?: number;
    color_temp?: number;
    rgb_color?: [number, number, number];
    [key: string]: any;
  };
  last_changed: string;
  last_updated: string;
  context: {
    id: string;
    parent_id: string | null;
    user_id: string | null;
  };
}

export interface HAServiceCall {
  domain: string;
  service: string;
  target?: {
    entity_id?: string | string[];
    device_id?: string | string[];
    area_id?: string | string[];
  };
  service_data?: Record<string, any>;
}

export interface HAConfig {
  url: string;           // e.g., "http://homeassistant.local:8123"
  token: string;         // Long-lived access token
  autoDiscovery?: boolean;
}

export interface JarvisDevice {
  id: string;
  name: string;
  type: 'light' | 'switch' | 'climate' | 'media' | 'cover' | 'lock' | 'sensor' | 'binary_sensor' | 'camera' | 'vacuum' | 'fan' | 'other';
  area?: string;
  state: string;
  isOn?: boolean;
  brightness?: number;
  attributes: Record<string, any>;
  entityId: string;
  source: 'home_assistant';
}

export class HomeAssistantBridge {
  private config: HAConfig | null = null;
  private entities: Map<string, HAEntity> = new Map();
  private areas: Map<string, string> = new Map(); // area_id -> name
  private websocket: WebSocket | null = null;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private eventListeners: Set<(event: any) => void> = new Set();
  private isConnected: boolean = false;
  private messageId: number = 1;
  private pendingRequests: Map<number, { resolve: Function; reject: Function }> = new Map();
  
  constructor() {}
  
  // ===========================================================================
  // CONFIGURATION
  // ===========================================================================
  
  /**
   * Configure the Home Assistant connection
   */
  async configure(config: HAConfig): Promise<{ success: boolean; error?: string; deviceCount?: number }> {
    this.config = config;
    
    // Test connection
    try {
      const response = await this.apiCall('/api/');
      if (!response.message) {
        return { success: false, error: 'Invalid Home Assistant URL or not running' };
      }
      
      // Load all entities
      await this.loadEntities();
      
      // Load areas
      await this.loadAreas();
      
      // Connect WebSocket for real-time updates
      await this.connectWebSocket();
      
      console.log(`[HA Bridge] Connected! ${this.entities.size} entities loaded`);
      
      return { success: true, deviceCount: this.entities.size };
      
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection failed';
      console.error('[HA Bridge] Configuration failed:', message);
      return { success: false, error: message };
    }
  }
  
  /**
   * Check if configured and connected
   */
  isConfigured(): boolean {
    return this.config !== null && this.isConnected;
  }
  
  /**
   * Get connection status
   */
  getStatus(): { configured: boolean; connected: boolean; entityCount: number } {
    return {
      configured: this.config !== null,
      connected: this.isConnected,
      entityCount: this.entities.size,
    };
  }
  
  // ===========================================================================
  // API CALLS
  // ===========================================================================
  
  /**
   * Make an API call to Home Assistant
   */
  private async apiCall(endpoint: string, method: string = 'GET', body?: any): Promise<any> {
    if (!this.config) {
      throw new Error('Home Assistant not configured');
    }
    
    const url = `${this.config.url}${endpoint}`;
    
    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${this.config.token}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HA API error ${response.status}: ${text}`);
    }
    
    return response.json();
  }
  
  /**
   * Load all entities from Home Assistant
   */
  private async loadEntities(): Promise<void> {
    const states = await this.apiCall('/api/states');
    
    this.entities.clear();
    for (const entity of states) {
      this.entities.set(entity.entity_id, entity);
    }
  }
  
  /**
   * Load areas (rooms) from Home Assistant
   */
  private async loadAreas(): Promise<void> {
    try {
      // Areas require WebSocket API, so we'll get them from entity registry
      const registry = await this.apiCall('/api/config/entity_registry/list');
      
      // Also get area registry
      try {
        const areas = await this.apiCall('/api/config/area_registry/list');
        for (const area of areas) {
          this.areas.set(area.area_id, area.name);
        }
      } catch (e) {
        // Area registry might not be available
      }
    } catch (e) {
      console.warn('[HA Bridge] Could not load areas:', e);
    }
  }
  
  // ===========================================================================
  // WEBSOCKET FOR REAL-TIME UPDATES
  // ===========================================================================
  
  /**
   * Connect to Home Assistant WebSocket API
   */
  private async connectWebSocket(): Promise<void> {
    if (!this.config) return;
    
    const wsUrl = this.config.url.replace(/^http/, 'ws') + '/api/websocket';
    
    return new Promise((resolve, reject) => {
      try {
        this.websocket = new WebSocket(wsUrl);
        
        this.websocket.onopen = () => {
          console.log('[HA Bridge] WebSocket connected');
        };
        
        this.websocket.onmessage = (event) => {
          const data = JSON.parse(event.data);
          this.handleWebSocketMessage(data, resolve);
        };
        
        this.websocket.onerror = (error) => {
          console.error('[HA Bridge] WebSocket error:', error);
          reject(error);
        };
        
        this.websocket.onclose = () => {
          console.log('[HA Bridge] WebSocket closed');
          this.isConnected = false;
          this.attemptReconnect();
        };
        
        // Timeout
        setTimeout(() => {
          if (!this.isConnected) {
            reject(new Error('WebSocket connection timeout'));
          }
        }, 10000);
        
      } catch (error) {
        reject(error);
      }
    });
  }
  
  /**
   * Handle WebSocket messages
   */
  private handleWebSocketMessage(data: any, onAuthSuccess?: Function): void {
    switch (data.type) {
      case 'auth_required':
        // Send authentication
        this.websocket?.send(JSON.stringify({
          type: 'auth',
          access_token: this.config!.token,
        }));
        break;
        
      case 'auth_ok':
        this.isConnected = true;
        this.reconnectAttempts = 0;
        
        // Subscribe to state changes
        this.websocket?.send(JSON.stringify({
          id: this.messageId++,
          type: 'subscribe_events',
          event_type: 'state_changed',
        }));
        
        onAuthSuccess?.();
        break;
        
      case 'auth_invalid':
        console.error('[HA Bridge] Invalid authentication');
        this.websocket?.close();
        break;
        
      case 'event':
        if (data.event?.event_type === 'state_changed') {
          this.handleStateChange(data.event.data);
        }
        break;
        
      case 'result':
        // Handle response to our requests
        const pending = this.pendingRequests.get(data.id);
        if (pending) {
          if (data.success) {
            pending.resolve(data.result);
          } else {
            pending.reject(new Error(data.error?.message || 'Request failed'));
          }
          this.pendingRequests.delete(data.id);
        }
        break;
    }
  }
  
  /**
   * Handle state change events
   */
  private handleStateChange(data: { entity_id: string; new_state: HAEntity; old_state: HAEntity }): void {
    const { entity_id, new_state } = data;
    
    if (new_state) {
      this.entities.set(entity_id, new_state);
      
      // Notify listeners
      for (const listener of this.eventListeners) {
        listener({
          type: 'state_changed',
          entity_id,
          state: new_state,
        });
      }
    }
  }
  
  /**
   * Attempt to reconnect WebSocket
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[HA Bridge] Max reconnect attempts reached');
      return;
    }
    
    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    
    console.log(`[HA Bridge] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    setTimeout(() => {
      this.connectWebSocket().catch(e => {
        console.error('[HA Bridge] Reconnect failed:', e);
      });
    }, delay);
  }
  
  /**
   * Subscribe to state changes
   */
  onStateChange(callback: (event: any) => void): () => void {
    this.eventListeners.add(callback);
    return () => this.eventListeners.delete(callback);
  }
  
  // ===========================================================================
  // DEVICE ACCESS
  // ===========================================================================
  
  /**
   * Get all devices as JARVIS-compatible format
   */
  getAllDevices(): JarvisDevice[] {
    const devices: JarvisDevice[] = [];
    
    for (const [entityId, entity] of this.entities) {
      const device = this.entityToDevice(entity);
      if (device) {
        devices.push(device);
      }
    }
    
    return devices;
  }
  
  /**
   * Get devices by type
   */
  getDevicesByType(type: JarvisDevice['type']): JarvisDevice[] {
    return this.getAllDevices().filter(d => d.type === type);
  }
  
  /**
   * Get devices by area/room
   */
  getDevicesByArea(areaName: string): JarvisDevice[] {
    const nameLower = areaName.toLowerCase();
    return this.getAllDevices().filter(d => 
      d.area?.toLowerCase().includes(nameLower) ||
      d.name.toLowerCase().includes(nameLower)
    );
  }
  
  /**
   * Find a device by name (fuzzy match)
   */
  findDevice(query: string): JarvisDevice | null {
    const queryLower = query.toLowerCase();
    
    for (const [entityId, entity] of this.entities) {
      const name = entity.attributes.friendly_name?.toLowerCase() || entityId.toLowerCase();
      if (name.includes(queryLower)) {
        return this.entityToDevice(entity);
      }
    }
    
    return null;
  }
  
  /**
   * Convert HA entity to JARVIS device
   */
  private entityToDevice(entity: HAEntity): JarvisDevice | null {
    const domain = entity.entity_id.split('.')[0];
    
    // Skip internal/system entities
    if (['automation', 'script', 'scene', 'input_boolean', 'input_number', 'input_select', 'input_text', 'input_datetime', 'timer', 'counter', 'persistent_notification', 'zone', 'person', 'device_tracker', 'sun', 'weather', 'update'].includes(domain)) {
      return null;
    }
    
    const type = this.domainToType(domain);
    const isOn = ['on', 'playing', 'open', 'unlocked', 'home'].includes(entity.state.toLowerCase());
    
    return {
      id: entity.entity_id,
      name: entity.attributes.friendly_name || entity.entity_id,
      type,
      area: undefined, // Would need area registry lookup
      state: entity.state,
      isOn,
      brightness: entity.attributes.brightness ? Math.round(entity.attributes.brightness / 2.55) : undefined,
      attributes: entity.attributes,
      entityId: entity.entity_id,
      source: 'home_assistant',
    };
  }
  
  /**
   * Map HA domain to JARVIS device type
   */
  private domainToType(domain: string): JarvisDevice['type'] {
    const mapping: Record<string, JarvisDevice['type']> = {
      'light': 'light',
      'switch': 'switch',
      'climate': 'climate',
      'media_player': 'media',
      'cover': 'cover',
      'lock': 'lock',
      'sensor': 'sensor',
      'binary_sensor': 'binary_sensor',
      'camera': 'camera',
      'vacuum': 'vacuum',
      'fan': 'fan',
    };
    
    return mapping[domain] || 'other';
  }
  
  // ===========================================================================
  // DEVICE CONTROL
  // ===========================================================================
  
  /**
   * Call a Home Assistant service
   */
  async callService(domain: string, service: string, data?: Record<string, any>, entityId?: string): Promise<void> {
    const serviceData: any = { ...data };
    if (entityId) {
      serviceData.entity_id = entityId;
    }
    
    await this.apiCall(`/api/services/${domain}/${service}`, 'POST', serviceData);
  }
  
  /**
   * Turn on a device
   */
  async turnOn(entityIdOrName: string, options?: { brightness?: number }): Promise<string> {
    const device = this.resolveDevice(entityIdOrName);
    if (!device) {
      return `I couldn't find a device called "${entityIdOrName}"`;
    }
    
    const domain = device.entityId.split('.')[0];
    const serviceData: any = {};
    
    if (options?.brightness && domain === 'light') {
      serviceData.brightness_pct = options.brightness;
    }
    
    await this.callService(domain, 'turn_on', serviceData, device.entityId);
    
    return `${device.name} is now on${options?.brightness ? ` at ${options.brightness}%` : ''}, Sir.`;
  }
  
  /**
   * Turn off a device
   */
  async turnOff(entityIdOrName: string): Promise<string> {
    const device = this.resolveDevice(entityIdOrName);
    if (!device) {
      return `I couldn't find a device called "${entityIdOrName}"`;
    }
    
    const domain = device.entityId.split('.')[0];
    await this.callService(domain, 'turn_off', {}, device.entityId);
    
    return `${device.name} is now off, Sir.`;
  }
  
  /**
   * Toggle a device
   */
  async toggle(entityIdOrName: string): Promise<string> {
    const device = this.resolveDevice(entityIdOrName);
    if (!device) {
      return `I couldn't find a device called "${entityIdOrName}"`;
    }
    
    const domain = device.entityId.split('.')[0];
    await this.callService(domain, 'toggle', {}, device.entityId);
    
    return `${device.name} toggled, Sir.`;
  }
  
  /**
   * Set brightness (for lights)
   */
  async setBrightness(entityIdOrName: string, brightness: number): Promise<string> {
    const device = this.resolveDevice(entityIdOrName);
    if (!device) {
      return `I couldn't find a device called "${entityIdOrName}"`;
    }
    
    if (device.type !== 'light') {
      return `${device.name} doesn't support brightness control.`;
    }
    
    await this.callService('light', 'turn_on', { brightness_pct: brightness }, device.entityId);
    
    return `${device.name} set to ${brightness}%, Sir.`;
  }
  
  /**
   * Control all lights in an area
   */
  async controlArea(areaName: string, action: 'on' | 'off', brightness?: number): Promise<string> {
    const devices = this.getDevicesByArea(areaName).filter(d => d.type === 'light' || d.type === 'switch');
    
    if (devices.length === 0) {
      return `I couldn't find any controllable devices in "${areaName}"`;
    }
    
    const entityIds = devices.map(d => d.entityId);
    const serviceData: any = { entity_id: entityIds };
    
    if (brightness && action === 'on') {
      serviceData.brightness_pct = brightness;
    }
    
    await this.callService('homeassistant', `turn_${action}`, serviceData);
    
    return `${devices.length} ${action === 'on' ? 'turned on' : 'turned off'} in ${areaName}, Sir.`;
  }
  
  /**
   * Resolve a device by name or entity_id
   */
  private resolveDevice(query: string): JarvisDevice | null {
    // Direct entity_id match
    const entity = this.entities.get(query);
    if (entity) {
      return this.entityToDevice(entity);
    }
    
    // Fuzzy name match
    return this.findDevice(query);
  }
  
  /**
   * Get entity state
   */
  getState(entityId: string): HAEntity | null {
    return this.entities.get(entityId) || null;
  }
  
  // ===========================================================================
  // CLEANUP
  // ===========================================================================
  
  /**
   * Disconnect and cleanup
   */
  disconnect(): void {
    if (this.websocket) {
      this.websocket.close();
      this.websocket = null;
    }
    
    this.entities.clear();
    this.areas.clear();
    this.isConnected = false;
    this.config = null;
  }
}

// Export singleton
export const homeAssistant = new HomeAssistantBridge();
