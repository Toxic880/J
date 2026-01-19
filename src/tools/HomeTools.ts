/**
 * HOME TOOLS
 * Smart Home control via Home Assistant and Philips Hue
 * 
 * Includes:
 * - Device control (lights, switches, locks, thermostats)
 * - Scene activation
 * - Device status queries
 * - Intercom/announcements
 */

import { JarvisTool } from '../types';

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

export const DEVICE_TOOLS: JarvisTool[] = [
  {
    name: 'controlDevice',
    description: 'Control smart home device',
    parameters: {
      type: 'object',
      properties: {
        device: { type: 'string' },
        action: { type: 'string', description: 'turn_on, turn_off, lock, unlock, set' },
        value: { type: 'number' }
      },
      required: ['device', 'action']
    }
  },
  {
    name: 'getDeviceStatus',
    description: 'Get device status',
    parameters: {
      type: 'object',
      properties: {
        device: { type: 'string' }
      },
      required: ['device']
    }
  },
  {
    name: 'setScene',
    description: 'Activate a scene',
    parameters: {
      type: 'object',
      properties: {
        sceneName: { type: 'string' }
      },
      required: ['sceneName']
    }
  },
];

export const INTERCOM_TOOLS: JarvisTool[] = [
  {
    name: 'announce',
    description: 'Make an announcement to specific rooms',
    parameters: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Message to announce' },
        rooms: { type: 'array', items: { type: 'string' }, description: 'Target rooms (optional, defaults to all)' }
      },
      required: ['message']
    }
  },
  {
    name: 'broadcast',
    description: 'Broadcast message to all rooms',
    parameters: {
      type: 'object',
      properties: {
        message: { type: 'string' }
      },
      required: ['message']
    }
  },
  {
    name: 'announceDinner',
    description: 'Announce that dinner is ready',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'intercom',
    description: 'Start intercom to specific room',
    parameters: {
      type: 'object',
      properties: {
        targetRoom: { type: 'string', description: 'Room to connect to' }
      },
      required: ['targetRoom']
    }
  },
];

// Combined export
export const ALL_HOME_TOOLS: JarvisTool[] = [
  ...DEVICE_TOOLS,
  ...INTERCOM_TOOLS,
];

// Tool names for routing
export const HOME_TOOL_NAMES = [
  'controlDevice', 'getDeviceStatus', 'setScene',
  'announce', 'broadcast', 'announceDinner', 'intercom',
];
