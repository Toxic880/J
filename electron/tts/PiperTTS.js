/**
 * PIPER TTS SERVICE
 * 
 * Phase 8: Production Grade Voice
 * 
 * Replaces robotic browser speechSynthesis with Piper - a local, fast,
 * neural TTS engine that sounds human.
 * 
 * Piper runs as a subprocess and outputs WAV audio.
 * We stream it directly to speakers without browser involvement.
 * 
 * Setup:
 *   1. Download Piper from: https://github.com/rhasspy/piper/releases
 *   2. Download a voice model (e.g., en_US-lessac-medium)
 *   3. Place in electron/tts/piper/
 * 
 * Fallback chain:
 *   1. Piper (local, fast, best quality)
 *   2. ElevenLabs (cloud, excellent quality, costs money)
 *   3. Browser speechSynthesis (always available, robotic)
 */

const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

class PiperTTS {
  constructor() {
    this.piperPath = null;
    this.modelPath = null;
    this.configPath = null;
    this.isAvailable = false;
    this.currentProcess = null;
    this.audioQueue = [];
    this.isPlaying = false;
    
    // Platform-specific executable name
    this.exeName = process.platform === 'win32' ? 'piper.exe' : 'piper';
    
    this.init();
  }
  
  /**
   * Initialize Piper - find executable and model
   */
  init() {
    const possiblePaths = [
      // Development paths
      path.join(__dirname, 'piper', this.exeName),
      path.join(__dirname, '..', 'tts', 'piper', this.exeName),
      path.join(process.cwd(), 'electron', 'tts', 'piper', this.exeName),
      
      // Production paths (packaged app)
      path.join(process.resourcesPath || '', 'tts', 'piper', this.exeName),
      
      // System paths
      '/usr/bin/piper',
      '/usr/local/bin/piper',
    ];
    
    // Find Piper executable
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        this.piperPath = p;
        console.log('[Piper] Found executable:', p);
        break;
      }
    }
    
    if (!this.piperPath) {
      console.log('[Piper] Executable not found. Voice will fall back to browser TTS.');
      console.log('[Piper] To enable: download Piper and place in electron/tts/piper/');
      return;
    }
    
    // Find voice model
    const piperDir = path.dirname(this.piperPath);
    const modelFiles = fs.readdirSync(piperDir).filter(f => f.endsWith('.onnx'));
    
    if (modelFiles.length > 0) {
      this.modelPath = path.join(piperDir, modelFiles[0]);
      this.configPath = this.modelPath + '.json';
      
      if (fs.existsSync(this.configPath)) {
        this.isAvailable = true;
        console.log('[Piper] Ready with model:', modelFiles[0]);
      } else {
        console.log('[Piper] Model config not found:', this.configPath);
      }
    } else {
      console.log('[Piper] No voice model found. Download one from:');
      console.log('[Piper] https://huggingface.co/rhasspy/piper-voices/tree/main');
    }
  }
  
  /**
   * Check if Piper is available
   */
  available() {
    return this.isAvailable;
  }
  
  /**
   * Synthesize text to audio and play it
   * Returns a promise that resolves when speech is complete
   */
  async speak(text, options = {}) {
    if (!this.isAvailable) {
      throw new Error('Piper TTS not available');
    }
    
    return new Promise((resolve, reject) => {
      // Clean text for TTS
      const cleanText = this.cleanTextForTTS(text);
      
      if (!cleanText) {
        resolve();
        return;
      }
      
      // Generate temp WAV file path
      const tempWav = path.join(os.tmpdir(), `jarvis-tts-${Date.now()}.wav`);
      
      // Build Piper command
      const args = [
        '--model', this.modelPath,
        '--config', this.configPath,
        '--output_file', tempWav,
      ];
      
      // Optional: adjust speed
      if (options.speed) {
        args.push('--length_scale', String(1.0 / options.speed));
      }
      
      console.log('[Piper] Synthesizing:', cleanText.substring(0, 50) + '...');
      
      // Spawn Piper process
      this.currentProcess = spawn(this.piperPath, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      
      // Send text to stdin
      this.currentProcess.stdin.write(cleanText);
      this.currentProcess.stdin.end();
      
      let stderr = '';
      
      this.currentProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      this.currentProcess.on('close', async (code) => {
        this.currentProcess = null;
        
        if (code !== 0) {
          console.error('[Piper] Process failed:', stderr);
          reject(new Error(`Piper failed with code ${code}`));
          return;
        }
        
        // Play the generated audio
        try {
          await this.playAudio(tempWav);
          
          // Clean up temp file
          fs.unlink(tempWav, () => {});
          
          resolve();
        } catch (err) {
          reject(err);
        }
      });
      
      this.currentProcess.on('error', (err) => {
        this.currentProcess = null;
        reject(err);
      });
    });
  }
  
  /**
   * Play a WAV file using system audio
   */
  async playAudio(wavPath) {
    return new Promise((resolve, reject) => {
      const platform = process.platform;
      let command;
      let args;
      
      if (platform === 'win32') {
        // Windows: Use PowerShell to play audio
        command = 'powershell';
        args = ['-c', `(New-Object Media.SoundPlayer '${wavPath}').PlaySync()`];
      } else if (platform === 'darwin') {
        // macOS: Use afplay
        command = 'afplay';
        args = [wavPath];
      } else {
        // Linux: Use aplay or paplay
        command = 'aplay';
        args = ['-q', wavPath];
        
        // Try paplay if aplay not available
        try {
          execSync('which paplay', { stdio: 'ignore' });
          command = 'paplay';
          args = [wavPath];
        } catch (e) {
          // aplay it is
        }
      }
      
      const player = spawn(command, args, { stdio: 'ignore' });
      
      player.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Audio playback failed with code ${code}`));
        }
      });
      
      player.on('error', (err) => {
        reject(err);
      });
    });
  }
  
  /**
   * Stop current speech
   */
  stop() {
    if (this.currentProcess) {
      this.currentProcess.kill('SIGTERM');
      this.currentProcess = null;
    }
  }
  
  /**
   * Clean text for TTS - remove markdown, URLs, etc.
   */
  cleanTextForTTS(text) {
    return text
      // Remove markdown formatting
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      .replace(/_([^_]+)_/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/```[\s\S]*?```/g, '')
      
      // Remove URLs
      .replace(/https?:\/\/[^\s]+/g, '')
      
      // Remove excessive punctuation
      .replace(/([.!?])\1+/g, '$1')
      
      // Clean up whitespace
      .replace(/\s+/g, ' ')
      .trim();
  }
  
  /**
   * Get available voices (for future multi-voice support)
   */
  getVoices() {
    if (!this.piperPath) return [];
    
    const piperDir = path.dirname(this.piperPath);
    const models = fs.readdirSync(piperDir)
      .filter(f => f.endsWith('.onnx'))
      .map(f => ({
        id: f.replace('.onnx', ''),
        name: f.replace('.onnx', '').replace(/-/g, ' '),
        path: path.join(piperDir, f),
      }));
    
    return models;
  }
  
  /**
   * Set active voice model
   */
  setVoice(voiceId) {
    const voices = this.getVoices();
    const voice = voices.find(v => v.id === voiceId);
    
    if (voice) {
      this.modelPath = voice.path;
      this.configPath = voice.path + '.json';
      console.log('[Piper] Voice changed to:', voiceId);
      return true;
    }
    
    return false;
  }
}

module.exports = { PiperTTS };
