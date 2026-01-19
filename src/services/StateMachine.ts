/**
 * JARVIS STATE MACHINE
 * 
 * Phase 8: Production Grade
 * 
 * Replaces the "isProcessing", "isListening" flag spaghetti with
 * explicit, deterministic states. No more race conditions.
 * 
 * States:
 *   IDLE       -> Waiting, not listening (sleeping)
 *   LISTENING  -> Actively listening for commands
 *   PROCESSING -> Sending to LLM, waiting for response
 *   SPEAKING   -> TTS is playing audio
 *   EXECUTING  -> Running a tool/action
 *   ERROR      -> Something went wrong, needs recovery
 * 
 * Valid Transitions:
 *   IDLE       -> LISTENING  (wake word detected)
 *   LISTENING  -> PROCESSING (final transcript received)
 *   LISTENING  -> IDLE       (timeout/sleep)
 *   PROCESSING -> SPEAKING   (LLM response ready)
 *   PROCESSING -> EXECUTING  (tool call needed)
 *   PROCESSING -> ERROR      (LLM failed)
 *   SPEAKING   -> LISTENING  (finished speaking, continue conversation)
 *   SPEAKING   -> IDLE       (finished speaking, go to sleep)
 *   SPEAKING   -> PROCESSING (barge-in with new command)
 *   EXECUTING  -> SPEAKING   (tool result ready)
 *   EXECUTING  -> ERROR      (tool failed)
 *   ERROR      -> IDLE       (recovery)
 *   ANY        -> IDLE       (hard interrupt)
 */

export type JarvisState = 
  | 'IDLE' 
  | 'LISTENING' 
  | 'PROCESSING' 
  | 'SPEAKING' 
  | 'EXECUTING' 
  | 'ERROR';

export type JarvisEvent = 
  | { type: 'WAKE' }
  | { type: 'TRANSCRIPT'; text: string; isFinal: boolean }
  | { type: 'BARGE_IN'; text: string }
  | { type: 'LLM_RESPONSE'; text: string; toolCalls?: any[] }
  | { type: 'LLM_ERROR'; error: string }
  | { type: 'SPEAK_START' }
  | { type: 'SPEAK_END' }
  | { type: 'TOOL_START'; tool: string }
  | { type: 'TOOL_RESULT'; result: string }
  | { type: 'TOOL_ERROR'; error: string }
  | { type: 'TIMEOUT' }
  | { type: 'INTERRUPT' }
  | { type: 'SLEEP' }
  | { type: 'RECOVER' };

export interface StateContext {
  // Current conversation
  transcript: string;
  lastResponse: string;
  pendingToolCalls: any[];
  
  // Error tracking
  lastError: string | null;
  errorCount: number;
  
  // Timing
  stateEnteredAt: number;
  lastActivityAt: number;
  
  // Conversation continuity
  conversationActive: boolean;
  turnCount: number;
}

export interface StateTransition {
  from: JarvisState;
  to: JarvisState;
  event: JarvisEvent;
  timestamp: number;
}

type StateHandler = (event: JarvisEvent, context: StateContext) => {
  nextState: JarvisState;
  actions: StateAction[];
  contextUpdates: Partial<StateContext>;
};

export type StateAction = 
  | { type: 'PLAY_SOUND'; sound: 'wake' | 'processing' | 'success' | 'error' | 'sleep' }
  | { type: 'START_LISTENING' }
  | { type: 'STOP_LISTENING' }
  | { type: 'DUCK_AUDIO'; duck: boolean }
  | { type: 'SEND_TO_LLM'; text: string }
  | { type: 'SPEAK'; text: string }
  | { type: 'CANCEL_SPEECH' }
  | { type: 'EXECUTE_TOOL'; tool: string; args: any }
  | { type: 'EXECUTE_REFLEX'; text: string }
  | { type: 'UPDATE_UI'; overlay?: string }
  | { type: 'LOG'; level: 'INFO' | 'WARN' | 'ERROR'; message: string };

export class JarvisStateMachine {
  private state: JarvisState = 'IDLE';
  private context: StateContext;
  private listeners: Set<(state: JarvisState, context: StateContext) => void> = new Set();
  private transitionHistory: StateTransition[] = [];
  private actionHandler: ((action: StateAction) => void) | null = null;
  
  // Timeouts
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  
  // Configuration
  private readonly LISTEN_TIMEOUT = 30000;      // 30s of silence -> sleep
  private readonly PROCESSING_TIMEOUT = 45000;  // 45s max for LLM response
  private readonly SPEAKING_TIMEOUT = 120000;   // 2min max for long responses
  
  constructor() {
    this.context = this.createInitialContext();
  }
  
  private createInitialContext(): StateContext {
    return {
      transcript: '',
      lastResponse: '',
      pendingToolCalls: [],
      lastError: null,
      errorCount: 0,
      stateEnteredAt: Date.now(),
      lastActivityAt: Date.now(),
      conversationActive: false,
      turnCount: 0,
    };
  }
  
  /**
   * Set the action handler (called by JarvisCore)
   */
  setActionHandler(handler: (action: StateAction) => void): void {
    this.actionHandler = handler;
  }
  
  /**
   * Get current state
   */
  getState(): JarvisState {
    return this.state;
  }
  
  /**
   * Get current context
   */
  getContext(): StateContext {
    return { ...this.context };
  }
  
  /**
   * Subscribe to state changes
   */
  subscribe(listener: (state: JarvisState, context: StateContext) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  
  /**
   * Send an event to the state machine
   */
  send(event: JarvisEvent): void {
    const previousState = this.state;
    
    // Get handler for current state
    const handler = this.getStateHandler(this.state);
    const result = handler(event, this.context);
    
    // Update state
    this.state = result.nextState;
    
    // Update context
    this.context = {
      ...this.context,
      ...result.contextUpdates,
      stateEnteredAt: result.nextState !== previousState ? Date.now() : this.context.stateEnteredAt,
      lastActivityAt: Date.now(),
    };
    
    // Record transition
    if (result.nextState !== previousState) {
      this.transitionHistory.push({
        from: previousState,
        to: result.nextState,
        event,
        timestamp: Date.now(),
      });
      
      // Keep history bounded
      if (this.transitionHistory.length > 100) {
        this.transitionHistory.shift();
      }
      
      console.log(`[StateMachine] ${previousState} -> ${result.nextState} (${event.type})`);
    }
    
    // Execute actions
    for (const action of result.actions) {
      this.executeAction(action);
    }
    
    // Manage timeouts
    this.manageTimeouts();
    
    // Notify listeners
    for (const listener of this.listeners) {
      listener(this.state, this.context);
    }
  }
  
  /**
   * Get the handler for a state
   */
  private getStateHandler(state: JarvisState): StateHandler {
    switch (state) {
      case 'IDLE': return this.handleIdleState.bind(this);
      case 'LISTENING': return this.handleListeningState.bind(this);
      case 'PROCESSING': return this.handleProcessingState.bind(this);
      case 'SPEAKING': return this.handleSpeakingState.bind(this);
      case 'EXECUTING': return this.handleExecutingState.bind(this);
      case 'ERROR': return this.handleErrorState.bind(this);
    }
  }
  
  // ===========================================================================
  // STATE HANDLERS
  // ===========================================================================
  
  private handleIdleState(event: JarvisEvent, context: StateContext): ReturnType<StateHandler> {
    switch (event.type) {
      case 'WAKE':
        return {
          nextState: 'LISTENING',
          actions: [
            { type: 'PLAY_SOUND', sound: 'wake' },
            { type: 'DUCK_AUDIO', duck: true },
            { type: 'START_LISTENING' },
            { type: 'LOG', level: 'INFO', message: 'Wake word detected, now listening' },
          ],
          contextUpdates: {
            conversationActive: true,
            turnCount: 0,
          },
        };
        
      default:
        return { nextState: 'IDLE', actions: [], contextUpdates: {} };
    }
  }
  
  private handleListeningState(event: JarvisEvent, context: StateContext): ReturnType<StateHandler> {
    switch (event.type) {
      case 'TRANSCRIPT':
        if (event.isFinal && event.text.trim().length > 0) {
          return {
            nextState: 'PROCESSING',
            actions: [
              { type: 'PLAY_SOUND', sound: 'processing' },
              { type: 'STOP_LISTENING' },
              { type: 'EXECUTE_REFLEX', text: event.text }, // Try reflex first
              { type: 'LOG', level: 'INFO', message: `Processing: "${event.text}"` },
            ],
            contextUpdates: {
              transcript: event.text,
              turnCount: context.turnCount + 1,
            },
          };
        }
        return { nextState: 'LISTENING', actions: [], contextUpdates: {} };
        
      case 'TIMEOUT':
      case 'SLEEP':
        return {
          nextState: 'IDLE',
          actions: [
            { type: 'PLAY_SOUND', sound: 'sleep' },
            { type: 'DUCK_AUDIO', duck: false },
            { type: 'STOP_LISTENING' },
            { type: 'LOG', level: 'INFO', message: 'Going to sleep (timeout)' },
          ],
          contextUpdates: {
            conversationActive: false,
          },
        };
        
      case 'INTERRUPT':
        return {
          nextState: 'IDLE',
          actions: [
            { type: 'DUCK_AUDIO', duck: false },
            { type: 'STOP_LISTENING' },
          ],
          contextUpdates: { conversationActive: false },
        };
        
      default:
        return { nextState: 'LISTENING', actions: [], contextUpdates: {} };
    }
  }
  
  private handleProcessingState(event: JarvisEvent, context: StateContext): ReturnType<StateHandler> {
    switch (event.type) {
      case 'LLM_RESPONSE':
        if (event.toolCalls && event.toolCalls.length > 0) {
          return {
            nextState: 'EXECUTING',
            actions: [
              { type: 'EXECUTE_TOOL', tool: event.toolCalls[0].name, args: event.toolCalls[0].args },
            ],
            contextUpdates: {
              pendingToolCalls: event.toolCalls.slice(1),
            },
          };
        }
        return {
          nextState: 'SPEAKING',
          actions: [
            { type: 'SPEAK', text: event.text },
          ],
          contextUpdates: {
            lastResponse: event.text,
          },
        };
        
      case 'LLM_ERROR':
        return {
          nextState: 'ERROR',
          actions: [
            { type: 'PLAY_SOUND', sound: 'error' },
            { type: 'LOG', level: 'ERROR', message: `LLM error: ${event.error}` },
          ],
          contextUpdates: {
            lastError: event.error,
            errorCount: context.errorCount + 1,
          },
        };
        
      case 'BARGE_IN':
        // User interrupted with a new command
        return {
          nextState: 'PROCESSING',
          actions: [
            { type: 'EXECUTE_REFLEX', text: event.text },
            { type: 'LOG', level: 'INFO', message: `Barge-in: "${event.text}"` },
          ],
          contextUpdates: {
            transcript: event.text,
          },
        };
        
      case 'TIMEOUT':
        return {
          nextState: 'ERROR',
          actions: [
            { type: 'PLAY_SOUND', sound: 'error' },
            { type: 'SPEAK', text: "I'm having trouble thinking, Sir. Let me try again." },
          ],
          contextUpdates: {
            lastError: 'Processing timeout',
          },
        };
        
      case 'INTERRUPT':
        return {
          nextState: 'IDLE',
          actions: [
            { type: 'DUCK_AUDIO', duck: false },
            { type: 'SPEAK', text: 'Understood, Sir.' },
          ],
          contextUpdates: { conversationActive: false },
        };
        
      default:
        return { nextState: 'PROCESSING', actions: [], contextUpdates: {} };
    }
  }
  
  private handleSpeakingState(event: JarvisEvent, context: StateContext): ReturnType<StateHandler> {
    switch (event.type) {
      case 'SPEAK_END':
        // Continue conversation or go to sleep?
        if (context.conversationActive && context.turnCount < 10) {
          return {
            nextState: 'LISTENING',
            actions: [
              { type: 'START_LISTENING' },
            ],
            contextUpdates: {},
          };
        }
        return {
          nextState: 'IDLE',
          actions: [
            { type: 'PLAY_SOUND', sound: 'sleep' },
            { type: 'DUCK_AUDIO', duck: false },
          ],
          contextUpdates: { conversationActive: false },
        };
        
      case 'BARGE_IN':
        // User interrupted while speaking - THIS IS THE KEY FIX
        return {
          nextState: 'PROCESSING',
          actions: [
            { type: 'CANCEL_SPEECH' },
            { type: 'PLAY_SOUND', sound: 'wake' },
            { type: 'EXECUTE_REFLEX', text: event.text },
            { type: 'LOG', level: 'INFO', message: `Barge-in while speaking: "${event.text}"` },
          ],
          contextUpdates: {
            transcript: event.text,
          },
        };
        
      case 'INTERRUPT':
        return {
          nextState: 'LISTENING',
          actions: [
            { type: 'CANCEL_SPEECH' },
            { type: 'PLAY_SOUND', sound: 'success' },
            { type: 'START_LISTENING' },
          ],
          contextUpdates: {},
        };
        
      case 'TIMEOUT':
        return {
          nextState: 'IDLE',
          actions: [
            { type: 'CANCEL_SPEECH' },
            { type: 'DUCK_AUDIO', duck: false },
          ],
          contextUpdates: { conversationActive: false },
        };
        
      default:
        return { nextState: 'SPEAKING', actions: [], contextUpdates: {} };
    }
  }
  
  private handleExecutingState(event: JarvisEvent, context: StateContext): ReturnType<StateHandler> {
    switch (event.type) {
      case 'TOOL_RESULT':
        // More tools to execute?
        if (context.pendingToolCalls.length > 0) {
          const next = context.pendingToolCalls[0];
          return {
            nextState: 'EXECUTING',
            actions: [
              { type: 'EXECUTE_TOOL', tool: next.name, args: next.args },
            ],
            contextUpdates: {
              pendingToolCalls: context.pendingToolCalls.slice(1),
            },
          };
        }
        return {
          nextState: 'SPEAKING',
          actions: [
            { type: 'PLAY_SOUND', sound: 'success' },
            { type: 'SPEAK', text: event.result },
          ],
          contextUpdates: {
            lastResponse: event.result,
          },
        };
        
      case 'TOOL_ERROR':
        return {
          nextState: 'SPEAKING',
          actions: [
            { type: 'PLAY_SOUND', sound: 'error' },
            { type: 'SPEAK', text: `I had trouble with that: ${event.error}` },
          ],
          contextUpdates: {
            lastError: event.error,
          },
        };
        
      case 'BARGE_IN':
      case 'INTERRUPT':
        return {
          nextState: 'LISTENING',
          actions: [
            { type: 'START_LISTENING' },
          ],
          contextUpdates: {},
        };
        
      default:
        return { nextState: 'EXECUTING', actions: [], contextUpdates: {} };
    }
  }
  
  private handleErrorState(event: JarvisEvent, context: StateContext): ReturnType<StateHandler> {
    switch (event.type) {
      case 'RECOVER':
        return {
          nextState: 'LISTENING',
          actions: [
            { type: 'START_LISTENING' },
            { type: 'SPEAK', text: "I'm ready to try again, Sir." },
          ],
          contextUpdates: {
            lastError: null,
          },
        };
        
      case 'SPEAK_END':
        // After error message, try to recover
        if (context.errorCount < 3) {
          return {
            nextState: 'LISTENING',
            actions: [
              { type: 'START_LISTENING' },
            ],
            contextUpdates: {},
          };
        }
        return {
          nextState: 'IDLE',
          actions: [
            { type: 'DUCK_AUDIO', duck: false },
            { type: 'LOG', level: 'ERROR', message: 'Too many errors, going to sleep' },
          ],
          contextUpdates: {
            conversationActive: false,
            errorCount: 0,
          },
        };
        
      case 'INTERRUPT':
      case 'TIMEOUT':
        return {
          nextState: 'IDLE',
          actions: [
            { type: 'DUCK_AUDIO', duck: false },
          ],
          contextUpdates: {
            conversationActive: false,
            errorCount: 0,
          },
        };
        
      default:
        return { nextState: 'ERROR', actions: [], contextUpdates: {} };
    }
  }
  
  // ===========================================================================
  // ACTION EXECUTION
  // ===========================================================================
  
  private executeAction(action: StateAction): void {
    if (this.actionHandler) {
      this.actionHandler(action);
    } else {
      console.warn('[StateMachine] No action handler set, action dropped:', action.type);
    }
  }
  
  // ===========================================================================
  // TIMEOUT MANAGEMENT
  // ===========================================================================
  
  private manageTimeouts(): void {
    // Clear existing timeout
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    
    // Set new timeout based on state
    let timeout: number | null = null;
    
    switch (this.state) {
      case 'LISTENING':
        timeout = this.LISTEN_TIMEOUT;
        break;
      case 'PROCESSING':
        timeout = this.PROCESSING_TIMEOUT;
        break;
      case 'SPEAKING':
        timeout = this.SPEAKING_TIMEOUT;
        break;
    }
    
    if (timeout) {
      this.timeoutId = setTimeout(() => {
        this.send({ type: 'TIMEOUT' });
      }, timeout);
    }
  }
  
  /**
   * Force reset to IDLE (emergency recovery)
   */
  reset(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    
    this.state = 'IDLE';
    this.context = this.createInitialContext();
    
    for (const listener of this.listeners) {
      listener(this.state, this.context);
    }
  }
  
  /**
   * Get transition history for debugging
   */
  getHistory(): StateTransition[] {
    return [...this.transitionHistory];
  }
  
  /**
   * Check if a transition is valid
   */
  canTransition(to: JarvisState): boolean {
    const validTransitions: Record<JarvisState, JarvisState[]> = {
      'IDLE': ['LISTENING'],
      'LISTENING': ['PROCESSING', 'IDLE'],
      'PROCESSING': ['SPEAKING', 'EXECUTING', 'ERROR', 'IDLE'],
      'SPEAKING': ['LISTENING', 'IDLE', 'PROCESSING'],
      'EXECUTING': ['SPEAKING', 'LISTENING', 'ERROR'],
      'ERROR': ['LISTENING', 'IDLE'],
    };
    
    return validTransitions[this.state]?.includes(to) ?? false;
  }
}

// Export singleton for easy access
export const stateMachine = new JarvisStateMachine();
