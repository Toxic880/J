/**
 * COMMUNICATION TOOLS
 * Email (Gmail) and SMS (Twilio) integration
 * 
 * Includes:
 * - Email reading, sending, and search
 * - SMS messaging via Twilio
 */

import { JarvisTool } from '../types';

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

export const EMAIL_TOOLS: JarvisTool[] = [
  {
    name: 'getEmails',
    description: 'Get emails from inbox',
    parameters: {
      type: 'object',
      properties: {
        count: { type: 'number', description: 'Number of emails (default 5)' },
        unreadOnly: { type: 'boolean', description: 'Only unread emails' }
      }
    }
  },
  {
    name: 'getUnreadCount',
    description: 'Get unread email count',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'readEmail',
    description: 'Read a specific email',
    parameters: {
      type: 'object',
      properties: {
        index: { type: 'number', description: 'Email number (1-based)' }
      },
      required: ['index']
    }
  },
  {
    name: 'sendEmail',
    description: 'Send an email',
    parameters: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient email' },
        subject: { type: 'string' },
        body: { type: 'string' }
      },
      required: ['to', 'subject', 'body']
    }
  },
  {
    name: 'replyEmail',
    description: 'Reply to an email',
    parameters: {
      type: 'object',
      properties: {
        index: { type: 'number', description: 'Email to reply to' },
        body: { type: 'string' }
      },
      required: ['index', 'body']
    }
  },
  {
    name: 'searchEmails',
    description: 'Search emails',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string' }
      },
      required: ['query']
    }
  },
];

export const SMS_TOOLS: JarvisTool[] = [
  {
    name: 'sendText',
    description: 'Send a text message',
    parameters: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Contact name or phone number' },
        message: { type: 'string' }
      },
      required: ['to', 'message']
    }
  },
  {
    name: 'getTexts',
    description: 'Get text message history',
    parameters: {
      type: 'object',
      properties: {
        contact: { type: 'string', description: 'Contact name (optional)' }
      }
    }
  },
  {
    name: 'addContact',
    description: 'Add SMS contact',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        phone: { type: 'string' }
      },
      required: ['name', 'phone']
    }
  },
];

// Combined export
export const ALL_COMMUNICATION_TOOLS: JarvisTool[] = [
  ...EMAIL_TOOLS,
  ...SMS_TOOLS,
];

// Tool names for routing
export const COMMUNICATION_TOOL_NAMES = [
  // Email
  'getEmails', 'getUnreadCount', 'readEmail', 'sendEmail', 'replyEmail', 'searchEmails',
  // SMS
  'sendText', 'getTexts', 'addContact',
];
