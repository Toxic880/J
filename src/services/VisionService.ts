/**
 * VISION SERVICE
 * 
 * Gives JARVIS eyes - camera integration for:
 * - Seeing the user (CAMERA mode)
 * - Desktop/screen capture (SCREEN mode) - Phase 7
 * - Face detection/recognition
 * - Observing the environment
 * - Reading expressions/mood
 * 
 * Uses browser getUserMedia + sends frames to vision-capable LLM
 * 
 * === PHASE 7: DESKTOP VISION ===
 * - Can capture active window or entire screen via Electron
 * - Enables "How do I fix this error?" while looking at VS Code
 * - Switches between CAMERA and SCREEN modes
 */

export type VisionMode = 'CAMERA' | 'SCREEN';

export interface VisionObservation {
  timestamp: Date;
  description: string;
  people: number;
  mood?: 'happy' | 'neutral' | 'tired' | 'stressed' | 'focused';
  activity?: string;
  confidence: number;
  mode: VisionMode;
}

export interface ScreenCapture {
  image: string;        // Base64 data URL
  sourceName: string;   // Window/screen name
  width: number;
  height: number;
  capturedAt: number;
}

export interface FaceData {
  name?: string;
  isKnown: boolean;
  boundingBox?: { x: number; y: number; width: number; height: number };
}

export class VisionService {
  private video: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private stream: MediaStream | null = null;
  private isActive: boolean = false;
  private lastObservation: VisionObservation | null = null;
  private observationInterval: ReturnType<typeof setInterval> | null = null;
  
  // Phase 7: Vision mode
  private mode: VisionMode = 'CAMERA';
  private lastScreenCapture: ScreenCapture | null = null;
  
  // LLM endpoint for vision analysis
  private visionEndpoint: string = '';
  private visionModel: string = '';
  
  // Callbacks
  private onObservation?: (observation: VisionObservation) => void;
  private onFaceDetected?: (face: FaceData) => void;

  constructor(config?: {
    visionEndpoint?: string;
    visionModel?: string;
    onObservation?: (observation: VisionObservation) => void;
    onFaceDetected?: (face: FaceData) => void;
    mode?: VisionMode;
  }) {
    this.visionEndpoint = config?.visionEndpoint || '';
    this.visionModel = config?.visionModel || 'gpt-4-vision-preview';
    this.onObservation = config?.onObservation;
    this.onFaceDetected = config?.onFaceDetected;
    this.mode = config?.mode || 'CAMERA';
    
    // Create hidden video and canvas elements
    this.setupElements();
  }

  private setupElements() {
    // Video element to receive camera stream
    this.video = document.createElement('video');
    this.video.setAttribute('playsinline', 'true');
    this.video.setAttribute('autoplay', 'true');
    this.video.style.display = 'none';
    document.body.appendChild(this.video);

    // Canvas for capturing frames
    this.canvas = document.createElement('canvas');
    this.canvas.width = 640;
    this.canvas.height = 480;
    this.canvas.style.display = 'none';
    document.body.appendChild(this.canvas);
    
    this.ctx = this.canvas.getContext('2d');
  }
  
  // ===========================================================================
  // PHASE 7: MODE SWITCHING
  // ===========================================================================
  
  /**
   * Set vision mode (CAMERA or SCREEN)
   */
  setMode(mode: VisionMode): void {
    this.mode = mode;
    console.log(`[Vision] Mode set to: ${mode}`);
  }
  
  getMode(): VisionMode {
    return this.mode;
  }

  /**
   * Start the camera
   */
  async start(): Promise<boolean> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user'
        },
        audio: false
      });

      if (this.video) {
        this.video.srcObject = this.stream;
        await this.video.play();
      }

      this.isActive = true;
      console.log('[Vision] Camera started');
      return true;
    } catch (error) {
      console.error('[Vision] Failed to start camera:', error);
      return false;
    }
  }

  /**
   * Stop the camera
   */
  stop() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    
    if (this.observationInterval) {
      clearInterval(this.observationInterval);
      this.observationInterval = null;
    }
    
    this.isActive = false;
    console.log('[Vision] Camera stopped');
  }

  /**
   * Capture current frame as base64
   */
  captureFrame(): string | null {
    if (!this.video || !this.canvas || !this.ctx || !this.isActive) {
      return null;
    }

    this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
    return this.canvas.toDataURL('image/jpeg', 0.8);
  }

  /**
   * Get a description of what JARVIS sees (for including in prompts)
   */
  async analyzeScene(customPrompt?: string): Promise<string> {
    const frame = this.captureFrame();
    if (!frame) {
      return "I don't have visual access at the moment.";
    }

    // If we have a vision endpoint configured, use it
    if (this.visionEndpoint) {
      return this.analyzeWithLLM(frame, customPrompt);
    }

    // Otherwise return a basic message
    return "I can see you, Sir, though my visual analysis capabilities are limited without a vision model configured.";
  }

  /**
   * Analyze frame with vision-capable LLM
   */
  private async analyzeWithLLM(frameBase64: string, customPrompt?: string): Promise<string> {
    const prompt = customPrompt || `You are JARVIS observing through a camera. Briefly describe what you see in a natural, JARVIS-like way. Focus on:
- The person (if visible): their apparent mood, what they're doing, how they look
- The environment
- Anything notable

Be concise and natural, like JARVIS would speak. Don't be robotic.`;

    try {
      // Try OpenAI-compatible endpoint first
      const response = await fetch(this.visionEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.visionModel,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                { 
                  type: 'image_url', 
                  image_url: { 
                    url: frameBase64,
                    detail: 'low'
                  } 
                }
              ]
            }
          ],
          max_tokens: 150,
        }),
      });

      if (!response.ok) {
        throw new Error(`Vision API error: ${response.status}`);
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content || "I'm having trouble processing what I see.";
    } catch (error) {
      console.error('[Vision] Analysis failed:', error);
      return "My visual processing encountered an issue, Sir.";
    }
  }

  /**
   * Quick check - is someone there?
   */
  async detectPresence(): Promise<boolean> {
    const frame = this.captureFrame();
    if (!frame) return false;

    // Simple presence detection could use face-api.js or similar
    // For now, we'll assume if camera is active and we can capture, someone might be there
    return true;
  }

  /**
   * Start periodic observation (for proactive comments)
   */
  startPeriodicObservation(intervalMs: number = 60000) {
    if (this.observationInterval) {
      clearInterval(this.observationInterval);
    }

    this.observationInterval = setInterval(async () => {
      if (!this.isActive) return;

      const description = await this.analyzeScene();
      
      const observation: VisionObservation = {
        timestamp: new Date(),
        description,
        people: 1, // Simplified for now
        confidence: 0.7,
      };

      this.lastObservation = observation;
      this.onObservation?.(observation);
    }, intervalMs);
  }

  /**
   * Get the last observation
   */
  getLastObservation(): VisionObservation | null {
    return this.lastObservation;
  }

  /**
   * Check if camera is active
   */
  isRunning(): boolean {
    return this.isActive;
  }

  /**
   * Set vision endpoint
   */
  setVisionEndpoint(endpoint: string, model: string = 'gpt-4-vision-preview') {
    this.visionEndpoint = endpoint;
    this.visionModel = model;
  }

  /**
   * Get current frame for display (e.g., in UI)
   */
  getVideoElement(): HTMLVideoElement | null {
    return this.video;
  }

  /**
   * Take a snapshot and return as blob
   */
  async takeSnapshot(): Promise<Blob | null> {
    const frame = this.captureFrame();
    if (!frame) return null;

    const response = await fetch(frame);
    return response.blob();
  }

  /**
   * Cleanup
   */
  destroy() {
    this.stop();
    
    if (this.video) {
      this.video.remove();
      this.video = null;
    }
    
    if (this.canvas) {
      this.canvas.remove();
      this.canvas = null;
    }
  }
  
  // ===========================================================================
  // PHASE 7: SCREEN CAPTURE (Desktop Vision)
  // ===========================================================================
  
  /**
   * Capture the desktop/active window
   * Requires Electron with desktopCapturer
   */
  async captureScreen(options: { 
    type?: 'screen' | 'window';
    activeOnly?: boolean;
  } = {}): Promise<ScreenCapture | null> {
    // Check if we're in Electron
    if (!window.jarvisHost?.captureScreen) {
      console.warn('[Vision] Screen capture not available (not in Electron)');
      return null;
    }
    
    try {
      const result = await window.jarvisHost.captureScreen({
        type: options.type || 'screen',
        activeOnly: options.activeOnly ?? true,
      });
      
      if (!result.success) {
        console.error('[Vision] Screen capture failed:', result.error);
        return null;
      }
      
      this.lastScreenCapture = {
        image: result.image,
        sourceName: result.sourceName,
        width: result.width,
        height: result.height,
        capturedAt: result.capturedAt,
      };
      
      console.log(`[Vision] Captured screen: ${result.sourceName} (${result.width}x${result.height})`);
      return this.lastScreenCapture;
      
    } catch (error) {
      console.error('[Vision] Screen capture error:', error);
      return null;
    }
  }
  
  /**
   * Get the last screen capture
   */
  getLastScreenCapture(): ScreenCapture | null {
    return this.lastScreenCapture;
  }
  
  /**
   * Analyze the current screen using vision LLM
   * Phase 9: Includes timeout for reliability
   */
  async analyzeScreen(prompt?: string): Promise<string> {
    const capture = await this.captureScreen({ type: 'screen', activeOnly: true });
    
    if (!capture) {
      return "I couldn't capture your screen. This feature requires the desktop app.";
    }
    
    // Use the vision endpoint to analyze
    if (!this.visionEndpoint) {
      return "Vision analysis is not configured. Please set up a vision-capable LLM endpoint.";
    }
    
    try {
      const analysisPrompt = prompt || 
        "Describe what you see on this screen. If there are any errors, code, or UI elements that might need help, describe them clearly.";
      
      // Phase 9: Add AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000); // 20 second timeout for vision
      
      try {
        const response = await fetch(this.visionEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: this.visionModel,
            messages: [{
              role: 'user',
              content: [
                { type: 'text', text: analysisPrompt },
                { 
                  type: 'image_url', 
                  image_url: { 
                    url: capture.image,
                    detail: 'high'
                  }
                }
              ]
            }],
            max_tokens: 1000,
          }),
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        
        const data = await response.json();
        return data.choices?.[0]?.message?.content || 'Unable to analyze the screen.';
        
      } catch (error) {
        clearTimeout(timeoutId);
        
        // Phase 9: Graceful degradation on timeout
        if (error instanceof Error && error.name === 'AbortError') {
          console.warn('[Vision] Screen analysis timed out');
          return "I can't see right now, Sir. My vision systems are taking too long to respond. The LLM may be busy.";
        }
        throw error;
      }
      
    } catch (error) {
      console.error('[Vision] Screen analysis failed:', error);
      // Phase 9: User-friendly error message
      return "I can't see right now, Sir. My vision systems are temporarily unavailable.";
    }
  }
  
  /**
   * Get available capture sources (windows and screens)
   */
  async getCaptureSources(): Promise<Array<{
    id: string;
    name: string;
    thumbnail: string;
    isScreen: boolean;
  }>> {
    if (!window.jarvisHost?.getCaptureSources) {
      return [];
    }
    
    try {
      const result = await window.jarvisHost.getCaptureSources();
      return result.success ? result.sources : [];
    } catch (error) {
      console.error('[Vision] Failed to get capture sources:', error);
      return [];
    }
  }
}
