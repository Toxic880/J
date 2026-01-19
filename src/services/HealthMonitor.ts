/**
 * JARVIS HEALTH MONITOR
 * 
 * Phase 9: Bulletproof
 * 
 * The watchdog that monitors all critical systems and auto-recovers from failures.
 * 
 * Monitors:
 * - LM Studio (LLM backend)
 * - Backend server (WebSocket)
 * - Home Assistant connection
 * - Vision model availability
 * 
 * Recovery actions:
 * - Auto-restart failed services
 * - Fall back to degraded modes
 * - Queue commands during outages
 * - Notify user of issues (without being annoying)
 */

export type ServiceStatus = 'healthy' | 'degraded' | 'offline' | 'recovering';

export interface ServiceHealth {
  name: string;
  status: ServiceStatus;
  lastCheck: number;
  lastHealthy: number;
  consecutiveFailures: number;
  message?: string;
}

export interface HealthState {
  overall: ServiceStatus;
  services: {
    llm: ServiceHealth;
    backend: ServiceHealth;
    homeAssistant: ServiceHealth;
    vision: ServiceHealth;
    tts: ServiceHealth;
  };
  commandQueue: QueuedCommand[];
}

export interface QueuedCommand {
  id: string;
  text: string;
  timestamp: number;
  retries: number;
}

type HealthListener = (state: HealthState) => void;

export class HealthMonitor {
  private state: HealthState;
  private listeners: Set<HealthListener> = new Set();
  private checkIntervals: Map<string, ReturnType<typeof setInterval>> = new Map();
  private reconnectTimeouts: Map<string, ReturnType<typeof setTimeout>> = new Map();
  
  // Configuration
  private readonly LLM_CHECK_INTERVAL = 10000;      // 10 seconds
  private readonly BACKEND_CHECK_INTERVAL = 5000;   // 5 seconds
  private readonly HA_CHECK_INTERVAL = 30000;       // 30 seconds
  private readonly MAX_FAILURES_BEFORE_ACTION = 3;
  private readonly MAX_QUEUE_SIZE = 10;
  private readonly COMMAND_QUEUE_TIMEOUT = 60000;   // 1 minute max queue time
  
  // LM Studio config
  private lmStudioUrl: string = 'http://127.0.0.1:1234';
  private lmStudioPath: string = '';  // Path to LM Studio executable
  
  constructor() {
    this.state = this.createInitialState();
  }
  
  private createInitialState(): HealthState {
    const now = Date.now();
    const createService = (name: string): ServiceHealth => ({
      name,
      status: 'healthy',  // Assume healthy until proven otherwise
      lastCheck: now,
      lastHealthy: now,
      consecutiveFailures: 0,
    });
    
    return {
      overall: 'healthy',
      services: {
        llm: createService('LM Studio'),
        backend: createService('Backend Server'),
        homeAssistant: createService('Home Assistant'),
        vision: createService('Vision Model'),
        tts: createService('Text-to-Speech'),
      },
      commandQueue: [],
    };
  }
  
  // ===========================================================================
  // PUBLIC API
  // ===========================================================================
  
  /**
   * Start all health monitors
   */
  start(config?: { lmStudioUrl?: string; lmStudioPath?: string }): void {
    if (config?.lmStudioUrl) {
      this.lmStudioUrl = config.lmStudioUrl;
    }
    if (config?.lmStudioPath) {
      this.lmStudioPath = config.lmStudioPath;
    }
    
    console.log('[Health] Starting health monitors...');
    
    // Start LLM health check
    this.startLLMMonitor();
    
    // Start backend health check
    this.startBackendMonitor();
    
    // Start Home Assistant check (less frequent)
    this.startHomeAssistantMonitor();
    
    // Clean up stale queued commands periodically
    setInterval(() => this.cleanupCommandQueue(), 10000);
  }
  
  /**
   * Stop all monitors
   */
  stop(): void {
    for (const interval of this.checkIntervals.values()) {
      clearInterval(interval);
    }
    this.checkIntervals.clear();
    
    for (const timeout of this.reconnectTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.reconnectTimeouts.clear();
  }
  
  /**
   * Get current health state
   */
  getState(): HealthState {
    return { ...this.state };
  }
  
  /**
   * Subscribe to health changes
   */
  subscribe(listener: HealthListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }
  
  /**
   * Check if a service is available
   */
  isServiceHealthy(service: keyof HealthState['services']): boolean {
    return this.state.services[service].status === 'healthy';
  }
  
  /**
   * Queue a command for later execution (when service recovers)
   */
  queueCommand(text: string): string {
    if (this.state.commandQueue.length >= this.MAX_QUEUE_SIZE) {
      // Remove oldest
      this.state.commandQueue.shift();
    }
    
    const id = crypto.randomUUID();
    this.state.commandQueue.push({
      id,
      text,
      timestamp: Date.now(),
      retries: 0,
    });
    
    this.notify();
    return id;
  }
  
  /**
   * Get and clear queued commands
   */
  drainCommandQueue(): QueuedCommand[] {
    const commands = [...this.state.commandQueue];
    this.state.commandQueue = [];
    this.notify();
    return commands;
  }
  
  /**
   * Manually trigger a service check
   */
  async checkService(service: keyof HealthState['services']): Promise<ServiceHealth> {
    switch (service) {
      case 'llm':
        await this.checkLLMHealth();
        break;
      case 'backend':
        await this.checkBackendHealth();
        break;
      case 'homeAssistant':
        await this.checkHomeAssistantHealth();
        break;
      case 'vision':
        await this.checkVisionHealth();
        break;
      case 'tts':
        await this.checkTTSHealth();
        break;
    }
    return this.state.services[service];
  }
  
  // ===========================================================================
  // LLM HEALTH MONITOR
  // ===========================================================================
  
  private startLLMMonitor(): void {
    // Initial check
    this.checkLLMHealth();
    
    // Periodic checks
    const interval = setInterval(() => {
      this.checkLLMHealth();
    }, this.LLM_CHECK_INTERVAL);
    
    this.checkIntervals.set('llm', interval);
  }
  
  private async checkLLMHealth(): Promise<void> {
    const service = this.state.services.llm;
    service.lastCheck = Date.now();
    
    try {
      // Ping LM Studio models endpoint (lightweight check)
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(`${this.lmStudioUrl}/v1/models`, {
        signal: controller.signal,
      });
      
      clearTimeout(timeout);
      
      if (response.ok) {
        this.markServiceHealthy('llm');
      } else {
        this.markServiceFailed('llm', `HTTP ${response.status}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection failed';
      this.markServiceFailed('llm', message);
    }
  }
  
  private async attemptLLMRecovery(): Promise<void> {
    const service = this.state.services.llm;
    service.status = 'recovering';
    service.message = 'Attempting to restart LM Studio...';
    this.notify();
    
    console.log('[Health] Attempting LM Studio recovery...');
    
    // Try to restart via Electron
    if (window.jarvisHost?.restartLMStudio) {
      try {
        const result = await window.jarvisHost.restartLMStudio();
        
        if (result.success) {
          console.log('[Health] LM Studio restart initiated, waiting for startup...');
          
          // Wait for LM Studio to start (check every 2 seconds for 30 seconds)
          let attempts = 0;
          const checkStartup = async () => {
            attempts++;
            try {
              const response = await fetch(`${this.lmStudioUrl}/v1/models`, {
                signal: AbortSignal.timeout(3000),
              });
              
              if (response.ok) {
                console.log('[Health] LM Studio recovered!');
                this.markServiceHealthy('llm');
                return;
              }
            } catch (e) {
              // Still starting up
            }
            
            if (attempts < 15) {
              setTimeout(checkStartup, 2000);
            } else {
              console.log('[Health] LM Studio recovery failed after 30 seconds');
              this.markServiceFailed('llm', 'Recovery failed - LM Studio did not start');
              this.activateFallbackMode();
            }
          };
          
          setTimeout(checkStartup, 2000);
          return;
        }
      } catch (e) {
        console.error('[Health] LM Studio restart failed:', e);
      }
    }
    
    // Restart not available, go to fallback
    this.activateFallbackMode();
  }
  
  private activateFallbackMode(): void {
    console.log('[Health] Activating fallback mode (hardcoded responses)');
    this.state.services.llm.status = 'degraded';
    this.state.services.llm.message = 'Using fallback responses (LLM offline)';
    this.updateOverallStatus();
    this.notify();
  }
  
  // ===========================================================================
  // BACKEND HEALTH MONITOR
  // ===========================================================================
  
  private startBackendMonitor(): void {
    this.checkBackendHealth();
    
    const interval = setInterval(() => {
      this.checkBackendHealth();
    }, this.BACKEND_CHECK_INTERVAL);
    
    this.checkIntervals.set('backend', interval);
  }
  
  private async checkBackendHealth(): Promise<void> {
    const service = this.state.services.backend;
    service.lastCheck = Date.now();
    
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      
      // Try the health endpoint
      const response = await fetch('http://localhost:3001/health', {
        signal: controller.signal,
      });
      
      clearTimeout(timeout);
      
      if (response.ok) {
        this.markServiceHealthy('backend');
        
        // If we have queued commands and LLM is healthy, replay them
        if (this.state.commandQueue.length > 0 && this.isServiceHealthy('llm')) {
          this.replayQueuedCommands();
        }
      } else {
        this.markServiceFailed('backend', `HTTP ${response.status}`);
      }
    } catch (error) {
      this.markServiceFailed('backend', 'Connection failed');
    }
  }
  
  private async attemptBackendRecovery(): Promise<void> {
    const service = this.state.services.backend;
    service.status = 'recovering';
    service.message = 'Reconnecting to backend...';
    this.notify();
    
    // Exponential backoff
    const failures = service.consecutiveFailures;
    const delay = Math.min(1000 * Math.pow(2, failures - this.MAX_FAILURES_BEFORE_ACTION), 30000);
    
    console.log(`[Health] Backend recovery attempt in ${delay}ms`);
    
    // Clear any existing timeout
    const existingTimeout = this.reconnectTimeouts.get('backend');
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }
    
    const timeout = setTimeout(async () => {
      await this.checkBackendHealth();
    }, delay);
    
    this.reconnectTimeouts.set('backend', timeout);
  }
  
  private replayQueuedCommands(): void {
    const commands = this.drainCommandQueue();
    
    if (commands.length === 0) return;
    
    console.log(`[Health] Replaying ${commands.length} queued commands`);
    
    // Emit event for JarvisCore to handle
    window.dispatchEvent(new CustomEvent('jarvis-replay-commands', {
      detail: { commands },
    }));
  }
  
  // ===========================================================================
  // HOME ASSISTANT HEALTH MONITOR
  // ===========================================================================
  
  private startHomeAssistantMonitor(): void {
    this.checkHomeAssistantHealth();
    
    const interval = setInterval(() => {
      this.checkHomeAssistantHealth();
    }, this.HA_CHECK_INTERVAL);
    
    this.checkIntervals.set('homeAssistant', interval);
  }
  
  private async checkHomeAssistantHealth(): Promise<void> {
    const service = this.state.services.homeAssistant;
    service.lastCheck = Date.now();
    
    // Check if HA bridge reports connected
    try {
      const { homeAssistant } = await import('./HomeAssistantBridge');
      const status = homeAssistant.getStatus();
      
      if (!status.configured) {
        service.status = 'offline';
        service.message = 'Not configured';
      } else if (status.connected) {
        this.markServiceHealthy('homeAssistant');
      } else {
        this.markServiceFailed('homeAssistant', 'Disconnected');
      }
    } catch (e) {
      service.status = 'offline';
      service.message = 'Not available';
    }
    
    this.notify();
  }
  
  // ===========================================================================
  // VISION HEALTH (checked on-demand)
  // ===========================================================================
  
  private async checkVisionHealth(): Promise<void> {
    const service = this.state.services.vision;
    service.lastCheck = Date.now();
    
    // Vision is healthy if LLM is healthy (uses same backend)
    if (this.isServiceHealthy('llm')) {
      service.status = 'healthy';
      service.message = undefined;
    } else {
      service.status = 'degraded';
      service.message = 'Vision unavailable (LLM offline)';
    }
    
    this.notify();
  }
  
  // ===========================================================================
  // TTS HEALTH (checked on-demand)
  // ===========================================================================
  
  private async checkTTSHealth(): Promise<void> {
    const service = this.state.services.tts;
    service.lastCheck = Date.now();
    
    // TTS has multiple fallbacks, so it's almost always available
    // Check Piper first
    if (window.jarvisHost?.piperAvailable) {
      try {
        const result = await window.jarvisHost.piperAvailable();
        if (result.available) {
          service.status = 'healthy';
          service.message = 'Piper TTS';
          this.notify();
          return;
        }
      } catch (e) {
        // Piper not available
      }
    }
    
    // Browser TTS is always available
    if (window.speechSynthesis) {
      service.status = 'degraded';
      service.message = 'Using browser voice';
    } else {
      service.status = 'offline';
      service.message = 'No TTS available';
    }
    
    this.notify();
  }
  
  // ===========================================================================
  // HELPERS
  // ===========================================================================
  
  private markServiceHealthy(service: keyof HealthState['services']): void {
    const s = this.state.services[service];
    const wasUnhealthy = s.status !== 'healthy';
    
    s.status = 'healthy';
    s.lastHealthy = Date.now();
    s.consecutiveFailures = 0;
    s.message = undefined;
    
    if (wasUnhealthy) {
      console.log(`[Health] ${s.name} recovered`);
    }
    
    this.updateOverallStatus();
    this.notify();
  }
  
  private markServiceFailed(service: keyof HealthState['services'], message: string): void {
    const s = this.state.services[service];
    s.consecutiveFailures++;
    s.message = message;
    
    console.log(`[Health] ${s.name} failed (${s.consecutiveFailures}x): ${message}`);
    
    // After MAX_FAILURES_BEFORE_ACTION consecutive failures, take action
    if (s.consecutiveFailures >= this.MAX_FAILURES_BEFORE_ACTION) {
      s.status = 'offline';
      
      // Attempt recovery based on service type
      switch (service) {
        case 'llm':
          this.attemptLLMRecovery();
          break;
        case 'backend':
          this.attemptBackendRecovery();
          break;
        // Other services don't have auto-recovery
      }
    } else {
      s.status = 'degraded';
    }
    
    this.updateOverallStatus();
    this.notify();
  }
  
  private updateOverallStatus(): void {
    const services = Object.values(this.state.services);
    
    if (services.every(s => s.status === 'healthy')) {
      this.state.overall = 'healthy';
    } else if (services.some(s => s.status === 'recovering')) {
      this.state.overall = 'recovering';
    } else if (services.some(s => s.status === 'offline')) {
      // Core services offline = overall offline
      if (this.state.services.llm.status === 'offline' || 
          this.state.services.backend.status === 'offline') {
        this.state.overall = 'offline';
      } else {
        this.state.overall = 'degraded';
      }
    } else {
      this.state.overall = 'degraded';
    }
  }
  
  private cleanupCommandQueue(): void {
    const now = Date.now();
    const before = this.state.commandQueue.length;
    
    this.state.commandQueue = this.state.commandQueue.filter(
      cmd => (now - cmd.timestamp) < this.COMMAND_QUEUE_TIMEOUT
    );
    
    if (this.state.commandQueue.length !== before) {
      console.log(`[Health] Cleaned up ${before - this.state.commandQueue.length} stale queued commands`);
      this.notify();
    }
  }
  
  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }
}

// Singleton export
export const healthMonitor = new HealthMonitor();

// Type declaration for Electron bridge
declare global {
  interface Window {
    jarvisHost?: {
      restartLMStudio?: () => Promise<{ success: boolean; error?: string }>;
      piperAvailable?: () => Promise<{ available: boolean; voices: any[] }>;
      // ... other existing methods
    };
  }
}
