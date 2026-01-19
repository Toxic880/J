/**
 * MICROPHONE QUALITY PANEL
 * 
 * Phase 11: The Microphone Problem
 * 
 * Shows microphone analysis results and recommendations.
 * Can be embedded in FirstLaunchWizard or Settings.
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  MicrophoneAnalyzer, 
  MicrophoneAnalysis, 
  RECOMMENDED_MICROPHONES,
  AudioProcessingConfig,
  microphoneAnalyzer
} from '../services/MicrophoneAnalyzer';

interface MicrophoneQualityPanelProps {
  onAnalysisComplete?: (analysis: MicrophoneAnalysis) => void;
  showRecommendations?: boolean;
  compact?: boolean;
}

export const MicrophoneQualityPanel: React.FC<MicrophoneQualityPanelProps> = ({
  onAnalysisComplete,
  showRecommendations = true,
  compact = false,
}) => {
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<MicrophoneAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentLevel, setCurrentLevel] = useState(0);
  
  // Real-time level monitoring
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number | null>(null);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);
  
  const cleanup = () => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    analyserRef.current = null;
  };
  
  const startAnalysis = async () => {
    setAnalyzing(true);
    setError(null);
    
    try {
      // Start real-time level monitoring
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      
      audioContextRef.current = new AudioContext();
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      
      const source = audioContextRef.current.createMediaStreamSource(streamRef.current);
      source.connect(analyserRef.current);
      
      // Start level monitoring
      const updateLevel = () => {
        if (analyserRef.current) {
          const level = microphoneAnalyzer.getCurrentLevel(analyserRef.current);
          setCurrentLevel(level);
        }
        animationRef.current = requestAnimationFrame(updateLevel);
      };
      updateLevel();
      
      // Run the actual analysis (3 seconds)
      const result = await microphoneAnalyzer.analyze(3000);
      setAnalysis(result);
      
      if (onAnalysisComplete) {
        onAnalysisComplete(result);
      }
      
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Analysis failed';
      setError(message);
    } finally {
      setAnalyzing(false);
      cleanup();
    }
  };
  
  const getQualityColor = (quality: MicrophoneAnalysis['quality']) => {
    switch (quality) {
      case 'excellent': return 'text-green-400';
      case 'good': return 'text-cyan-400';
      case 'fair': return 'text-yellow-400';
      case 'poor': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };
  
  const getQualityBg = (quality: MicrophoneAnalysis['quality']) => {
    switch (quality) {
      case 'excellent': return 'bg-green-500/20 border-green-500/30';
      case 'good': return 'bg-cyan-500/20 border-cyan-500/30';
      case 'fair': return 'bg-yellow-500/20 border-yellow-500/30';
      case 'poor': return 'bg-red-500/20 border-red-500/30';
      default: return 'bg-gray-500/20 border-gray-500/30';
    }
  };
  
  if (compact && !analysis) {
    return (
      <button
        onClick={startAnalysis}
        disabled={analyzing}
        className="flex items-center gap-2 px-4 py-2 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 rounded-lg transition-colors"
      >
        {analyzing ? (
          <>
            <div className="w-4 h-4 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-cyan-400">Analyzing...</span>
          </>
        ) : (
          <>
            <span className="text-lg">🎤</span>
            <span className="text-cyan-400">Test Microphone Quality</span>
          </>
        )}
      </button>
    );
  }
  
  return (
    <div className="space-y-6">
      {/* Analysis Button / Status */}
      {!analysis && (
        <div className="text-center space-y-4">
          {/* Level Meter (during analysis) */}
          {analyzing && (
            <div className="space-y-2">
              <div className="flex items-center justify-center gap-4">
                <div className="w-48 h-4 bg-black/30 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-green-500 via-yellow-500 to-red-500 transition-all duration-75"
                    style={{ width: `${currentLevel}%` }}
                  />
                </div>
                <span className="text-white font-mono text-sm w-12">
                  {Math.round(currentLevel)}%
                </span>
              </div>
              <p className="text-cyan-400/70 text-sm">
                Stay quiet while I measure background noise...
              </p>
            </div>
          )}
          
          <button
            onClick={startAnalysis}
            disabled={analyzing}
            className={`px-8 py-4 rounded-lg font-semibold transition-all ${
              analyzing 
                ? 'bg-gray-600 text-gray-300 cursor-not-allowed'
                : 'bg-cyan-500 hover:bg-cyan-400 text-black'
            }`}
          >
            {analyzing ? (
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                <span>Analyzing Microphone...</span>
              </div>
            ) : (
              <span>🎤 Analyze Microphone Quality</span>
            )}
          </button>
          
          {error && (
            <p className="text-red-400">{error}</p>
          )}
        </div>
      )}
      
      {/* Analysis Results */}
      {analysis && (
        <div className="space-y-6">
          {/* Quality Badge */}
          <div className={`p-4 rounded-lg border ${getQualityBg(analysis.quality)}`}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className={`text-xl font-semibold ${getQualityColor(analysis.quality)}`}>
                  {analysis.quality.charAt(0).toUpperCase() + analysis.quality.slice(1)} Quality
                </h3>
                <p className="text-sm text-white/70">{analysis.deviceName}</p>
              </div>
              <div className="text-4xl">
                {analysis.quality === 'excellent' && '🌟'}
                {analysis.quality === 'good' && '✅'}
                {analysis.quality === 'fair' && '⚠️'}
                {analysis.quality === 'poor' && '🔇'}
              </div>
            </div>
            <p className="mt-3 text-white/80">{analysis.recommendation}</p>
          </div>
          
          {/* Metrics */}
          <div className="grid grid-cols-3 gap-4">
            <div className="p-3 bg-black/30 rounded-lg text-center">
              <div className="text-xs text-cyan-400/70 mb-1">Background Noise</div>
              <div className="text-xl font-mono text-white">{analysis.backgroundNoiseLevel} dB</div>
              <div className="text-xs text-cyan-400/50">
                {analysis.backgroundNoiseLevel < -45 ? 'Quiet' : 
                 analysis.backgroundNoiseLevel < -35 ? 'Moderate' : 'Noisy'}
              </div>
            </div>
            <div className="p-3 bg-black/30 rounded-lg text-center">
              <div className="text-xs text-cyan-400/70 mb-1">Signal/Noise Ratio</div>
              <div className="text-xl font-mono text-white">{analysis.signalToNoiseRatio} dB</div>
              <div className="text-xs text-cyan-400/50">
                {analysis.signalToNoiseRatio > 30 ? 'Excellent' : 
                 analysis.signalToNoiseRatio > 20 ? 'Good' : 
                 analysis.signalToNoiseRatio > 10 ? 'Fair' : 'Poor'}
              </div>
            </div>
            <div className="p-3 bg-black/30 rounded-lg text-center">
              <div className="text-xs text-cyan-400/70 mb-1">Peak Level</div>
              <div className="text-xl font-mono text-white">{analysis.peakLevel} dB</div>
              <div className="text-xs text-cyan-400/50">
                {analysis.peakLevel > -10 ? 'Strong' : 
                 analysis.peakLevel > -30 ? 'Normal' : 'Weak'}
              </div>
            </div>
          </div>
          
          {/* Issues */}
          {analysis.issues.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm text-cyan-400/70 font-medium">Issues Detected</h4>
              {analysis.issues.map((issue, i) => (
                <div 
                  key={i}
                  className={`p-3 rounded-lg border ${
                    issue.severity === 'high' ? 'bg-red-500/10 border-red-500/30' :
                    issue.severity === 'medium' ? 'bg-yellow-500/10 border-yellow-500/30' :
                    'bg-gray-500/10 border-gray-500/30'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-lg">
                      {issue.severity === 'high' ? '🔴' : 
                       issue.severity === 'medium' ? '🟡' : '⚪'}
                    </span>
                    <div>
                      <p className="text-white/90">{issue.description}</p>
                      {issue.fix && (
                        <p className="text-sm text-cyan-400/70 mt-1">💡 {issue.fix}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          
          {/* Re-test button */}
          <button
            onClick={() => {
              setAnalysis(null);
              startAnalysis();
            }}
            className="w-full py-2 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 rounded-lg transition-colors"
          >
            Test Again
          </button>
        </div>
      )}
      
      {/* Hardware Recommendations */}
      {showRecommendations && analysis && (analysis.quality === 'fair' || analysis.quality === 'poor') && (
        <div className="space-y-4 mt-8 pt-8 border-t border-cyan-500/20">
          <h3 className="text-lg font-semibold text-white">Recommended Microphones</h3>
          <p className="text-cyan-400/70 text-sm">
            For the best JARVIS experience, consider one of these:
          </p>
          
          <div className="space-y-3">
            {RECOMMENDED_MICROPHONES.slice(0, 3).map((mic, i) => (
              <a
                key={i}
                href={mic.amazonUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block p-4 bg-black/30 hover:bg-black/40 rounded-lg border border-cyan-500/20 hover:border-cyan-500/40 transition-colors"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="text-white font-medium">{mic.name}</h4>
                    <p className="text-xs text-cyan-400/60">{mic.type}</p>
                    <p className="text-sm text-white/70 mt-1">{mic.bestFor}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-green-400 font-semibold">{mic.price}</div>
                    <div className="text-xs text-yellow-400">★ {mic.rating}</div>
                  </div>
                </div>
                <div className="flex gap-2 mt-2">
                  {mic.pros.slice(0, 2).map((pro, j) => (
                    <span key={j} className="text-xs px-2 py-1 bg-green-500/10 text-green-400 rounded">
                      ✓ {pro}
                    </span>
                  ))}
                </div>
              </a>
            ))}
          </div>
          
          <p className="text-xs text-cyan-400/50 text-center">
            Links open in new tab. JARVIS is not affiliated with these products.
          </p>
        </div>
      )}
    </div>
  );
};

/**
 * Audio Settings Panel - for configuring noise gate, sensitivity, etc.
 */
interface AudioSettingsPanelProps {
  onConfigChange?: (config: AudioProcessingConfig) => void;
}

export const AudioSettingsPanel: React.FC<AudioSettingsPanelProps> = ({ onConfigChange }) => {
  const [config, setConfig] = useState<AudioProcessingConfig>(microphoneAnalyzer.getConfig());
  
  const updateConfig = (updates: Partial<AudioProcessingConfig>) => {
    const newConfig = { ...config, ...updates };
    setConfig(newConfig);
    microphoneAnalyzer.setConfig(newConfig);
    if (onConfigChange) {
      onConfigChange(newConfig);
    }
  };
  
  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-white">Audio Settings</h3>
      
      {/* Wake Word Sensitivity */}
      <div className="space-y-2">
        <label className="text-sm text-cyan-400/70">Wake Word Sensitivity</label>
        <div className="flex gap-2">
          {(['low', 'medium', 'high'] as const).map((level) => (
            <button
              key={level}
              onClick={() => updateConfig({ wakeWordSensitivity: level })}
              className={`flex-1 py-2 px-4 rounded-lg border transition-colors ${
                config.wakeWordSensitivity === level
                  ? 'bg-cyan-500/20 border-cyan-500 text-cyan-400'
                  : 'bg-black/30 border-cyan-500/20 text-white/70 hover:border-cyan-500/40'
              }`}
            >
              {level.charAt(0).toUpperCase() + level.slice(1)}
            </button>
          ))}
        </div>
        <p className="text-xs text-cyan-400/50">
          {config.wakeWordSensitivity === 'high' 
            ? 'More sensitive - may trigger accidentally'
            : config.wakeWordSensitivity === 'low'
            ? 'Less sensitive - requires clear pronunciation'
            : 'Balanced sensitivity'}
        </p>
      </div>
      
      {/* Noise Gate */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm text-cyan-400/70">Noise Gate</label>
          <button
            onClick={() => updateConfig({ noiseGateEnabled: !config.noiseGateEnabled })}
            className={`w-12 h-6 rounded-full transition-colors ${
              config.noiseGateEnabled ? 'bg-cyan-500' : 'bg-gray-600'
            }`}
          >
            <div className={`w-5 h-5 rounded-full bg-white shadow transform transition-transform ${
              config.noiseGateEnabled ? 'translate-x-6' : 'translate-x-0.5'
            }`} />
          </button>
        </div>
        
        {config.noiseGateEnabled && (
          <div className="space-y-2">
            <input
              type="range"
              min="-60"
              max="-20"
              value={config.noiseGateThreshold}
              onChange={(e) => updateConfig({ noiseGateThreshold: parseInt(e.target.value) })}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-cyan-400/50">
              <span>More sensitive</span>
              <span>{config.noiseGateThreshold} dB</span>
              <span>Less sensitive</span>
            </div>
          </div>
        )}
        <p className="text-xs text-cyan-400/50">
          Ignores audio below the threshold to reduce background noise
        </p>
      </div>
      
      {/* WebRTC Processing */}
      <div className="space-y-3">
        <label className="text-sm text-cyan-400/70">Audio Processing</label>
        
        <div className="space-y-2">
          {[
            { key: 'echoCancellation', label: 'Echo Cancellation', desc: 'Prevents JARVIS from hearing itself' },
            { key: 'noiseSuppression', label: 'Noise Suppression', desc: 'Reduces background noise (WebRTC)' },
            { key: 'autoGainControl', label: 'Auto Gain Control', desc: 'Automatically adjusts volume levels' },
          ].map(({ key, label, desc }) => (
            <div key={key} className="flex items-center justify-between p-3 bg-black/20 rounded-lg">
              <div>
                <div className="text-white text-sm">{label}</div>
                <div className="text-xs text-cyan-400/50">{desc}</div>
              </div>
              <button
                onClick={() => updateConfig({ [key]: !config[key as keyof AudioProcessingConfig] })}
                className={`w-10 h-5 rounded-full transition-colors ${
                  config[key as keyof AudioProcessingConfig] ? 'bg-cyan-500' : 'bg-gray-600'
                }`}
              >
                <div className={`w-4 h-4 rounded-full bg-white shadow transform transition-transform ${
                  config[key as keyof AudioProcessingConfig] ? 'translate-x-5' : 'translate-x-0.5'
                }`} />
              </button>
            </div>
          ))}
        </div>
      </div>
      
      {/* Reset to defaults */}
      <button
        onClick={() => {
          const defaults: AudioProcessingConfig = {
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
          setConfig(defaults);
          microphoneAnalyzer.setConfig(defaults);
        }}
        className="w-full py-2 text-sm border border-cyan-500/30 text-cyan-400/70 hover:text-cyan-400 hover:bg-cyan-500/10 rounded-lg transition-colors"
      >
        Reset to Defaults
      </button>
    </div>
  );
};
