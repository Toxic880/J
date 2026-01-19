/**
 * JARVIS TOOLS - INDEX
 * 
 * Central export for all JARVIS tools and the ToolsExecutor.
 * Tool definitions are split into domain-specific modules for maintainability.
 * 
 * Modules:
 * - TimerTools: Timers, alarms, reminders
 * - ListTools: Lists, notes
 * - MediaTools: Spotify, news, stocks, sports
 * - CalendarTools: Google Calendar, tasks
 * - CommunicationTools: Email, SMS
 * - HomeTools: Home Assistant, devices, intercom
 * - SystemTools: Weather, time, calculations, modes, memory, vision
 * - HealthTools: Whoop health data
 */

import { JarvisTool } from '../types';

// Import tool definitions from each module
import { ALL_TIMER_TOOLS, TIMER_TOOL_NAMES, ALARM_TOOLS, REMINDER_TOOLS } from './TimerTools';
import { ALL_LIST_TOOLS, LIST_TOOL_NAMES } from './ListTools';
import { ALL_MEDIA_TOOLS, MEDIA_TOOL_NAMES, MUSIC_TOOLS, NEWS_TOOLS, STOCK_TOOLS } from './MediaTools';
import { ALL_CALENDAR_TOOLS, CALENDAR_TOOL_NAMES } from './CalendarTools';
import { ALL_COMMUNICATION_TOOLS, COMMUNICATION_TOOL_NAMES, EMAIL_TOOLS, SMS_TOOLS } from './CommunicationTools';
import { ALL_HOME_TOOLS, HOME_TOOL_NAMES, INTERCOM_TOOLS } from './HomeTools';
import { ALL_SYSTEM_TOOLS, SYSTEM_TOOL_NAMES, UTILITY_TOOLS, MODE_TOOLS, MEMORY_TOOLS, VISION_TOOLS, BRIEFING_TOOLS } from './SystemTools';
import { ALL_HEALTH_TOOLS, HEALTH_TOOL_NAMES, DEPRECATED_TESLA_TOOL_NAMES } from './HealthTools';

// Re-export types
export { STORAGE_KEYS, ToolsCallbacks, ToolExecutionContext, persistData, loadPersistedData } from './types';

// Re-export individual module exports for granular access
export * from './TimerTools';
export * from './ListTools';
export * from './MediaTools';
export * from './CalendarTools';
export * from './CommunicationTools';
export * from './HomeTools';
export * from './SystemTools';
export * from './HealthTools';

// =============================================================================
// COMBINED JARVIS_TOOLS ARRAY
// This is the master list of all tools available to the LLM
// =============================================================================

export const JARVIS_TOOLS: JarvisTool[] = [
  ...ALL_TIMER_TOOLS,
  ...ALL_LIST_TOOLS,
  ...ALL_MEDIA_TOOLS,
  ...ALL_CALENDAR_TOOLS,
  ...ALL_COMMUNICATION_TOOLS,
  ...ALL_HOME_TOOLS,
  ...ALL_SYSTEM_TOOLS,
  ...ALL_HEALTH_TOOLS,
];

// =============================================================================
// TOOL ROUTING HELPERS
// =============================================================================

/**
 * All tool names grouped by category for efficient routing
 */
export const TOOL_CATEGORIES = {
  timer: TIMER_TOOL_NAMES,
  list: LIST_TOOL_NAMES,
  media: MEDIA_TOOL_NAMES,
  calendar: CALENDAR_TOOL_NAMES,
  communication: COMMUNICATION_TOOL_NAMES,
  home: HOME_TOOL_NAMES,
  system: SYSTEM_TOOL_NAMES,
  health: HEALTH_TOOL_NAMES,
  deprecatedTesla: DEPRECATED_TESLA_TOOL_NAMES,
};

/**
 * Get the category for a tool name
 */
export function getToolCategory(toolName: string): string | null {
  for (const [category, names] of Object.entries(TOOL_CATEGORIES)) {
    if (names.includes(toolName)) {
      return category;
    }
  }
  return null;
}

/**
 * Check if a tool exists
 */
export function isValidTool(toolName: string): boolean {
  return JARVIS_TOOLS.some(t => t.name === toolName);
}

// =============================================================================
// RE-EXPORT TOOLS EXECUTOR
// The main executor class remains in services/Tools.ts for now
// This maintains backwards compatibility while tool definitions are modular
// =============================================================================

// ToolsExecutor is still exported from services/Tools.ts
// Import it from there: import { ToolsExecutor } from '../services/Tools';
