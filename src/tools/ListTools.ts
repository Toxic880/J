/**
 * LIST TOOLS
 * Lists and Notes management
 * 
 * Includes:
 * - Shopping lists, todo lists, custom lists
 * - Persistent notes
 */

import { JarvisTool } from '../types';

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

export const LIST_TOOLS: JarvisTool[] = [
  {
    name: 'addToList',
    description: 'Add item to a list (shopping, todo, etc)',
    parameters: {
      type: 'object',
      properties: {
        listName: { type: 'string', description: 'List name' },
        item: { type: 'string', description: 'Item to add' }
      },
      required: ['listName', 'item']
    }
  },
  {
    name: 'removeFromList',
    description: 'Remove item from list',
    parameters: {
      type: 'object',
      properties: {
        listName: { type: 'string' },
        item: { type: 'string' }
      },
      required: ['listName', 'item']
    }
  },
  {
    name: 'getList',
    description: 'Read a list',
    parameters: {
      type: 'object',
      properties: {
        listName: { type: 'string' }
      },
      required: ['listName']
    }
  },
  {
    name: 'clearList',
    description: 'Clear all items from list',
    parameters: {
      type: 'object',
      properties: {
        listName: { type: 'string' }
      },
      required: ['listName']
    }
  },
  {
    name: 'createList',
    description: 'Create a new list',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the new list' }
      },
      required: ['name']
    }
  },
];

export const NOTE_TOOLS: JarvisTool[] = [
  {
    name: 'createNote',
    description: 'Create a note',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        content: { type: 'string' }
      },
      required: ['title', 'content']
    }
  },
  {
    name: 'getNote',
    description: 'Read a note',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' }
      },
      required: ['title']
    }
  },
  {
    name: 'deleteNote',
    description: 'Delete a note',
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
export const ALL_LIST_TOOLS: JarvisTool[] = [
  ...LIST_TOOLS,
  ...NOTE_TOOLS,
];

// Tool names for routing
export const LIST_TOOL_NAMES = [
  'createList', 'addToList', 'removeFromList', 'getList', 'clearList',
  'createNote', 'getNote', 'deleteNote',
];
