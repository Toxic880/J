/**
 * TIMER TOOLS
 * Timers, Alarms, and Reminders
 * 
 * Includes:
 * - Countdown timers with pause/resume
 * - Scheduled alarms (one-time and recurring)
 * - Time-based reminders
 */

import { JarvisTool } from '../types';

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

export const TIMER_TOOLS: JarvisTool[] = [
  // TIMERS
  {
    name: 'setTimer',
    description: 'Set a countdown timer',
    parameters: {
      type: 'object',
      properties: {
        duration: { type: 'number', description: 'Duration in seconds' },
        label: { type: 'string', description: 'Timer name' }
      },
      required: ['duration']
    }
  },
  {
    name: 'cancelTimer',
    description: 'Cancel a timer',
    parameters: {
      type: 'object',
      properties: {
        label: { type: 'string', description: 'Timer name to cancel' }
      },
      required: ['label']
    }
  },
  {
    name: 'pauseTimer',
    description: 'Pause a timer',
    parameters: {
      type: 'object',
      properties: {
        label: { type: 'string', description: 'Timer to pause' }
      },
      required: ['label']
    }
  },
  {
    name: 'resumeTimer',
    description: 'Resume a paused timer',
    parameters: {
      type: 'object',
      properties: {
        label: { type: 'string', description: 'Timer to resume' }
      },
      required: ['label']
    }
  },
  {
    name: 'getTimers',
    description: 'Get all active timers',
    parameters: { type: 'object', properties: {} }
  },
];

export const ALARM_TOOLS: JarvisTool[] = [
  {
    name: 'setAlarm',
    description: 'Set an alarm',
    parameters: {
      type: 'object',
      properties: {
        time: { type: 'string', description: 'Time in HH:MM format' },
        label: { type: 'string', description: 'Alarm label' },
        days: { type: 'array', items: { type: 'string' }, description: 'Days for recurring' },
        recurring: { type: 'boolean' }
      },
      required: ['time']
    }
  },
  {
    name: 'cancelAlarm',
    description: 'Cancel an alarm',
    parameters: {
      type: 'object',
      properties: {
        label: { type: 'string', description: 'Alarm to cancel' }
      },
      required: ['label']
    }
  },
  {
    name: 'getAlarms',
    description: 'Get all alarms',
    parameters: { type: 'object', properties: {} }
  },
];

export const REMINDER_TOOLS: JarvisTool[] = [
  {
    name: 'setReminder',
    description: 'Set a reminder',
    parameters: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Reminder message' },
        time: { type: 'string', description: 'When (e.g., "in 5 minutes", "in 30 seconds", "at 14:00")' }
      },
      required: ['message', 'time']
    }
  },
  {
    name: 'cancelReminder',
    description: 'Cancel a reminder',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Reminder ID or message text' }
      },
      required: ['id']
    }
  },
  {
    name: 'getReminders',
    description: 'Get pending reminders',
    parameters: { type: 'object', properties: {} }
  },
];

// Combined export for all timer-related tools
export const ALL_TIMER_TOOLS: JarvisTool[] = [
  ...TIMER_TOOLS,
  ...ALARM_TOOLS,
  ...REMINDER_TOOLS,
];

// Tool names for routing in executor
export const TIMER_TOOL_NAMES = [
  'setTimer', 'cancelTimer', 'pauseTimer', 'resumeTimer', 'addTimeToTimer', 'getTimers',
  'setAlarm', 'cancelAlarm', 'snoozeAlarm', 'getAlarms',
  'setReminder', 'cancelReminder', 'getReminders',
];
