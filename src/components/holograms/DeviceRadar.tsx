/**
 * DEVICE RADAR HOLOGRAM - NETWORK SCANNER DISPLAY
 * 
 * A visual "radar sweep" that discovers smart devices on your network.
 * Uses SSDP/UPnP to find Hue lights, Sonos speakers, Chromecast, etc.
 * 
 * === PHASE 5: THE HANDSHAKE ===
 * Now handles device pairing:
 * - Detects devices that require authorization
 * - Guides user through Hue Bridge pairing (button press)
 * - Stores credentials for future sessions
 * 
 * Projects when you say "Scan for devices" or "Find smart home hardware"
 */

import React, { useEffect, useState, useCallback } from 'react';

interface DiscoveredDevice {
  ip: string;
  port?: number;
  type: string;
  category?: string;
  name: string;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  location?: string;
  paired?: boolean;
  requiresPairing?: boolean;
  discoveredAt?: number;
}

interface PairingStatus {
  status: 'idle' | 'awaiting_action' | 'polling' | 'success' | 'failed';
  message?: string;
  actionRequired?: string;
}

interface DeviceRadarProps {
  onDeviceSelect?: (device: DiscoveredDevice) => void;
  onClose?: () => void;
}

// Device type to color/icon mapping
const deviceStyles: Record<string, { color: string; icon: string; glow: string }> = {
  hue_bridge: { color: 'bg-yellow-400', icon: '💡', glow: 'shadow-[0_0_15px_#facc15]' },
  light: { color: 'bg-yellow-400', icon: '💡', glow: 'shadow-[0_0_15px_#facc15]' },
  sonos_speaker: { color: 'bg-purple-400', icon: '🔊', glow: 'shadow-[0_0_15px_#c084fc]' },
  speaker: { color: 'bg-purple-400', icon: '🔊', glow: 'shadow-[0_0_15px_#c084fc]' },
  echo: { color: 'bg-blue-500', icon: '🔵', glow: 'shadow-[0_0_15px_#3b82f6]' },
  chromecast: { color: 'bg-red-400', icon: '📺', glow: 'shadow-[0_0_15px_#f87171]' },
  media: { color: 'bg-red-400', icon: '📺', glow: 'shadow-[0_0_15px_#f87171]' },
  roku: { color: 'bg-purple-600', icon: '📺', glow: 'shadow-[0_0_15px_#9333ea]' },
  home_assistant: { color: 'bg-green-400', icon: '🏠', glow: 'shadow-[0_0_15px_#4ade80]' },
  hub: { color: 'bg-green-400', icon: '🏠', glow: 'shadow-[0_0_15px_#4ade80]' },
  wemo_switch: { color: 'bg-orange-400', icon: '🔌', glow: 'shadow-[0_0_15px_#fb923c]' },
  switch: { color: 'bg-orange-400', icon: '🔌', glow: 'shadow-[0_0_15px_#fb923c]' },
  network: { color: 'bg-blue-400', icon: '🌐', glow: 'shadow-[0_0_15px_#60a5fa]' },
  unknown: { color: 'bg-cyan-400', icon: '❓', glow: 'shadow-[0_0_15px_#22d3ee]' },
};

export const DeviceRadar: React.FC<DeviceRadarProps> = ({ onDeviceSelect, onClose }) => {
  const [scanning, setScanning] = useState(true);
  const [devices, setDevices] = useState<DiscoveredDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<DiscoveredDevice | null>(null);
  const [scanProgress, setScanProgress] = useState(0);
  const [pairingStatus, setPairingStatus] = useState<PairingStatus>({ status: 'idle' });

  // Run network scan
  const runScan = useCallback(async () => {
    setScanning(true);
    setScanProgress(0);
    setDevices([]);
    setSelectedDevice(null);
    setPairingStatus({ status: 'idle' });

    // Progress animation
    const progressInterval = setInterval(() => {
      setScanProgress(prev => Math.min(prev + 1.5, 95));
    }, 100);

    try {
      // Check if running in Electron with jarvisHost
      if (window.jarvisHost?.scanNetwork) {
        console.log('[Radar] Starting SSDP network scan with XML enrichment...');
        const results = await window.jarvisHost.scanNetwork();
        
        // Check pairing status for each device that requires it
        const enrichedResults = await Promise.all(results.map(async (device: DiscoveredDevice) => {
          if (device.type === 'hue_bridge' && window.jarvisHost?.hueCheckPaired) {
            const pairStatus = await window.jarvisHost.hueCheckPaired(device.ip);
            return { ...device, paired: pairStatus.paired, requiresPairing: true };
          }
          return device;
        }));
        
        setDevices(enrichedResults);
        console.log(`[Radar] Found ${results.length} devices`);
      } else {
        // Browser fallback: simulate discovery with mock data
        console.log('[Radar] Running in browser mode - using mock data');
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        setDevices([
          { ip: '192.168.1.5', type: 'hue_bridge', category: 'light', name: 'Philips Hue Bridge', manufacturer: 'Philips', requiresPairing: true, paired: false },
          { ip: '192.168.1.12', type: 'sonos_speaker', category: 'speaker', name: 'Living Room', manufacturer: 'Sonos', paired: true },
          { ip: '192.168.1.20', type: 'chromecast', category: 'media', name: 'Living Room TV', manufacturer: 'Google', paired: true },
          { ip: '192.168.1.25', type: 'home_assistant', category: 'hub', name: 'Home Assistant', manufacturer: 'Home Assistant', requiresPairing: true, paired: false },
          { ip: '192.168.1.30', type: 'echo', category: 'speaker', name: 'Kitchen Echo', manufacturer: 'Amazon', paired: true },
          { ip: '192.168.1.35', type: 'wemo_switch', category: 'switch', name: 'Desk Lamp', manufacturer: 'Belkin', paired: true },
        ]);
      }
    } catch (error) {
      console.error('[Radar] Scan failed:', error);
    } finally {
      clearInterval(progressInterval);
      setScanProgress(100);
      setScanning(false);
    }
  }, []);

  // Start scan on mount
  useEffect(() => {
    runScan();
  }, [runScan]);

  // Calculate device positions on radar
  const getDevicePosition = (index: number, total: number) => {
    const angle = (index / total) * 2 * Math.PI - Math.PI / 2;
    const radiusVariation = 80 + (index % 3) * 40;
    const x = Math.cos(angle) * radiusVariation;
    const y = Math.sin(angle) * radiusVariation;
    return { x, y };
  };

  const handleDeviceClick = (device: DiscoveredDevice) => {
    setSelectedDevice(device);
    setPairingStatus({ status: 'idle' });
    onDeviceSelect?.(device);
  };

  // Start Hue pairing process
  const startHuePairing = async (device: DiscoveredDevice) => {
    if (!window.jarvisHost?.hueStartPairing) {
      setPairingStatus({ status: 'failed', message: 'Pairing only available in desktop mode' });
      return;
    }

    setPairingStatus({ 
      status: 'awaiting_action', 
      message: 'Press the link button on your Hue Bridge...', 
      actionRequired: 'PRESS_HUE_LINK_BUTTON' 
    });

    await window.jarvisHost.hueStartPairing(device.ip);
    
    // Start polling for button press
    pollHuePairing(device.ip);
  };

  // Poll for Hue pairing completion
  const pollHuePairing = async (ip: string) => {
    setPairingStatus(prev => ({ ...prev, status: 'polling' }));
    
    for (let attempt = 0; attempt < 15; attempt++) {
      if (!window.jarvisHost?.hueCompletePairing) break;
      
      const result = await window.jarvisHost.hueCompletePairing(ip);
      console.log('[Radar] Pairing poll result:', result);
      
      if (result.status === 'success') {
        setPairingStatus({ status: 'success', message: result.message });
        
        // Update device in list
        setDevices(prev => prev.map(d => 
          d.ip === ip ? { ...d, paired: true } : d
        ));
        
        if (selectedDevice?.ip === ip) {
          setSelectedDevice(prev => prev ? { ...prev, paired: true } : null);
        }
        
        return;
      }
      
      if (result.status === 'failed') {
        setPairingStatus({ status: 'failed', message: result.message });
        return;
      }
      
      // Still awaiting button press, wait and try again
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    setPairingStatus({ status: 'failed', message: 'Pairing timed out. Please try again.' });
  };

  const getStyle = (type: string) => deviceStyles[type] || deviceStyles.unknown;

  return (
    <div className="relative bg-black/95 border border-cyan-500/40 rounded-2xl p-8 w-[750px] shadow-[0_0_60px_rgba(0,255,255,0.15)]">
      {/* Corner Brackets */}
      <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-cyan-400" />
      <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-cyan-400" />
      <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-cyan-400" />
      <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-cyan-400" />

      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${scanning ? 'bg-yellow-400 animate-pulse' : 'bg-green-400'}`} />
          <h2 className="text-cyan-400 font-orbitron tracking-[0.2em] text-sm">
            NETWORK DISCOVERY
          </h2>
        </div>
        <div className="text-cyan-600/60 font-mono text-xs">
          {scanning ? `SCANNING... ${Math.round(scanProgress)}%` : `${devices.length} DEVICES FOUND`}
        </div>
      </div>

      <div className="flex gap-6">
        {/* Radar Display */}
        <div className="relative w-[400px] h-[400px] flex items-center justify-center flex-shrink-0">
          
          {/* Radar Grid Circles */}
          <div className="absolute inset-0 rounded-full border border-cyan-500/20" />
          <div className="absolute inset-[50px] rounded-full border border-cyan-500/15" />
          <div className="absolute inset-[100px] rounded-full border border-cyan-500/10" />
          <div className="absolute inset-[150px] rounded-full border border-cyan-500/10" />
          
          {/* Cross Lines */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-full h-px bg-cyan-500/15" />
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-full w-px bg-cyan-500/15" />
          </div>

          {/* Radar Sweep Animation */}
          {scanning && (
            <div className="absolute inset-0 rounded-full overflow-hidden">
              <div 
                className="absolute top-1/2 left-1/2 w-1/2 h-1/2 origin-left"
                style={{
                  background: 'conic-gradient(from 0deg, transparent 0deg, rgba(34, 211, 238, 0.3) 30deg, transparent 60deg)',
                  animation: 'spin 2s linear infinite',
                }}
              />
            </div>
          )}

          {/* Center Hub */}
          <div className="absolute w-6 h-6 bg-cyan-500 rounded-full shadow-[0_0_20px_#06b6d4] z-20 flex items-center justify-center">
            <div className="w-2 h-2 bg-white rounded-full" />
          </div>

          {/* Discovered Devices */}
          {devices.map((device, index) => {
            const { x, y } = getDevicePosition(index, devices.length);
            const style = getStyle(device.type);
            const isSelected = selectedDevice?.ip === device.ip;
            
            return (
              <div
                key={device.ip}
                className={`absolute flex flex-col items-center cursor-pointer transition-all duration-300 z-10
                  ${scanning ? 'animate-pulse' : ''}`}
                style={{ 
                  transform: `translate(${x}px, ${y}px)`,
                  opacity: scanning ? 0.7 : 1,
                }}
                onClick={() => handleDeviceClick(device)}
              >
                {/* Paired indicator ring */}
                {device.paired && (
                  <div className="absolute w-6 h-6 rounded-full border-2 border-green-400 animate-ping opacity-50" />
                )}
                
                {/* Device Dot */}
                <div className={`
                  w-4 h-4 rounded-full ${style.color} ${style.glow}
                  transition-all duration-200
                  ${isSelected ? 'scale-150 ring-2 ring-white' : 'hover:scale-125'}
                `} />
                
                {/* Unpaired warning */}
                {device.requiresPairing && !device.paired && (
                  <div className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                )}
              </div>
            );
          })}

          {/* Status Ring */}
          <div className={`absolute inset-[-4px] rounded-full border-2 transition-colors duration-500 ${
            scanning ? 'border-yellow-500/30 animate-pulse' : 'border-green-500/30'
          }`} />
        </div>

        {/* Device Details Panel */}
        <div className="flex-1 min-w-[280px]">
          {selectedDevice ? (
            <div className="bg-cyan-900/20 border border-cyan-500/30 rounded-lg p-4 h-full">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-2xl">{getStyle(selectedDevice.type).icon}</span>
                <div>
                  <div className="text-white font-rajdhani text-lg">{selectedDevice.name}</div>
                  <div className="text-cyan-500/60 font-mono text-xs">
                    {selectedDevice.manufacturer || 'Unknown'} • {selectedDevice.ip}
                  </div>
                </div>
              </div>

              <div className="space-y-2 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-cyan-600">TYPE</span>
                  <span className="text-white uppercase">{selectedDevice.type.replace(/_/g, ' ')}</span>
                </div>
                {selectedDevice.model && (
                  <div className="flex justify-between">
                    <span className="text-cyan-600">MODEL</span>
                    <span className="text-white">{selectedDevice.model}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-cyan-600">STATUS</span>
                  <span className={selectedDevice.paired ? 'text-green-400' : 'text-yellow-400'}>
                    {selectedDevice.paired ? '● PAIRED' : '○ NOT PAIRED'}
                  </span>
                </div>
              </div>

              {/* Pairing Section */}
              {selectedDevice.requiresPairing && !selectedDevice.paired && (
                <div className="mt-4 pt-4 border-t border-cyan-800/30">
                  {pairingStatus.status === 'idle' && (
                    <button 
                      onClick={() => startHuePairing(selectedDevice)}
                      className="w-full px-4 py-2 bg-yellow-500/20 border border-yellow-500/40 rounded text-yellow-400 font-mono text-xs hover:bg-yellow-500/30 transition-colors"
                    >
                      PAIR DEVICE
                    </button>
                  )}
                  
                  {(pairingStatus.status === 'awaiting_action' || pairingStatus.status === 'polling') && (
                    <div className="text-center">
                      <div className="text-yellow-400 font-mono text-xs mb-2 animate-pulse">
                        {pairingStatus.message}
                      </div>
                      <div className="w-full h-1 bg-yellow-900/30 rounded overflow-hidden">
                        <div className="h-full bg-yellow-400 animate-pulse" style={{ width: '100%' }} />
                      </div>
                    </div>
                  )}
                  
                  {pairingStatus.status === 'success' && (
                    <div className="text-center text-green-400 font-mono text-xs">
                      ✓ {pairingStatus.message}
                    </div>
                  )}
                  
                  {pairingStatus.status === 'failed' && (
                    <div className="text-center">
                      <div className="text-red-400 font-mono text-xs mb-2">
                        ✗ {pairingStatus.message}
                      </div>
                      <button 
                        onClick={() => startHuePairing(selectedDevice)}
                        className="px-4 py-1 border border-cyan-500/40 text-cyan-400 rounded font-mono text-xs hover:bg-cyan-500/10"
                      >
                        RETRY
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Already paired - show controls */}
              {selectedDevice.paired && selectedDevice.type === 'hue_bridge' && (
                <div className="mt-4 pt-4 border-t border-cyan-800/30">
                  <div className="text-green-400/60 font-mono text-xs mb-2">INTEGRATED</div>
                  <div className="text-cyan-400/80 font-mono text-[10px]">
                    Say "Turn on the lights" or "Set lights to 50%"
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-cyan-600/40 font-mono text-xs">
              SELECT A DEVICE
            </div>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="flex justify-center gap-4 mt-6 flex-wrap">
        {[
          { type: 'light', label: 'Lights' },
          { type: 'speaker', label: 'Speakers' },
          { type: 'media', label: 'Media' },
          { type: 'hub', label: 'Hubs' },
          { type: 'switch', label: 'Switches' },
        ].map(({ type, label }) => (
          <div key={type} className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${deviceStyles[type].color}`} />
            <span className="text-cyan-600/60 font-mono text-[10px] uppercase">{label}</span>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-red-500" />
          <span className="text-cyan-600/60 font-mono text-[10px] uppercase">Needs Pairing</span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-between items-center mt-6 pt-4 border-t border-cyan-800/30">
        <button 
          onClick={runScan}
          disabled={scanning}
          className={`px-4 py-2 border rounded font-mono text-xs transition-colors ${
            scanning 
              ? 'border-cyan-800/30 text-cyan-800 cursor-not-allowed' 
              : 'border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/10'
          }`}
        >
          {scanning ? 'SCANNING...' : 'RESCAN NETWORK'}
        </button>
        
        {onClose && (
          <button 
            onClick={onClose}
            className="px-4 py-2 border border-cyan-500/40 text-cyan-400 rounded font-mono text-xs hover:bg-cyan-500/10 transition-colors"
          >
            CLOSE
          </button>
        )}
      </div>

      {/* CSS for radar sweep animation */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default DeviceRadar;
