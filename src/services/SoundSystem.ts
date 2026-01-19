/**
 * JARVIS SOUND SYSTEM
 * 
 * Phase 8: Production Grade
 * 
 * Audio feedback for all interactions. This is what makes the difference
 * between "is it working?" and KNOWING it's working.
 * 
 * Sounds:
 *   wake       - Subtle chime when wake word detected
 *   processing - Low hum while thinking
 *   success    - Satisfying click/beep on completion
 *   error      - Gentle alert for problems
 *   sleep      - Soft tone when going idle
 *   interrupt  - Quick acknowledgment of barge-in
 */

export type SoundType = 'wake' | 'processing' | 'success' | 'error' | 'sleep' | 'interrupt';

// Base64-encoded audio files (small, embedded, no external dependencies)
// These are simple synthesized tones - production would use better samples
const SOUNDS: Record<SoundType, string> = {
  // Wake: Two-tone ascending chime (C5 -> E5)
  wake: generateTone([523.25, 659.25], [0.1, 0.15], 0.3),
  
  // Processing: Low continuous hum (will loop)
  processing: generateTone([120, 180], [0.5, 0.5], 0.1),
  
  // Success: Quick ascending triple beep
  success: generateTone([440, 554.37, 659.25], [0.08, 0.08, 0.12], 0.25),
  
  // Error: Descending two-tone
  error: generateTone([440, 349.23], [0.15, 0.2], 0.3),
  
  // Sleep: Soft descending tone
  sleep: generateTone([392, 329.63], [0.2, 0.3], 0.15),
  
  // Interrupt: Quick single beep
  interrupt: generateTone([880], [0.05], 0.2),
};

/**
 * Generate a simple tone as a data URL
 * This is a fallback - production should use proper audio files
 */
function generateTone(frequencies: number[], durations: number[], volume: number): string {
  // Create audio context for generation
  const sampleRate = 44100;
  const totalDuration = durations.reduce((a, b) => a + b, 0);
  const numSamples = Math.floor(sampleRate * totalDuration);
  
  // Generate samples
  const samples = new Float32Array(numSamples);
  let sampleIndex = 0;
  
  for (let i = 0; i < frequencies.length; i++) {
    const freq = frequencies[i];
    const duration = durations[i];
    const numToneSamples = Math.floor(sampleRate * duration);
    
    for (let j = 0; j < numToneSamples && sampleIndex < numSamples; j++) {
      const t = j / sampleRate;
      // Sine wave with envelope
      const envelope = Math.sin(Math.PI * j / numToneSamples); // Fade in/out
      samples[sampleIndex] = Math.sin(2 * Math.PI * freq * t) * envelope * volume;
      sampleIndex++;
    }
  }
  
  // Convert to WAV
  const wavData = encodeWAV(samples, sampleRate);
  return 'data:audio/wav;base64,' + btoa(String.fromCharCode(...new Uint8Array(wavData)));
}

/**
 * Encode samples as WAV file
 */
function encodeWAV(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  
  // WAV header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size
  view.setUint16(20, 1, true);  // AudioFormat (PCM)
  view.setUint16(22, 1, true);  // NumChannels
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // ByteRate
  view.setUint16(32, 2, true);  // BlockAlign
  view.setUint16(34, 16, true); // BitsPerSample
  writeString(view, 36, 'data');
  view.setUint32(40, samples.length * 2, true);
  
  // Write samples
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
    offset += 2;
  }
  
  return buffer;
}

function writeString(view: DataView, offset: number, string: string): void {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

export class SoundSystem {
  private audioContext: AudioContext | null = null;
  private audioElements: Map<SoundType, HTMLAudioElement> = new Map();
  private processingLoop: HTMLAudioElement | null = null;
  private isProcessingPlaying: boolean = false;
  private volume: number = 0.5;
  private enabled: boolean = true;
  
  constructor() {
    this.preloadSounds();
  }
  
  /**
   * Preload all sounds as Audio elements
   */
  private preloadSounds(): void {
    for (const [type, dataUrl] of Object.entries(SOUNDS)) {
      const audio = new Audio(dataUrl);
      audio.preload = 'auto';
      audio.volume = this.volume;
      this.audioElements.set(type as SoundType, audio);
    }
  }
  
  /**
   * Play a sound
   */
  play(type: SoundType): void {
    if (!this.enabled) return;
    
    // Special handling for processing sound (loops)
    if (type === 'processing') {
      this.startProcessingLoop();
      return;
    }
    
    // Stop processing loop if playing any other sound
    if (this.isProcessingPlaying) {
      this.stopProcessingLoop();
    }
    
    const audio = this.audioElements.get(type);
    if (audio) {
      // Clone to allow overlapping plays
      const clone = audio.cloneNode() as HTMLAudioElement;
      clone.volume = this.volume;
      clone.play().catch(e => {
        // Autoplay blocked - user hasn't interacted yet
        console.warn('[Sound] Playback blocked:', e.message);
      });
    }
  }
  
  /**
   * Start the processing loop sound
   */
  private startProcessingLoop(): void {
    if (this.isProcessingPlaying) return;
    
    const audio = this.audioElements.get('processing');
    if (audio) {
      this.processingLoop = audio.cloneNode() as HTMLAudioElement;
      this.processingLoop.loop = true;
      this.processingLoop.volume = this.volume * 0.3; // Quieter for loop
      this.processingLoop.play().catch(() => {});
      this.isProcessingPlaying = true;
    }
  }
  
  /**
   * Stop the processing loop
   */
  stopProcessingLoop(): void {
    if (this.processingLoop) {
      this.processingLoop.pause();
      this.processingLoop = null;
    }
    this.isProcessingPlaying = false;
  }
  
  /**
   * Stop all sounds
   */
  stopAll(): void {
    this.stopProcessingLoop();
    // Other sounds are short enough they don't need stopping
  }
  
  /**
   * Set master volume (0-1)
   */
  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    
    // Update all audio elements
    for (const audio of this.audioElements.values()) {
      audio.volume = this.volume;
    }
    
    if (this.processingLoop) {
      this.processingLoop.volume = this.volume * 0.3;
    }
  }
  
  /**
   * Enable/disable sounds
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.stopAll();
    }
  }
  
  /**
   * Check if sounds are enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }
  
  /**
   * Play sound through Electron (bypasses browser restrictions)
   * Falls back to browser audio if not in Electron
   */
  async playNative(type: SoundType): Promise<void> {
    // Try Electron first
    if (window.jarvisHost?.playSound) {
      try {
        await window.jarvisHost.playSound(type);
        return;
      } catch (e) {
        // Fall back to browser
      }
    }
    
    // Browser fallback
    this.play(type);
  }
}

// Export singleton
export const sounds = new SoundSystem();

// Add type declaration for Electron
declare global {
  interface Window {
    jarvisHost?: {
      playSound?: (type: SoundType) => Promise<void>;
      // ... other existing methods
    };
  }
}
