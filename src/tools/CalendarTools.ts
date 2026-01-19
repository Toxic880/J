/**
 * CALENDAR TOOLS
 * Google Calendar and Google Tasks integration
 * 
 * Includes:
 * - Calendar event viewing and creation
 * - Task management
 */

import { JarvisTool } from '../types';

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

export const CALENDAR_TOOLS: JarvisTool[] = [
  {
    name: 'getSchedule',
    description: 'Get calendar events',
    parameters: {
      type: 'object',
      properties: {
        when: { type: 'string', description: 'today or tomorrow' }
      }
    }
  },
  {
    name: 'getTodayEvents',
    description: 'Get today\'s calendar events',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'createEvent',
    description: 'Create calendar event',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        time: { type: 'string', description: 'HH:MM or datetime' },
        duration: { type: 'number', description: 'Duration in minutes' },
        description: { type: 'string' }
      },
      required: ['title', 'time']
    }
  },
];

export const TASK_TOOLS: JarvisTool[] = [
  {
    name: 'getTasks',
    description: 'Get Google Tasks',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'addTask',
    description: 'Add a task',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        due: { type: 'string', description: 'Due date (optional)' }
      },
      required: ['title']
    }
  },
  {
    name: 'completeTask',
    description: 'Mark task complete',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' }
      },
      required: ['title']
    }
  },
];

// Combined export
export const ALL_CALENDAR_TOOLS: JarvisTool[] = [
  ...CALENDAR_TOOLS,
  ...TASK_TOOLS,
];

// Tool names for routing
export const CALENDAR_TOOL_NAMES = [
  'getSchedule', 'getTodayEvents', 'createEvent',
  'getTasks', 'addTask', 'completeTask',
];
