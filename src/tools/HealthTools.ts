/**
 * HEALTH TOOLS
 * Health and fitness data from Whoop (and future Garmin support)
 * 
 * Includes:
 * - Recovery scores
 * - Sleep analysis
 * - Activity/strain data
 * - Health summaries
 * 
 * Note: Garmin integration requires enterprise API access
 */

import { JarvisTool } from '../types';

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

export const HEALTH_TOOLS: JarvisTool[] = [
  {
    name: 'getHealthSummary',
    description: 'Get overall health summary (sleep, recovery, activity)',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'getRecoveryScore',
    description: 'Get recovery score and recommendation',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'getSleepData',
    description: 'Get last night\'s sleep data',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'getActivityData',
    description: 'Get today\'s activity and strain data',
    parameters: { type: 'object', properties: {} }
  },
];

// =============================================================================
// DEPRECATED TESLA TOOLS (kept for backwards compatibility error messages)
// These were removed as they were never a working integration
// =============================================================================

export const DEPRECATED_TESLA_TOOLS: JarvisTool[] = [
  { name: 'getTeslaStatus', description: 'Get Tesla vehicle status (battery, range, climate)', parameters: { type: 'object', properties: {} } },
  { name: 'lockTesla', description: 'Lock the Tesla', parameters: { type: 'object', properties: {} } },
  { name: 'unlockTesla', description: 'Unlock the Tesla', parameters: { type: 'object', properties: {} } },
  { name: 'startTeslaClimate', description: 'Start Tesla climate control (pre-condition)', parameters: { type: 'object', properties: {} } },
  { name: 'stopTeslaClimate', description: 'Stop Tesla climate control', parameters: { type: 'object', properties: {} } },
  { name: 'setTeslaTemp', description: 'Set Tesla temperature', parameters: { type: 'object', properties: { temperature: { type: 'number', description: 'Temperature in Celsius' } }, required: ['temperature'] } },
  { name: 'openTeslaTrunk', description: 'Open Tesla trunk', parameters: { type: 'object', properties: {} } },
  { name: 'openTeslaFrunk', description: 'Open Tesla frunk', parameters: { type: 'object', properties: {} } },
  { name: 'honkTeslaHorn', description: 'Honk Tesla horn', parameters: { type: 'object', properties: {} } },
  { name: 'flashTeslaLights', description: 'Flash Tesla lights', parameters: { type: 'object', properties: {} } },
  { name: 'startTeslaCharging', description: 'Start Tesla charging', parameters: { type: 'object', properties: {} } },
  { name: 'stopTeslaCharging', description: 'Stop Tesla charging', parameters: { type: 'object', properties: {} } },
  { name: 'setTeslaSentryMode', description: 'Enable/disable Tesla Sentry Mode', parameters: { type: 'object', properties: { enabled: { type: 'boolean' } }, required: ['enabled'] } },
];

// Combined export
export const ALL_HEALTH_TOOLS: JarvisTool[] = [
  ...HEALTH_TOOLS,
  ...DEPRECATED_TESLA_TOOLS, // Kept for error messages when called
];

// Tool names for routing
export const HEALTH_TOOL_NAMES = [
  'getHealthSummary', 'getRecoveryScore', 'getSleepData', 'getActivityData',
];

// Deprecated Tesla tools - all return error when called
export const DEPRECATED_TESLA_TOOL_NAMES = [
  'getTeslaStatus', 'lockTesla', 'unlockTesla', 'startTeslaClimate', 'stopTeslaClimate',
  'setTeslaTemp', 'openTeslaTrunk', 'openTeslaFrunk', 'honkTeslaHorn', 'flashTeslaLights',
  'startTeslaCharging', 'stopTeslaCharging', 'setTeslaSentryMode',
];
