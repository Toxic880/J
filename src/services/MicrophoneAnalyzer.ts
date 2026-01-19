/**
 * MICROPHONE ANALYZER
 * 
 * Phase 11: The Microphone Problem
 * 
 * Analyzes microphone quality and background noise to:
 * 1. Detect if the mic is good enough for voice commands
 * 2. Calculate signal-to-noise ratio (SNR)
 * 3. Recommend hardware if needed
 * 4. Apply audio processing (noise gate, noise reduction)
 * 
 * This is REAL audio analysis using the Web Audio API.
 */

export interface MicrophoneAnalysis {
  // Basic info
  deviceId: string;
  deviceName: string;
  
  // Quality metrics
  backgroundNoiseLevel: number;  // dB, lower is better (typically -60 to -30)
  peakLevel: number;             // dB when speaking
  signalToNoiseRatio: number;    // dB, higher is better (>20 is good)
  
  // Quality assessment
  quality: 'excellent' | 'good' | 'fair' | 'poor';
  recommendation: string;
  
  // Detailed metrics
  frequencyResponse: {
    low: number;    // Energy in low frequencies (rumble/hum)
    mid: number;    // Energy in voice frequencies
    high: number;   // Energy in high frequencies (hiss)
  };
  
  // Issues detected
  issues: MicrophoneIssue[];
}

export interface MicrophoneIssue {
  type: 'noise_floor' | 'hum' | 'clipping' | 'low_gain' | 'echo' | 'compression';
  severity: 'low' | 'medium' | 'high';
  description: string;
  fix?: string;
}

export interface AudioProcessingConfig {
  // Noise gate
  noiseGateEnabled: boolean;
  noiseGateThreshold: number;  // dB, audio below this is silenced (-50 to -30)
  noiseGateAttack: number;     // ms
  noiseGateRelease: number;    // ms
  
  // Noise reduction
  noiseReductionEnabled: boolean;
  noiseReductionLevel: 'low' | 'medium' | 'high';
  
  // WebRTC processing
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
  
  // Sensitivity
  wakeWordSensitivity: 'low' | 'medium' | 'high';
  voiceActivityThreshold: number;  // dB
}

// Default config optimized for voice commands
const DEFAULT_CONFIG: AudioProcessingConfig = {
  noiseGateEnabled: true,
  noiseGateThreshold: -45,
  noiseGateAttack: 10,
  noiseGateRelease: 100,
  
  noiseReductionEnabled: true,
  noiseReductionLevel: 'medium',
  
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  
  wakeWordSensitivity: 'medium',
  voiceActivityThreshold: -40,
};

export class MicrophoneAnalyzer {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private stream: MediaStream | null = null;
  private config: AudioProcessingConfig;
  
  // For continuous monitoring
  private monitorInterval: ReturnType<typeof setInterval> | null = null;
  private noiseFloorSamples: number[] = [];
  
  constructor(config?: Partial<AudioProcessingConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }
  
  /**
   * Get the current audio processing config
   */
  getConfig(): AudioProcessingConfig {
    return { ...this.config };
  }
  
  /**
   * Update audio processing config
   */
  setConfig(config: Partial<AudioProcessingConfig>): void {
    this.config = { ...this.config, ...config };
    this.saveConfig();
  }
  
  /**
   * Save config to localStorage
   */
  private saveConfig(): void {
    localStorage.setItem('jarvis_audio_config', JSON.stringify(this.config));
  }
  
  /**
   * Load config from localStorage
   */
  loadConfig(): void {
    const saved = localStorage.getItem('jarvis_audio_config');
    if (saved) {
      try {
        this.config = { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
      } catch (e) {
        console.warn('[MicAnalyzer] Failed to load saved config');
      }
    }
  }
  
  /**
   * Get MediaStream constraints based on config
   */
  getMediaConstraints(): MediaStreamConstraints {
    return {
      audio: {
        echoCancellation: this.config.echoCancellation,
        noiseSuppression: this.config.noiseSuppression,
        autoGainControl: this.config.autoGainControl,
        // Request specific sample rate for better quality
        sampleRate: 16000,
        channelCount: 1,
      },
    };
  }
  
  /**
   * Run a full microphone analysis
   * Takes ~3 seconds to analyze background noise
   */
  async analyze(durationMs: number = 3000): Promise<MicrophoneAnalysis> {
    console.log('[MicAnalyzer] Starting microphone analysis...');
    
    // Get microphone access
    try {
      this.stream = await navigator.mediaDevices.getUserMedia(this.getMediaConstraints());
    } catch (e) {
      throw new Error('Microphone access denied. Please allow microphone access.');
    }
    
    // Get device info
    const track = this.stream.getAudioTracks()[0];
    const settings = track.getSettings();
    const deviceId = settings.deviceId || 'default';
    const deviceName = track.label || 'Unknown Microphone';
    
    // Set up audio analysis
    this.audioContext = new AudioContext();
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.3;
    
    const source = this.audioContext.createMediaStreamSource(this.stream);
    source.connect(this.analyser);
    
    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const floatArray = new Float32Array(bufferLength);
    
    // Collect samples over the analysis period
    const samples: { rms: number; peak: number; frequencies: number[] }[] = [];
    const startTime = Date.now();
    
    await new Promise<void>((resolve) => {
      const collectSample = () => {
        this.analyser!.getByteTimeDomainData(dataArray);
        this.analyser!.getFloatFrequencyData(floatArray);
        
        // Calculate RMS (root mean square) for volume
        let sum = 0;
        let peak = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const value = (dataArray[i] - 128) / 128;
          sum += value * value;
          peak = Math.max(peak, Math.abs(value));
        }
        const rms = Math.sqrt(sum / dataArray.length);
        
        samples.push({
          rms,
          peak,
          frequencies: Array.from(floatArray),
        });
        
        if (Date.now() - startTime < durationMs) {
          requestAnimationFrame(collectSample);
        } else {
          resolve();
        }
      };
      
      collectSample();
    });
    
    // Analyze collected samples
    const analysis = this.analyzeSamples(samples, deviceId, deviceName);
    
    // Cleanup
    this.cleanup();
    
    console.log('[MicAnalyzer] Analysis complete:', analysis);
    return analysis;
  }
  
  /**
   * Analyze collected audio samples
   */
  private analyzeSamples(
    samples: { rms: number; peak: number; frequencies: number[] }[],
    deviceId: string,
    deviceName: string
  ): MicrophoneAnalysis {
    // Calculate average and peak levels
    const rmsValues = samples.map(s => s.rms);
    const avgRms = rmsValues.reduce((a, b) => a + b, 0) / rmsValues.length;
    const maxRms = Math.max(...rmsValues);
    const minRms = Math.min(...rmsValues);
    
    // Convert to dB
    const backgroundNoiseLevel = 20 * Math.log10(avgRms + 0.0001);
    const peakLevel = 20 * Math.log10(maxRms + 0.0001);
    
    // Estimate SNR (assuming peak was speech, average was noise)
    // This is a rough estimate - real SNR needs actual speech samples
    const estimatedSpeechLevel = peakLevel + 10; // Assume speech would be ~10dB louder
    const signalToNoiseRatio = estimatedSpeechLevel - backgroundNoiseLevel;
    
    // Analyze frequency distribution (for detecting hum, hiss, etc.)
    const avgFrequencies = new Float32Array(samples[0].frequencies.length);
    for (const sample of samples) {
      for (let i = 0; i < sample.frequencies.length; i++) {
        avgFrequencies[i] += sample.frequencies[i] / samples.length;
      }
    }
    
    // Split into low/mid/high bands
    const binCount = avgFrequencies.length;
    const lowEnd = Math.floor(binCount * 0.1);   // ~0-800Hz
    const midEnd = Math.floor(binCount * 0.3);   // ~800-2400Hz
    
    let lowSum = 0, midSum = 0, highSum = 0;
    for (let i = 0; i < binCount; i++) {
      const power = Math.pow(10, avgFrequencies[i] / 10);
      if (i < lowEnd) lowSum += power;
      else if (i < midEnd) midSum += power;
      else highSum += power;
    }
    
    const frequencyResponse = {
      low: 10 * Math.log10(lowSum / lowEnd + 0.0001),
      mid: 10 * Math.log10(midSum / (midEnd - lowEnd) + 0.0001),
      high: 10 * Math.log10(highSum / (binCount - midEnd) + 0.0001),
    };
    
    // Detect issues
    const issues: MicrophoneIssue[] = [];
    
    // High noise floor
    if (backgroundNoiseLevel > -35) {
      issues.push({
        type: 'noise_floor',
        severity: backgroundNoiseLevel > -25 ? 'high' : 'medium',
        description: 'High background noise detected',
        fix: 'Move to a quieter location or use a directional microphone',
      });
    }
    
    // 60Hz hum (power line interference)
    if (frequencyResponse.low > frequencyResponse.mid + 10) {
      issues.push({
        type: 'hum',
        severity: 'medium',
        description: 'Electrical hum detected (possibly from nearby electronics)',
        fix: 'Move away from power cables or use a USB mic with better shielding',
      });
    }
    
    // High frequency hiss
    if (frequencyResponse.high > frequencyResponse.mid + 5) {
      issues.push({
        type: 'compression',
        severity: 'low',
        description: 'High-frequency noise (hiss) detected',
        fix: 'May indicate a low-quality microphone preamp',
      });
    }
    
    // Low gain
    if (peakLevel < -30) {
      issues.push({
        type: 'low_gain',
        severity: 'medium',
        description: 'Microphone volume is very low',
        fix: 'Increase microphone input level in system settings',
      });
    }
    
    // Determine quality rating
    let quality: MicrophoneAnalysis['quality'];
    let recommendation: string;
    
    if (signalToNoiseRatio > 30 && backgroundNoiseLevel < -45) {
      quality = 'excellent';
      recommendation = 'Your microphone is excellent for voice commands.';
    } else if (signalToNoiseRatio > 20 && backgroundNoiseLevel < -35) {
      quality = 'good';
      recommendation = 'Your microphone should work well for voice commands.';
    } else if (signalToNoiseRatio > 10 && backgroundNoiseLevel < -25) {
      quality = 'fair';
      recommendation = 'Your microphone may have trouble in noisy environments. Consider a dedicated USB microphone for better results.';
    } else {
      quality = 'poor';
      recommendation = 'Sir, your microphone is picking up significant background noise. For reliable voice commands, I strongly recommend a dedicated USB microphone.';
    }
    
    return {
      deviceId,
      deviceName,
      backgroundNoiseLevel: Math.round(backgroundNoiseLevel * 10) / 10,
      peakLevel: Math.round(peakLevel * 10) / 10,
      signalToNoiseRatio: Math.round(signalToNoiseRatio * 10) / 10,
      quality,
      recommendation,
      frequencyResponse: {
        low: Math.round(frequencyResponse.low * 10) / 10,
        mid: Math.round(frequencyResponse.mid * 10) / 10,
        high: Math.round(frequencyResponse.high * 10) / 10,
      },
      issues,
    };
  }
  
  /**
   * Get current audio level (for real-time monitoring)
   * Returns value from 0-100
   */
  getCurrentLevel(analyser: AnalyserNode): number {
    const dataArray = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(dataArray);
    
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const value = (dataArray[i] - 128) / 128;
      sum += value * value;
    }
    const rms = Math.sqrt(sum / dataArray.length);
    
    // Convert to 0-100 scale (logarithmic)
    const db = 20 * Math.log10(rms + 0.0001);
    // Map -60dB to 0, 0dB to 100
    return Math.max(0, Math.min(100, (db + 60) * (100 / 60)));
  }
  
  /**
   * Check if audio level is above noise gate threshold
   */
  isAboveNoiseGate(level: number): boolean {
    if (!this.config.noiseGateEnabled) return true;
    
    // Convert level (0-100) back to dB
    const db = (level / 100) * 60 - 60;
    return db > this.config.noiseGateThreshold;
  }
  
  /**
   * Check if audio indicates voice activity
   */
  isVoiceActivity(level: number): boolean {
    const db = (level / 100) * 60 - 60;
    return db > this.config.voiceActivityThreshold;
  }
  
  /**
   * Get sensitivity multiplier for wake word detection
   */
  getSensitivityMultiplier(): number {
    switch (this.config.wakeWordSensitivity) {
      case 'low': return 0.7;
      case 'medium': return 1.0;
      case 'high': return 1.5;
      default: return 1.0;
    }
  }
  
  /**
   * Cleanup resources
   */
  cleanup(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
    
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    
    this.analyser = null;
  }
}

// Hardware recommendations
export const RECOMMENDED_MICROPHONES = [
  {
    name: 'Anker PowerConf S330',
    type: 'USB Speakerphone',
    price: '$50',
    amazonUrl: 'https://www.amazon.com/dp/B09BKCZPW2',
    pros: ['360° pickup', 'Built-in speaker', 'Noise reduction'],
    cons: ['Not ideal for far-field'],
    rating: 4.5,
    bestFor: 'Desk use, video calls + voice commands',
  },
  {
    name: 'FIFINE K669B',
    type: 'USB Condenser Microphone',
    price: '$30',
    amazonUrl: 'https://www.amazon.com/dp/B06XCKGLTP',
    pros: ['Great value', 'Good voice clarity', 'Plug and play'],
    cons: ['Picks up keyboard noise', 'No headphone jack'],
    rating: 4.3,
    bestFor: 'Budget-friendly desk microphone',
  },
  {
    name: 'Blue Snowball iCE',
    type: 'USB Condenser Microphone',
    price: '$50',
    amazonUrl: 'https://www.amazon.com/dp/B014PYGTUQ',
    pros: ['Trusted brand', 'Good frequency response', 'Durable'],
    cons: ['Large footprint', 'No gain control'],
    rating: 4.4,
    bestFor: 'Quality on a budget',
  },
  {
    name: 'ReSpeaker USB Mic Array',
    type: 'USB Microphone Array (4-mic)',
    price: '$80',
    amazonUrl: 'https://www.amazon.com/dp/B07D27DLGY',
    pros: ['Far-field (5m+ range)', '4 microphones', 'LED ring', 'Alexa-grade'],
    cons: ['Requires more setup', 'No speaker'],
    rating: 4.2,
    bestFor: 'Alexa-like always-listening experience',
  },
  {
    name: 'Jabra Speak 410',
    type: 'USB Speakerphone',
    price: '$100',
    amazonUrl: 'https://www.amazon.com/dp/B007SHJIO2',
    pros: ['Professional grade', 'Excellent noise cancellation', 'Wideband audio'],
    cons: ['Higher price', 'Overkill for personal use'],
    rating: 4.6,
    bestFor: 'Professional/conference room quality',
  },
];

// Export singleton
export const microphoneAnalyzer = new MicrophoneAnalyzer();
