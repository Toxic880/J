/**
 * FIRST LAUNCH WIZARD - IMPROVED
 * 
 * Goal: Get JARVIS working in 5 minutes with ZERO confusion
 * 
 * Steps:
 * 1. Welcome
 * 2. LM Studio Setup (with guided installation)
 * 3. Model Download (recommends specific model)
 * 4. Microphone Test
 * 5. Smart Home (optional)
 * 6. Ready
 * 
 * Key improvements:
 * - Actually walks through LM Studio installation
 * - Recommends a specific model (not "download any model")
 * - Visual guides with screenshots/animations
 * - "I'm stuck" help at every step
 */

import React, { useState, useEffect, useCallback } from 'react';
import { microphoneAnalyzer, MicrophoneAnalysis, RECOMMENDED_MICROPHONES } from '../services/MicrophoneAnalyzer';

// ============================================================================
// TYPES
// ============================================================================

interface WizardStepProps {
  onNext: () => void;
  onBack?: () => void;
  onSkip?: () => void;
}

// ============================================================================
// STEP 1: WELCOME
// ============================================================================

const WelcomeStep: React.FC<WizardStepProps> = ({ onNext }) => (
  <div className="text-center space-y-8">
    {/* Arc Reactor Animation */}
    <div className="w-40 h-40 mx-auto relative">
      <div className="absolute inset-0 rounded-full bg-cyan-500/20 animate-ping" style={{ animationDuration: '2s' }} />
      <div className="absolute inset-4 rounded-full bg-cyan-500/30 animate-pulse" />
      <div className="absolute inset-8 rounded-full bg-cyan-500/50" />
      <div className="absolute inset-12 rounded-full bg-cyan-400" />
      <div className="absolute inset-[52px] rounded-full bg-white" />
    </div>
    
    <div>
      <h1 className="text-4xl font-bold text-white mb-4">
        Welcome, Sir.
      </h1>
      <p className="text-cyan-400/80 text-lg max-w-md mx-auto">
        I'm J.A.R.V.I.S. — your personal AI assistant.
        <br />
        Let's get me set up. It'll only take a few minutes.
      </p>
    </div>
    
    <div className="space-y-3">
      <button
        onClick={onNext}
        className="w-full max-w-xs px-8 py-4 bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-lg rounded-xl transition-all hover:scale-105"
      >
        Let's Go
      </button>
      <p className="text-cyan-500/40 text-sm">Estimated time: 5 minutes</p>
    </div>
  </div>
);

// ============================================================================
// STEP 2: LM STUDIO SETUP (THE CRITICAL ONE)
// ============================================================================

const LMStudioStep: React.FC<WizardStepProps> = ({ onNext, onBack }) => {
  const [status, setStatus] = useState<'checking' | 'not-installed' | 'installed-no-model' | 'ready' | 'error'>('checking');
  const [modelInfo, setModelInfo] = useState<{ id: string; size?: number } | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [checkCount, setCheckCount] = useState(0);

  const checkLMStudio = useCallback(async () => {
    try {
      const response = await fetch('http://127.0.0.1:1234/v1/models', {
        signal: AbortSignal.timeout(3000),
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.data && data.data.length > 0) {
          setModelInfo(data.data[0]);
          setStatus('ready');
        } else {
          setStatus('installed-no-model');
        }
      } else {
        setStatus('not-installed');
      }
    } catch {
      setStatus('not-installed');
    }
  }, []);

  useEffect(() => {
    checkLMStudio();
  }, [checkLMStudio]);

  // Auto-retry check every 3 seconds when not ready
  useEffect(() => {
    if (status === 'not-installed' || status === 'installed-no-model') {
      const interval = setInterval(() => {
        setCheckCount(c => c + 1);
        checkLMStudio();
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [status, checkLMStudio]);

  const openLMStudioDownload = () => {
    window.open('https://lmstudio.ai/', '_blank');
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-3xl font-bold text-white mb-2">AI Brain Setup</h2>
        <p className="text-cyan-400/70">
          JARVIS needs LM Studio to think. It's free and runs on your computer.
        </p>
      </div>

      {/* Status Card */}
      <div className="bg-black/40 border border-cyan-500/30 rounded-2xl p-6 max-w-lg mx-auto">
        {status === 'checking' && (
          <div className="text-center py-8">
            <div className="w-12 h-12 mx-auto mb-4 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-cyan-400">Checking for LM Studio...</p>
          </div>
        )}

        {status === 'not-installed' && (
          <div className="space-y-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-yellow-500/20 flex items-center justify-center flex-shrink-0">
                <span className="text-2xl">🧠</span>
              </div>
              <div>
                <h3 className="text-white font-semibold text-lg">Install LM Studio</h3>
                <p className="text-cyan-400/60 text-sm mt-1">
                  LM Studio is a free app that runs AI models on your computer.
                  No cloud, no subscriptions, complete privacy.
                </p>
              </div>
            </div>

            <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-xl p-4">
              <h4 className="text-cyan-400 font-semibold mb-3">Quick Setup (2 minutes):</h4>
              <ol className="space-y-3 text-sm">
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-cyan-500 text-black font-bold flex items-center justify-center flex-shrink-0">1</span>
                  <span className="text-white/80">Click the button below to download LM Studio</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-cyan-500/50 text-white font-bold flex items-center justify-center flex-shrink-0">2</span>
                  <span className="text-white/80">Install it (just click Next a few times)</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-cyan-500/50 text-white font-bold flex items-center justify-center flex-shrink-0">3</span>
                  <span className="text-white/80">Open LM Studio and click <strong className="text-cyan-400">"Local Server"</strong> on the left</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-cyan-500/50 text-white font-bold flex items-center justify-center flex-shrink-0">4</span>
                  <span className="text-white/80">Click <strong className="text-cyan-400">"Start Server"</strong></span>
                </li>
              </ol>
            </div>

            <button
              onClick={openLMStudioDownload}
              className="w-full py-4 bg-cyan-500 hover:bg-cyan-400 text-black font-bold rounded-xl transition-all hover:scale-[1.02] flex items-center justify-center gap-2"
            >
              <span>Download LM Studio</span>
              <span className="text-xl">↗</span>
            </button>

            <div className="text-center">
              <p className="text-cyan-500/40 text-sm">
                Waiting for LM Studio... {checkCount > 0 && `(checked ${checkCount} times)`}
              </p>
              <div className="mt-2 flex justify-center gap-1">
                {[0, 1, 2].map(i => (
                  <div
                    key={i}
                    className="w-2 h-2 rounded-full bg-cyan-500/50 animate-pulse"
                    style={{ animationDelay: `${i * 200}ms` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {status === 'installed-no-model' && (
          <div className="space-y-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                <span className="text-2xl">✓</span>
              </div>
              <div>
                <h3 className="text-white font-semibold text-lg">LM Studio Running!</h3>
                <p className="text-cyan-400/60 text-sm mt-1">
                  Now we need to download an AI model.
                </p>
              </div>
            </div>

            <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-xl p-4">
              <h4 className="text-cyan-400 font-semibold mb-3">Download a Model:</h4>
              <ol className="space-y-3 text-sm">
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-cyan-500 text-black font-bold flex items-center justify-center flex-shrink-0">1</span>
                  <span className="text-white/80">In LM Studio, click <strong className="text-cyan-400">"Discover"</strong> on the left</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-cyan-500/50 text-white font-bold flex items-center justify-center flex-shrink-0">2</span>
                  <div className="text-white/80">
                    Search for: <code className="bg-black/50 px-2 py-1 rounded text-cyan-400">llama 3.2 3b</code>
                    <p className="text-cyan-500/50 text-xs mt-1">This is a good balance of smart + fast (2GB download)</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-cyan-500/50 text-white font-bold flex items-center justify-center flex-shrink-0">3</span>
                  <span className="text-white/80">Click <strong className="text-cyan-400">"Download"</strong> on the Q4_K_M version</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-cyan-500/50 text-white font-bold flex items-center justify-center flex-shrink-0">4</span>
                  <span className="text-white/80">Once downloaded, go to <strong className="text-cyan-400">"Local Server"</strong> and select the model, then <strong className="text-cyan-400">"Start Server"</strong></span>
                </li>
              </ol>
            </div>

            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
              <p className="text-yellow-400/80 text-sm flex items-center gap-2">
                <span>💡</span>
                <span>Bigger model = smarter but slower. Start with 3B, upgrade later if needed.</span>
              </p>
            </div>

            <div className="text-center">
              <p className="text-cyan-500/40 text-sm">
                Waiting for model to load...
              </p>
            </div>
          </div>
        )}

        {status === 'ready' && (
          <div className="text-center py-4 space-y-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-green-500/20 flex items-center justify-center">
              <span className="text-4xl">🎉</span>
            </div>
            <div>
              <h3 className="text-white font-semibold text-lg">AI Brain Ready!</h3>
              <p className="text-cyan-400/60 text-sm mt-1">
                Model loaded: {modelInfo?.id || 'Unknown'}
              </p>
            </div>
            <button
              onClick={onNext}
              className="px-8 py-3 bg-green-500 hover:bg-green-400 text-black font-bold rounded-xl transition-all hover:scale-105"
            >
              Continue
            </button>
          </div>
        )}
      </div>

      {/* Help Button */}
      {(status === 'not-installed' || status === 'installed-no-model') && (
        <div className="text-center">
          <button
            onClick={() => setShowHelp(true)}
            className="text-cyan-500/60 hover:text-cyan-400 text-sm underline"
          >
            I'm stuck, help me
          </button>
        </div>
      )}

      {/* Help Modal */}
      {showHelp && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-cyan-500/30 rounded-2xl p-6 max-w-md">
            <h3 className="text-xl font-bold text-white mb-4">Troubleshooting</h3>
            <div className="space-y-4 text-sm text-cyan-400/80">
              <div>
                <strong className="text-white">LM Studio won't start?</strong>
                <p>Make sure you have enough disk space (at least 5GB free) and try running as administrator.</p>
              </div>
              <div>
                <strong className="text-white">Server won't start?</strong>
                <p>Check that port 1234 isn't being used by another app. You can change the port in LM Studio settings.</p>
              </div>
              <div>
                <strong className="text-white">Model download stuck?</strong>
                <p>Try a smaller model first like "phi-3-mini" (1.5GB). You can always download bigger models later.</p>
              </div>
              <div>
                <strong className="text-white">Still stuck?</strong>
                <p>
                  Join our Discord for help:{' '}
                  <a href="https://discord.gg/jarvis" className="text-cyan-400 underline">discord.gg/jarvis</a>
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowHelp(false)}
              className="mt-6 w-full py-2 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 rounded-lg"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Back Button */}
      {onBack && (
        <div className="text-center">
          <button onClick={onBack} className="text-cyan-500/50 hover:text-cyan-400 text-sm">
            ← Back
          </button>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// STEP 3: MICROPHONE TEST
// ============================================================================

const MicTestStep: React.FC<WizardStepProps> = ({ onNext, onBack }) => {
  const [status, setStatus] = useState<'requesting' | 'denied' | 'analyzing' | 'ready'>('requesting');
  const [analysis, setAnalysis] = useState<MicrophoneAnalysis | null>(null);
  const [listening, setListening] = useState(false);
  const [wakeWordDetected, setWakeWordDetected] = useState(false);
  const [transcript, setTranscript] = useState('');

  useEffect(() => {
    const setup = async () => {
      try {
        // Request mic permission
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(t => t.stop());
        
        setStatus('analyzing');
        
        // Run quality analysis
        const result = await microphoneAnalyzer.analyze(2000);
        setAnalysis(result);
        setStatus('ready');
        
      } catch (e) {
        setStatus('denied');
      }
    };
    
    setup();
  }, []);

  // Wake word test
  useEffect(() => {
    if (status !== 'ready' || wakeWordDetected) return;
    
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    
    recognition.onresult = (event: any) => {
      const current = event.results[event.results.length - 1];
      const text = current[0].transcript.toLowerCase();
      setTranscript(text);
      
      if (text.includes('jarvis') || text.includes('jarvas') || text.includes('jarves')) {
        setWakeWordDetected(true);
        recognition.stop();
      }
    };
    
    recognition.start();
    setListening(true);
    
    return () => {
      try { recognition.stop(); } catch {}
    };
  }, [status, wakeWordDetected]);

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-3xl font-bold text-white mb-2">Microphone Check</h2>
        <p className="text-cyan-400/70">
          Let's make sure I can hear you.
        </p>
      </div>

      <div className="bg-black/40 border border-cyan-500/30 rounded-2xl p-6 max-w-lg mx-auto">
        {status === 'requesting' && (
          <div className="text-center py-8">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-cyan-500/20 flex items-center justify-center">
              <span className="text-3xl">🎤</span>
            </div>
            <p className="text-white">Allow microphone access when prompted...</p>
          </div>
        )}

        {status === 'denied' && (
          <div className="text-center py-8 space-y-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-red-500/20 flex items-center justify-center">
              <span className="text-3xl">❌</span>
            </div>
            <div>
              <h3 className="text-red-400 font-semibold">Microphone Access Denied</h3>
              <p className="text-cyan-400/60 text-sm mt-2">
                JARVIS needs microphone access for voice commands.
                <br />
                Click the lock icon in your browser's address bar to enable it.
              </p>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 rounded-lg"
            >
              Try Again
            </button>
          </div>
        )}

        {status === 'analyzing' && (
          <div className="text-center py-8">
            <div className="w-12 h-12 mx-auto mb-4 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-cyan-400">Analyzing microphone quality...</p>
          </div>
        )}

        {status === 'ready' && (
          <div className="space-y-6">
            {/* Quality Result */}
            {analysis && (
              <div className="flex items-center gap-4 p-4 bg-black/30 rounded-xl">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                  analysis.quality === 'excellent' ? 'bg-green-500/20' :
                  analysis.quality === 'good' ? 'bg-cyan-500/20' :
                  analysis.quality === 'fair' ? 'bg-yellow-500/20' : 'bg-red-500/20'
                }`}>
                  <span className="text-2xl">
                    {analysis.quality === 'excellent' ? '🌟' :
                     analysis.quality === 'good' ? '✓' :
                     analysis.quality === 'fair' ? '⚠️' : '❌'}
                  </span>
                </div>
                <div>
                  <p className="text-white font-semibold capitalize">
                    {analysis.quality} Quality
                  </p>
                  <p className="text-cyan-400/60 text-sm">
                    {analysis.quality === 'excellent' || analysis.quality === 'good'
                      ? "Your microphone should work great!"
                      : "You might want to use a better microphone for best results."}
                  </p>
                </div>
              </div>
            )}

            {/* Wake Word Test */}
            <div className="text-center space-y-4">
              <p className="text-white">
                {wakeWordDetected 
                  ? '🎉 I heard you!' 
                  : 'Now say "Jarvis" to test the wake word...'}
              </p>
              
              {listening && !wakeWordDetected && (
                <div className="flex justify-center gap-1">
                  {[0, 1, 2, 3, 4].map(i => (
                    <div
                      key={i}
                      className="w-1 bg-cyan-500 rounded-full animate-pulse"
                      style={{
                        height: `${20 + Math.random() * 20}px`,
                        animationDelay: `${i * 100}ms`,
                      }}
                    />
                  ))}
                </div>
              )}

              {transcript && !wakeWordDetected && (
                <p className="text-cyan-500/50 text-sm">Heard: "{transcript}"</p>
              )}

              {wakeWordDetected && (
                <button
                  onClick={onNext}
                  className="px-8 py-3 bg-green-500 hover:bg-green-400 text-black font-bold rounded-xl transition-all hover:scale-105"
                >
                  Continue
                </button>
              )}
            </div>

            {/* Skip option */}
            {!wakeWordDetected && (
              <div className="text-center">
                <button
                  onClick={onNext}
                  className="text-cyan-500/50 hover:text-cyan-400 text-sm"
                >
                  Skip test →
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {onBack && (
        <div className="text-center">
          <button onClick={onBack} className="text-cyan-500/50 hover:text-cyan-400 text-sm">
            ← Back
          </button>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// STEP 4: SMART HOME (OPTIONAL)
// ============================================================================

const SmartHomeStep: React.FC<WizardStepProps> = ({ onNext, onBack }) => {
  const [haUrl, setHaUrl] = useState('');
  const [haToken, setHaToken] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  const [deviceCount, setDeviceCount] = useState(0);

  const testConnection = async () => {
    if (!haUrl || !haToken) return;
    
    setTesting(true);
    setTestResult(null);
    
    try {
      const url = haUrl.endsWith('/') ? haUrl.slice(0, -1) : haUrl;
      const response = await fetch(`${url}/api/states`, {
        headers: {
          'Authorization': `Bearer ${haToken}`,
        },
        signal: AbortSignal.timeout(5000),
      });
      
      if (response.ok) {
        const states = await response.json();
        setDeviceCount(states.length);
        setTestResult('success');
        
        // Save to localStorage for JarvisCore to use
        localStorage.setItem('ha_url', url);
        localStorage.setItem('ha_token', haToken);
      } else {
        setTestResult('error');
      }
    } catch {
      setTestResult('error');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-3xl font-bold text-white mb-2">Smart Home</h2>
        <p className="text-cyan-400/70">
          Connect Home Assistant to control your smart devices.
        </p>
      </div>

      <div className="bg-black/40 border border-cyan-500/30 rounded-2xl p-6 max-w-lg mx-auto space-y-6">
        <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-xl p-4">
          <h4 className="text-cyan-400 font-semibold mb-2">What is Home Assistant?</h4>
          <p className="text-sm text-cyan-400/70">
            Home Assistant is free software that connects all your smart devices (Philips Hue, smart plugs, thermostats, etc.) in one place.
            If you don't have it, you can skip this step and set it up later.
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-cyan-400 mb-2">Home Assistant URL</label>
            <input
              type="text"
              value={haUrl}
              onChange={(e) => setHaUrl(e.target.value)}
              placeholder="http://homeassistant.local:8123"
              className="w-full px-4 py-3 bg-black/50 border border-cyan-500/30 rounded-lg text-white placeholder:text-cyan-500/30 focus:border-cyan-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm text-cyan-400 mb-2">
              Long-Lived Access Token
              <button
                onClick={() => window.open('https://www.home-assistant.io/docs/authentication/#your-account-profile', '_blank')}
                className="ml-2 text-cyan-500/50 hover:text-cyan-400 text-xs"
              >
                (How to get this?)
              </button>
            </label>
            <input
              type="password"
              value={haToken}
              onChange={(e) => setHaToken(e.target.value)}
              placeholder="eyJ0eXAiOiJKV1QiLCJhbGci..."
              className="w-full px-4 py-3 bg-black/50 border border-cyan-500/30 rounded-lg text-white placeholder:text-cyan-500/30 focus:border-cyan-500 focus:outline-none font-mono text-sm"
            />
          </div>

          <button
            onClick={testConnection}
            disabled={!haUrl || !haToken || testing}
            className={`w-full py-3 rounded-lg font-semibold transition-all ${
              !haUrl || !haToken || testing
                ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                : 'bg-cyan-500 hover:bg-cyan-400 text-black'
            }`}
          >
            {testing ? 'Testing...' : 'Test Connection'}
          </button>

          {testResult === 'success' && (
            <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg text-center">
              <p className="text-green-400 font-semibold">✓ Connected!</p>
              <p className="text-green-400/70 text-sm">Found {deviceCount} entities</p>
            </div>
          )}

          {testResult === 'error' && (
            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-center">
              <p className="text-red-400 font-semibold">Connection failed</p>
              <p className="text-red-400/70 text-sm">Check your URL and token</p>
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={onNext}
            className="flex-1 py-3 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 rounded-lg"
          >
            {testResult === 'success' ? 'Continue' : 'Skip for Now'}
          </button>
        </div>
      </div>

      {onBack && (
        <div className="text-center">
          <button onClick={onBack} className="text-cyan-500/50 hover:text-cyan-400 text-sm">
            ← Back
          </button>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// STEP 5: READY
// ============================================================================

const ReadyStep: React.FC<WizardStepProps> = ({ onNext }) => (
  <div className="text-center space-y-8">
    <div className="w-32 h-32 mx-auto relative">
      <div className="absolute inset-0 rounded-full bg-green-500/20 animate-pulse" />
      <div className="absolute inset-4 rounded-full bg-green-500/40 flex items-center justify-center">
        <span className="text-6xl">✓</span>
      </div>
    </div>

    <div>
      <h1 className="text-4xl font-bold text-white mb-4">
        All Systems Online
      </h1>
      <p className="text-cyan-400/80 text-lg max-w-md mx-auto">
        I'm ready to assist you, Sir.
        <br />
        Just say <span className="text-cyan-400 font-semibold">"Jarvis"</span> followed by your command.
      </p>
    </div>

    <div className="bg-black/40 border border-cyan-500/30 rounded-2xl p-6 max-w-md mx-auto">
      <h3 className="text-white font-semibold mb-4">Try saying:</h3>
      <ul className="space-y-2 text-cyan-400/80 text-left">
        <li>"Jarvis, what time is it?"</li>
        <li>"Jarvis, set a timer for 5 minutes"</li>
        <li>"Jarvis, what's the weather like?"</li>
        <li>"Jarvis, turn on the lights" (if connected to Home Assistant)</li>
      </ul>
    </div>

    <button
      onClick={onNext}
      className="px-12 py-4 bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-lg rounded-xl transition-all hover:scale-105"
    >
      Start Using JARVIS
    </button>
  </div>
);

// ============================================================================
// MAIN WIZARD
// ============================================================================

interface FirstLaunchWizardProps {
  onComplete: () => void;
}

export const FirstLaunchWizard: React.FC<FirstLaunchWizardProps> = ({ onComplete }) => {
  const [currentStep, setCurrentStep] = useState(0);

  const steps = [
    { id: 'welcome', title: 'Welcome', component: WelcomeStep },
    { id: 'lmstudio', title: 'AI Setup', component: LMStudioStep },
    { id: 'mic', title: 'Microphone', component: MicTestStep },
    { id: 'smarthome', title: 'Smart Home', component: SmartHomeStep },
    { id: 'ready', title: 'Ready', component: ReadyStep },
  ];

  const handleNext = useCallback(() => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      localStorage.setItem('jarvis_setup_complete', 'true');
      onComplete();
    }
  }, [currentStep, steps.length, onComplete]);

  const handleBack = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  }, [currentStep]);

  const CurrentStepComponent = steps[currentStep].component;

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center p-8 overflow-auto">
      {/* Background effects */}
      <div className="absolute inset-0 opacity-30 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl" />
      </div>

      {/* Progress indicator */}
      <div className="absolute top-8 left-1/2 -translate-x-1/2 flex gap-2">
        {steps.map((step, i) => (
          <div
            key={step.id}
            className={`w-3 h-3 rounded-full transition-colors ${
              i === currentStep
                ? 'bg-cyan-500'
                : i < currentStep
                  ? 'bg-cyan-500/50'
                  : 'bg-gray-600'
            }`}
            title={step.title}
          />
        ))}
      </div>

      {/* Content */}
      <div className="relative z-10 w-full max-w-2xl">
        <CurrentStepComponent
          onNext={handleNext}
          onBack={currentStep > 0 ? handleBack : undefined}
        />
      </div>

      {/* Version */}
      <div className="absolute bottom-4 right-4 text-cyan-500/30 text-sm font-mono">
        JARVIS v2.0
      </div>
    </div>
  );
};

/**
 * Check if this is the first launch
 */
export function isFirstLaunch(): boolean {
  return localStorage.getItem('jarvis_setup_complete') !== 'true';
}

/**
 * Reset the first launch flag (for testing)
 */
export function resetFirstLaunch(): void {
  localStorage.removeItem('jarvis_setup_complete');
}

// Type declarations for Electron bridge
declare global {
  interface Window {
    jarvisHost?: {
      piperAvailable?: () => Promise<{ available: boolean; voices?: any[] }>;
      installPiper?: () => Promise<{ success: boolean; error?: string }>;
      onPiperProgress?: (callback: (progress: { step: string; progress: number }) => void) => () => void;
    };
  }
}
