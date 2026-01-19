/**
 * JARVIS POWER MANAGER
 * 
 * Phase 12: Power Efficiency Mode
 * 
 * The user NEVER thinks about this. It just works.
 * 
 * Like how your phone dims the screen when idle, JARVIS automatically:
 * - Sleeps when you're not around (2W - just wake word)
 * - Wakes light for simple stuff (30W - "lights on")
 * - Goes full power only when needed (300W - "analyze this code")
 * - Falls back to sleep after you're done
 * 
 * The user sees: "Jarvis, turn on the lights" → lights turn on instantly
 * They DON'T see: Model swap, GPU spin-up, tier management
 */

export type PowerTier = 'SLEEP' | 'LIGHT' | 'FULL';

export interface PowerState {
  currentTier: PowerTier;
  targetTier: PowerTier;
  transitioning: boolean;
  lastActivity: number;
  estimatedWatts: number;
  reason: string;
}

// Commands that can be handled without the big model
const LIGHT_MODE_PATTERNS = [
  // Time & Date
  /what(?:'s| is)? (?:the )?time/i,
  /what(?:'s| is)? (?:the )?date/i,
  /what day is it/i,
  
  // Lights
  /(?:turn |switch )?(?:on |off )?(?:the )?lights?(?: on| off)?/i,
  /lights? (?:on|off)/i,
  /dim (?:the )?lights?/i,
  /brighten (?:the )?lights?/i,
  
  // Timers & Alarms
  /set (?:a |an )?(?:timer|alarm)/i,
  /cancel (?:the |my )?(?:timer|alarm)/i,
  /how much time (?:is )?left/i,
  
  // Basic queries
  /^(?:hey|hi|hello|good (?:morning|afternoon|evening))/i,
  /^(?:thanks|thank you|thx)/i,
  /^(?:stop|cancel|never ?mind)/i,
  
  // Weather (simple)
  /what(?:'s| is)? (?:the )?weather/i,
  /is it (?:going to )?rain/i,
  /temperature/i,
  
  // Music control
  /(?:play|pause|stop|skip|next|previous) (?:the )?(?:music|song|track)/i,
  /volume (?:up|down)/i,
  
  // Reminders
  /remind me (?:to |about )?/i,
  /what(?:'s| are)? my reminders?/i,
  
  // Simple math
  /what(?:'s| is)? \d+\s*[\+\-\*\/×÷]\s*\d+/i,
];

// Commands that REQUIRE the full model
const FULL_MODE_TRIGGERS = [
  // Analysis
  /analyze/i,
  /explain (?:this|the|how)/i,
  /what(?:'s| is) (?:wrong|the (?:problem|issue))/i,
  /debug/i,
  /fix (?:this|the)/i,
  
  // Writing
  /write (?:me |a |an )?/i,
  /compose/i,
  /draft/i,
  /summarize/i,
  /rewrite/i,
  
  // Complex reasoning
  /why (?:did|does|is|are|do|should)/i,
  /how (?:do|does|can|should|would)/i,
  /what (?:do you think|would happen|should I)/i,
  /compare/i,
  /difference between/i,
  
  // Code
  /code/i,
  /function/i,
  /script/i,
  /program/i,
  
  // Research
  /research/i,
  /find (?:out|information)/i,
  /look up/i,
  /search for/i,
  
  // Creative
  /story/i,
  /poem/i,
  /creative/i,
  /imagine/i,
  
  // Screen analysis
  /look at (?:this|my|the)/i,
  /what(?:'s| is) on (?:my |the )?screen/i,
  /can you see/i,
];

// Timeouts
const FULL_TO_LIGHT_TIMEOUT = 2 * 60 * 1000;  // 2 minutes
const LIGHT_TO_SLEEP_TIMEOUT = 5 * 60 * 1000; // 5 minutes

type PowerChangeCallback = (state: PowerState) => void;

class PowerManager {
  private state: PowerState = {
    currentTier: 'SLEEP',
    targetTier: 'SLEEP',
    transitioning: false,
    lastActivity: Date.now(),
    estimatedWatts: 2,
    reason: 'Initial state',
  };
  
  private listeners: Set<PowerChangeCallback> = new Set();
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private transitionPromise: Promise<void> | null = null;
  
  // LM Studio configuration
  private lmStudioUrl = 'http://127.0.0.1:1234';
  private lightModel = '';  // Will be auto-detected or configured
  private fullModel = '';   // Will be auto-detected or configured
  
  constructor() {
    // Start idle monitoring
    this.startIdleMonitor();
  }
  
  // ===========================================================================
  // PUBLIC API - What the rest of JARVIS uses
  // ===========================================================================
  
  /**
   * Get current power state
   */
  getState(): PowerState {
    return { ...this.state };
  }
  
  /**
   * Subscribe to power state changes
   */
  subscribe(callback: PowerChangeCallback): () => void {
    this.listeners.add(callback);
    callback(this.state);
    return () => this.listeners.delete(callback);
  }
  
  /**
   * Determine what power tier a command needs
   * Called BEFORE processing - returns instantly
   */
  classifyCommand(text: string): PowerTier {
    const trimmed = text.trim().toLowerCase();
    
    // Check if it's a simple command (Light mode)
    for (const pattern of LIGHT_MODE_PATTERNS) {
      if (pattern.test(trimmed)) {
        return 'LIGHT';
      }
    }
    
    // Check if it requires full power
    for (const pattern of FULL_MODE_TRIGGERS) {
      if (pattern.test(trimmed)) {
        return 'FULL';
      }
    }
    
    // Default: if it's short and simple, try Light mode first
    if (trimmed.length < 50 && !trimmed.includes('?')) {
      return 'LIGHT';
    }
    
    // Otherwise, use Full mode
    return 'FULL';
  }
  
  /**
   * Ensure we're at the right power tier for a command
   * Returns when ready (may take a moment if spinning up)
   */
  async ensureTier(tier: PowerTier): Promise<void> {
    this.recordActivity();
    
    // Already at or above the needed tier
    if (this.tierLevel(this.state.currentTier) >= this.tierLevel(tier)) {
      return;
    }
    
    // Need to power up
    await this.transitionTo(tier, `Command requires ${tier} mode`);
  }
  
  /**
   * Record user activity (resets idle timer)
   */
  recordActivity(): void {
    this.state.lastActivity = Date.now();
    this.resetIdleTimer();
  }
  
  /**
   * Wake up from sleep (called when wake word detected)
   */
  async wake(): Promise<void> {
    this.recordActivity();
    
    if (this.state.currentTier === 'SLEEP') {
      // Don't wait for full transition - just start it
      this.transitionTo('LIGHT', 'Wake word detected');
    }
  }
  
  /**
   * Force a specific tier (for testing/manual control)
   */
  async forceTier(tier: PowerTier, reason: string): Promise<void> {
    await this.transitionTo(tier, reason);
  }
  
  // ===========================================================================
  // INTERNAL - Power tier transitions
  // ===========================================================================
  
  private tierLevel(tier: PowerTier): number {
    switch (tier) {
      case 'SLEEP': return 0;
      case 'LIGHT': return 1;
      case 'FULL': return 2;
    }
  }
  
  private async transitionTo(tier: PowerTier, reason: string): Promise<void> {
    if (this.state.currentTier === tier) return;
    
    // If already transitioning, wait for it
    if (this.transitionPromise) {
      await this.transitionPromise;
      if (this.state.currentTier === tier) return;
    }
    
    this.transitionPromise = this._doTransition(tier, reason);
    await this.transitionPromise;
    this.transitionPromise = null;
  }
  
  private async _doTransition(tier: PowerTier, reason: string): Promise<void> {
    console.log(`[Power] Transitioning: ${this.state.currentTier} → ${tier} (${reason})`);
    
    this.state.targetTier = tier;
    this.state.transitioning = true;
    this.state.reason = reason;
    this.notify();
    
    try {
      const from = this.state.currentTier;
      
      // Handle each transition type
      if (tier === 'SLEEP') {
        await this.enterSleep();
      } else if (tier === 'LIGHT') {
        if (from === 'SLEEP') {
          await this.wakeToLight();
        } else if (from === 'FULL') {
          await this.dropToLight();
        }
      } else if (tier === 'FULL') {
        await this.enterFull();
      }
      
      this.state.currentTier = tier;
      this.state.estimatedWatts = this.getWattsForTier(tier);
      
    } catch (error) {
      console.error('[Power] Transition failed:', error);
      // Stay at current tier on failure
      this.state.targetTier = this.state.currentTier;
    } finally {
      this.state.transitioning = false;
      this.notify();
    }
  }
  
  private getWattsForTier(tier: PowerTier): number {
    switch (tier) {
      case 'SLEEP': return 2;
      case 'LIGHT': return 30;
      case 'FULL': return 300;
    }
  }
  
  // ===========================================================================
  // TIER IMPLEMENTATIONS
  // ===========================================================================
  
  /**
   * Enter sleep mode - unload models, minimal CPU
   */
  private async enterSleep(): Promise<void> {
    console.log('[Power] Entering SLEEP mode');
    
    // Try to unload models via LM Studio API
    if (this.fullModel) {
      await this.unloadModel(this.fullModel).catch(() => {});
    }
    if (this.lightModel && this.lightModel !== this.fullModel) {
      await this.unloadModel(this.lightModel).catch(() => {});
    }
    
    // Notify UI to dim
    window.dispatchEvent(new CustomEvent('jarvis-power-sleep'));
  }
  
  /**
   * Wake from sleep to light mode
   */
  private async wakeToLight(): Promise<void> {
    console.log('[Power] Waking to LIGHT mode');
    
    // Load light model if configured
    if (this.lightModel) {
      await this.loadModel(this.lightModel).catch(err => {
        console.warn('[Power] Could not load light model:', err.message);
      });
    }
    
    // Notify UI to wake up
    window.dispatchEvent(new CustomEvent('jarvis-power-wake'));
  }
  
  /**
   * Drop from full to light mode
   */
  private async dropToLight(): Promise<void> {
    console.log('[Power] Dropping to LIGHT mode');
    
    // Unload full model, keep light model
    if (this.fullModel && this.fullModel !== this.lightModel) {
      await this.unloadModel(this.fullModel).catch(() => {});
    }
    
    // Load light model if not already
    if (this.lightModel) {
      await this.loadModel(this.lightModel).catch(() => {});
    }
  }
  
  /**
   * Enter full power mode
   */
  private async enterFull(): Promise<void> {
    console.log('[Power] Entering FULL mode');
    
    // Load full model
    if (this.fullModel) {
      await this.loadModel(this.fullModel).catch(err => {
        console.warn('[Power] Could not load full model:', err.message);
      });
    }
    
    // Notify UI we're at full power
    window.dispatchEvent(new CustomEvent('jarvis-power-full'));
  }
  
  // ===========================================================================
  // LM STUDIO MODEL MANAGEMENT
  // ===========================================================================
  
  /**
   * Configure LM Studio models
   */
  configure(config: {
    lmStudioUrl?: string;
    lightModel?: string;
    fullModel?: string;
  }): void {
    if (config.lmStudioUrl) this.lmStudioUrl = config.lmStudioUrl;
    if (config.lightModel) this.lightModel = config.lightModel;
    if (config.fullModel) this.fullModel = config.fullModel;
    
    console.log('[Power] Configured:', {
      url: this.lmStudioUrl,
      light: this.lightModel,
      full: this.fullModel,
    });
  }
  
  /**
   * Auto-detect available models from LM Studio
   */
  async detectModels(): Promise<void> {
    try {
      const response = await fetch(`${this.lmStudioUrl}/v1/models`, {
        signal: AbortSignal.timeout(5000),
      });
      
      if (!response.ok) return;
      
      const data = await response.json();
      const models = data.data || [];
      
      if (models.length === 0) return;
      
      // Sort by size (smaller models first based on name heuristics)
      const sorted = models.sort((a: any, b: any) => {
        const aSize = this.estimateModelSize(a.id);
        const bSize = this.estimateModelSize(b.id);
        return aSize - bSize;
      });
      
      // Use smallest as light, largest as full
      this.lightModel = sorted[0].id;
      this.fullModel = sorted[sorted.length - 1].id;
      
      // If only one model, use it for both
      if (sorted.length === 1) {
        this.fullModel = this.lightModel;
      }
      
      console.log('[Power] Auto-detected models:', {
        light: this.lightModel,
        full: this.fullModel,
      });
      
    } catch (e) {
      console.warn('[Power] Could not detect models:', e);
    }
  }
  
  private estimateModelSize(modelId: string): number {
    const lower = modelId.toLowerCase();
    
    // Check for size indicators
    if (lower.includes('0.5b') || lower.includes('0b5')) return 0.5;
    if (lower.includes('1b')) return 1;
    if (lower.includes('3b')) return 3;
    if (lower.includes('7b')) return 7;
    if (lower.includes('8b')) return 8;
    if (lower.includes('13b')) return 13;
    if (lower.includes('14b')) return 14;
    if (lower.includes('32b')) return 32;
    if (lower.includes('70b')) return 70;
    
    // Default to medium
    return 7;
  }
  
  private async loadModel(modelId: string): Promise<void> {
    console.log(`[Power] Loading model: ${modelId}`);
    
    // LM Studio loads models automatically when you send a request
    // But we can prime it by sending a minimal request
    try {
      await fetch(`${this.lmStudioUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelId,
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 1,
        }),
        signal: AbortSignal.timeout(30000), // 30s for model load
      });
    } catch (e) {
      // Timeout is expected if model is loading
      console.log(`[Power] Model ${modelId} load initiated`);
    }
  }
  
  private async unloadModel(modelId: string): Promise<void> {
    console.log(`[Power] Unloading model: ${modelId}`);
    
    // LM Studio doesn't have a direct unload API
    // Models are managed by LM Studio's memory system
    // We can try the /models/unload endpoint if available
    try {
      await fetch(`${this.lmStudioUrl}/api/models/unload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelId }),
        signal: AbortSignal.timeout(5000),
      });
    } catch (e) {
      // Unload API might not exist - that's okay
    }
  }
  
  // ===========================================================================
  // IDLE MONITORING
  // ===========================================================================
  
  private startIdleMonitor(): void {
    // Check every 30 seconds
    setInterval(() => this.checkIdle(), 30000);
  }
  
  private checkIdle(): void {
    const idleTime = Date.now() - this.state.lastActivity;
    
    if (this.state.currentTier === 'FULL' && idleTime > FULL_TO_LIGHT_TIMEOUT) {
      this.transitionTo('LIGHT', 'Idle timeout (Full → Light)');
    } else if (this.state.currentTier === 'LIGHT' && idleTime > LIGHT_TO_SLEEP_TIMEOUT) {
      this.transitionTo('SLEEP', 'Idle timeout (Light → Sleep)');
    }
  }
  
  private resetIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
    }
    
    // Set timeout based on current tier
    const timeout = this.state.currentTier === 'FULL' 
      ? FULL_TO_LIGHT_TIMEOUT 
      : LIGHT_TO_SLEEP_TIMEOUT;
    
    this.idleTimer = setTimeout(() => this.checkIdle(), timeout);
  }
  
  // ===========================================================================
  // HELPERS
  // ===========================================================================
  
  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.state);
      } catch (e) {
        console.error('[Power] Listener error:', e);
      }
    }
  }
}

// Export singleton
export const powerManager = new PowerManager();

// Also export class for testing
export { PowerManager };
