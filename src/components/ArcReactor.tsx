import React from 'react';

interface ArcReactorProps {
  volume: number;
  status: string;
  healthStatus?: 'healthy' | 'degraded' | 'offline' | 'recovering';
  wakeDetected?: boolean;  // Phase 11: Instant visual feedback when "Jarvis" is heard
}

export const ArcReactor: React.FC<ArcReactorProps> = ({ 
  volume, 
  status, 
  healthStatus = 'healthy',
  wakeDetected = false,
}) => {
  // --- STATE MAPPING ---
  let primaryColor = '#00f0ff'; // Cyan (Default)
  let secondaryColor = '#0891b2';
  let spinSpeed = '20s';
  let pulseClass = 'animate-pulse';
  let centerGlow = 0.5;
  let opacity = 1;
  let extraScale = 1;
  let showWakeFlash = false;

  // === PHASE 11: INSTANT WAKE DETECTION FEEDBACK ===
  // When "Jarvis" is detected, show IMMEDIATE obvious feedback
  // This is NOT subtle - user must KNOW they were heard
  if (wakeDetected) {
    primaryColor = '#ffffff';  // Pure white - maximum brightness
    secondaryColor = '#ffffff';
    centerGlow = 1.0;          // Full glow
    extraScale = 1.15;         // Pop outward
    showWakeFlash = true;      // Show the flash ring
    pulseClass = '';           // No pulse - solid bright
  }

  // === PHASE 9: HEALTH STATUS OVERRIDE ===
  // If system is degraded/offline, show it visually
  else if (healthStatus === 'offline') {
    primaryColor = '#6b7280'; // Gray - dimmed
    secondaryColor = '#374151';
    spinSpeed = '60s'; // Very slow
    centerGlow = 0.2;
    opacity = 0.5;
    pulseClass = ''; // No pulse - it's dead
  } else if (healthStatus === 'recovering') {
    primaryColor = '#fbbf24'; // Amber - warning/recovery
    secondaryColor = '#d97706';
    spinSpeed = '1s'; // Fast pulse while recovering
    centerGlow = 0.6;
    pulseClass = 'animate-pulse';
  } else if (healthStatus === 'degraded') {
    primaryColor = '#f97316'; // Orange - degraded
    secondaryColor = '#ea580c';
    spinSpeed = '15s';
    centerGlow = 0.4;
  }
  // If healthy, continue with normal status-based colors
  else if (healthStatus === 'healthy') {
    if (status === 'LISTENING') {
      primaryColor = '#ffffff'; // White hot
      secondaryColor = '#cffafe';
      spinSpeed = '10s';
      centerGlow = 0.8;
    } else if (status === 'PROCESSING') {
      primaryColor = '#818cf8'; // Indigo/Purple
      secondaryColor = '#4f46e5';
      spinSpeed = '2s';
      centerGlow = 0.6;
    } else if (status === 'SPEAKING') {
      primaryColor = '#22d3ee';
      spinSpeed = '15s';
      pulseClass = ''; // Manual pulsing via volume
    } else if (status.includes('ERR') || status.includes('FAILURE')) {
      primaryColor = '#ef4444'; // Red
      secondaryColor = '#991b1b';
      spinSpeed = '30s';
    }
  }

  // Calculate audio reactivity
  const scale = (1 + (volume / 200)) * extraScale; // 1.0 to 1.5, plus wake boost
  const ringScale = 1 + (volume / 300);

  return (
    <div className="relative flex items-center justify-center w-80 h-80 md:w-[450px] md:h-[450px]">
      
      {/* PHASE 11: WAKE DETECTION FLASH RING */}
      {/* This is the "I heard you" indicator - BIG and OBVIOUS */}
      {showWakeFlash && (
        <div 
          className="absolute inset-[-20%] rounded-full animate-ping"
          style={{
            background: `radial-gradient(circle, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0) 70%)`,
            animationDuration: '0.5s',
            animationIterationCount: '1',
          }}
        />
      )}
      
      {/* 1. AUDIO WAVEFORM RING (Outermost) */}
      <div 
        className="absolute inset-0 rounded-full border border-dashed transition-all duration-75"
        style={{ 
            borderColor: primaryColor,
            transform: `scale(${scale})`,
            borderWidth: '1px',
            opacity: showWakeFlash ? 0.8 : 0.3,
        }}
      />
      
      {/* 2. MAIN SVG ASSEMBLY */}
      <svg viewBox="0 0 200 200" className="w-full h-full drop-shadow-[0_0_20px_rgba(0,240,255,0.3)]">
        
        {/* Definition for Glow Filter */}
        <defs>
            <filter id="reactor-glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="4" result="coloredBlur" />
                <feMerge>
                    <feMergeNode in="coloredBlur" />
                    <feMergeNode in="SourceGraphic" />
                </feMerge>
            </filter>
        </defs>

        {/* Outer Tech Ring - Static */}
        <circle cx="100" cy="100" r="98" fill="none" stroke={secondaryColor} strokeWidth="0.5" strokeOpacity="0.3" />

        {/* Outer Rotating Gear (Counter-Clockwise) */}
        <g style={{ transformOrigin: '100px 100px', animation: `spin ${spinSpeed} linear infinite reverse` }}>
            <circle cx="100" cy="100" r="85" fill="none" stroke={primaryColor} strokeWidth="1" strokeDasharray="4 6" strokeOpacity="0.6" />
            <path d="M100 15 L100 5 M100 195 L100 185 M15 100 L5 100 M195 100 L185 100" stroke={primaryColor} strokeWidth="2" />
        </g>

        {/* Middle Segmented Ring (Clockwise) */}
        <g style={{ transformOrigin: '100px 100px', animation: `spin ${parseFloat(spinSpeed)*0.7}s linear infinite` }}>
            <circle cx="100" cy="100" r="70" fill="none" stroke={primaryColor} strokeWidth="4" strokeDasharray="40 10 40 10" strokeOpacity="0.4" />
            <circle cx="100" cy="100" r="65" fill="none" stroke={secondaryColor} strokeWidth="1" strokeOpacity="0.5" />
        </g>

        {/* Inner Reactor Core Structure (Triangle) */}
        <g style={{ transformOrigin: '100px 100px' }}>
            <polygon 
                points="100,40 152,130 48,130" 
                fill="none" 
                stroke={primaryColor} 
                strokeWidth="2" 
                strokeOpacity="0.8"
                filter="url(#reactor-glow)"
                style={{ transform: `scale(${ringScale})`, transformOrigin: '100px 100px', transition: 'transform 0.1s' }}
            />
        </g>

        {/* The Eye (Center) */}
        <circle 
            cx="100" 
            cy="100" 
            r={15 + (volume / 5)} 
            fill={primaryColor} 
            fillOpacity={centerGlow + (volume/200)}
            filter="url(#reactor-glow)"
            className="transition-all duration-75"
        />
        
        {/* Arc Details around Eye */}
        <path d="M85 100 A 15 15 0 0 1 115 100" fill="none" stroke="white" strokeWidth="1" strokeOpacity="0.5" />

      </svg>

      {/* 3. STATUS TEXT OVERLAY */}
      <div className="absolute -bottom-8 w-full text-center">
          <div className="flex justify-center gap-1 mb-2 h-1">
              {/* Audio Bars */}
              {[...Array(20)].map((_, i) => (
                  <div 
                    key={i} 
                    className="w-1 bg-cyan-400 transition-all duration-75"
                    style={{ 
                        height: i < volume / 5 ? '8px' : '2px', 
                        opacity: i < volume / 5 ? 1 : 0.2,
                        backgroundColor: primaryColor
                    }}
                  ></div>
              ))}
          </div>
          <div 
            className="font-mono text-[10px] tracking-[0.6em] uppercase text-glow transition-colors duration-300"
            style={{ color: primaryColor }}
          >
              {status}
          </div>
      </div>
    </div>
  );
};