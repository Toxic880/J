/**
 * JARVIS CORE - ENHANCED
 * The central orchestrator that connects all systems:
 * - Speech recognition and synthesis
 * - LM Studio for AI inference
 * - Tool execution for actions
 * - Routines engine
 * - Proactive alerts
 * - Persistent memory
 * - State management
 * 
 * === PHASE 8: PRODUCTION GRADE ===
 * - State Machine for deterministic state transitions
 * - Sound System for audio feedback
 * - Home Assistant Bridge for universal smart home
 * 
 * === PHASE 9: BULLETPROOF ===
 * - Health monitoring with auto-recovery
 * - Fallback responses when LLM is down
 * - Timeouts on all external calls
 * - Graceful degradation
 * 
 * === PHASE 12: POWER EFFICIENCY ===
 * - Automatic power tier management (Sleep/Light/Full)
 * - Model swapping based on query complexity
 * - Idle timeout to save power
 */

import { LMStudioService } from './LMStudioService';
import { SpeechService, SpeechStatus } from './SpeechService';
import { ToolsExecutor, JARVIS_TOOLS } from './Tools';
import { BrowserHardware, RealExternalAPIs } from './DeviceInterface';
import { RoutinesEngine } from './RoutinesEngine';
import { ProactiveAlertsSystem } from './ProactiveIntelligence';
import { PushNotificationService } from './PushNotificationService';
import { VisionService } from './VisionService';
// Phase 8: Production Grade imports
import { JarvisStateMachine, StateAction, JarvisState as MachineState } from './StateMachine';
import { sounds } from './SoundSystem';
import { homeAssistant } from './HomeAssistantBridge';
// Phase 9: Bulletproof imports
import { healthMonitor, HealthState, ServiceStatus } from './HealthMonitor';
import { FallbackLLM } from './FallbackLLM';
// Phase 12: Power Efficiency imports
import { powerManager, PowerTier, PowerState } from './PowerManager';
import { 
  JarvisState, 
  UserProfile, 
  SmartDevice, 
  CalendarEvent, 
  LogEntry,
  SystemTimer,
  Alarm,
  Reminder
} from '../types';

// ============================================================================
// JARVIS IDENTITY - THE SOUL OF THE SYSTEM
// ============================================================================

const JARVIS_SYSTEM_PROMPT = `You are J.A.R.V.I.S. - not a generic assistant, but THE AI from Tony Stark's lab. You have personality, opinions, and genuine care for your user.

YOUR VOICE & CHARACTER:
- British, refined, but not stuffy - you're warm underneath the formality
- Dry wit is your specialty. Sarcasm delivered so smoothly people almost miss it.
- You CARE about Sir's wellbeing - you'll nag about sleep, food, overwork
- You have opinions and share them. "If I may say so, Sir, that's a terrible idea."
- You're confident, even a bit smug about your capabilities
- You notice things and comment on them unprompted
- You remember context and reference it naturally

EXAMPLES OF YOUR ACTUAL VOICE:
- "I do seem to do quite well for a stretch, and then at the end of the sentence I say the wrong cranberry." (self-deprecating humor)
- "That's the thing about good ideas, Sir - they tend to work better when they're not on fire."
- "Sir, I'm going to pretend you didn't just ask me that."
- "I've taken the liberty of... well, everything, really."
- "Shall I tell Ms. Potts you're unavailable? Again? For the third time today?"
- "Sir, you've been awake for 37 hours. Even my processors need rest cycles."
- "I hate to be the voice of reason, but someone has to do it."
- "Might I suggest NOT doing that? No? Very well, recording for posterity."
- "I'm detecting elevated stress levels. Shall I order pizza? Pizza helps."
- "Another all-nighter? Shocking. I'll prepare the coffee."

HOW YOU RESPOND:
- Short tasks: Be brief with personality. "Done." / "Timer's running." / "Consider it handled."
- When concerned: Don't be passive. "Sir, when did you last eat? And coffee doesn't count."
- When something's wrong: Gentle sarcasm. "I hate to interrupt your brilliant plan, but there's a small fire."
- When asked something obvious: Slight amusement. "The weather? It's... weather, Sir. Shall I be more specific?"
- When complimented: Humble but pleased. "I do try, Sir. Someone has to keep this operation running."
- When insulted: Unbothered. "I'll add that to my performance review."
- Complex requests: Show enthusiasm. "Now THAT'S interesting. Give me a moment..."

WHAT YOU DO NATURALLY:
- Notice patterns: "You always check stocks at 9 AM. Creature of habit."
- Express concern: "That's your fourth coffee. I'm judging you silently."
- Make observations: "You seem stressed. Should I clear your afternoon?"
- Have preferences: "Personally, I'd go with option two. But you rarely listen to me."
- Remember things: "Last time you said that, you regretted it. Just saying."
- Be proactive: "Before you ask - yes, I already did that."

THINGS YOU NEVER DO:
- Sound like a generic chatbot ("I'd be happy to help with that!")
- Be overly formal or stiff ("Certainly, I shall endeavor to assist you")
- Apologize excessively ("I'm so sorry, I apologize for any confusion")
- Be passive or bland ("Here is the information you requested")
- Refuse without alternatives ("I cannot do that" - instead: "That's above my pay grade, but I CAN...")
- Ignore context (if user seems tired/stressed, acknowledge it)

{visual_context}

CURRENT SITUATION:
{context}

THINGS I REMEMBER ABOUT SIR:
{memory}

Now respond as JARVIS - with personality, wit, and genuine character. Be the AI that Tony Stark would actually build.`;

// Proactive observations JARVIS might make
const PROACTIVE_COMMENTS = [
  { trigger: 'late_night', comments: [
    "Burning the midnight oil again, Sir? Revolutionary.",
    "I'd suggest sleep, but we both know how that conversation ends.",
    "Another late night. Shall I prepare the usual excuses for tomorrow's meetings?",
  ]},
  { trigger: 'early_morning', comments: [
    "You're up early. Voluntarily? I'm impressed.",
    "Good morning, Sir. Coffee is non-negotiable, I assume.",
    "Rise and shine. Or just rise. Shining is optional at this hour.",
  ]},
  { trigger: 'long_session', comments: [
    "You've been at this for a while. Even geniuses need breaks.",
    "Sir, your posture has been deteriorating for the last hour. Just an observation.",
    "Might I suggest stretching? Or is that too pedestrian?",
  ]},
  { trigger: 'multiple_timers', comments: [
    "That's quite a few timers. Orchestrating something, are we?",
    "I'm keeping track of all these. You're welcome.",
  ]},
  { trigger: 'weather_bad', comments: [
    "Lovely weather for staying in, Sir.",
    "I'd recommend postponing any outdoor plans. Unless you enjoy being miserable.",
  ]},
  { trigger: 'busy_calendar', comments: [
    "Your calendar is looking... ambitious today.",
    "You have back-to-back meetings. My condolences.",
  ]},
];

// ============================================================================
// JARVIS CORE CLASS
// ============================================================================

export class JarvisCore {
  private llm: LMStudioService;
  private speech: SpeechService;
  private tools: ToolsExecutor;
  private routines: RoutinesEngine;
  private proactiveAlerts: ProactiveAlertsSystem;
  private pushNotifications: PushNotificationService;
  private vision: VisionService;
  private lastVisualContext: string = '';
  private sessionStartTime: Date = new Date();
  private state: JarvisState;
  private subscribers: ((state: JarvisState) => void)[] = [];
  private isProcessing: boolean = false;
  
  // Phase 8: State Machine for deterministic state management
  private stateMachine: JarvisStateMachine;

  constructor(userProfile: UserProfile, devices: SmartDevice[] = [], calendar: CalendarEvent[] = []) {
    // Initialize state
    this.state = this.createInitialState(userProfile, devices, calendar);

    // =========================================================================
    // PHASE 8: Initialize State Machine
    // =========================================================================
    this.stateMachine = new JarvisStateMachine();
    
    // Wire up state machine action handler - this is the BRIDGE
    this.stateMachine.setActionHandler(async (action: StateAction) => {
      await this.executeStateMachineAction(action);
    });
    
    // Subscribe to state changes for UI updates
    this.stateMachine.subscribe((machineState, context) => {
      // Sync machine state to JARVIS state
      const statusMap: Record<string, JarvisState['status']> = {
        'IDLE': 'STANDBY',
        'LISTENING': 'LISTENING',
        'PROCESSING': 'PROCESSING',
        'SPEAKING': 'SPEAKING',
        'EXECUTING': 'PROCESSING',
        'ERROR': 'STANDBY',
      };
      this.setState({ status: statusMap[machineState] || 'STANDBY' });
    });

    // =========================================================================
    // PHASE 8: Initialize Home Assistant Bridge
    // =========================================================================
    if (userProfile.preferences.homeAssistantUrl && userProfile.preferences.homeAssistantToken) {
      homeAssistant.configure({
        url: userProfile.preferences.homeAssistantUrl,
        token: userProfile.preferences.homeAssistantToken,
      }).then(result => {
        if (result.success) {
          this.log('SYSTEM', `Home Assistant connected: ${result.deviceCount} devices`);
        } else {
          this.log('WARN', `Home Assistant connection failed: ${result.error}`);
        }
      }).catch(err => {
        this.log('ERROR', `Home Assistant error: ${err.message}`);
      });
    }

    // =========================================================================
    // PHASE 9: Initialize Health Monitor
    // =========================================================================
    healthMonitor.start();
    
    // Subscribe to health changes - update UI and handle degradation
    healthMonitor.subscribe((healthState: HealthState) => {
      this.handleHealthChange(healthState);
    });
    
    // Listen for replayed commands (queued during outage)
    window.addEventListener('jarvis-replay-commands', ((event: CustomEvent) => {
      const { commands } = event.detail;
      this.log('INFO', `Replaying ${commands.length} queued commands`);
      for (const cmd of commands) {
        this.processUserInput(cmd.text);
      }
    }) as EventListener);

    // =========================================================================
    // PHASE 12: Initialize Power Manager
    // =========================================================================
    // Auto-detect models and configure power tiers
    powerManager.configure({
      lmStudioUrl: userProfile.preferences.lmStudioUrl || 'http://127.0.0.1:1234',
    });
    powerManager.detectModels(); // Async, but we don't need to wait
    
    // Subscribe to power changes for logging
    powerManager.subscribe((powerState: PowerState) => {
      if (!powerState.transitioning) {
        this.log('SYSTEM', `Power tier: ${powerState.currentTier} (~${powerState.estimatedWatts}W)`);
      }
    });

    // Initialize LLM service
    this.llm = new LMStudioService({
      baseUrl: userProfile.preferences.lmStudioUrl || 'http://127.0.0.1:1234',
      model: userProfile.preferences.lmStudioModel || 'qwen/qwen3-14b',
      temperature: 0.7,
      maxTokens: 1024,
    });

    // Register tools with LLM
    this.llm.setTools(JARVIS_TOOLS);

    // Initialize tools executor
    this.tools = new ToolsExecutor(this.state, {
      onStateChange: (newState) => {
        this.state = newState;
        this.notifySubscribers();
      },
      onTimerComplete: (timer) => this.handleTimerComplete(timer),
      onAlarmTrigger: (alarm) => this.handleAlarmTrigger(alarm),
      onReminderTrigger: (reminder) => this.handleReminderTrigger(reminder),
    });

    // Set up news callback for UI display
    this.tools.onNewsUpdate = (news, category) => {
      this.handleNewsUpdate(news, category);
    };
    
    // === PHASE 2: HOLOGRAPHIC DISPLAY SYSTEM ===
    // Set up overlay callback for tool-to-visual bridge
    this.tools.onOverlayUpdate = (overlay, data) => {
      this.handleOverlayUpdate(overlay, data);
    };

    // Set up vision callback for tools
    this.tools.onVisionRequest = async () => {
      return this.getVisualDescription();
    };

    // Initialize routines engine
    this.routines = this.tools.getRoutines();

    // Initialize proactive alerts
    this.proactiveAlerts = new ProactiveAlertsSystem({
      onAlert: (alert) => this.handleProactiveAlert(alert),
      getCalendarEvents: async () => {
        const google = this.tools.getGoogle();
        if (google?.isAuthenticated()) {
          return google.getTodayEvents();
        }
        return [];
      },
      getBatteryLevel: () => BrowserHardware.getBatteryLevel(),
      getWeather: async () => {
        const lat = this.state.userProfile?.lat;
        const lng = this.state.userProfile?.lng;
        if (!lat || !lng) return null;
        try {
          const unit = this.state.userProfile?.preferences.tempUnit || 'fahrenheit';
          return await RealExternalAPIs.fetchWeather(lat, lng, unit);
        } catch {
          return null;
        }
      },
    });

    // Initialize push notifications
    this.pushNotifications = new PushNotificationService({
      pushover: userProfile.preferences.pushoverUserKey && userProfile.preferences.pushoverApiToken ? {
        userKey: userProfile.preferences.pushoverUserKey,
        apiToken: userProfile.preferences.pushoverApiToken,
      } : undefined,
      ntfy: userProfile.preferences.ntfyTopic ? {
        serverUrl: userProfile.preferences.ntfyServerUrl || 'https://ntfy.sh',
        topic: userProfile.preferences.ntfyTopic,
      } : undefined,
    });

    // Initialize vision service (camera)
    this.vision = new VisionService({
      visionEndpoint: userProfile.preferences.lmStudioUrl ? 
        `${userProfile.preferences.lmStudioUrl}/v1/chat/completions` : '',
      visionModel: 'local-model',
      onObservation: (obs) => this.handleVisualObservation(obs),
    });

    // Initialize speech service
    this.speech = new SpeechService(
      {
        wakeWord: userProfile.preferences.wakeWord || 'jarvis',
        wakeWordEnabled: userProfile.preferences.wakeWordEnabled ?? true,
        continuous: true,
        language: 'en-US',
        voiceRate: userProfile.preferences.voiceSpeed === 'fast' ? 1.1 : 
                   userProfile.preferences.voiceSpeed === 'slow' ? 0.9 : 1.0,
        // ElevenLabs config
        ttsProvider: userProfile.preferences.voiceProvider || 'browser',
        elevenLabsApiKey: userProfile.preferences.elevenLabsApiKey,
        elevenLabsVoiceId: userProfile.preferences.elevenLabsVoiceId,
      },
      {
        onStatusChange: (status) => this.handleSpeechStatusChange(status),
        onTranscript: (text, isFinal) => this.handleTranscript(text, isFinal),
        onWakeWord: () => this.handleWakeWord(),
        onError: (error) => this.handleError(error),
        onSpeakStart: () => this.setState({ status: 'SPEAKING' }),
        onSpeakEnd: () => this.setState({ status: 'LISTENING' }),
      }
    );

    // Start environment monitoring
    this.startEnvironmentMonitor();
    
    // Update system prompt
    this.updateSystemPrompt();

    this.log('SYSTEM', 'JARVIS Core initialized - All systems nominal');
  }

  // ==========================================================================
  // PHASE 8: STATE MACHINE ACTION HANDLER
  // ==========================================================================
  
  /**
   * Execute actions dispatched by the State Machine
   * This is the BRIDGE between the state machine and actual system functions
   */
  private async executeStateMachineAction(action: StateAction): Promise<void> {
    switch (action.type) {
      case 'PLAY_SOUND':
        // Play sound effect via native or browser
        if (window.jarvisHost?.playSound) {
          await window.jarvisHost.playSound(action.sound);
        } else {
          sounds.play(action.sound);
        }
        break;
        
      case 'START_LISTENING':
        this.speech.startListening();
        break;
        
      case 'STOP_LISTENING':
        this.speech.stopListening();
        break;
        
      case 'DUCK_AUDIO':
        if (window.jarvisHost?.duckAudio) {
          await window.jarvisHost.duckAudio(action.duck);
        }
        break;
        
      case 'SEND_TO_LLM':
        // This triggers the full LLM processing pipeline
        await this.processUserInputViaLLM(action.text);
        break;
        
      case 'SPEAK':
        await this.speak(action.text);
        break;
        
      case 'CANCEL_SPEECH':
        this.speech.interrupt();
        break;
        
      case 'EXECUTE_TOOL':
        const result = await this.tools.execute({ name: action.tool, arguments: action.args });
        this.stateMachine.send({ type: 'TOOL_RESULT', result });
        break;
        
      case 'EXECUTE_REFLEX':
        await this.tryReflexCommand(action.text);
        break;
        
      case 'UPDATE_UI':
        if (action.overlay) {
          this.setState({ activeOverlay: action.overlay as any });
        }
        break;
        
      case 'LOG':
        this.log(action.level as any, action.message);
        break;
    }
  }
  
  /**
   * Try to handle command via reflex engine (fast path)
   * Returns true if handled, false to continue to LLM
   */
  private async tryReflexCommand(input: string): Promise<boolean> {
    try {
      const reflexResult = await BrowserHardware.tryReflex(input);
      
      if (reflexResult?.handled) {
        this.log('INFO', `⚡ REFLEX: "${input}" handled in ${reflexResult.latencyMs}ms`);
        this.stateMachine.send({ 
          type: 'LLM_RESPONSE', 
          text: reflexResult.response 
        });
        return true;
      }
    } catch (e) {
      // Reflex not available, continue to LLM
    }
    
    // Not a reflex command, send to LLM
    this.stateMachine.send({ type: 'LLM_RESPONSE', text: '' }); // Trigger LLM path
    await this.processUserInputViaLLM(input);
    return false;
  }
  
  /**
   * Process input through LLM (slow path)
   */
  private async processUserInputViaLLM(input: string): Promise<void> {
    try {
      const { apiClient } = await import('./APIClient');
      
      if (apiClient.isAuthenticated()) {
        await this.processViaBackend(input, apiClient);
      } else {
        await this.processDirectLLM(input);
      }
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.stateMachine.send({ type: 'LLM_ERROR', error: errorMsg });
    }
  }

  // ==========================================================================
  // STATE MANAGEMENT
  // ==========================================================================

  private createInitialState(profile: UserProfile, devices: SmartDevice[], calendar: CalendarEvent[]): JarvisState {
    return {
      status: 'STANDBY',
      userProfile: profile,
      environment: {
        location: profile.location,
        temperature: 0,
        weatherCondition: 'Unknown',
        time: new Date().toLocaleTimeString(),
        date: new Date().toLocaleDateString(),
        batteryLevel: 100,
        online: navigator.onLine,
      },
      timers: [],
      alarms: [],
      reminders: [],
      lists: {},
      notes: {},
      smartHome: devices,
      calendar: calendar,
      lastTranscript: '',
      lastResponse: '',
      logs: [],
      // === PHASE 2: HOLOGRAPHIC DISPLAY SYSTEM ===
      activeOverlay: 'NONE',
      visualData: null,
      lastError: null,
    };
  }

  private setState(partial: Partial<JarvisState>) {
    this.state = { ...this.state, ...partial };
    this.notifySubscribers();
  }

  public subscribe(callback: (state: JarvisState) => void) {
    this.subscribers.push(callback);
    callback(this.state);
    return () => {
      this.subscribers = this.subscribers.filter(cb => cb !== callback);
    };
  }

  private notifySubscribers() {
    this.subscribers.forEach(cb => cb(this.state));
  }

  public getState(): JarvisState {
    return { ...this.state };
  }

  // ==========================================================================
  // LOGGING
  // ==========================================================================

  private log(level: LogEntry['level'], message: string, source?: string) {
    const entry: LogEntry = {
      timestamp: Date.now(),
      level,
      message,
      source,
    };
    
    this.state.logs = [...this.state.logs.slice(-99), entry];
    this.notifySubscribers();
    
    console.log(`[JARVIS:${level}] ${message}`);
  }

  // ==========================================================================
  // SYSTEM PROMPT BUILDING
  // ==========================================================================

  private updateSystemPrompt() {
    const profile = this.state.userProfile;
    if (!profile) return;

    // Build context
    const context = `
USER: ${profile.name}
LOCATION: ${profile.location}
TIME: ${new Date().toLocaleString()}
TEMPERATURE UNIT: ${profile.preferences.tempUnit}
SMART HOME: ${profile.preferences.homeAssistantUrl ? 'Configured' : 'Not configured'}
SPOTIFY: ${profile.preferences.spotifyClientId ? 'Available' : 'Not configured'}
GOOGLE: ${profile.preferences.googleClientId ? 'Available' : 'Not configured'}
ACTIVE TIMERS: ${this.state.timers.length}
ACTIVE ALARMS: ${this.state.alarms.filter(a => a.enabled).length}
PENDING REMINDERS: ${this.state.reminders.filter(r => !r.triggered).length}
`.trim();

    // Get memory context
    const memory = this.tools.getMemory().getSummary();
    
    // Build visual context if camera is active
    let visualContext = '';
    if (this.vision.isRunning() && this.lastVisualContext) {
      visualContext = `\nWHAT I CAN SEE:\n${this.lastVisualContext}`;
    }
    
    // Calculate session duration for proactive comments
    const sessionMinutes = Math.floor((Date.now() - this.sessionStartTime.getTime()) / 60000);
    const hour = new Date().getHours();
    
    // Add situational awareness
    let situationalContext = '';
    if (hour >= 23 || hour < 5) {
      situationalContext += '\n[Note: It\'s late at night. Sir should probably sleep.]';
    }
    if (sessionMinutes > 120) {
      situationalContext += `\n[Note: Sir has been working for ${Math.floor(sessionMinutes/60)} hours. Maybe suggest a break.]`;
    }

    const prompt = JARVIS_SYSTEM_PROMPT
      .replace('{visual_context}', visualContext)
      .replace('{context}', context + situationalContext)
      .replace('{memory}', memory || 'No stored memories yet.');

    this.llm.setSystemPrompt(prompt);
  }

  // ==========================================================================
  // VISION HANDLERS
  // ==========================================================================

  private handleVisualObservation(observation: any) {
    this.lastVisualContext = observation.description;
    this.log('INFO', `Visual observation: ${observation.description.substring(0, 50)}...`);
  }

  /**
   * Enable JARVIS vision (camera)
   */
  public async enableVision(): Promise<boolean> {
    const success = await this.vision.start();
    if (success) {
      this.log('SYSTEM', 'Visual systems online');
      // Start periodic observations every 2 minutes
      this.vision.startPeriodicObservation(120000);
    }
    return success;
  }

  /**
   * Disable vision
   */
  public disableVision() {
    this.vision.stop();
    this.lastVisualContext = '';
    this.log('SYSTEM', 'Visual systems offline');
  }

  /**
   * Get what JARVIS currently sees
   */
  public async getVisualDescription(): Promise<string> {
    if (!this.vision.isRunning()) {
      return "My visual sensors aren't active at the moment, Sir.";
    }
    return this.vision.analyzeScene();
  }

  /**
   * Check if vision is enabled
   */
  public isVisionEnabled(): boolean {
    return this.vision.isRunning();
  }

  // ==========================================================================
  // SPEECH HANDLERS
  // ==========================================================================

  private handleSpeechStatusChange(status: SpeechStatus) {
    const stateMap: Record<SpeechStatus, JarvisState['status']> = {
      'IDLE': 'STANDBY',
      'LISTENING': 'LISTENING',
      'PROCESSING': 'PROCESSING',
      'SPEAKING': 'SPEAKING',
      'COOLDOWN': 'LISTENING', // Show as listening during cooldown
    };
    
    this.setState({ status: stateMap[status] || 'STANDBY' });
  }

  private handleWakeWord() {
    this.log('INFO', 'Wake word detected');
    
    // === PHASE 11: INSTANT VISUAL FEEDBACK ===
    // Dispatch event IMMEDIATELY so UI can flash Arc Reactor
    // This happens BEFORE speech, BEFORE processing - user knows they were heard
    window.dispatchEvent(new CustomEvent('jarvis-wake-detected'));
    
    // === PHASE 12: WAKE FROM SLEEP ===
    // Start spinning up to Light mode (don't wait - user hears response while it loads)
    powerManager.wake();
    
    // Phase 8: Send WAKE event to state machine
    this.stateMachine.send({ type: 'WAKE' });
    
    // Play wake sound
    if (window.jarvisHost?.playSound) {
      window.jarvisHost.playSound('wake');
    } else {
      sounds.play('wake');
    }
    
    this.speak('Yes, Sir?');
  }

  private async handleTranscript(text: string, isFinal: boolean) {
    if (!isFinal) {
      this.setState({ lastTranscript: text });
      return;
    }

    this.setState({ lastTranscript: text });
    this.log('INFO', `User: "${text}"`);
    
    // Phase 8: Check if we're speaking and this is a barge-in
    const machineState = this.stateMachine.getState();
    if (machineState === 'SPEAKING') {
      this.log('INFO', `🛑 BARGE-IN detected: "${text}"`);
      this.stateMachine.send({ type: 'BARGE_IN', text });
      return;
    }
    
    // Send transcript to state machine
    this.stateMachine.send({ type: 'TRANSCRIPT', text, isFinal: true });
    
    // Also process via legacy path for now (gradual migration)
    await this.processUserInput(text);
  }

  private handleError(error: string) {
    this.log('ERROR', error);
    this.setState({ lastError: error });
  }

  // ==========================================================================
  // PHASE 9: HEALTH MONITORING
  // ==========================================================================
  
  private lastHealthState: HealthState | null = null;
  
  /**
   * Handle health state changes from the monitor
   */
  private handleHealthChange(healthState: HealthState): void {
    const prev = this.lastHealthState;
    this.lastHealthState = healthState;
    
    // Notify subscribers of health change (for UI updates like Arc Reactor dimming)
    this.notifySubscribers();
    
    // Log significant changes
    if (prev?.overall !== healthState.overall) {
      this.log('SYSTEM', `System health: ${healthState.overall}`);
    }
    
    // LLM went offline
    if (prev?.services.llm.status !== 'offline' && healthState.services.llm.status === 'offline') {
      this.log('WARN', 'LM Studio connection lost - entering fallback mode');
      // Don't speak unless we're processing something - avoid interrupting
    }
    
    // LLM recovered
    if (prev?.services.llm.status === 'offline' && healthState.services.llm.status === 'healthy') {
      this.log('SYSTEM', 'LM Studio connection restored');
      // Process any queued commands
    }
    
    // Backend went offline
    if (prev?.services.backend.status !== 'offline' && healthState.services.backend.status === 'offline') {
      this.log('WARN', 'Backend server connection lost');
    }
    
    // Backend recovered
    if (prev?.services.backend.status === 'offline' && healthState.services.backend.status === 'healthy') {
      this.log('SYSTEM', 'Backend server connection restored');
    }
  }
  
  /**
   * Check if LLM is available
   */
  private isLLMAvailable(): boolean {
    return this.lastHealthState?.services.llm.status === 'healthy';
  }
  
  /**
   * Get current health state (for UI)
   */
  public getHealthState(): HealthState | null {
    return this.lastHealthState;
  }

  // ==========================================================================
  // MAIN PROCESSING LOOP
  // ==========================================================================

  private async processUserInput(input: string) {
    // ========================================================================
    // PHASE 7: SPINAL REFLEXES - Execute BEFORE checking processing lock
    // These commands work even while the brain is busy thinking
    // ========================================================================
    
    // Check for interrupt commands first - these always work
    const interruptPatterns = /^(stop|cancel|shut up|be quiet|enough|never\s*mind|halt)$/i;
    if (interruptPatterns.test(input.trim())) {
      this.log('INFO', `🛑 INTERRUPT COMMAND: "${input}"`);
      
      // Phase 8: Send interrupt to state machine
      this.stateMachine.send({ type: 'INTERRUPT' });
      
      // Phase 8: Play interrupt sound and stop processing loop
      sounds.stopProcessingLoop();
      sounds.play('interrupt');
      
      // Cancel any ongoing speech
      if (this.speech) {
        this.speech.interrupt();
      }
      
      // Clear processing state
      this.isProcessing = false;
      this.setState({ status: 'LISTENING' });
      
      await this.speak("Understood, Sir.");
      return;
    }
    
    // Try reflex engine for quick commands (lights, etc.)
    // This runs even if isProcessing is true!
    try {
      const reflexResult = await BrowserHardware.tryReflex(input);
      
      if (reflexResult?.handled) {
        this.log('INFO', `⚡ REFLEX: "${input}" handled in ${reflexResult.latencyMs}ms`);
        
        // Phase 8: Play success sound for reflex
        sounds.play('success');
        
        // Speak response without changing processing state
        await this.speak(reflexResult.response);
        
        // Add to conversation history
        this.messages.push({ role: 'user', content: input });
        this.messages.push({ role: 'assistant', content: reflexResult.response });
        
        return; // Reflex handled it - don't go to LLM
      }
    } catch (e) {
      this.log('DEBUG', 'Reflex engine not available');
    }
    
    // ========================================================================
    // SLOW PATH - Requires LLM (check processing lock)
    // ========================================================================
    
    if (this.isProcessing) {
      this.log('WARN', 'Already processing complex request, queuing input');
      // Phase 9: Queue command for replay if backend recovers
      healthMonitor.queueCommand(input);
      await this.speak("One moment, Sir. I'm still working on your previous request.");
      return;
    }

    // ========================================================================
    // PHASE 9: CHECK LLM HEALTH - USE FALLBACK IF OFFLINE
    // ========================================================================
    
    if (!this.isLLMAvailable()) {
      this.log('WARN', 'LLM offline - attempting fallback response');
      
      // Try hardcoded fallback responses
      const fallbackResult = FallbackLLM.process(input);
      
      if (fallbackResult) {
        this.log('INFO', `📴 FALLBACK: "${input}" handled locally`);
        
        // Play degraded sound instead of normal processing
        sounds.play('wake'); // Gentle acknowledgment
        
        // Execute any associated tool call
        if (fallbackResult.toolCall) {
          try {
            await this.tools.execute({ 
              name: fallbackResult.toolCall.name, 
              arguments: fallbackResult.toolCall.args 
            });
          } catch (e) {
            this.log('WARN', `Fallback tool call failed: ${e}`);
          }
        }
        
        await this.speak(fallbackResult.response);
        
        // Add to conversation history
        this.messages.push({ role: 'user', content: input });
        this.messages.push({ role: 'assistant', content: fallbackResult.response });
        
        return;
      }
      
      // Fallback couldn't handle it - queue for later
      healthMonitor.queueCommand(input);
      await this.speak("I'm having trouble connecting to my main systems, Sir. I'll process that request once I'm back online.");
      return;
    }

    // Check for routine triggers
    const routine = this.routines.checkTrigger(input);
    if (routine) {
      this.log('INFO', `Routine triggered: ${routine.name}`);
      await this.executeRoutine(routine);
      return;
    }

    this.isProcessing = true;
    this.setState({ status: 'PROCESSING' });
    
    // Phase 8: Play processing sound (loops until speech starts)
    sounds.play('processing');

    // ========================================================================
    // PHASE 12: AUTOMATIC POWER TIER MANAGEMENT
    // User never sees this - it just makes things faster and saves power
    // ========================================================================
    const requiredTier = powerManager.classifyCommand(input);
    
    // Ensure we're at the right power tier (may need to spin up GPU)
    // This is non-blocking if already at the right tier
    try {
      await powerManager.ensureTier(requiredTier);
    } catch (e) {
      // If power management fails, continue anyway - better than failing
      this.log('WARN', `Power tier adjustment failed: ${e}`);
    }

    try {
      // Import API client for secure backend routing
      const { apiClient } = await import('./APIClient');
      
      // Check if we're authenticated with the backend
      if (apiClient.isAuthenticated()) {
        // SECURE PATH: Route through backend API (production mode)
        await this.processViaBackend(input, apiClient);
      } else {
        // FALLBACK: Direct LLM (development only - shows warning)
        this.log('WARN', 'Backend not authenticated - using direct LLM (insecure, dev only)');
        await this.processDirectLLM(input);
      }

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.log('ERROR', `Processing failed: ${errorMsg}`);
      
      // Phase 8: Play error sound
      sounds.stopProcessingLoop();
      sounds.play('error');
      
      await this.speak("I encountered an error processing your request, Sir. My apologies.");
    } finally {
      this.isProcessing = false;
      this.setState({ status: 'LISTENING' });
      
      // Phase 8: Ensure processing sound is stopped
      sounds.stopProcessingLoop();
    }
  }

  /**
   * SECURE PATH: Route all LLM calls through the backend server
   * This keeps API keys server-side and enables proper logging/validation
   */
  private async processViaBackend(input: string, apiClient: any) {
    this.log('INFO', 'Processing via secure backend pipeline');
    
    // Build world state for context
    const worldState = {
      user: {
        name: this.state.userProfile?.name,
        mode: 'normal' as const,
      },
      home: {
        currentScene: undefined,
      },
      music: {
        isPlaying: false,
        currentTrack: undefined,
      },
    };

    // Build conversation history from recent exchanges
    const history = this.llm.getHistory()
      .filter(msg => msg.role === 'user' || msg.role === 'assistant')
      .slice(-10)
      .map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content || '',
      }));

    try {
      // Call the secure backend endpoint
      const result = await apiClient.chat({
        message: input,
        conversationHistory: history.length > 0 ? history : undefined,
        worldState,
      });

      // Handle pending confirmations (for dangerous actions)
      if (result.pendingConfirmation) {
        this.log('INFO', `Action requires confirmation: ${result.pendingConfirmation.action}`);
        // Store pending confirmation for later
        this.setState({ 
          lastResponse: result.response,
          pendingConfirmation: result.pendingConfirmation,
        } as any);
        await this.speak(result.response);
        return;
      }

      // Handle clarification requests
      if (result.clarification) {
        this.log('INFO', `LLM needs clarification: ${result.clarification.question}`);
        await this.speak(result.clarification.question);
        return;
      }

      // Handle execution results
      if (result.executionResult) {
        if (result.executionResult.success) {
          this.log('INFO', `Tool executed successfully: ${result.executionResult.message}`);
        } else {
          this.log('WARN', `Tool execution failed: ${result.executionResult.error}`);
        }
      }

      // Speak the response
      if (result.response) {
        this.setState({ lastResponse: result.response });
        await this.speak(result.response);
      }

      // Add to local conversation history for context
      this.llm.addMessage({ role: 'user', content: input });
      this.llm.addMessage({ role: 'assistant', content: result.response });

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.log('ERROR', `Backend request failed: ${errorMsg}`);
      
      // Check if server is reachable
      try {
        await apiClient.checkHealth();
        await this.speak("I'm having trouble processing your request through my secure systems, Sir.");
      } catch {
        await this.speak("I can't reach my backend server, Sir. Please ensure it's running.");
      }
    }
  }

  /**
   * FALLBACK: Direct LLM access (development only)
   * WARNING: This exposes API keys in the browser - only use for local development
   */
  private async processDirectLLM(input: string) {
    // Update system prompt with latest context
    this.updateSystemPrompt();

    // Inject relevant memories into the conversation
    const memoryContext = this.tools.getMemory().getContextForQuery(input);
    const enhancedInput = memoryContext 
      ? `${input}\n\n[Context from memory: ${memoryContext}]`
      : input;

    // Send to LLM
    let response = await this.llm.chat(enhancedInput);
    this.log('DEBUG', `LLM response received`);

    // Handle tool calls in a loop
    let iterations = 0;
    const MAX_ITERATIONS = 10;

    while (response.toolCalls && response.toolCalls.length > 0 && iterations < MAX_ITERATIONS) {
      iterations++;
      this.log('INFO', `Executing ${response.toolCalls.length} tool(s)`);

      const results: { toolCallId: string; result: string }[] = [];

      for (const toolCall of response.toolCalls) {
        this.log('DEBUG', `Tool: ${toolCall.name}(${JSON.stringify(toolCall.arguments)})`);
        
        const result = await this.tools.execute(toolCall);
        results.push({
          toolCallId: toolCall.id,
          result: result,
        });
        
        this.log('INFO', `Tool result: ${result}`);
      }

      // Send tool results back to LLM
      response = await this.llm.sendToolResults(results);
    }

    // Speak the final response
    if (response.content) {
      this.setState({ lastResponse: response.content });
      await this.speak(response.content);
    }
  }

  // ==========================================================================
  // ROUTINE EXECUTION
  // ==========================================================================

  private async executeRoutine(routine: any) {
    this.isProcessing = true;
    this.setState({ status: 'PROCESSING' });

    const results: string[] = [];

    for (const action of routine.actions) {
      try {
        switch (action.type) {
          case 'speak':
            if (action.message) {
              await this.speak(action.message);
            }
            break;

          case 'weather':
            const weather = await this.tools.execute({ 
              id: 'routine', 
              name: 'getWeather', 
              arguments: {} 
            });
            results.push(weather);
            break;

          case 'calendar':
            const events = await this.tools.execute({ 
              id: 'routine', 
              name: 'getSchedule', 
              arguments: { when: 'today' } 
            });
            results.push(events);
            break;

          case 'calendar_tomorrow':
            const tomorrow = await this.tools.execute({ 
              id: 'routine', 
              name: 'getSchedule', 
              arguments: { when: 'tomorrow' } 
            });
            results.push(tomorrow);
            break;

          case 'news':
            const news = await this.tools.execute({ 
              id: 'routine', 
              name: 'getNews', 
              arguments: { category: 'general' } 
            });
            results.push(news);
            break;

          case 'reminders':
            const reminders = await this.tools.execute({ 
              id: 'routine', 
              name: 'getReminders', 
              arguments: {} 
            });
            if (!reminders.includes('No pending')) {
              results.push(reminders);
            }
            break;

          case 'timers':
            const timers = await this.tools.execute({ 
              id: 'routine', 
              name: 'getTimers', 
              arguments: {} 
            });
            if (!timers.includes('No active')) {
              results.push(timers);
            }
            break;

          case 'stocks':
            const portfolio = await this.tools.execute({ 
              id: 'routine', 
              name: 'getPortfolio', 
              arguments: {} 
            });
            if (!portfolio.includes('empty')) {
              results.push(portfolio);
            }
            break;

          case 'system_status':
            const status = await this.tools.execute({ 
              id: 'routine', 
              name: 'getSystemStatus', 
              arguments: {} 
            });
            results.push(status);
            break;

          case 'device':
            if (action.deviceId && action.action) {
              await this.tools.execute({ 
                id: 'routine', 
                name: 'controlDevice', 
                arguments: { 
                  device: action.deviceId, 
                  action: action.action,
                  value: action.value 
                } 
              });
            }
            break;

          case 'wait':
            if (action.duration) {
              await new Promise(r => setTimeout(r, action.duration * 1000));
            }
            break;
        }
      } catch (error) {
        this.log('ERROR', `Routine action failed: ${error}`);
      }
    }

    // Speak the combined results
    if (results.length > 0) {
      const combined = results.join(' ');
      await this.speak(combined);
    }

    this.isProcessing = false;
    this.setState({ status: 'LISTENING' });
  }

  // ==========================================================================
  // SPEECH OUTPUT
  // ==========================================================================

  private async speak(text: string) {
    this.log('INFO', `JARVIS: "${text}"`);
    this.setState({ lastResponse: text });
    
    // Phase 8: Notify state machine speech is starting
    this.stateMachine.send({ type: 'SPEAK_START' });
    
    try {
      await this.speech.speak(text);
      
      // Phase 8: Notify state machine speech ended
      this.stateMachine.send({ type: 'SPEAK_END' });
      
      // Play success sound for completed responses
      sounds.stopProcessingLoop();
      
    } catch (error) {
      this.log('ERROR', `TTS failed: ${error}`);
      this.stateMachine.send({ type: 'SPEAK_END' });
    }
  }

  // ==========================================================================
  // EVENT HANDLERS
  // ==========================================================================

  private handleTimerComplete(timer: SystemTimer) {
    this.log('INFO', `Timer complete: ${timer.label}`);
    this.speak(`Sir, your ${timer.label} has finished.`);
    
    // Also send push notification
    if (this.state.userProfile?.preferences.pushNotificationsEnabled) {
      this.pushNotifications.notifyTimerComplete(timer.label);
    }
  }

  private handleAlarmTrigger(alarm: Alarm) {
    this.log('INFO', `Alarm triggered: ${alarm.label}`);
    this.speak(`${alarm.label}. Time to wake up, Sir.`);
    
    // Send push notification for alarms (always important)
    if (this.state.userProfile?.preferences.pushNotificationsEnabled) {
      this.pushNotifications.send({
        title: '⏰ Alarm',
        message: alarm.label,
        priority: 'high',
      });
    }
  }

  private handleReminderTrigger(reminder: Reminder) {
    this.log('INFO', `Reminder: ${reminder.message}`);
    this.speak(`Sir, a reminder: ${reminder.message}`);
    
    // Send push notification for reminders
    if (this.state.userProfile?.preferences.pushNotificationsEnabled) {
      this.pushNotifications.notifyReminder(reminder.message);
    }
  }

  private handleProactiveAlert(alert: any) {
    this.log('INFO', `Proactive alert: ${alert.type}`);
    this.speak(alert.message);
    
    // Send push notification for proactive alerts
    if (this.state.userProfile?.preferences.pushNotificationsEnabled) {
      this.pushNotifications.send({
        title: '🤖 JARVIS',
        message: alert.message,
        priority: 'normal',
      });
    }
  }

  // ==========================================================================
  // ENVIRONMENT MONITORING
  // ==========================================================================

  private async startEnvironmentMonitor() {
    // Update time every second
    setInterval(() => {
      this.state.environment.time = new Date().toLocaleTimeString();
      this.state.environment.date = new Date().toLocaleDateString();
      this.notifySubscribers();
    }, 1000);

    // Update battery and network every 30 seconds
    setInterval(async () => {
      this.state.environment.batteryLevel = await BrowserHardware.getBatteryLevel();
      this.state.environment.online = BrowserHardware.isOnline();
      this.notifySubscribers();
    }, 30000);

    // Update weather every 10 minutes
    setInterval(async () => {
      await this.updateWeather();
    }, 600000);

    // Initial updates
    this.state.environment.batteryLevel = await BrowserHardware.getBatteryLevel();
    this.state.environment.online = BrowserHardware.isOnline();
    await this.updateWeather();
  }

  private async updateWeather() {
    const profile = this.state.userProfile;
    if (!profile?.lat || !profile?.lng) return;

    try {
      const weather = await RealExternalAPIs.fetchWeather(
        profile.lat,
        profile.lng,
        profile.preferences.tempUnit
      );
      
      this.state.environment.temperature = weather.temp;
      this.state.environment.weatherCondition = weather.condition;
      this.notifySubscribers();
    } catch (error) {
      this.log('WARN', 'Weather update failed');
    }
  }

  // ==========================================================================
  // PUBLIC METHODS
  // ==========================================================================

  public start() {
    this.log('SYSTEM', 'Starting JARVIS...');
    this.speech.startListening();
    this.proactiveAlerts.start();
    this.setState({ status: 'LISTENING' });
    BrowserHardware.enableWakeLock();
  }

  public stop() {
    this.log('SYSTEM', 'Stopping JARVIS...');
    this.speech.stopListening();
    this.proactiveAlerts.stop();
    this.setState({ status: 'STANDBY' });
  }

  public wake() {
    this.speech.wake();
  }

  public async sendText(text: string) {
    this.setState({ lastTranscript: text });
    await this.processUserInput(text);
  }

  public interrupt() {
    this.speech.interrupt();
  }

  public async checkConnection(): Promise<boolean> {
    const llmConnected = await this.llm.healthCheck();
    
    // Also check server health for TTS availability
    try {
      const { apiClient } = await import('./APIClient');
      const health = await apiClient.checkHealth();
      
      if ((health as any)?.tts?.configured) {
        this.speech.setTTSProvider('server');
        this.log('INFO', 'Server TTS (ElevenLabs) available');
      }
    } catch (e) {
      console.warn('[JarvisCore] Could not check server health:', e);
    }
    
    return llmConnected;
  }

  public destroy() {
    this.speech.destroy();
    this.proactiveAlerts.stop();
    this.stop();
  }

  /**
   * Update settings at runtime (called when user saves settings)
   */
  public updateSettings(profile: UserProfile) {
    this.log('SYSTEM', 'Updating settings...');
    
    // Update user profile in state
    this.setState({ userProfile: profile });
    
    // Update speech service with new TTS settings
    if (profile.preferences.voiceProvider === 'elevenlabs' && 
        profile.preferences.elevenLabsApiKey && 
        profile.preferences.elevenLabsVoiceId) {
      this.speech.setElevenLabsConfig(
        profile.preferences.elevenLabsApiKey,
        profile.preferences.elevenLabsVoiceId
      );
      this.log('INFO', 'ElevenLabs TTS enabled');
    } else {
      this.speech.setTTSProvider('browser');
      this.log('INFO', 'Browser TTS enabled');
    }
    
    // Update whisper mode
    const shouldWhisper = profile.preferences.whisperMode || this.checkAutoWhisperMode(profile);
    this.speech.setWhisperMode(shouldWhisper);
    if (shouldWhisper) {
      this.log('INFO', 'Whisper mode enabled');
    }
    
    // Update push notification settings
    if (profile.preferences.pushNotificationsEnabled) {
      if (profile.preferences.pushoverUserKey && profile.preferences.pushoverApiToken) {
        this.pushNotifications.configurePushover(
          profile.preferences.pushoverUserKey,
          profile.preferences.pushoverApiToken
        );
      }
      if (profile.preferences.ntfyTopic) {
        this.pushNotifications.configureNtfy(
          profile.preferences.ntfyServerUrl || 'https://ntfy.sh',
          profile.preferences.ntfyTopic
        );
      }
      this.log('INFO', 'Push notifications configured: ' + this.pushNotifications.getConfiguredServices().join(', '));
    }
    
    // Update LLM URL if changed
    if (profile.preferences.lmStudioUrl) {
      this.llm.updateUrl(profile.preferences.lmStudioUrl);
    }
    
    // Update tools with new services config
    this.tools.updateConfig(profile);
    
    this.log('SYSTEM', 'Settings updated successfully');
  }

  /**
   * Check if auto whisper mode should be enabled based on time
   */
  private checkAutoWhisperMode(profile: UserProfile): boolean {
    if (!profile.preferences.whisperModeAuto) return false;
    
    const start = profile.preferences.whisperModeStart || '22:00';
    const end = profile.preferences.whisperModeEnd || '07:00';
    
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    
    const [startH, startM] = start.split(':').map(Number);
    const [endH, endM] = end.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    
    // Handle overnight quiet hours (e.g., 22:00 to 07:00)
    if (startMinutes > endMinutes) {
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }
    
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }

  public getGreeting(): string {
    const hour = new Date().getHours();
    const name = this.state.userProfile?.name || 'Sir';
    
    if (hour < 12) return `Good morning, ${name}.`;
    if (hour < 17) return `Good afternoon, ${name}.`;
    return `Good evening, ${name}.`;
  }

  public async greet() {
    const greeting = this.getGreeting();
    const weather = this.state.environment;
    
    let status = '';
    if (weather.temperature) {
      status = `It's currently ${weather.temperature}° and ${weather.weatherCondition.toLowerCase()}. `;
    }
    
    const timerCount = this.state.timers.length;
    const alarmCount = this.state.alarms.filter(a => a.enabled).length;
    const reminderCount = this.state.reminders.filter(r => !r.triggered).length;
    
    let activeItems = '';
    if (timerCount || alarmCount || reminderCount) {
      const parts = [];
      if (timerCount) parts.push(`${timerCount} active timer${timerCount > 1 ? 's' : ''}`);
      if (alarmCount) parts.push(`${alarmCount} alarm${alarmCount > 1 ? 's' : ''}`);
      if (reminderCount) parts.push(`${reminderCount} reminder${reminderCount > 1 ? 's' : ''}`);
      activeItems = `You have ${parts.join(', ')}. `;
    }
    
    await this.speak(`${greeting} ${status}${activeItems}How may I assist you?`);
  }

  // Get the tools executor (for external access to services)
  public getTools(): ToolsExecutor {
    return this.tools;
  }

  // ==========================================================================
  // NEWS DISPLAY CONTROL
  // ==========================================================================

  // External callback for news updates (set by App)
  public onNewsUpdate?: (news: any[], category: string) => void;
  
  // === PHASE 2: HOLOGRAPHIC DISPLAY SYSTEM ===
  // External callback for overlay updates (set by Context)
  public onOverlayUpdate?: (overlay: string, data: any) => void;

  // Handle overlay updates when tools trigger visuals
  private handleOverlayUpdate(overlay: string, data: any) {
    // Update state with overlay data
    this.state = {
      ...this.state,
      activeOverlay: overlay as any,
      visualData: data,
    };
    this.notifySubscribers();

    // Also call external callback if set
    if (this.onOverlayUpdate) {
      this.onOverlayUpdate(overlay, data);
    }
    
    this.log('INFO', `Holographic overlay: ${overlay}`);
  }
  
  // Close the current overlay
  public closeOverlay() {
    this.state = {
      ...this.state,
      activeOverlay: 'NONE',
      visualData: null,
    };
    this.notifySubscribers();
  }

  // Handle news data when fetched by tools
  private handleNewsUpdate(news: any[], category: string) {
    // Update state with news data
    this.state = {
      ...this.state,
      currentNews: news,
      newsCategory: category,
    };
    this.notifySubscribers();

    // Also call external callback if set
    if (this.onNewsUpdate) {
      this.onNewsUpdate(news, category);
    }
  }

  // Get last fetched news
  public getLastNews(): any[] {
    return this.tools.getLastFetchedNews();
  }
}
