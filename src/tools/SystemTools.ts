/**
 * SYSTEM TOOLS
 * System control, utilities, modes, and general functions
 * 
 * Includes:
 * - Weather, time, date queries
 * - Mathematical calculations and unit conversions
 * - System status and desktop control
 * - JARVIS modes (DND, Focus, Sleep, etc.)
 * - Vision/camera analysis
 * - Memory (remember/recall/forget)
 * - Morning/evening briefings
 */

import { JarvisTool } from '../types';

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

export const UTILITY_TOOLS: JarvisTool[] = [
  {
    name: 'getWeather',
    description: 'Get weather conditions',
    parameters: {
      type: 'object',
      properties: {
        location: { type: 'string', description: 'Location (optional)' }
      }
    }
  },
  {
    name: 'getTime',
    description: 'Get current time',
    parameters: {
      type: 'object',
      properties: {
        timezone: { type: 'string', description: 'Timezone (optional)' }
      }
    }
  },
  {
    name: 'getDate',
    description: 'Get current date',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'calculate',
    description: 'Calculate math expression',
    parameters: {
      type: 'object',
      properties: {
        expression: { type: 'string' }
      },
      required: ['expression']
    }
  },
  {
    name: 'convert',
    description: 'Convert units',
    parameters: {
      type: 'object',
      properties: {
        value: { type: 'number' },
        fromUnit: { type: 'string' },
        toUnit: { type: 'string' }
      },
      required: ['value', 'fromUnit', 'toUnit']
    }
  },
];

export const SYSTEM_TOOLS: JarvisTool[] = [
  {
    name: 'getSystemStatus',
    description: 'Get JARVIS system status',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'systemControl',
    description: 'Control desktop/system functions (Electron only)',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'launch_app, set_volume, get_clipboard, set_clipboard, shutdown, restart, sleep, lock' },
        appName: { type: 'string', description: 'App name (for launch_app)' },
        value: { type: 'string', description: 'Value (for volume, clipboard)' }
      },
      required: ['action']
    }
  },
];

export const MODE_TOOLS: JarvisTool[] = [
  {
    name: 'setMode',
    description: 'Set JARVIS mode',
    parameters: {
      type: 'object',
      properties: {
        mode: { type: 'string', description: 'normal, dnd, sleep, focus, party, guest, away' }
      },
      required: ['mode']
    }
  },
  {
    name: 'getMode',
    description: 'Get current JARVIS mode',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'enableDND',
    description: 'Enable Do Not Disturb mode',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'disableDND',
    description: 'Disable Do Not Disturb mode',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'enableGuestMode',
    description: 'Enable guest mode (limited features)',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'enablePartyMode',
    description: 'Enable party mode',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'enableSleepMode',
    description: 'Enable sleep mode',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'enableFocusMode',
    description: 'Enable focus mode',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'enableAwayMode',
    description: 'Enable away mode',
    parameters: { type: 'object', properties: {} }
  },
];

export const MEMORY_TOOLS: JarvisTool[] = [
  {
    name: 'remember',
    description: 'Remember information about user',
    parameters: {
      type: 'object',
      properties: {
        information: { type: 'string', description: 'Fact to remember' }
      },
      required: ['information']
    }
  },
  {
    name: 'recall',
    description: 'Recall information from memory',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to recall' }
      },
      required: ['query']
    }
  },
  {
    name: 'forget',
    description: 'Forget information',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string' }
      },
      required: ['query']
    }
  },
];

export const VISION_TOOLS: JarvisTool[] = [
  {
    name: 'describeScene',
    description: 'Describe what the camera sees',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'lookAtUser',
    description: 'Look at and identify the user',
    parameters: { type: 'object', properties: {} }
  },
];

export const BRIEFING_TOOLS: JarvisTool[] = [
  {
    name: 'getMorningBriefing',
    description: 'Get morning briefing (weather, calendar, news)',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'getEveningReview',
    description: 'Get evening review (accomplishments, tomorrow\'s schedule)',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'getSmartAlerts',
    description: 'Get current smart/proactive alerts',
    parameters: { type: 'object', properties: {} }
  },
];

// Combined export
export const ALL_SYSTEM_TOOLS: JarvisTool[] = [
  ...UTILITY_TOOLS,
  ...SYSTEM_TOOLS,
  ...MODE_TOOLS,
  ...MEMORY_TOOLS,
  ...VISION_TOOLS,
  ...BRIEFING_TOOLS,
];

// Tool names for routing
export const SYSTEM_TOOL_NAMES = [
  // Utilities
  'getWeather', 'getTime', 'getDate', 'calculate', 'convert',
  // System
  'getSystemStatus', 'systemControl',
  // Modes
  'setMode', 'getMode', 'enableDND', 'disableDND', 'enableGuestMode', 
  'enablePartyMode', 'enableSleepMode', 'enableFocusMode', 'enableAwayMode',
  // Memory
  'remember', 'recall', 'forget',
  // Vision
  'describeScene', 'lookAtUser',
  // Briefings
  'getMorningBriefing', 'getEveningReview', 'getSmartAlerts',
];
