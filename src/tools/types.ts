/**
 * TOOLS - SHARED TYPES
 * Common types and interfaces used across tool modules
 */

import { JarvisTool, JarvisState, SystemTimer, Alarm, Reminder } from '../types';

// Storage keys for persistence
export const STORAGE_KEYS = {
  TIMERS: 'jarvis_timers',
  ALARMS: 'jarvis_alarms',
  REMINDERS: 'jarvis_reminders',
  LISTS: 'jarvis_lists',
  NOTES: 'jarvis_notes',
  ROUTINES: 'jarvis_routines',
  STOCKS_WATCHLIST: 'jarvis_stocks',
};

// Callback types for state management
export interface ToolsCallbacks {
  onStateChange: (state: JarvisState) => void;
  onTimerComplete: (timer: SystemTimer) => void;
  onAlarmTrigger: (alarm: Alarm) => void;
  onReminderTrigger: (reminder: Reminder) => void;
}

// Base context for tool execution
export interface ToolExecutionContext {
  state: JarvisState;
  updateState: (partial: Partial<JarvisState>) => void;
  persist: (key: string, data: any) => void;
}

// Helper to persist data to localStorage
export function persistData(key: string, data: any): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.error('[Tools] Failed to persist data:', e);
  }
}

// Helper to load data from localStorage
export function loadPersistedData<T>(key: string, defaultValue: T): T {
  try {
    const data = localStorage.getItem(key);
    if (data) return JSON.parse(data);
  } catch (e) {
    console.error('[Tools] Failed to load data:', e);
  }
  return defaultValue;
}
