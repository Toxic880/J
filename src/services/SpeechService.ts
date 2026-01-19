/**
 * SPEECH SERVICE - REWRITTEN FOR NATURAL CONVERSATION
 * 
 * Fixes:
 * - Self-hearing prevention (ignores own voice after speaking)
 * - Natural pause detection (waits for you to finish speaking)
 * - Cooldown period after JARVIS speaks
 * - Debounced transcript handling
 * 
 * === PHASE 7: BARGE-IN SUPPORT ===
 * - Wake word during speech triggers IMMEDIATE interrupt
 * - Audio ducking when listening (lowers system volume)
 * - Hardware interrupt signal propagation
 */

export type SpeechStatus = 'IDLE' | 'LISTENING' | 'PROCESSING' | 'SPEAKING' | 'COOLDOWN';

export interface SpeechConfig {
  wakeWord: string;
  wakeWordEnabled: boolean;
  continuous: boolean;
  language: string;
  voiceName?: string;
  voiceRate?: number;
  voicePitch?: number;
  // TTS config - Phase 8: Added 'piper' and 'auto'
  ttsProvider?: 'browser' | 'elevenlabs' | 'server' | 'piper' | 'auto';
  elevenLabsApiKey?: string;
  elevenLabsVoiceId?: string;
  // Conversation tuning
  silenceTimeout?: number;      // How long to wait for more speech (ms)
  cooldownDuration?: number;    // How long to ignore input after speaking (ms)
  whisperMode?: boolean;        // Quiet mode for night time
  // Phase 7: Audio control
  enableAudioDucking?: boolean; // Lower system volume when listening
}

export interface SpeechCallbacks {
  onStatusChange: (status: SpeechStatus) => void;
  onTranscript: (text: string, isFinal: boolean) => void;
  onWakeWord: () => void;
  onError: (error: string) => void;
  onSpeakStart: () => void;
  onSpeakEnd: () => void;
  // Phase 7: Interrupt callback
  onInterrupt?: () => void;
}

// Phrases JARVIS might say that we should ignore if heard back
const SELF_PHRASES = [
  'yes sir', 'yes, sir', 'certainly', 'of course', 'right away',
  'understood', 'very well', 'at once', 'good morning', 'good afternoon',
  'good evening', 'how may i assist', 'how can i help', 'sir',
];

export class SpeechService {
  private recognition: SpeechRecognition | null = null;
  private synthesis: SpeechSynthesis;
  private config: SpeechConfig;
  private callbacks: SpeechCallbacks;
  private status: SpeechStatus = 'IDLE';
  private isAwake: boolean = false;
  private selectedVoice: SpeechSynthesisVoice | null = null;
  private currentAudio: HTMLAudioElement | null = null;
  
  // Anti-self-hearing
  private lastSpokeAt: number = 0;
  private lastSpokenText: string = '';
  private inCooldown: boolean = false;
  
  // Natural conversation timing
  private transcriptBuffer: string = '';
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSpeechAt: number = 0;
  
  // Auto-sleep
  private autoSleepTimer: ReturnType<typeof setTimeout> | null = null;
  private restartTimeout: ReturnType<typeof setTimeout> | null = null;
  
  // Phase 7: Audio ducking state
  private isAudioDucked: boolean = false;
  private interruptUnsubscribe: (() => void) | null = null;

  constructor(config: Partial<SpeechConfig>, callbacks: SpeechCallbacks) {
    this.config = {
      wakeWord: config.wakeWord || 'jarvis',
      wakeWordEnabled: config.wakeWordEnabled ?? true,
      continuous: config.continuous ?? true,
      language: config.language || 'en-US',
      voiceName: config.voiceName,
      voiceRate: config.voiceRate ?? 1.0,
      voicePitch: config.voicePitch ?? 1.0,
      ttsProvider: config.ttsProvider || 'auto', // Phase 8: Auto-detect best TTS
      elevenLabsApiKey: config.elevenLabsApiKey,
      elevenLabsVoiceId: config.elevenLabsVoiceId,
      silenceTimeout: config.silenceTimeout ?? 1500,    // Wait 1.5s of silence
      cooldownDuration: config.cooldownDuration ?? 800, // Ignore input for 800ms after speaking
      whisperMode: config.whisperMode ?? false,
      enableAudioDucking: config.enableAudioDucking ?? true, // Phase 7: Duck audio when listening
    };
    this.callbacks = callbacks;
    this.synthesis = window.speechSynthesis;
    
    this.initRecognition();
    this.initVoice();
    this.setupInterruptListener();
  }
  
  /**
   * Phase 7: Listen for hardware interrupt signals from Electron
   */
  private setupInterruptListener(): void {
    if (window.jarvisHost?.onInterrupt) {
      this.interruptUnsubscribe = window.jarvisHost.onInterrupt(() => {
        console.log('[Speech] Hardware interrupt received!');
        this.interrupt();
      });
    }
  }

  // ===========================================================================
  // CONFIGURATION UPDATES
  // ===========================================================================

  public setElevenLabsConfig(apiKey: string, voiceId: string) {
    this.config.elevenLabsApiKey = apiKey;
    this.config.elevenLabsVoiceId = voiceId;
    this.config.ttsProvider = 'elevenlabs';
    console.log('[Speech] ElevenLabs configured');
  }

  public setTTSProvider(provider: 'browser' | 'elevenlabs' | 'server') {
    this.config.ttsProvider = provider;
    console.log('[Speech] TTS provider set to:', provider);
  }

  public setWhisperMode(enabled: boolean) {
    this.config.whisperMode = enabled;
    console.log('[Speech] Whisper mode:', enabled);
  }

  public setSilenceTimeout(ms: number) {
    this.config.silenceTimeout = ms;
  }

  // ===========================================================================
  // SPEECH RECOGNITION
  // ===========================================================================

  private initRecognition(): void {
    const SpeechRecognition = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      this.callbacks.onError('Speech Recognition not supported in this browser');
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = this.config.continuous;
    this.recognition.interimResults = true;
    this.recognition.lang = this.config.language;

    this.recognition.onstart = () => {
      if (!this.inCooldown) {
        this.setStatus('LISTENING');
      }
      console.log('[Speech] Recognition started, wake word:', this.config.wakeWordEnabled ? 'ENABLED' : 'DISABLED');
    };

    this.recognition.onresult = (event) => {
      // CRITICAL: Ignore input during cooldown (prevents self-hearing)
      if (this.inCooldown) {
        console.log('[Speech] Ignoring input during cooldown');
        return;
      }

      // Check if we're too close to when we last spoke
      const timeSinceSpoke = Date.now() - this.lastSpokeAt;
      if (timeSinceSpoke < this.config.cooldownDuration!) {
        console.log('[Speech] Ignoring input, too soon after speaking:', timeSinceSpoke, 'ms');
        return;
      }

      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      const currentText = (finalTranscript || interimTranscript).trim().toLowerCase();
      
      // === PHASE 8: SMART BARGE-IN ===
      // ANY speech interrupts while JARVIS is speaking, BUT we filter self-hearing
      
      // Check if this sounds like JARVIS talking (self-hearing prevention)
      // Do this FIRST, before barge-in check
      if (this.isSelfHearing(currentText)) {
        // Don't log every self-heard phrase - it's noisy
        return;
      }
      
      // BARGE-IN: If we're speaking and hear NON-JARVIS speech, interrupt immediately
      // This is the "Alexa, stop" experience - ANY word stops the assistant
      if (this.status === 'SPEAKING' && currentText.length > 0) {
        // Only interrupt on final transcript to avoid false triggers from noise
        if (finalTranscript) {
          console.log(`[Speech] 🛑 BARGE-IN: "${currentText}" (interrupting speech)`);
          this.interrupt();
          this.callbacks.onInterrupt?.();
          
          // Check if it's a pure stop command (don't process further)
          const pureStopCommands = ['stop', 'cancel', 'shut up', 'be quiet', 'enough', 'okay', 'ok', 'nevermind', 'never mind'];
          if (pureStopCommands.some(cmd => currentText === cmd || currentText === `${this.config.wakeWord} ${cmd}`)) {
            console.log('[Speech] Pure stop command - not continuing');
            return;
          }
          
          // If it's a new command, extract it and continue
          const wakeWordDetected = currentText.includes(this.config.wakeWord.toLowerCase());
          if (wakeWordDetected) {
            // Extract text after wake word as new command
            const wakeWordIndex = currentText.indexOf(this.config.wakeWord.toLowerCase());
            const afterWakeWord = currentText.slice(wakeWordIndex + this.config.wakeWord.length).trim();
            
            if (afterWakeWord.length > 2) {
              console.log(`[Speech] New command after wake word: "${afterWakeWord}"`);
              this.transcriptBuffer = afterWakeWord;
              this.startSilenceTimer();
            }
          } else {
            // No wake word - treat entire utterance as new command (user is already engaged)
            if (currentText.length > 2) {
              console.log(`[Speech] Barge-in command: "${currentText}"`);
              this.transcriptBuffer = currentText;
              this.startSilenceTimer();
            }
          }
          return;
        }
        // Interim transcript during speech - ignore (might be self-hearing)
        return;
      }

      // Record that we heard speech
      this.lastSpeechAt = Date.now();

      // Handle wake word detection (when not already awake)
      const wakeWordDetected = currentText.includes(this.config.wakeWord.toLowerCase());
      
      if (this.config.wakeWordEnabled && !this.isAwake) {
        if (wakeWordDetected) {
          console.log('[Speech] Wake word detected!');
          this.isAwake = true;
          
          // === PHASE 7: AUDIO DUCKING ===
          // Duck system audio when wake word detected
          this.duckAudio(true);
          
          this.callbacks.onWakeWord();
          
          // Extract text after wake word
          const wakeWordIndex = currentText.indexOf(this.config.wakeWord.toLowerCase());
          const afterWakeWord = currentText.slice(wakeWordIndex + this.config.wakeWord.length).trim();
          
          // If there's meaningful text after wake word, buffer it
          if (afterWakeWord && afterWakeWord.length > 2 && finalTranscript) {
            this.transcriptBuffer = afterWakeWord;
            this.startSilenceTimer();
          }
        }
        return;
      }

      // Normal transcript handling (awake or wake word disabled)
      if (interimTranscript) {
        // Show interim results but don't act on them
        this.callbacks.onTranscript(interimTranscript, false);
        
        // Reset silence timer - user is still speaking
        this.resetSilenceTimer();
      }
      
      if (finalTranscript) {
        // Add to buffer instead of sending immediately
        this.transcriptBuffer += ' ' + finalTranscript.trim();
        this.transcriptBuffer = this.transcriptBuffer.trim();
        
        // Start/reset silence timer
        this.startSilenceTimer();
      }
    };

    this.recognition.onerror = (event) => {
      console.log('[Speech] Recognition error:', event.error);
      
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        this.callbacks.onError(`Speech recognition error: ${event.error}`);
      }
      
      // Auto-restart on recoverable errors
      if (event.error === 'no-speech' || event.error === 'network') {
        this.scheduleRestart();
      }
    };

    this.recognition.onend = () => {
      console.log('[Speech] Recognition ended, continuous:', this.config.continuous, 'status:', this.status);
      
      // Auto-restart if we should be listening
      if (this.config.continuous && this.status !== 'SPEAKING' && this.status !== 'COOLDOWN') {
        this.scheduleRestart();
      }
    };
  }

  /**
   * Check if the transcript sounds like JARVIS's own voice
   * 
   * Phase 8: Improved self-hearing detection
   * - Time-based: Extra cautious right after speaking
   * - Content-based: Check against known JARVIS phrases
   * - Similarity-based: Check against what we just said
   */
  private isSelfHearing(text: string): boolean {
    const cleanText = text.toLowerCase().trim();
    
    // Empty text is not self-hearing (but also not useful)
    if (cleanText.length < 2) {
      return true; // Treat as noise
    }
    
    // Time-based check: If we JUST finished speaking (within 500ms),
    // be very suspicious of any input that matches our speaking patterns
    const timeSinceSpoke = Date.now() - this.lastSpokeAt;
    const recentlySpeaking = timeSinceSpoke < 500;
    
    // Check against common JARVIS phrases
    for (const phrase of SELF_PHRASES) {
      if (cleanText === phrase || cleanText.startsWith(phrase)) {
        return true;
      }
    }
    
    // Check if it's similar to what we just said
    if (this.lastSpokenText) {
      const lastSpoken = this.lastSpokenText.toLowerCase();
      
      // If the heard text is contained in what we just said, ignore it
      if (lastSpoken.includes(cleanText)) {
        return true;
      }
      
      // If we recently spoke and there's significant overlap, ignore it
      if (recentlySpeaking) {
        const words = cleanText.split(' ');
        const spokenWords = lastSpoken.split(' ');
        const overlap = words.filter(w => spokenWords.includes(w)).length;
        
        // If more than half the words match what we said, likely echo
        if (overlap > words.length * 0.5) {
          return true;
        }
      }
      
      // Check first few words match (common for echoes)
      const firstWords = cleanText.slice(0, 30);
      if (lastSpoken.includes(firstWords) && firstWords.length > 10) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Start timer to send transcript after silence
   */
  private startSilenceTimer(): void {
    this.resetSilenceTimer();
    
    this.silenceTimer = setTimeout(() => {
      if (this.transcriptBuffer.trim()) {
        console.log('[Speech] Silence detected, sending transcript:', this.transcriptBuffer);
        this.callbacks.onTranscript(this.transcriptBuffer.trim(), true);
        this.transcriptBuffer = '';
        
        // Auto-sleep after processing (if wake word enabled)
        if (this.config.wakeWordEnabled) {
          this.scheduleAutoSleep();
        }
      }
    }, this.config.silenceTimeout);
  }

  private resetSilenceTimer(): void {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  private scheduleRestart(): void {
    if (this.restartTimeout) return;
    
    this.restartTimeout = setTimeout(() => {
      this.restartTimeout = null;
      if (this.status !== 'SPEAKING' && this.status !== 'COOLDOWN') {
        this.startListening();
      }
    }, 100);
  }

  private scheduleAutoSleep(): void {
    if (this.autoSleepTimer) {
      clearTimeout(this.autoSleepTimer);
    }
    
    // Go back to sleep after 30 seconds of no interaction
    this.autoSleepTimer = setTimeout(() => {
      if (this.isAwake) {
        console.log('[Speech] Auto-sleep after inactivity');
        this.isAwake = false;
        
        // Restore audio when going to sleep
        this.duckAudio(false);
      }
    }, 30000);
  }

  // ===========================================================================
  // VOICE INITIALIZATION
  // ===========================================================================

  private initVoice(): void {
    const setVoice = () => {
      const voices = this.synthesis.getVoices();
      
      // Prefer configured voice, then Google UK English Female, then any English
      if (this.config.voiceName) {
        this.selectedVoice = voices.find(v => v.name.includes(this.config.voiceName!)) || null;
      }
      
      if (!this.selectedVoice) {
        this.selectedVoice = voices.find(v => v.name.includes('Google UK English Female')) ||
                            voices.find(v => v.name.includes('Google UK English')) ||
                            voices.find(v => v.lang.startsWith('en') && v.name.includes('Google')) ||
                            voices.find(v => v.lang.startsWith('en')) ||
                            null;
      }
      
      if (this.selectedVoice) {
        console.log('[Speech] Selected voice:', this.selectedVoice.name);
      }
    };

    if (this.synthesis.getVoices().length > 0) {
      setVoice();
    } else {
      this.synthesis.onvoiceschanged = setVoice;
    }
  }

  // ===========================================================================
  // PUBLIC METHODS
  // ===========================================================================

  public startListening(): void {
    if (this.recognition && this.status !== 'SPEAKING' && this.status !== 'COOLDOWN') {
      try {
        this.recognition.start();
      } catch (e) {
        // Already started, ignore
      }
    }
  }

  public stopListening(): void {
    this.resetSilenceTimer();
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (e) {
        // Not running, ignore
      }
    }
    this.setStatus('IDLE');
  }

  public wake(): void {
    this.isAwake = true;
    if (this.autoSleepTimer) {
      clearTimeout(this.autoSleepTimer);
    }
    this.scheduleAutoSleep();
  }

  // ===========================================================================
  // TEXT TO SPEECH
  // ===========================================================================

  public speak(text: string): Promise<void> {
    // Record what we're about to say (for self-hearing prevention)
    this.lastSpokenText = text;
    
    // === PHASE 8: Try Piper TTS first (local, fast, human-sounding) ===
    if (this.config.ttsProvider === 'piper' || this.config.ttsProvider === 'auto') {
      return this.speakPiper(text);
    }
    
    // Use server TTS if configured (key is on server side)
    if (this.config.ttsProvider === 'server') {
      return this.speakElevenLabs(text);
    }
    
    // Use direct ElevenLabs if configured with client-side key
    if (this.config.ttsProvider === 'elevenlabs' && 
        this.config.elevenLabsApiKey && 
        this.config.elevenLabsVoiceId) {
      return this.speakElevenLabs(text);
    }
    
    return this.speakBrowser(text);
  }
  
  /**
   * Speak using Piper TTS (Phase 8: Neural voice)
   * Falls back to browser if Piper unavailable
   */
  private async speakPiper(text: string): Promise<void> {
    if (!text || text.trim().length === 0) return;
    
    // Check if Piper is available
    if (!window.jarvisHost?.speakPiper) {
      console.log('[Speech] Piper not available, falling back to browser');
      return this.speakBrowser(text);
    }
    
    this.stopListening();
    this.setStatus('SPEAKING');
    this.callbacks.onSpeakStart();
    
    try {
      const result = await window.jarvisHost.speakPiper(text);
      
      if (result.fallback) {
        // Piper not available, use browser
        console.log('[Speech] Piper fallback:', result.reason);
        return this.speakBrowser(text);
      }
      
      // Piper succeeded
      this.lastSpokeAt = Date.now();
      this.callbacks.onSpeakEnd();
      this.enterCooldown();
      this.exitCooldown();
      
    } catch (error) {
      console.error('[Speech] Piper error:', error);
      // Fall back to browser
      return this.speakBrowser(text);
    }
  }

  /**
   * Enter cooldown mode - ignore all input
   */
  private enterCooldown(): void {
    this.inCooldown = true;
    this.setStatus('COOLDOWN');
    console.log('[Speech] Entering cooldown for', this.config.cooldownDuration, 'ms');
  }

  /**
   * Exit cooldown mode and resume listening
   */
  private exitCooldown(): void {
    setTimeout(() => {
      this.inCooldown = false;
      this.lastSpokeAt = Date.now();
      console.log('[Speech] Exiting cooldown, resuming listening');
      
      if (this.config.continuous) {
        this.setStatus('LISTENING');
        this.startListening();
      } else {
        this.setStatus('IDLE');
      }
    }, this.config.cooldownDuration);
  }

  private async speakElevenLabs(text: string): Promise<void> {
    if (!text || text.trim().length === 0) return;

    // Stop listening and enter pre-speak state
    this.stopListening();
    this.setStatus('SPEAKING');
    this.callbacks.onSpeakStart();

    try {
      let audioBlob: Blob;

      // Use server proxy if in server mode, otherwise direct ElevenLabs
      if (this.config.ttsProvider === 'server') {
        // Server TTS proxy (secure - API key stays server-side)
        const { apiClient } = await import('./APIClient');
        const audioBuffer = await apiClient.speak(text, this.config.elevenLabsVoiceId);
        audioBlob = new Blob([audioBuffer], { type: 'audio/mpeg' });
      } else {
        // Direct ElevenLabs (dev mode only - requires client-side API key)
        if (!this.config.elevenLabsApiKey || !this.config.elevenLabsVoiceId) {
          throw new Error('ElevenLabs API key and voice ID required for direct mode');
        }

        const response = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${this.config.elevenLabsVoiceId}`,
          {
            method: 'POST',
            headers: {
              'Accept': 'audio/mpeg',
              'Content-Type': 'application/json',
              'xi-api-key': this.config.elevenLabsApiKey,
            },
            body: JSON.stringify({
              text,
              model_id: 'eleven_monolingual_v1',
              voice_settings: {
                stability: 0.5,
                similarity_boost: 0.75,
              },
            }),
          }
        );

        if (!response.ok) {
          throw new Error(`ElevenLabs API error: ${response.status}`);
        }

        audioBlob = await response.blob();
      }

      const audioUrl = URL.createObjectURL(audioBlob);
      
      return new Promise((resolve, reject) => {
        const audio = new Audio(audioUrl);
        this.currentAudio = audio;
        
        // Apply whisper mode
        audio.volume = this.config.whisperMode ? 0.3 : 1.0;

        audio.onended = () => {
          URL.revokeObjectURL(audioUrl);
          this.currentAudio = null;
          this.callbacks.onSpeakEnd();
          
          // Enter cooldown before resuming listening
          this.enterCooldown();
          this.exitCooldown();
          
          resolve();
        };

        audio.onerror = (e) => {
          URL.revokeObjectURL(audioUrl);
          this.currentAudio = null;
          console.error('[Speech] TTS audio error:', e);
          this.callbacks.onSpeakEnd();
          this.enterCooldown();
          this.exitCooldown();
          reject(new Error('Audio playback failed'));
        };

        audio.play().catch(reject);
      });
    } catch (error) {
      console.error('[Speech] TTS error:', error);
      this.callbacks.onSpeakEnd();
      
      // Fall back to browser TTS
      console.log('[Speech] Falling back to browser TTS');
      return this.speakBrowser(text);
    }
  }

  private speakBrowser(text: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!text || text.trim().length === 0) {
        resolve();
        return;
      }

      // Stop listening while speaking
      this.stopListening();
      this.setStatus('SPEAKING');
      this.callbacks.onSpeakStart();

      const utterance = new SpeechSynthesisUtterance(text);
      
      if (this.selectedVoice) {
        utterance.voice = this.selectedVoice;
      }
      
      utterance.rate = this.config.voiceRate || 1.0;
      utterance.pitch = this.config.voicePitch || 1.0;
      utterance.volume = this.config.whisperMode ? 0.3 : 1.0;

      utterance.onend = () => {
        this.callbacks.onSpeakEnd();
        
        // Enter cooldown before resuming listening
        this.enterCooldown();
        this.exitCooldown();
        
        resolve();
      };

      utterance.onerror = (event) => {
        console.error('[Speech] TTS error:', event);
        this.callbacks.onSpeakEnd();
        this.enterCooldown();
        this.exitCooldown();
        reject(new Error(`TTS error: ${event.error}`));
      };

      // Chrome bug workaround
      this.synthesis.cancel();
      
      setTimeout(() => {
        this.synthesis.speak(utterance);
      }, 50);
    });
  }

  public async speakSequence(texts: string[]): Promise<void> {
    for (const text of texts) {
      await this.speak(text);
      await new Promise(r => setTimeout(r, 200));
    }
  }

  public interrupt(): void {
    console.log('[Speech] Interrupt called');
    
    // Stop browser speech synthesis
    this.synthesis.cancel();
    
    // Stop any audio playback (ElevenLabs)
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      this.currentAudio = null;
    }
    
    // Phase 8: Stop Piper TTS
    if (window.jarvisHost?.stopPiper) {
      window.jarvisHost.stopPiper().catch(() => {});
    }
    
    this.inCooldown = false;
    this.setStatus('IDLE');
    this.callbacks.onSpeakEnd();
  }
  
  /**
   * Phase 7: Audio Ducking - Lower/restore system volume
   */
  private async duckAudio(duck: boolean): Promise<void> {
    if (!this.config.enableAudioDucking) return;
    
    // Avoid redundant calls
    if (duck === this.isAudioDucked) return;
    
    if (window.jarvisHost?.duckAudio) {
      try {
        await window.jarvisHost.duckAudio(duck);
        this.isAudioDucked = duck;
        console.log(`[Speech] Audio ${duck ? 'ducked' : 'restored'}`);
      } catch (e) {
        console.warn('[Speech] Audio ducking failed:', e);
      }
    }
  }
  
  /**
   * Call when interaction is complete to restore audio
   */
  public async restoreAudio(): Promise<void> {
    await this.duckAudio(false);
  }

  public destroy(): void {
    this.stopListening();
    this.interrupt();
    this.resetSilenceTimer();
    
    // Restore audio on destroy
    this.duckAudio(false);
    
    // Clean up interrupt listener
    if (this.interruptUnsubscribe) {
      this.interruptUnsubscribe();
      this.interruptUnsubscribe = null;
    }
    
    if (this.autoSleepTimer) {
      clearTimeout(this.autoSleepTimer);
    }
    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
    }
  }

  // ===========================================================================
  // STATE
  // ===========================================================================

  private setStatus(status: SpeechStatus): void {
    if (this.status !== status) {
      this.status = status;
      this.callbacks.onStatusChange(status);
    }
  }

  public getStatus(): SpeechStatus {
    return this.status;
  }

  public isListening(): boolean {
    return this.status === 'LISTENING';
  }

  public isCurrentlyAwake(): boolean {
    return this.isAwake;
  }
}
