/**
 * JARVIS APP - THE STAGE MANAGER
 * 
 * This is the new clean root component. It replaces the old "God Component"
 * with a simple router that delegates to the right view based on setup state.
 * 
 * Architecture:
 * - JarvisProvider: Manages all state (replaces 20+ useState hooks)
 * - StageManager: Routes to the right view
 * - FirstLaunchWizard: The "30-second experience" for new users (Phase 10)
 * - AutoSetup: The "Iron Man" boot sequence for profile configuration
 * - AmbientInterface: The main "holographic" interface
 */

import React, { useState, useEffect } from 'react';
import { JarvisProvider, useJarvis } from './store/JarvisContext';
import { AutoSetup } from './components/AutoSetup';
import { AmbientInterface } from './components/AmbientInterface';
import { FirstLaunchWizard, isFirstLaunch } from './components/FirstLaunchWizard';
import { ToastProvider } from './components/ui/Toast';

// =============================================================================
// STAGE MANAGER - Routes to the correct view based on state
// =============================================================================

const StageManager: React.FC = () => {
  const { ui } = useJarvis();
  const [showFirstLaunch, setShowFirstLaunch] = useState(false);
  const [checkingFirstLaunch, setCheckingFirstLaunch] = useState(true);

  // Check if this is the first launch
  useEffect(() => {
    const checkFirstLaunch = async () => {
      // Check Electron first (has persistent storage)
      if (window.jarvisHost?.isFirstLaunch) {
        try {
          const result = await window.jarvisHost.isFirstLaunch();
          setShowFirstLaunch(result.firstLaunch);
        } catch {
          // Fallback to localStorage
          setShowFirstLaunch(isFirstLaunch());
        }
      } else {
        // Browser mode - use localStorage
        setShowFirstLaunch(isFirstLaunch());
      }
      setCheckingFirstLaunch(false);
    };
    
    checkFirstLaunch();
  }, []);

  // Show loading while checking
  if (checkingFirstLaunch) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="text-cyan-500 animate-pulse font-mono">
          INITIALIZING...
        </div>
      </div>
    );
  }

  // Show first launch wizard for new users (Phase 10)
  if (showFirstLaunch) {
    return (
      <FirstLaunchWizard 
        onComplete={() => {
          setShowFirstLaunch(false);
          // Also mark complete in Electron if available
          if (window.jarvisHost?.markSetupComplete) {
            window.jarvisHost.markSetupComplete();
          }
        }} 
      />
    );
  }

  // If not setup complete, show the "Boot Sequence"
  if (!ui.isSetupComplete) {
    return <AutoSetup />;
  }

  // Otherwise, show the main ambient interface
  return <AmbientInterface />;
};

// =============================================================================
// APP ROOT
// =============================================================================

export default function App() {
  return (
    <ToastProvider>
      <JarvisProvider>
        <div className="antialiased text-slate-500 dark:text-slate-400 bg-black min-h-screen">
          <StageManager />
        </div>
      </JarvisProvider>
    </ToastProvider>
  );
}

// Type declarations for Electron
declare global {
  interface Window {
    jarvisHost?: {
      isFirstLaunch?: () => Promise<{ firstLaunch: boolean }>;
      markSetupComplete?: () => Promise<{ success: boolean }>;
    };
  }
}
