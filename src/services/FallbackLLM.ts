/**
 * JARVIS FALLBACK LLM
 * 
 * Phase 9: Bulletproof
 * 
 * When LM Studio is down, JARVIS doesn't go silent.
 * This provides hardcoded responses for common commands.
 * 
 * It's not smart, but it keeps the lights on (literally).
 */

export interface FallbackResponse {
  pattern: RegExp;
  handler: (match: RegExpMatchArray, input: string) => string | null;
  toolCall?: {
    name: string;
    args: (match: RegExpMatchArray) => Record<string, any>;
  };
}

/**
 * Fallback response patterns
 * Order matters - first match wins
 */
const FALLBACK_PATTERNS: FallbackResponse[] = [
  // ===========================================================================
  // TIME & DATE
  // ===========================================================================
  {
    pattern: /what(?:'s| is) the time|what time is it|current time/i,
    handler: () => {
      const time = new Date().toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
      });
      return `It's ${time}, Sir.`;
    },
  },
  {
    pattern: /what(?:'s| is) (?:the |today(?:'s)? )?date|what day is it/i,
    handler: () => {
      const date = new Date().toLocaleDateString('en-US', { 
        weekday: 'long',
        month: 'long', 
        day: 'numeric',
        year: 'numeric'
      });
      return `It's ${date}, Sir.`;
    },
  },
  
  // ===========================================================================
  // LIGHTS (via reflex, but fallback just in case)
  // ===========================================================================
  {
    pattern: /(?:turn |switch )?(?:on |off )?(?:the )?lights?(?: on| off)?|lights? (?:on|off)/i,
    handler: (match, input) => {
      const isOn = /\bon\b/i.test(input);
      const isOff = /\boff\b/i.test(input);
      
      if (isOn) {
        return "I'll turn on the lights, Sir.";
      } else if (isOff) {
        return "Lights off, Sir.";
      }
      return "Should I turn the lights on or off, Sir?";
    },
    toolCall: {
      name: 'controlHueLights',
      args: (match) => {
        const input = match.input || '';
        return { action: /\bon\b/i.test(input) ? 'on' : 'off' };
      },
    },
  },
  
  // ===========================================================================
  // TIMERS
  // ===========================================================================
  {
    pattern: /set (?:a )?timer (?:for )?(\d+)\s*(second|minute|hour)s?/i,
    handler: (match) => {
      const amount = parseInt(match[1]);
      const unit = match[2].toLowerCase();
      return `Timer set for ${amount} ${unit}${amount > 1 ? 's' : ''}, Sir.`;
    },
    toolCall: {
      name: 'setTimer',
      args: (match) => {
        const amount = parseInt(match[1]);
        const unit = match[2].toLowerCase();
        const multipliers: Record<string, number> = { second: 1, minute: 60, hour: 3600 };
        return { duration: amount * (multipliers[unit] || 60) };
      },
    },
  },
  {
    pattern: /cancel (?:the |my )?timer/i,
    handler: () => "Timer cancelled, Sir.",
    toolCall: {
      name: 'cancelTimer',
      args: () => ({ label: 'Timer' }),
    },
  },
  
  // ===========================================================================
  // REMINDERS
  // ===========================================================================
  {
    pattern: /remind me (?:to |about )?(.+?) in (\d+)\s*(second|minute|hour)s?/i,
    handler: (match) => {
      const task = match[1];
      const amount = parseInt(match[2]);
      const unit = match[3].toLowerCase();
      return `I'll remind you to ${task} in ${amount} ${unit}${amount > 1 ? 's' : ''}, Sir.`;
    },
    toolCall: {
      name: 'setReminder',
      args: (match) => {
        const amount = parseInt(match[2]);
        const unit = match[3].toLowerCase();
        return { 
          message: match[1],
          time: `in ${amount} ${unit}${amount > 1 ? 's' : ''}`,
        };
      },
    },
  },
  
  // ===========================================================================
  // BASIC COMMANDS
  // ===========================================================================
  {
    pattern: /^(?:hey |hi |hello |good morning|good afternoon|good evening)/i,
    handler: () => {
      const hour = new Date().getHours();
      if (hour < 12) return "Good morning, Sir. How may I assist you?";
      if (hour < 17) return "Good afternoon, Sir. What can I do for you?";
      return "Good evening, Sir. How may I help?";
    },
  },
  {
    pattern: /^(?:thanks|thank you|thx)/i,
    handler: () => "You're welcome, Sir. Always at your service.",
  },
  {
    pattern: /^(?:stop|cancel|never ?mind|shut up)/i,
    handler: () => "Understood, Sir.",
  },
  
  // ===========================================================================
  // STATUS & HELP
  // ===========================================================================
  {
    pattern: /(?:what(?:'s| is) )?(?:your )?status|are you (?:there|online|working)/i,
    handler: () => "I'm here, Sir, though I should mention my main systems are currently in fallback mode. I can handle basic commands, but complex requests will need to wait until I'm fully operational.",
  },
  {
    pattern: /what(?:'s| is) wrong|why (?:aren't|can't) you/i,
    handler: () => "My connection to LM Studio appears to be offline, Sir. I'm operating in fallback mode with limited capabilities. I can still handle lights, timers, and basic queries.",
  },
  {
    pattern: /what can you do|help|capabilities/i,
    handler: () => "In fallback mode, I can: tell the time and date, control your lights, set timers and reminders, and respond to basic commands. For anything more complex, I'll need my full systems back online.",
  },
  
  // ===========================================================================
  // WEATHER (limited)
  // ===========================================================================
  {
    pattern: /weather|temperature|forecast/i,
    handler: () => "I'm sorry Sir, weather data requires my full systems. I'm currently in fallback mode. Try again in a moment.",
  },
  
  // ===========================================================================
  // MUSIC
  // ===========================================================================
  {
    pattern: /play (?:some )?music|play (.+)/i,
    handler: (match) => {
      if (match[1]) {
        return `I'd play "${match[1]}" for you, Sir, but I'm in fallback mode. Music control requires my full systems.`;
      }
      return "Music control is unavailable in fallback mode, Sir. My systems are recovering.";
    },
  },
  {
    pattern: /pause|stop music|stop playing/i,
    handler: () => "I'll attempt to pause, Sir.",
    toolCall: {
      name: 'spotifyControl',
      args: () => ({ action: 'pause' }),
    },
  },
  
  // ===========================================================================
  // CATCH-ALL (must be last)
  // ===========================================================================
  {
    pattern: /.+/,
    handler: () => "I apologize, Sir. I'm currently in fallback mode with limited capabilities. My connection to the main AI is recovering. For now, I can only handle basic commands like lights, timers, and time queries.",
  },
];

export class FallbackLLM {
  /**
   * Try to handle input with hardcoded responses
   * Returns null if no pattern matches (shouldn't happen with catch-all)
   */
  static process(input: string): { response: string; toolCall?: { name: string; args: Record<string, any> } } | null {
    const cleanInput = input.trim();
    
    for (const fallback of FALLBACK_PATTERNS) {
      const match = cleanInput.match(fallback.pattern);
      
      if (match) {
        const response = fallback.handler(match, cleanInput);
        
        if (response) {
          return {
            response,
            toolCall: fallback.toolCall ? {
              name: fallback.toolCall.name,
              args: fallback.toolCall.args(match),
            } : undefined,
          };
        }
      }
    }
    
    return null;
  }
  
  /**
   * Check if fallback can handle this input meaningfully
   * (i.e., not just the catch-all)
   */
  static canHandle(input: string): boolean {
    const cleanInput = input.trim();
    
    // Check all patterns except the last (catch-all)
    for (let i = 0; i < FALLBACK_PATTERNS.length - 1; i++) {
      if (FALLBACK_PATTERNS[i].pattern.test(cleanInput)) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Get list of available fallback capabilities
   */
  static getCapabilities(): string[] {
    return [
      'Time and date queries',
      'Light control (on/off)',
      'Timer management',
      'Basic reminders',
      'Greetings and basic interaction',
      'Status and help queries',
    ];
  }
}
