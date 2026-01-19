/**
 * MEDIA TOOLS
 * Music (Spotify), News, Stocks, Sports
 * 
 * Includes:
 * - Spotify playback control
 * - News headlines by category
 * - Stock and crypto prices
 * - Sports scores
 */

import { JarvisTool } from '../types';

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

export const MUSIC_TOOLS: JarvisTool[] = [
  {
    name: 'playMusic',
    description: 'Play music on Spotify',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Song, artist, or playlist name' }
      },
      required: ['query']
    }
  },
  {
    name: 'pauseMusic',
    description: 'Pause music',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'resumeMusic',
    description: 'Resume music',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'nextTrack',
    description: 'Skip to next track',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'previousTrack',
    description: 'Go to previous track',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'setVolume',
    description: 'Set music volume',
    parameters: {
      type: 'object',
      properties: {
        volume: { type: 'number', description: '0-100' }
      },
      required: ['volume']
    }
  },
  {
    name: 'getCurrentTrack',
    description: 'Get currently playing track',
    parameters: { type: 'object', properties: {} }
  },
];

export const NEWS_TOOLS: JarvisTool[] = [
  {
    name: 'getNews',
    description: 'Get news headlines',
    parameters: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'general, tech, business, sports, science' }
      }
    }
  },
  {
    name: 'getHeadlines',
    description: 'Get top news headlines',
    parameters: { type: 'object', properties: {} }
  },
];

export const STOCK_TOOLS: JarvisTool[] = [
  {
    name: 'getStockPrice',
    description: 'Get stock price',
    parameters: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Stock symbol (e.g., AAPL, TSLA)' }
      },
      required: ['symbol']
    }
  },
  {
    name: 'getCryptoPrice',
    description: 'Get cryptocurrency price',
    parameters: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Crypto (bitcoin, ethereum, etc)' }
      },
      required: ['symbol']
    }
  },
  {
    name: 'getPortfolio',
    description: 'Get watchlist prices',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'addToWatchlist',
    description: 'Add stock to watchlist',
    parameters: {
      type: 'object',
      properties: {
        symbol: { type: 'string' }
      },
      required: ['symbol']
    }
  },
  {
    name: 'removeFromWatchlist',
    description: 'Remove stock from watchlist',
    parameters: {
      type: 'object',
      properties: {
        symbol: { type: 'string' }
      },
      required: ['symbol']
    }
  },
];

export const SPORTS_TOOLS: JarvisTool[] = [
  {
    name: 'getSportsScores',
    description: 'Get sports scores',
    parameters: {
      type: 'object',
      properties: {
        league: { type: 'string', description: 'nfl, nba, mlb, nhl, soccer' }
      }
    }
  },
];

// Combined export
export const ALL_MEDIA_TOOLS: JarvisTool[] = [
  ...MUSIC_TOOLS,
  ...NEWS_TOOLS,
  ...STOCK_TOOLS,
  ...SPORTS_TOOLS,
];

// Tool names for routing
export const MEDIA_TOOL_NAMES = [
  // Music
  'playMusic', 'pauseMusic', 'resumeMusic', 'nextTrack', 'previousTrack', 'setVolume', 'getCurrentTrack',
  // News
  'getNews', 'getHeadlines',
  // Stocks
  'getStockPrice', 'getCryptoPrice', 'getPortfolio', 'addToWatchlist', 'removeFromWatchlist',
  // Sports
  'getSportsScores',
];
