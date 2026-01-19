/**
 * JARVIS COMPREHENSIVE TOOLS
 * All tool definitions and execution for the complete JARVIS system
 * 
 * CATEGORIES:
 * - Timers, Alarms, Reminders
 * - Lists & Notes
 * - Weather, Time, Date
 * - Calculations & Conversions
 * - Smart Home
 * - News, Stocks, Sports
 * - Music (Spotify)
 * - Calendar & Tasks (Google)
 * - Memory (Persistent)
 * - Routines
 * - System
 */

import { JarvisTool, ToolCall, JarvisState, SystemTimer, Alarm, Reminder, ListItem, SmartDevice } from '../types';
import { BrowserHardware, RealExternalAPIs } from './DeviceInterface';
import { ExternalAPIsService } from './ExternalAPIs';
import { SpotifyService } from './SpotifyService';
import { GoogleService } from './GoogleService';
import { PersistentMemory } from './PersistentMemory';
import { RoutinesEngine } from './RoutinesEngine';
import { EmailService, Email } from './EmailService';
import { SMSService } from './SMSService';
// TeslaService removed - was not a working integration
import { HealthService, HealthSummary } from './HealthService';
import { ModesService, JarvisMode } from './ModesService';
import { homeAssistant } from './HomeAssistantBridge';
import { IntercomService } from './IntercomService';
import { ProactiveIntelligence, SmartAlert } from './ProactiveIntelligence';

// ============================================================================
// STORAGE KEYS
// ============================================================================

const STORAGE_KEYS = {
  TIMERS: 'jarvis_timers',
  ALARMS: 'jarvis_alarms',
  REMINDERS: 'jarvis_reminders',
  LISTS: 'jarvis_lists',
  NOTES: 'jarvis_notes',
  ROUTINES: 'jarvis_routines',
  STOCKS_WATCHLIST: 'jarvis_stocks',
};

// ============================================================================
// TIMER WORKER (Background-resistant timers with fallback)
// ============================================================================

class TimerWorkerManager {
  private worker: Worker | null = null;
  private callbacks: Map<string, () => void> = new Map();
  private fallbackTimers: Map<string, NodeJS.Timeout> = new Map();
  private useWorker: boolean = true;

  constructor() {
    this.initWorker();
  }

  private initWorker() {
    try {
      const blob = new Blob([`
        const timers = new Map();
        
        self.onmessage = function(e) {
          const { type, id, duration } = e.data;
          
          if (type === 'START') {
            const timer = setTimeout(() => {
              self.postMessage({ type: 'COMPLETE', id });
              timers.delete(id);
            }, duration * 1000);
            timers.set(id, { timer, startTime: Date.now(), duration: duration * 1000 });
          }
          
          if (type === 'CANCEL') {
            const t = timers.get(id);
            if (t) {
              clearTimeout(t.timer);
              timers.delete(id);
            }
            self.postMessage({ type: 'CANCELLED', id });
          }
          
          if (type === 'PAUSE') {
            const t = timers.get(id);
            if (t) {
              clearTimeout(t.timer);
              const elapsed = Date.now() - t.startTime;
              const remaining = t.duration - elapsed;
              timers.set(id, { ...t, timer: null, remaining });
            }
            self.postMessage({ type: 'PAUSED', id });
          }
          
          if (type === 'RESUME') {
            const t = timers.get(id);
            if (t && t.remaining) {
              const timer = setTimeout(() => {
                self.postMessage({ type: 'COMPLETE', id });
                timers.delete(id);
              }, t.remaining);
              timers.set(id, { timer, startTime: Date.now(), duration: t.remaining });
            }
            self.postMessage({ type: 'RESUMED', id });
          }
          
          if (type === 'ADD_TIME') {
            const t = timers.get(id);
            if (t) {
              clearTimeout(t.timer);
              const elapsed = Date.now() - t.startTime;
              const remaining = t.duration - elapsed + (e.data.seconds * 1000);
              const timer = setTimeout(() => {
                self.postMessage({ type: 'COMPLETE', id });
                timers.delete(id);
              }, remaining);
              timers.set(id, { timer, startTime: Date.now(), duration: remaining });
            }
          }
        };
      `], { type: 'application/javascript' });

      this.worker = new Worker(URL.createObjectURL(blob));
      this.worker.onmessage = (e) => {
        if (e.data.type === 'COMPLETE') {
          const callback = this.callbacks.get(e.data.id);
          if (callback) {
            callback();
            this.callbacks.delete(e.data.id);
          }
        }
      };
      this.worker.onerror = (e) => {
        console.warn('[Timer] Worker error, falling back to setTimeout:', e);
        this.useWorker = false;
      };
      console.log('[Timer] Worker initialized successfully');
    } catch (e) {
      console.warn('[Timer] Worker not available, using fallback:', e);
      this.useWorker = false;
    }
  }

  createTimer(id: string, durationSec: number, onComplete: () => void) {
    this.callbacks.set(id, onComplete);
    
    if (this.useWorker && this.worker) {
      this.worker.postMessage({ type: 'START', id, duration: durationSec });
    } else {
      // Fallback to regular setTimeout
      console.log('[Timer] Using fallback setTimeout for', id);
      const timer = setTimeout(() => {
        const callback = this.callbacks.get(id);
        if (callback) {
          callback();
          this.callbacks.delete(id);
        }
        this.fallbackTimers.delete(id);
      }, durationSec * 1000);
      this.fallbackTimers.set(id, timer);
    }
  }

  cancelTimer(id: string) {
    if (this.useWorker && this.worker) {
      this.worker.postMessage({ type: 'CANCEL', id });
    } else {
      const timer = this.fallbackTimers.get(id);
      if (timer) {
        clearTimeout(timer);
        this.fallbackTimers.delete(id);
      }
    }
    this.callbacks.delete(id);
  }

  pauseTimer(id: string) {
    if (this.useWorker && this.worker) {
      this.worker.postMessage({ type: 'PAUSE', id });
    }
    // Fallback doesn't support pause well
  }

  resumeTimer(id: string) {
    if (this.useWorker && this.worker) {
      this.worker.postMessage({ type: 'RESUME', id });
    }
  }

  addTime(id: string, seconds: number) {
    if (this.useWorker && this.worker) {
      this.worker.postMessage({ type: 'ADD_TIME', id, seconds });
    }
  }
}

// ============================================================================
// TOOLS EXECUTOR CLASS
// ============================================================================

export class ToolsExecutor {
  private timerWorker: TimerWorkerManager;
  private state: JarvisState;
  private onStateChange: (state: JarvisState) => void;
  private onTimerComplete: (timer: SystemTimer) => void;
  private onAlarmTrigger: (alarm: Alarm) => void;
  private onReminderTrigger: (reminder: Reminder) => void;
  
  // External services
  private externalAPIs: ExternalAPIsService;
  private spotify: SpotifyService | null = null;
  private google: GoogleService | null = null;
  private memory: PersistentMemory;
  private routines: RoutinesEngine;
  
  // NEW PHASE 3 SERVICES
  private email: EmailService | null = null;
  private sms: SMSService | null = null;
  // Tesla removed - was not a working integration
  private health: HealthService | null = null;
  private modes: ModesService;
  private intercom: IntercomService;
  private intelligence: ProactiveIntelligence;
  
  // User's stock watchlist
  private stockWatchlist: string[] = [];
  
  // Callbacks for new features
  public onModeChange?: (mode: JarvisMode, message: string) => void;
  public onSmartAlert?: (alert: SmartAlert) => void;
  public onAnnouncement?: (message: string) => void;
  public onVisionRequest?: () => Promise<string>; // Callback to JarvisCore vision
  
  // === PHASE 2: HOLOGRAPHIC DISPLAY SYSTEM ===
  // Callback to trigger visual overlays when tools are called
  public onOverlayUpdate?: (overlay: 'NONE' | 'WEATHER' | 'SYSTEM' | 'CALENDAR' | 'LISTS' | 'STOCKS' | 'MUSIC', data?: any) => void;

  constructor(
    state: JarvisState,
    callbacks: {
      onStateChange: (state: JarvisState) => void;
      onTimerComplete: (timer: SystemTimer) => void;
      onAlarmTrigger: (alarm: Alarm) => void;
      onReminderTrigger: (reminder: Reminder) => void;
    }
  ) {
    this.state = state;
    this.onStateChange = callbacks.onStateChange;
    this.onTimerComplete = callbacks.onTimerComplete;
    this.onAlarmTrigger = callbacks.onAlarmTrigger;
    this.onReminderTrigger = callbacks.onReminderTrigger;
    this.timerWorker = new TimerWorkerManager();
    
    // Initialize services
    this.externalAPIs = new ExternalAPIsService();
    this.memory = new PersistentMemory();
    this.routines = new RoutinesEngine(state);
    
    // Initialize Spotify if configured
    const spotifyClientId = state.userProfile?.preferences?.spotifyClientId;
    if (spotifyClientId) {
      this.spotify = new SpotifyService(spotifyClientId);
    }
    
    // Initialize Google if configured (requires both ID and secret)
    const googleClientId = state.userProfile?.preferences?.googleClientId;
    const googleClientSecret = state.userProfile?.preferences?.googleClientSecret;
    if (googleClientId) {
      this.google = new GoogleService(googleClientId, googleClientSecret || '');
    }
    
    // Initialize Email (uses same Google auth)
    if (googleClientId) {
      this.email = new EmailService();
    }
    
    // Initialize SMS if configured
    const twilioSid = state.userProfile?.preferences?.twilioAccountSid;
    const twilioToken = state.userProfile?.preferences?.twilioAuthToken;
    const twilioPhone = state.userProfile?.preferences?.twilioPhoneNumber;
    if (twilioSid && twilioToken && twilioPhone) {
      this.sms = new SMSService(twilioSid, twilioToken, twilioPhone);
    }
    
    // Initialize Health (Whoop only - Garmin removed as not implemented)
    const whoopClientId = state.userProfile?.preferences?.whoopClientId;
    const whoopClientSecret = state.userProfile?.preferences?.whoopClientSecret;
    if (whoopClientId && whoopClientSecret) {
      this.health = new HealthService({
        whoopClientId,
        whoopClientSecret,
      });
    }
    
    // Initialize Modes service
    this.modes = new ModesService((event) => {
      const message = this.modes.formatModeChangeForSpeech(event);
      this.onModeChange?.(event.newMode, message);
    });
    
    // Initialize Intercom service
    this.intercom = new IntercomService({
      homeAssistantUrl: state.userProfile?.preferences?.homeAssistantUrl,
      homeAssistantToken: state.userProfile?.preferences?.homeAssistantToken,
      onAnnouncement: (announcement) => {
        this.onAnnouncement?.(announcement.message);
      },
    });
    
    // Initialize Proactive Intelligence
    this.intelligence = new ProactiveIntelligence(
      {
        enableLeaveReminders: true,
        enableWeatherAlerts: true,
        enableHealthInsights: true,
        enableEmailDigest: true,
        enablePatternLearning: true,
        commutePrepTime: 15,
        morningBriefingTime: '07:30',
        eveningReviewTime: '21:00',
      },
      (alert) => this.onSmartAlert?.(alert)
    );
    
    // Set up intelligence data providers
    this.setupIntelligenceProviders();
    
    this.loadPersistedData();
    this.startAlarmChecker();
    this.startReminderChecker();
    
    // Start intelligence engine
    this.intelligence.start();
  }
  
  /**
   * Update configuration when settings change
   */
  public updateConfig(profile: UserProfile) {
    console.log('[Tools] Updating config...');
    
    // Update state
    this.state.userProfile = profile;
    
    // Reinitialize Spotify if config changed
    const spotifyClientId = profile.preferences?.spotifyClientId;
    if (spotifyClientId && !this.spotify) {
      this.spotify = new SpotifyService(spotifyClientId);
    }
    
    // Reinitialize Google if config changed
    const googleClientId = profile.preferences?.googleClientId;
    const googleClientSecret = profile.preferences?.googleClientSecret;
    if (googleClientId && googleClientSecret && !this.google) {
      this.google = new GoogleService(googleClientId, googleClientSecret);
    }
    
    // Reinitialize SMS if config changed
    const twilioSid = profile.preferences?.twilioAccountSid;
    const twilioToken = profile.preferences?.twilioAuthToken;
    const twilioPhone = profile.preferences?.twilioPhoneNumber;
    if (twilioSid && twilioToken && twilioPhone && !this.sms) {
      this.sms = new SMSService(twilioSid, twilioToken, twilioPhone);
    }
    
    // Reinitialize Health (Whoop) if config changed
    const whoopClientId = profile.preferences?.whoopClientId;
    const whoopClientSecret = profile.preferences?.whoopClientSecret;
    if (whoopClientId && whoopClientSecret && !this.health) {
      this.health = new HealthService({
        whoopClientId,
        whoopClientSecret,
      });
    }
    
    // Update Home Assistant URL in intercom
    if (profile.preferences?.homeAssistantUrl) {
      // Intercom doesn't have updateConfig, so we just log for now
      console.log('[Tools] Home Assistant URL:', profile.preferences.homeAssistantUrl);
    }
    
    console.log('[Tools] Config updated');
  }
  
  /**
   * Set up data providers for proactive intelligence
   */
  private setupIntelligenceProviders() {
    this.intelligence.setDataProviders({
      getCalendar: async () => {
        if (!this.google?.isAuthenticated()) return undefined;
        try {
          const events = await this.google.getCalendarEvents();
          if (events.length === 0) return undefined;
          
          const now = new Date();
          const todayEvents = events.filter(e => {
            const start = new Date(e.start);
            return start.toDateString() === now.toDateString();
          });
          
          const futureEvents = events.filter(e => new Date(e.start) > now);
          const nextEvent = futureEvents[0];
          
          return {
            todayEvents: todayEvents.map(e => ({
              title: e.title,
              startTime: new Date(e.start),
            })),
            nextEvent: nextEvent ? {
              title: nextEvent.title,
              startTime: new Date(nextEvent.start),
              location: nextEvent.location,
            } : undefined,
          };
        } catch {
          return undefined;
        }
      },
      
      getWeather: async () => {
        try {
          const weather = await this.externalAPIs.getWeather();
          return {
            current: weather.condition,
            temperature: weather.temperature,
            willRain: weather.condition.toLowerCase().includes('rain'),
            alerts: [],
          };
        } catch {
          return undefined;
        }
      },
      
      getHealth: async () => {
        if (!this.health?.isConnected()) return null;
        try {
          return await this.health.getTodaySummary();
        } catch {
          return null;
        }
      },
      
      getEmail: async () => {
        if (!this.email?.isAuthenticated()) return undefined;
        try {
          const unreadCount = await this.email.getUnreadCount();
          const urgent = await this.email.getImportantEmails(5);
          return {
            unreadCount,
            urgentCount: urgent.length,
            needsResponse: [],
          };
        } catch {
          return undefined;
        }
      },
    });
  }

  // ==========================================================================
  // PERSISTENCE
  // ==========================================================================

  private loadPersistedData() {
    try {
      const alarms = localStorage.getItem(STORAGE_KEYS.ALARMS);
      if (alarms) this.state.alarms = JSON.parse(alarms);

      const reminders = localStorage.getItem(STORAGE_KEYS.REMINDERS);
      if (reminders) this.state.reminders = JSON.parse(reminders);

      const lists = localStorage.getItem(STORAGE_KEYS.LISTS);
      if (lists) this.state.lists = JSON.parse(lists);

      const notes = localStorage.getItem(STORAGE_KEYS.NOTES);
      if (notes) this.state.notes = JSON.parse(notes);
      
      const stocks = localStorage.getItem(STORAGE_KEYS.STOCKS_WATCHLIST);
      if (stocks) this.stockWatchlist = JSON.parse(stocks);
    } catch (e) {
      console.error('[Tools] Failed to load persisted data:', e);
    }
  }

  private persist(key: string, data: any) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
      console.error('[Tools] Failed to persist data:', e);
    }
  }

  private updateState(partial: Partial<JarvisState>) {
    this.state = { ...this.state, ...partial };
    this.onStateChange(this.state);
  }

  // ==========================================================================
  // ALARM CHECKER (runs every minute)
  // ==========================================================================

  private startAlarmChecker() {
    setInterval(() => {
      const now = new Date();
      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const currentDay = now.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();

      for (const alarm of this.state.alarms) {
        if (!alarm.enabled) continue;
        if (alarm.time !== currentTime) continue;
        
        if (alarm.days && alarm.days.length > 0) {
          if (!alarm.days.includes(currentDay)) continue;
        }

        this.onAlarmTrigger(alarm);
        
        if (!alarm.recurring) {
          alarm.enabled = false;
          this.persist(STORAGE_KEYS.ALARMS, this.state.alarms);
        }
      }
    }, 60000);
  }

  // ==========================================================================
  // REMINDER CHECKER (runs every 10 seconds for better precision)
  // ==========================================================================

  private startReminderChecker() {
    setInterval(() => {
      const now = Date.now();

      for (const reminder of this.state.reminders) {
        if (reminder.triggered) continue;
        if (reminder.time > now) continue;

        this.onReminderTrigger(reminder);
        reminder.triggered = true;

        if (reminder.recurring && reminder.recurringInterval) {
          reminder.time = now + reminder.recurringInterval;
          reminder.triggered = false;
        }

        this.persist(STORAGE_KEYS.REMINDERS, this.state.reminders);
      }
    }, 10000);
  }

  // ==========================================================================
  // GETTERS FOR SERVICES
  // ==========================================================================
  
  public getMemory(): PersistentMemory {
    return this.memory;
  }
  
  public getRoutines(): RoutinesEngine {
    return this.routines;
  }
  
  public getSpotify(): SpotifyService | null {
    return this.spotify;
  }
  
  public getGoogle(): GoogleService | null {
    return this.google;
  }

  // ==========================================================================
  // TOOL EXECUTION - MAIN ROUTER
  // ==========================================================================

  async execute(call: ToolCall): Promise<string> {
    const { name, arguments: args } = call;

    try {
      switch (name) {
        // --- TIMERS ---
        case 'setTimer': return this.setTimer(args.duration, args.label);
        case 'cancelTimer': return this.cancelTimer(args.label || args.id);
        case 'pauseTimer': return this.pauseTimer(args.label || args.id);
        case 'resumeTimer': return this.resumeTimer(args.label || args.id);
        case 'addTimeToTimer': return this.addTimeToTimer(args.label || args.id, args.seconds);
        case 'getTimers': return this.getTimers();

        // --- ALARMS ---
        case 'setAlarm': return this.setAlarm(args.time, args.label, args.days, args.recurring);
        case 'cancelAlarm': return this.cancelAlarm(args.label || args.id);
        case 'snoozeAlarm': return this.snoozeAlarm(args.label || args.id, args.minutes || 9);
        case 'getAlarms': return this.getAlarms();

        // --- REMINDERS ---
        case 'setReminder': return this.setReminder(args.message, args.time, args.recurring, args.interval);
        case 'cancelReminder': return this.cancelReminder(args.id);
        case 'getReminders': return this.getReminders();

        // --- LISTS ---
        case 'createList': return this.createList(args.name);
        case 'addToList': return this.addToList(args.listName, args.item);
        case 'removeFromList': return this.removeFromList(args.listName, args.item);
        case 'getList': return this.getList(args.listName);
        case 'clearList': return this.clearList(args.listName);

        // --- NOTES ---
        case 'createNote': return this.createNote(args.title, args.content);
        case 'getNote': return this.getNote(args.title);
        case 'deleteNote': return this.deleteNote(args.title);

        // --- WEATHER ---
        case 'getWeather': return this.getWeather(args.location);

        // --- TIME & DATE ---
        case 'getTime': return this.getTime(args.timezone);
        case 'getDate': return this.getDate();

        // --- CALCULATIONS ---
        case 'calculate': return this.calculate(args.expression);
        case 'convert': return this.convert(args.value, args.fromUnit, args.toUnit);

        // --- SMART HOME ---
        case 'controlDevice': return this.controlDevice(args.device, args.action, args.value);
        case 'getDeviceStatus': return this.getDeviceStatus(args.device);
        case 'setScene': return this.setScene(args.sceneName);

        // --- NEWS ---
        case 'getNews': return this.getNews(args.category);
        case 'getHeadlines': return this.getNews('general');

        // --- STOCKS & CRYPTO ---
        case 'getStockPrice': return this.getStockPrice(args.symbol);
        case 'getCryptoPrice': return this.getCryptoPrice(args.symbol);
        case 'getPortfolio': return this.getPortfolio();
        case 'addToWatchlist': return this.addToWatchlist(args.symbol);
        case 'removeFromWatchlist': return this.removeFromWatchlist(args.symbol);

        // --- SPORTS ---
        case 'getSportsScores': return this.getSportsScores(args.league);

        // --- MUSIC (SPOTIFY) ---
        case 'playMusic': return this.playMusic(args.query);
        case 'pauseMusic': return this.pauseMusic();
        case 'resumeMusic': return this.resumeMusic();
        case 'nextTrack': return this.nextTrack();
        case 'previousTrack': return this.previousTrack();
        case 'setVolume': return this.setMusicVolume(args.volume);
        case 'getCurrentTrack': return this.getCurrentTrack();

        // --- CALENDAR ---
        case 'getSchedule': return this.getSchedule(args.when);
        case 'getTodayEvents': return this.getTodayEvents();
        case 'createEvent': return this.createCalendarEvent(args.title, args.time, args.duration, args.description);

        // --- TASKS ---
        case 'getTasks': return this.getTasks();
        case 'addTask': return this.addTask(args.title, args.due);
        case 'completeTask': return this.completeTask(args.title);

        // --- MEMORY ---
        case 'remember': return this.rememberFact(args.information);
        case 'recall': return this.recallMemory(args.query);
        case 'forget': return this.forgetMemory(args.query);

        // --- SYSTEM ---
        case 'getSystemStatus': return this.getSystemStatus();

        // --- EMAIL ---
        case 'getEmails': return this.getEmails(args.count, args.unreadOnly);
        case 'getUnreadCount': return this.getUnreadEmailCount();
        case 'readEmail': return this.readEmail(args.index);
        case 'sendEmail': return this.sendEmail(args.to, args.subject, args.body);
        case 'replyEmail': return this.replyToEmail(args.index, args.body);
        case 'searchEmails': return this.searchEmails(args.query);

        // --- SMS ---
        case 'sendText': return this.sendText(args.to, args.message);
        case 'getTexts': return this.getTextMessages(args.contact);
        case 'addContact': return this.addSmsContact(args.name, args.phone);

        // --- TESLA ---
        case 'getTeslaStatus': 
        case 'lockTesla': 
        case 'unlockTesla': 
        case 'startTeslaClimate': 
        case 'stopTeslaClimate': 
        case 'setTeslaTemp': 
        case 'openTeslaTrunk': 
        case 'openTeslaFrunk': 
        case 'honkTeslaHorn': 
        case 'flashTeslaLights': 
        case 'startTeslaCharging': 
        case 'stopTeslaCharging': 
        case 'setTeslaSentryMode': 
          return "Tesla integration has been removed.";

        // --- HEALTH (WHOOP/GARMIN) ---
        case 'getHealthSummary': return this.getHealthSummary();
        case 'getRecoveryScore': return this.getRecoveryScore();
        case 'getSleepData': return this.getSleepData();
        case 'getActivityData': return this.getActivityData();

        // --- MODES ---
        case 'setMode': return this.setJarvisMode(args.mode);
        case 'getMode': return this.getJarvisMode();
        case 'enableDND': return this.setJarvisMode('dnd');
        case 'disableDND': return this.setJarvisMode('normal');
        case 'enableGuestMode': return this.setJarvisMode('guest');
        case 'enablePartyMode': return this.setJarvisMode('party');
        case 'enableSleepMode': return this.setJarvisMode('sleep');
        case 'enableFocusMode': return this.setJarvisMode('focus');
        case 'enableAwayMode': return this.setJarvisMode('away');

        // --- INTERCOM/BROADCAST ---
        case 'announce': return this.makeAnnouncement(args.message, args.rooms);
        case 'broadcast': return this.broadcast(args.message);
        case 'announceDinner': return this.announceDinner();
        case 'intercom': return this.startIntercom(args.targetRoom);

        // --- MORNING/EVENING BRIEFING ---
        case 'getMorningBriefing': return this.getMorningBriefing();
        case 'getEveningReview': return this.getEveningReview();
        case 'getSmartAlerts': return this.getSmartAlerts();

        // --- VISION ---
        case 'describeScene': return this.describeScene();
        case 'lookAtUser': return this.lookAtUser();

        // --- PHASE 3: SYSTEM CONTROL (Electron Desktop Only) ---
        case 'systemControl': return this.executeSystemControl(args.action, args.appName, args.value);
        case 'openFile': return this.openFileOrFolder(args.path, args.isFolder);
        case 'clipboard': return this.handleClipboard(args.action, args.text);
        case 'getHardwareInfo': return this.getHardwareInfo(args.type);

        // --- PHASE 4: NETWORK DISCOVERY ---
        case 'scanDevices': return this.scanNetworkDevices();
        case 'getNetworkInfo': return this.getLocalNetworkInfo();

        // --- PHASE 5: DEVICE PAIRING ---
        case 'pairHueBridge': return this.pairHueBridge(args.ip);
        case 'controlHueLights': return this.controlHueLights(args.action, args.brightness, args.room);

        // --- PHASE 7: DESKTOP VISION ---
        case 'analyzeScreen': return this.analyzeScreen(args.prompt);
        case 'captureScreen': return this.captureScreen(args.type);

        // --- PHASE 8: HOME ASSISTANT ---
        case 'haControl': return this.haControl(args.action, args.device, args.area, args.brightness, args.temperature);
        case 'haSetup': return this.haSetup(args.url, args.token);

        default:
          return `Unknown tool: ${name}`;
      }
    } catch (error) {
      console.error(`[Tools] Error executing ${name}:`, error);
      return `Error executing ${name}: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  // ==========================================================================
  // TIMER IMPLEMENTATIONS
  // ==========================================================================

  private setTimer(duration: number, label?: string): string {
    const id = crypto.randomUUID();
    const timerLabel = label || `Timer ${this.state.timers.length + 1}`;
    
    const timer: SystemTimer = {
      id,
      label: timerLabel,
      duration,
      remaining: duration,
      status: 'RUNNING',
      createdAt: Date.now(),
    };

    this.state.timers.push(timer);
    this.updateState({ timers: [...this.state.timers] });

    this.timerWorker.createTimer(id, duration, () => {
      const t = this.state.timers.find(x => x.id === id);
      if (t) {
        t.status = 'COMPLETED';
        t.remaining = 0;
        this.onTimerComplete(t);
        this.updateState({ timers: [...this.state.timers] });
      }
    });

    this.startTimerCountdown(id);

    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;
    const timeStr = minutes > 0 
      ? `${minutes} minute${minutes !== 1 ? 's' : ''}${seconds > 0 ? ` and ${seconds} seconds` : ''}` 
      : `${seconds} seconds`;
    
    return `Timer "${timerLabel}" set for ${timeStr}.`;
  }

  private startTimerCountdown(id: string) {
    const interval = setInterval(() => {
      const timer = this.state.timers.find(t => t.id === id);
      if (!timer || timer.status !== 'RUNNING') {
        clearInterval(interval);
        return;
      }
      timer.remaining = Math.max(0, timer.remaining - 1);
      this.updateState({ timers: [...this.state.timers] });
    }, 1000);
  }

  private cancelTimer(identifier: string): string {
    const timer = this.state.timers.find(t => 
      t.id === identifier || t.label.toLowerCase().includes(identifier.toLowerCase())
    );
    
    if (!timer) return `No timer found matching "${identifier}".`;

    this.timerWorker.cancelTimer(timer.id);
    this.state.timers = this.state.timers.filter(t => t.id !== timer.id);
    this.updateState({ timers: [...this.state.timers] });
    
    return `Timer "${timer.label}" cancelled.`;
  }

  private pauseTimer(identifier: string): string {
    const timer = this.state.timers.find(t => 
      t.id === identifier || t.label.toLowerCase().includes(identifier.toLowerCase())
    );
    
    if (!timer) return `No timer found matching "${identifier}".`;
    if (timer.status !== 'RUNNING') return `Timer "${timer.label}" is not running.`;

    this.timerWorker.pauseTimer(timer.id);
    timer.status = 'PAUSED';
    this.updateState({ timers: [...this.state.timers] });
    
    const mins = Math.floor(timer.remaining / 60);
    const secs = timer.remaining % 60;
    return `Timer "${timer.label}" paused with ${mins > 0 ? `${mins} minutes and ` : ''}${secs} seconds remaining.`;
  }

  private resumeTimer(identifier: string): string {
    const timer = this.state.timers.find(t => 
      t.id === identifier || t.label.toLowerCase().includes(identifier.toLowerCase())
    );
    
    if (!timer) return `No timer found matching "${identifier}".`;
    if (timer.status !== 'PAUSED') return `Timer "${timer.label}" is not paused.`;

    this.timerWorker.resumeTimer(timer.id);
    timer.status = 'RUNNING';
    this.startTimerCountdown(timer.id);
    this.updateState({ timers: [...this.state.timers] });
    
    return `Timer "${timer.label}" resumed.`;
  }

  private addTimeToTimer(identifier: string, seconds: number): string {
    const timer = this.state.timers.find(t => 
      t.id === identifier || t.label.toLowerCase().includes(identifier.toLowerCase())
    );
    
    if (!timer) return `No timer found matching "${identifier}".`;

    this.timerWorker.addTime(timer.id, seconds);
    timer.remaining += seconds;
    timer.duration += seconds;
    this.updateState({ timers: [...this.state.timers] });
    
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    const addedStr = mins > 0 ? `${mins} minutes` : `${secs} seconds`;
    return `Added ${addedStr} to "${timer.label}".`;
  }

  private getTimers(): string {
    if (this.state.timers.length === 0) {
      return 'No active timers.';
    }

    const timerList = this.state.timers.map(t => {
      const mins = Math.floor(t.remaining / 60);
      const secs = t.remaining % 60;
      const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
      return `${t.label}: ${timeStr} remaining (${t.status.toLowerCase()})`;
    }).join('; ');

    return `Active timers: ${timerList}`;
  }

  // ==========================================================================
  // ALARM IMPLEMENTATIONS
  // ==========================================================================

  private setAlarm(time: string, label?: string, days?: string[], recurring?: boolean): string {
    const id = crypto.randomUUID();
    const alarmLabel = label || `Alarm at ${time}`;

    const alarm: Alarm = {
      id,
      time,
      label: alarmLabel,
      enabled: true,
      recurring: recurring || (days && days.length > 0) || false,
      days: days || [],
      createdAt: Date.now(),
    };

    this.state.alarms.push(alarm);
    this.persist(STORAGE_KEYS.ALARMS, this.state.alarms);
    this.updateState({ alarms: [...this.state.alarms] });

    const dayStr = days && days.length > 0 ? ` on ${days.join(', ')}` : '';
    return `Alarm "${alarmLabel}" set for ${time}${dayStr}.`;
  }

  private cancelAlarm(identifier: string): string {
    const alarm = this.state.alarms.find(a => 
      a.id === identifier || a.label.toLowerCase().includes(identifier.toLowerCase())
    );
    
    if (!alarm) return `No alarm found matching "${identifier}".`;

    this.state.alarms = this.state.alarms.filter(a => a.id !== alarm.id);
    this.persist(STORAGE_KEYS.ALARMS, this.state.alarms);
    this.updateState({ alarms: [...this.state.alarms] });
    
    return `Alarm "${alarm.label}" cancelled.`;
  }

  private snoozeAlarm(identifier: string, minutes: number): string {
    const alarm = this.state.alarms.find(a => 
      a.id === identifier || a.label.toLowerCase().includes(identifier.toLowerCase())
    );
    
    if (!alarm) return `No alarm found matching "${identifier}".`;

    const snoozeTime = new Date(Date.now() + minutes * 60 * 1000);
    const newTime = `${String(snoozeTime.getHours()).padStart(2, '0')}:${String(snoozeTime.getMinutes()).padStart(2, '0')}`;
    
    return this.setAlarm(newTime, `${alarm.label} (snoozed)`, [], false);
  }

  private getAlarms(): string {
    const enabledAlarms = this.state.alarms.filter(a => a.enabled);
    
    if (enabledAlarms.length === 0) {
      return 'No alarms set.';
    }

    const alarmList = enabledAlarms.map(a => {
      const dayStr = a.days && a.days.length > 0 ? ` (${a.days.join(', ')})` : '';
      return `${a.label}: ${a.time}${dayStr}`;
    }).join('; ');

    return `Active alarms: ${alarmList}`;
  }

  // ==========================================================================
  // REMINDER IMPLEMENTATIONS
  // ==========================================================================

  private setReminder(message: string, time: string, recurring?: boolean, interval?: string): string {
    const id = crypto.randomUUID();
    const timeLower = time.toLowerCase();
    let triggerTime: number;
    
    if (timeLower.includes('second')) {
      const seconds = parseInt(time.match(/(\d+)/)?.[1] || '0');
      triggerTime = Date.now() + seconds * 1000;
    } else if (timeLower.includes('minute')) {
      const minutes = parseInt(time.match(/(\d+)/)?.[1] || '0');
      triggerTime = Date.now() + minutes * 60 * 1000;
    } else if (timeLower.includes('hour')) {
      const hours = parseInt(time.match(/(\d+)/)?.[1] || '0');
      triggerTime = Date.now() + hours * 60 * 60 * 1000;
    } else if (time.includes(':')) {
      const [hours, mins] = time.split(':').map(Number);
      const target = new Date();
      target.setHours(hours, mins, 0, 0);
      if (target.getTime() < Date.now()) {
        target.setDate(target.getDate() + 1);
      }
      triggerTime = target.getTime();
    } else {
      const num = parseInt(time.match(/(\d+)/)?.[1] || '5');
      triggerTime = Date.now() + num * 60 * 1000;
    }

    let recurringInterval: number | undefined;
    if (recurring && interval) {
      if (interval.includes('day')) recurringInterval = 24 * 60 * 60 * 1000;
      else if (interval.includes('hour')) recurringInterval = 60 * 60 * 1000;
      else if (interval.includes('week')) recurringInterval = 7 * 24 * 60 * 60 * 1000;
    }

    const reminder: Reminder = {
      id,
      message,
      time: triggerTime,
      recurring: recurring || false,
      recurringInterval,
      triggered: false,
      createdAt: Date.now(),
    };

    this.state.reminders.push(reminder);
    this.persist(STORAGE_KEYS.REMINDERS, this.state.reminders);
    this.updateState({ reminders: [...this.state.reminders] });

    const timeFromNow = triggerTime - Date.now();
    let timeStr: string;
    if (timeFromNow < 60000) {
      timeStr = `${Math.round(timeFromNow / 1000)} seconds`;
    } else if (timeFromNow < 3600000) {
      timeStr = `${Math.round(timeFromNow / 60000)} minutes`;
    } else {
      timeStr = `${Math.round(timeFromNow / 3600000)} hours`;
    }
    
    return `Reminder set: "${message}" in ${timeStr}.`;
  }

  private cancelReminder(identifier: string): string {
    let reminder = this.state.reminders.find(r => r.id === identifier);
    
    if (!reminder) {
      reminder = this.state.reminders.find(r => 
        r.message.toLowerCase().includes(identifier.toLowerCase())
      );
    }
    
    if (!reminder) return `No reminder found matching "${identifier}".`;

    this.state.reminders = this.state.reminders.filter(r => r.id !== reminder!.id);
    this.persist(STORAGE_KEYS.REMINDERS, this.state.reminders);
    this.updateState({ reminders: [...this.state.reminders] });
    
    return `Reminder "${reminder.message}" cancelled.`;
  }

  private getReminders(): string {
    const pending = this.state.reminders.filter(r => !r.triggered);
    
    if (pending.length === 0) {
      return 'No pending reminders.';
    }

    const list = pending.map(r => {
      const timeFromNow = r.time - Date.now();
      let timeStr: string;
      if (timeFromNow < 60000) {
        timeStr = `${Math.round(timeFromNow / 1000)} seconds`;
      } else if (timeFromNow < 3600000) {
        timeStr = `${Math.round(timeFromNow / 60000)} minutes`;
      } else {
        timeStr = `${Math.round(timeFromNow / 3600000)} hours`;
      }
      return `"${r.message}" in ${timeStr}`;
    }).join('; ');

    return `Pending reminders: ${list}`;
  }

  // ==========================================================================
  // LIST IMPLEMENTATIONS
  // ==========================================================================

  private createList(name: string): string {
    const normalized = name.toLowerCase();
    if (this.state.lists[normalized]) {
      return `List "${name}" already exists.`;
    }

    this.state.lists[normalized] = [];
    this.persist(STORAGE_KEYS.LISTS, this.state.lists);
    this.updateState({ lists: { ...this.state.lists } });
    
    return `List "${name}" created.`;
  }

  private addToList(listName: string, item: string): string {
    const normalized = listName.toLowerCase();
    
    if (!this.state.lists[normalized]) {
      this.state.lists[normalized] = [];
    }

    const listItem: ListItem = {
      id: crypto.randomUUID(),
      content: item,
      completed: false,
      createdAt: Date.now(),
    };

    this.state.lists[normalized].push(listItem);
    this.persist(STORAGE_KEYS.LISTS, this.state.lists);
    this.updateState({ lists: { ...this.state.lists } });
    
    return `Added "${item}" to ${listName} list.`;
  }

  private removeFromList(listName: string, item: string): string {
    const normalized = listName.toLowerCase();
    const list = this.state.lists[normalized];
    
    if (!list) return `List "${listName}" not found.`;

    const index = list.findIndex(i => 
      i.content.toLowerCase().includes(item.toLowerCase())
    );
    
    if (index === -1) return `Item "${item}" not found in ${listName}.`;

    const removed = list.splice(index, 1)[0];
    this.persist(STORAGE_KEYS.LISTS, this.state.lists);
    this.updateState({ lists: { ...this.state.lists } });
    
    return `Removed "${removed.content}" from ${listName}.`;
  }

  private getList(listName: string): string {
    const normalized = listName.toLowerCase();
    const list = this.state.lists[normalized];
    
    if (!list || list.length === 0) {
      return `${listName} list is empty.`;
    }

    // === PHASE 2: TRIGGER HOLOGRAPHIC DISPLAY ===
    // Project the list onto the screen
    if (this.onOverlayUpdate) {
      this.onOverlayUpdate('LISTS', {
        listName: listName,
        items: list,
      });
    }

    const items = list.filter(i => !i.completed).map(i => i.content).join(', ');
    return `${listName} list: ${items}`;
  }

  private clearList(listName: string): string {
    const normalized = listName.toLowerCase();
    
    if (!this.state.lists[normalized]) {
      return `List "${listName}" not found.`;
    }

    this.state.lists[normalized] = [];
    this.persist(STORAGE_KEYS.LISTS, this.state.lists);
    this.updateState({ lists: { ...this.state.lists } });
    
    return `${listName} list cleared.`;
  }

  // ==========================================================================
  // NOTES IMPLEMENTATIONS
  // ==========================================================================

  private createNote(title: string, content: string): string {
    this.state.notes[title.toLowerCase()] = {
      title,
      content,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    
    this.persist(STORAGE_KEYS.NOTES, this.state.notes);
    this.updateState({ notes: { ...this.state.notes } });
    
    return `Note "${title}" saved.`;
  }

  private getNote(title: string): string {
    const note = this.state.notes[title.toLowerCase()];
    if (!note) return `Note "${title}" not found.`;
    return `Note "${note.title}": ${note.content}`;
  }

  private deleteNote(title: string): string {
    if (!this.state.notes[title.toLowerCase()]) {
      return `Note "${title}" not found.`;
    }

    delete this.state.notes[title.toLowerCase()];
    this.persist(STORAGE_KEYS.NOTES, this.state.notes);
    this.updateState({ notes: { ...this.state.notes } });
    
    return `Note "${title}" deleted.`;
  }

  // ==========================================================================
  // WEATHER
  // ==========================================================================

  private async getWeather(location?: string): Promise<string> {
    try {
      let lat: number, lng: number;
      
      if (location) {
        lat = this.state.userProfile?.lat || 0;
        lng = this.state.userProfile?.lng || 0;
      } else {
        const coords = await BrowserHardware.getLocation();
        if (!coords) {
          return 'Unable to determine location for weather.';
        }
        lat = coords.lat;
        lng = coords.lng;
      }

      const unit = this.state.userProfile?.preferences.tempUnit || 'fahrenheit';
      const weather = await RealExternalAPIs.fetchWeather(lat, lng, unit);
      
      // === PHASE 2: TRIGGER HOLOGRAPHIC DISPLAY ===
      // Project weather data onto the screen while speaking
      if (this.onOverlayUpdate) {
        this.onOverlayUpdate('WEATHER', {
          temp: weather.temp,
          condition: weather.condition,
          humidity: weather.humidity,
          wind: weather.wind,
          windSpeed: weather.wind,
          location: this.state.userProfile?.location || 'Current Location',
          feelsLike: weather.feelsLike,
        });
      }
      
      return `Currently ${weather.temp}° and ${weather.condition}. Humidity is ${weather.humidity}%, wind at ${weather.wind} mph.`;
    } catch (error) {
      return 'Unable to fetch weather data.';
    }
  }

  // ==========================================================================
  // TIME & DATE
  // ==========================================================================

  private getTime(timezone?: string): string {
    const options: Intl.DateTimeFormatOptions = {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    };
    
    if (timezone) {
      options.timeZone = timezone;
    }

    const time = new Date().toLocaleTimeString('en-US', options);
    return `The time is ${time}.`;
  }

  private getDate(): string {
    const date = new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    return `Today is ${date}.`;
  }

  // ==========================================================================
  // CALCULATIONS
  // ==========================================================================

  private calculate(expression: string): string {
    try {
      const sanitized = expression.replace(/[^0-9+\-*/().%\s]/g, '');
      const result = Function(`'use strict'; return (${sanitized})`)();
      return `${expression} equals ${result}`;
    } catch {
      return `Unable to calculate "${expression}".`;
    }
  }

  private convert(value: number, fromUnit: string, toUnit: string): string {
    const conversions: Record<string, Record<string, number>> = {
      'miles': { 'kilometers': 1.60934, 'meters': 1609.34, 'feet': 5280 },
      'kilometers': { 'miles': 0.621371, 'meters': 1000, 'feet': 3280.84 },
      'meters': { 'feet': 3.28084, 'inches': 39.3701, 'centimeters': 100 },
      'feet': { 'meters': 0.3048, 'inches': 12, 'centimeters': 30.48 },
      'pounds': { 'kilograms': 0.453592, 'ounces': 16, 'grams': 453.592 },
      'kilograms': { 'pounds': 2.20462, 'grams': 1000, 'ounces': 35.274 },
      'gallons': { 'liters': 3.78541, 'quarts': 4, 'pints': 8 },
      'liters': { 'gallons': 0.264172, 'milliliters': 1000 },
    };

    if (fromUnit.toLowerCase().includes('celsius') || fromUnit.toLowerCase().includes('fahrenheit')) {
      const from = fromUnit.toLowerCase();
      const to = toUnit.toLowerCase();
      
      if (from.includes('celsius') && to.includes('fahrenheit')) {
        const result = (value * 9/5) + 32;
        return `${value}°C is ${result.toFixed(1)}°F`;
      }
      if (from.includes('fahrenheit') && to.includes('celsius')) {
        const result = (value - 32) * 5/9;
        return `${value}°F is ${result.toFixed(1)}°C`;
      }
    }

    const fromLower = fromUnit.toLowerCase();
    const toLower = toUnit.toLowerCase();
    
    if (conversions[fromLower]?.[toLower]) {
      const result = value * conversions[fromLower][toLower];
      return `${value} ${fromUnit} is ${result.toFixed(2)} ${toUnit}`;
    }

    return `Unable to convert ${fromUnit} to ${toUnit}.`;
  }

  // ==========================================================================
  // SMART HOME
  // ==========================================================================

  private async controlDevice(device: string, action: string, value?: any): Promise<string> {
    const url = this.state.userProfile?.preferences.homeAssistantUrl;
    const token = this.state.userProfile?.preferences.homeAssistantToken;

    if (!url || !token) {
      return 'Smart home is not configured. Please set up Home Assistant URL and token in settings.';
    }

    // Find device by name
    const foundDevice = this.state.smartHome.find(d => 
      d.name.toLowerCase().includes(device.toLowerCase())
    );

    const entityId = foundDevice?.id || device;
    
    // Determine domain from entity_id or guess from device type
    let domain = 'switch';
    if (entityId.includes('.')) {
      domain = entityId.split('.')[0];
    } else if (foundDevice?.type) {
      const typeMap: Record<string, string> = {
        'light': 'light',
        'switch': 'switch',
        'lock': 'lock',
        'fan': 'fan',
        'cover': 'cover',
        'thermostat': 'climate',
        'climate': 'climate',
      };
      domain = typeMap[foundDevice.type] || 'switch';
    }

    // Build service call
    let service = action.replace('turn_', '').replace('_', '');
    if (action === 'turn_on') service = 'turn_on';
    if (action === 'turn_off') service = 'turn_off';
    if (action === 'toggle') service = 'toggle';

    const payload: any = { entity_id: entityId };
    
    // Handle brightness for lights
    if (domain === 'light' && value !== undefined) {
      payload.brightness_pct = value;
    }
    
    // Handle thermostat temperature
    if (domain === 'climate' && value !== undefined) {
      service = 'set_temperature';
      payload.temperature = value;
    }

    try {
      const response = await fetch(`${url}/api/services/${domain}/${service}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[HA] Service call failed:', errorText);
        return `Failed to control ${device}. Home Assistant returned error: ${response.status}`;
      }

      // Update local state
      if (foundDevice) {
        if (action === 'turn_on') foundDevice.status = 'on';
        else if (action === 'turn_off') foundDevice.status = 'off';
        else if (action === 'lock') foundDevice.status = 'locked';
        else if (action === 'unlock') foundDevice.status = 'unlocked';
        
        if (value !== undefined) foundDevice.value = value;
        
        this.updateState({ smartHome: [...this.state.smartHome] });
      }
      
      return `Done. ${foundDevice?.name || device} ${action.replace('_', ' ')}.`;
    } catch (error) {
      console.error('[HA] Control error:', error);
      return `Failed to control ${device}. Check your Home Assistant configuration.`;
    }
  }

  private getDeviceStatus(device: string): string {
    const foundDevice = this.state.smartHome.find(d => 
      d.name.toLowerCase().includes(device.toLowerCase())
    );

    if (!foundDevice) {
      return `Device "${device}" not found.`;
    }

    let status = `${foundDevice.name} is ${foundDevice.status}`;
    if (foundDevice.value !== undefined) {
      status += ` (${foundDevice.value})`;
    }
    
    return status;
  }

  private async setScene(sceneName: string): Promise<string> {
    const url = this.state.userProfile?.preferences.homeAssistantUrl;
    const token = this.state.userProfile?.preferences.homeAssistantToken;

    if (!url || !token) {
      return 'Smart home is not configured.';
    }

    const entityId = sceneName.startsWith('scene.') 
      ? sceneName 
      : `scene.${sceneName.toLowerCase().replace(/\s/g, '_')}`;

    try {
      const response = await fetch(`${url}/api/services/scene/turn_on`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ entity_id: entityId }),
      });

      if (!response.ok) {
        return `Failed to activate scene "${sceneName}".`;
      }

      return `Scene "${sceneName}" activated.`;
    } catch (error) {
      console.error('[HA] Scene error:', error);
      return `Failed to activate scene "${sceneName}".`;
    }
  }

  // ==========================================================================
  // NEWS
  // ==========================================================================

  // Store last fetched news for UI display
  private lastFetchedNews: any[] = [];

  private async getNews(category?: string): Promise<string> {
    const cat = (category?.toLowerCase() || 'general') as any;
    const news = await this.externalAPIs.getNews(cat, 6);
    
    // Store for UI access
    this.lastFetchedNews = news;
    
    // Emit event so UI can show the news display
    if (this.onNewsUpdate) {
      this.onNewsUpdate(news, cat);
    }
    
    return this.externalAPIs.formatNewsForSpeech(news);
  }

  // Callback for when news is fetched (set by JarvisCore/App)
  public onNewsUpdate?: (news: any[], category: string) => void;

  // Get the last fetched news (for UI access)
  public getLastFetchedNews(): any[] {
    return this.lastFetchedNews;
  }

  // ==========================================================================
  // STOCKS & CRYPTO
  // ==========================================================================

  private async getStockPrice(symbol: string): Promise<string> {
    const quote = await this.externalAPIs.getStockQuote(symbol);
    if (!quote) {
      return `Unable to get quote for ${symbol}.`;
    }
    return this.externalAPIs.formatStockForSpeech(quote);
  }

  private async getCryptoPrice(symbol: string): Promise<string> {
    const quote = await this.externalAPIs.getCryptoPrice(symbol);
    if (!quote) {
      return `Unable to get price for ${symbol}.`;
    }
    const direction = quote.changePercent >= 0 ? 'up' : 'down';
    return `${quote.name} is at $${quote.price.toLocaleString()}, ${direction} ${Math.abs(quote.changePercent)}% in the last 24 hours.`;
  }

  private async getPortfolio(): Promise<string> {
    if (this.stockWatchlist.length === 0) {
      return "Your watchlist is empty. Add stocks with 'add Tesla to my watchlist'.";
    }
    
    const quotes = await this.externalAPIs.getPortfolio(this.stockWatchlist);
    if (quotes.length === 0) {
      return "Unable to fetch portfolio data.";
    }
    
    const summary = quotes.map(q => {
      const direction = q.change >= 0 ? 'up' : 'down';
      return `${q.symbol} at $${q.price} (${direction} ${Math.abs(q.changePercent)}%)`;
    }).join('; ');
    
    return `Your watchlist: ${summary}`;
  }

  private addToWatchlist(symbol: string): string {
    const upper = symbol.toUpperCase();
    if (this.stockWatchlist.includes(upper)) {
      return `${upper} is already in your watchlist.`;
    }
    this.stockWatchlist.push(upper);
    this.persist(STORAGE_KEYS.STOCKS_WATCHLIST, this.stockWatchlist);
    return `Added ${upper} to your watchlist.`;
  }

  private removeFromWatchlist(symbol: string): string {
    const upper = symbol.toUpperCase();
    const index = this.stockWatchlist.indexOf(upper);
    if (index === -1) {
      return `${upper} is not in your watchlist.`;
    }
    this.stockWatchlist.splice(index, 1);
    this.persist(STORAGE_KEYS.STOCKS_WATCHLIST, this.stockWatchlist);
    return `Removed ${upper} from your watchlist.`;
  }

  // ==========================================================================
  // SPORTS
  // ==========================================================================

  private async getSportsScores(league?: string): Promise<string> {
    const scores = await this.externalAPIs.getSportsScores(league || 'nfl');
    return this.externalAPIs.formatSportsForSpeech(scores);
  }

  // ==========================================================================
  // MUSIC (SPOTIFY)
  // ==========================================================================

  private async playMusic(query: string): Promise<string> {
    if (!this.spotify) {
      return "Spotify is not configured. Add your Spotify Client ID in settings to enable music control.";
    }
    if (!this.spotify.isAuthenticated()) {
      return "Please connect your Spotify account in settings first.";
    }
    return this.spotify.playByQuery(query);
  }

  private async pauseMusic(): Promise<string> {
    if (!this.spotify?.isAuthenticated()) {
      return "Spotify is not connected.";
    }
    const success = await this.spotify.pause();
    return success ? "Music paused." : "Failed to pause music.";
  }

  private async resumeMusic(): Promise<string> {
    if (!this.spotify?.isAuthenticated()) {
      return "Spotify is not connected.";
    }
    const success = await this.spotify.play();
    return success ? "Resuming playback." : "Failed to resume music.";
  }

  private async nextTrack(): Promise<string> {
    if (!this.spotify?.isAuthenticated()) {
      return "Spotify is not connected.";
    }
    const success = await this.spotify.next();
    return success ? "Skipping to next track." : "Failed to skip track.";
  }

  private async previousTrack(): Promise<string> {
    if (!this.spotify?.isAuthenticated()) {
      return "Spotify is not connected.";
    }
    const success = await this.spotify.previous();
    return success ? "Going to previous track." : "Failed to go back.";
  }

  private async setMusicVolume(volume: number): Promise<string> {
    if (!this.spotify?.isAuthenticated()) {
      return "Spotify is not connected.";
    }
    const success = await this.spotify.setVolume(volume);
    return success ? `Volume set to ${volume}%.` : "Failed to set volume.";
  }

  private async getCurrentTrack(): Promise<string> {
    if (!this.spotify?.isAuthenticated()) {
      return "Spotify is not connected.";
    }
    const track = await this.spotify.getCurrentlyPlaying();
    if (!track) {
      return "Nothing is currently playing.";
    }
    return this.spotify.formatTrackForSpeech(track);
  }

  // ==========================================================================
  // CALENDAR
  // ==========================================================================

  private async getSchedule(when?: string): Promise<string> {
    if (!this.google?.isAuthenticated()) {
      return "Google Calendar is not connected. Add your Google Client ID in settings.";
    }
    
    const lower = (when || 'today').toLowerCase();
    let events;
    
    if (lower.includes('tomorrow')) {
      events = await this.google.getTomorrowEvents();
    } else {
      events = await this.google.getTodayEvents();
    }
    
    // === PHASE 2: TRIGGER HOLOGRAPHIC DISPLAY ===
    // Project calendar onto the screen
    if (this.onOverlayUpdate && events.length > 0) {
      this.onOverlayUpdate('CALENDAR', { events });
    }
    
    return this.google.formatEventsForSpeech(events);
  }

  private async getTodayEvents(): Promise<string> {
    return this.getSchedule('today');
  }

  private async createCalendarEvent(title: string, time: string, duration?: number, description?: string): Promise<string> {
    if (!this.google?.isAuthenticated()) {
      return "Google Calendar is not connected.";
    }
    
    // Parse time
    let startTime: Date;
    const now = new Date();
    
    if (time.includes(':')) {
      const [hours, mins] = time.split(':').map(Number);
      startTime = new Date();
      startTime.setHours(hours, mins, 0, 0);
      if (startTime < now) {
        startTime.setDate(startTime.getDate() + 1);
      }
    } else {
      // Try to parse natural language
      startTime = new Date(time);
      if (isNaN(startTime.getTime())) {
        return `Unable to parse time "${time}". Please use HH:MM format.`;
      }
    }
    
    const endTime = duration 
      ? new Date(startTime.getTime() + duration * 60 * 1000)
      : new Date(startTime.getTime() + 60 * 60 * 1000);
    
    const event = await this.google.createEvent(title, startTime, endTime, description);
    
    if (event) {
      const timeStr = startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      return `Event "${title}" created for ${timeStr}.`;
    }
    return "Failed to create calendar event.";
  }

  // ==========================================================================
  // TASKS
  // ==========================================================================

  private async getTasks(): Promise<string> {
    if (!this.google?.isAuthenticated()) {
      return "Google Tasks is not connected. Add your Google Client ID in settings.";
    }
    
    const tasks = await this.google.getTasks();
    return this.google.formatTasksForSpeech(tasks);
  }

  private async addTask(title: string, due?: string): Promise<string> {
    if (!this.google?.isAuthenticated()) {
      return "Google Tasks is not connected.";
    }
    
    let dueDate: Date | undefined;
    if (due) {
      if (due.toLowerCase().includes('tomorrow')) {
        dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 1);
      } else if (due.includes(':') || due.includes('-')) {
        dueDate = new Date(due);
      }
    }
    
    const task = await this.google.createTask(title, '@default', undefined, dueDate);
    return task ? `Task "${title}" added.` : "Failed to create task.";
  }

  private async completeTask(title: string): Promise<string> {
    if (!this.google?.isAuthenticated()) {
      return "Google Tasks is not connected.";
    }
    
    const tasks = await this.google.getTasks();
    const task = tasks.find(t => t.title.toLowerCase().includes(title.toLowerCase()));
    
    if (!task) {
      return `Task "${title}" not found.`;
    }
    
    const success = await this.google.completeTask(task.id);
    return success ? `Task "${task.title}" marked complete.` : "Failed to complete task.";
  }

  // ==========================================================================
  // MEMORY
  // ==========================================================================

  private rememberFact(information: string): string {
    const memory = this.memory.remember(information);
    return `I'll remember that. (${memory.type.toLowerCase()})`;
  }

  private recallMemory(query: string): string {
    const results = this.memory.search(query, 3);
    
    if (results.length === 0) {
      return `I don't have any information about "${query}".`;
    }
    
    const memories = results.map(r => r.memory.content).join('. ');
    return `Here's what I know: ${memories}`;
  }

  private forgetMemory(query: string): string {
    const count = this.memory.forgetByQuery(query);
    if (count === 0) {
      return `I don't have any memories matching "${query}".`;
    }
    return `Forgotten ${count} related memory${count > 1 ? 's' : ''}.`;
  }

  // ==========================================================================
  // SYSTEM STATUS
  // ==========================================================================

  private async getSystemStatus(): Promise<string> {
    const battery = await BrowserHardware.getBatteryLevel();
    const online = BrowserHardware.isOnline();
    const timerCount = this.state.timers.length;
    const alarmCount = this.state.alarms.filter(a => a.enabled).length;
    const reminderCount = this.state.reminders.filter(r => !r.triggered).length;
    
    // === PHASE 2: TRIGGER HOLOGRAPHIC DISPLAY ===
    // Project system diagnostics onto the screen
    if (this.onOverlayUpdate) {
      this.onOverlayUpdate('SYSTEM', {
        battery,
        online,
        timerCount,
        alarmCount,
        reminderCount,
      });
    }
    
    const parts: string[] = [];
    parts.push(`System online`);
    parts.push(`battery at ${battery}%`);
    parts.push(online ? 'network connected' : 'network offline');
    
    if (timerCount > 0) parts.push(`${timerCount} active timer${timerCount > 1 ? 's' : ''}`);
    if (alarmCount > 0) parts.push(`${alarmCount} alarm${alarmCount > 1 ? 's' : ''} set`);
    if (reminderCount > 0) parts.push(`${reminderCount} pending reminder${reminderCount > 1 ? 's' : ''}`);
    
    return `Status report: ${parts.join(', ')}.`;
  }

  // ==========================================================================
  // EMAIL IMPLEMENTATIONS
  // ==========================================================================

  private cachedEmails: Email[] = [];

  private async getEmails(count: number = 5, unreadOnly: boolean = false): Promise<string> {
    if (!this.email?.isAuthenticated()) {
      return "Email is not connected. Please set up Google integration in settings.";
    }

    try {
      const emails = await this.email.getInbox(count, unreadOnly);
      this.cachedEmails = emails;
      
      if (emails.length === 0) {
        return unreadOnly ? "No unread emails." : "Your inbox is empty.";
      }

      const unreadCount = await this.email.getUnreadCount();
      return this.email.formatInboxSummary(emails, unreadCount);
    } catch (e) {
      return "Failed to fetch emails.";
    }
  }

  private async getUnreadEmailCount(): Promise<string> {
    if (!this.email?.isAuthenticated()) {
      return "Email is not connected.";
    }

    try {
      const count = await this.email.getUnreadCount();
      if (count === 0) {
        return "No unread emails, sir.";
      }
      return `You have ${count} unread email${count !== 1 ? 's' : ''}.`;
    } catch (e) {
      return "Failed to check email count.";
    }
  }

  private async readEmail(index: number): Promise<string> {
    if (!this.email?.isAuthenticated()) {
      return "Email is not connected.";
    }

    if (this.cachedEmails.length === 0) {
      return "No emails loaded. Ask me to check your emails first.";
    }

    const email = this.cachedEmails[index - 1]; // 1-indexed for user
    if (!email) {
      return `Email ${index} not found. I have ${this.cachedEmails.length} emails loaded.`;
    }

    const body = email.body.substring(0, 500);
    return `Email from ${email.fromName}: Subject "${email.subject}". ${body}${email.body.length > 500 ? '...' : ''}`;
  }

  private async sendEmail(to: string, subject: string, body: string): Promise<string> {
    if (!this.email?.isAuthenticated()) {
      return "Email is not connected.";
    }

    try {
      await this.email.sendEmail({ to, subject, body });
      return `Email sent to ${to}.`;
    } catch (e) {
      return `Failed to send email: ${e instanceof Error ? e.message : 'Unknown error'}`;
    }
  }

  private async replyToEmail(index: number, body: string): Promise<string> {
    if (!this.email?.isAuthenticated()) {
      return "Email is not connected.";
    }

    const email = this.cachedEmails[index - 1];
    if (!email) {
      return "Email not found. Ask me to check your emails first.";
    }

    try {
      await this.email.replyToEmail(email, body);
      return `Reply sent to ${email.fromName}.`;
    } catch (e) {
      return "Failed to send reply.";
    }
  }

  private async searchEmails(query: string): Promise<string> {
    if (!this.email?.isAuthenticated()) {
      return "Email is not connected.";
    }

    try {
      const emails = await this.email.searchEmails(query, 5);
      this.cachedEmails = emails;
      
      if (emails.length === 0) {
        return `No emails found matching "${query}".`;
      }

      const summaries = emails.map((e, i) => `${i + 1}. From ${e.fromName}: "${e.subject}"`);
      return `Found ${emails.length} email${emails.length > 1 ? 's' : ''}: ${summaries.join('. ')}`;
    } catch (e) {
      return "Failed to search emails.";
    }
  }

  // ==========================================================================
  // SMS IMPLEMENTATIONS
  // ==========================================================================

  private async sendText(to: string, message: string): Promise<string> {
    if (!this.sms) {
      return "SMS is not configured. Add your Twilio credentials in settings.";
    }

    try {
      const msg = await this.sms.sendSMS(to, message);
      return this.sms.formatSendConfirmation(msg);
    } catch (e) {
      return `Failed to send text: ${e instanceof Error ? e.message : 'Unknown error'}`;
    }
  }

  private async getTextMessages(contact?: string): Promise<string> {
    if (!this.sms) {
      return "SMS is not configured.";
    }

    const history = contact 
      ? this.sms.getConversation(contact, 5)
      : this.sms.getMessageHistory(5);

    if (history.length === 0) {
      return contact ? `No messages with ${contact}.` : "No recent messages.";
    }

    const summaries = history.map(m => this.sms!.formatMessageForSpeech(m));
    return summaries.join(' ');
  }

  private addSmsContact(name: string, phone: string): string {
    if (!this.sms) {
      return "SMS is not configured.";
    }

    this.sms.addContact(name, phone);
    return `Contact "${name}" added.`;
  }

  // ==========================================================================
  // TESLA IMPLEMENTATIONS
  // ==========================================================================

  private async getTeslaStatus(): Promise<string> {
    if (!this.tesla?.isAuthenticated()) {
      return "Tesla is not connected. Add your Tesla tokens in settings.";
    }

    try {
      const state = await this.tesla.getVehicleState();
      return this.tesla.formatStatusForSpeech(state);
    } catch (e) {
      return "Failed to get Tesla status. The car may be asleep.";
    }
  }

  private async lockTesla(): Promise<string> {
    if (!this.tesla?.isAuthenticated()) {
      return "Tesla is not connected.";
    }

    try {
      await this.tesla.lock();
      return "Tesla is now locked.";
    } catch (e) {
      return "Failed to lock Tesla.";
    }
  }

  private async unlockTesla(): Promise<string> {
    if (!this.tesla?.isAuthenticated()) {
      return "Tesla is not connected.";
    }

    try {
      await this.tesla.unlock();
      return "Tesla is now unlocked.";
    } catch (e) {
      return "Failed to unlock Tesla.";
    }
  }

  private async startTeslaClimate(): Promise<string> {
    if (!this.tesla?.isAuthenticated()) {
      return "Tesla is not connected.";
    }

    try {
      await this.tesla.startClimate();
      return "Climate control started. The car will be ready shortly.";
    } catch (e) {
      return "Failed to start climate control.";
    }
  }

  private async stopTeslaClimate(): Promise<string> {
    if (!this.tesla?.isAuthenticated()) {
      return "Tesla is not connected.";
    }

    try {
      await this.tesla.stopClimate();
      return "Climate control stopped.";
    } catch (e) {
      return "Failed to stop climate control.";
    }
  }

  private async setTeslaTemperature(temperature: number): Promise<string> {
    if (!this.tesla?.isAuthenticated()) {
      return "Tesla is not connected.";
    }

    try {
      await this.tesla.setTemperature(temperature);
      return `Temperature set to ${temperature} degrees.`;
    } catch (e) {
      return "Failed to set temperature.";
    }
  }

  private async openTeslaTrunk(): Promise<string> {
    if (!this.tesla?.isAuthenticated()) {
      return "Tesla is not connected.";
    }

    try {
      await this.tesla.openTrunk();
      return "Trunk opened.";
    } catch (e) {
      return "Failed to open trunk.";
    }
  }

  private async openTeslaFrunk(): Promise<string> {
    if (!this.tesla?.isAuthenticated()) {
      return "Tesla is not connected.";
    }

    try {
      await this.tesla.openFrunk();
      return "Frunk opened.";
    } catch (e) {
      return "Failed to open frunk.";
    }
  }

  private async honkTeslaHorn(): Promise<string> {
    if (!this.tesla?.isAuthenticated()) {
      return "Tesla is not connected.";
    }

    try {
      await this.tesla.honkHorn();
      return "Done.";
    } catch (e) {
      return "Failed to honk horn.";
    }
  }

  private async flashTeslaLights(): Promise<string> {
    if (!this.tesla?.isAuthenticated()) {
      return "Tesla is not connected.";
    }

    try {
      await this.tesla.flashLights();
      return "Lights flashed.";
    } catch (e) {
      return "Failed to flash lights.";
    }
  }

  private async startTeslaCharging(): Promise<string> {
    if (!this.tesla?.isAuthenticated()) {
      return "Tesla is not connected.";
    }

    try {
      await this.tesla.startCharging();
      return "Charging started.";
    } catch (e) {
      return "Failed to start charging. Is the car plugged in?";
    }
  }

  private async stopTeslaCharging(): Promise<string> {
    if (!this.tesla?.isAuthenticated()) {
      return "Tesla is not connected.";
    }

    try {
      await this.tesla.stopCharging();
      return "Charging stopped.";
    } catch (e) {
      return "Failed to stop charging.";
    }
  }

  private async setTeslaSentryMode(enabled: boolean): Promise<string> {
    if (!this.tesla?.isAuthenticated()) {
      return "Tesla is not connected.";
    }

    try {
      await this.tesla.setSentryMode(enabled);
      return enabled ? "Sentry mode activated." : "Sentry mode deactivated.";
    } catch (e) {
      return "Failed to change sentry mode.";
    }
  }

  // ==========================================================================
  // HEALTH IMPLEMENTATIONS (WHOOP/GARMIN)
  // ==========================================================================

  private async getHealthSummary(): Promise<string> {
    if (!this.health?.isConnected()) {
      return "Health tracking is not connected. Set up Whoop or Garmin in settings.";
    }

    try {
      const summary = await this.health.getTodaySummary();
      return this.health.formatSummaryForSpeech(summary);
    } catch (e) {
      return "Failed to get health data.";
    }
  }

  private async getRecoveryScore(): Promise<string> {
    if (!this.health?.isConnected()) {
      return "Health tracking is not connected.";
    }

    try {
      const summary = await this.health.getTodaySummary();
      if (!summary.recovery) {
        return "No recovery data available yet.";
      }
      return `Your recovery score is ${summary.recovery.score}%. ${summary.recovery.recommendation === 'rest' ? 'Consider taking it easy today.' : summary.recovery.recommendation === 'intense' ? 'You are primed for peak performance.' : ''}`;
    } catch (e) {
      return "Failed to get recovery score.";
    }
  }

  private async getSleepData(): Promise<string> {
    if (!this.health?.isConnected()) {
      return "Health tracking is not connected.";
    }

    try {
      const summary = await this.health.getTodaySummary();
      if (!summary.sleep) {
        return "No sleep data available yet.";
      }
      
      const hours = Math.floor(summary.sleep.duration / 60);
      const mins = summary.sleep.duration % 60;
      return `You slept ${hours} hours and ${mins} minutes${summary.sleep.score ? ` with a sleep score of ${summary.sleep.score}%` : ''}.`;
    } catch (e) {
      return "Failed to get sleep data.";
    }
  }

  private async getActivityData(): Promise<string> {
    if (!this.health?.isConnected()) {
      return "Health tracking is not connected.";
    }

    try {
      const summary = await this.health.getTodaySummary();
      if (!summary.activity) {
        return "No activity data available yet.";
      }
      
      const a = summary.activity;
      const parts: string[] = [];
      if (a.strain) parts.push(`Strain: ${a.strain.toFixed(1)}`);
      if (a.calories) parts.push(`${a.calories} calories burned`);
      if (a.steps) parts.push(`${a.steps.toLocaleString()} steps`);
      
      return parts.length > 0 ? parts.join(', ') + '.' : 'Limited activity data available.';
    } catch (e) {
      return "Failed to get activity data.";
    }
  }

  // ==========================================================================
  // MODES IMPLEMENTATIONS
  // ==========================================================================

  private setJarvisMode(mode: string): string {
    const validModes: JarvisMode[] = ['normal', 'dnd', 'sleep', 'guest', 'party', 'away', 'focus'];
    const lowerMode = mode.toLowerCase() as JarvisMode;
    
    if (!validModes.includes(lowerMode)) {
      return `Invalid mode. Available modes: ${validModes.join(', ')}.`;
    }

    this.modes.setMode(lowerMode);
    return this.modes.formatModeChangeForSpeech({
      previousMode: this.modes.getCurrentMode(),
      newMode: lowerMode,
      reason: 'manual',
      timestamp: new Date(),
    });
  }

  private getJarvisMode(): string {
    return this.modes.formatStatusForSpeech();
  }

  public getModes(): ModesService {
    return this.modes;
  }

  // ==========================================================================
  // INTERCOM/BROADCAST IMPLEMENTATIONS
  // ==========================================================================

  private async makeAnnouncement(message: string, rooms?: string[]): Promise<string> {
    try {
      const announcement = await this.intercom.announce(message, { rooms });
      return this.intercom.formatAnnouncementConfirmation(announcement);
    } catch (e) {
      return "Failed to make announcement.";
    }
  }

  private async broadcast(message: string): Promise<string> {
    try {
      await this.intercom.broadcast(message, 'normal');
      return "Broadcast sent to all speakers.";
    } catch (e) {
      return "Failed to broadcast.";
    }
  }

  private async announceDinner(): Promise<string> {
    try {
      await this.intercom.announceDinner();
      return "Dinner announcement sent.";
    } catch (e) {
      return "Failed to announce dinner.";
    }
  }

  private startIntercom(targetRoom: string): string {
    try {
      this.intercom.startIntercom('current', targetRoom);
      return `Intercom to ${targetRoom} open.`;
    } catch (e) {
      return "Failed to start intercom.";
    }
  }

  public getIntercom(): IntercomService {
    return this.intercom;
  }

  // ==========================================================================
  // BRIEFING IMPLEMENTATIONS
  // ==========================================================================

  private async getMorningBriefing(): Promise<string> {
    try {
      return await this.intelligence.generateMorningBriefing();
    } catch (e) {
      return "Good morning, sir. I was unable to compile the full briefing.";
    }
  }

  private async getEveningReview(): Promise<string> {
    try {
      return await this.intelligence.generateEveningReview();
    } catch (e) {
      return "I was unable to compile the evening review.";
    }
  }

  private getSmartAlerts(): string {
    const alerts = this.intelligence.getActiveAlerts();
    
    if (alerts.length === 0) {
      return "No active alerts.";
    }

    const summaries = alerts.slice(0, 3).map(a => a.message);
    return `${alerts.length} alert${alerts.length > 1 ? 's' : ''}: ${summaries.join(' ')}`;
  }

  public getIntelligence(): ProactiveIntelligence {
    return this.intelligence;
  }

  // ==========================================================================
  // SERVICE GETTERS
  // ==========================================================================

  public getEmail(): EmailService | null {
    return this.email;
  }

  public getSMS(): SMSService | null {
    return this.sms;
  }

  public getHealth(): HealthService | null {
    return this.health;
  }

  // ==========================================================================
  // VISION METHODS
  // ==========================================================================

  private async describeScene(): Promise<string> {
    if (!this.onVisionRequest) {
      return "My visual sensors aren't available at the moment, Sir. Enable the camera to let me see.";
    }
    
    try {
      return await this.onVisionRequest();
    } catch (error) {
      return "I'm having trouble processing what I see, Sir.";
    }
  }

  private async lookAtUser(): Promise<string> {
    if (!this.onVisionRequest) {
      return "I'd need my camera enabled to look at you, Sir.";
    }
    
    try {
      return await this.onVisionRequest();
    } catch (error) {
      return "I'm having trouble seeing you at the moment, Sir.";
    }
  }

  // ==========================================================================
  // PHASE 3: SYSTEM CONTROL IMPLEMENTATIONS (Electron Desktop Only)
  // ==========================================================================

  /**
   * Execute system control commands (launch apps, lock screen, volume, etc.)
   */
  private async executeSystemControl(action: string, appName?: string, value?: number): Promise<string> {
    // Check if running in Electron
    if (!BrowserHardware.isElectron()) {
      return "Sir, system control is only available in desktop mode. I'm currently running in a browser.";
    }

    switch (action) {
      case 'launch':
        if (!appName) return "Please specify which application to launch, Sir.";
        const launchResult = await BrowserHardware.launchApp(appName);
        return launchResult.success 
          ? `Accessing ${appName}, Sir.`
          : `I couldn't launch ${appName}. ${launchResult.message}`;

      case 'close':
        if (!appName) return "Please specify which application to close, Sir.";
        const closeResult = await BrowserHardware.closeApp(appName);
        return closeResult.success 
          ? `${appName} has been closed.`
          : `I couldn't close ${appName}. ${closeResult.message}`;

      case 'lock':
        await BrowserHardware.lockScreen();
        return "Workstation secured, Sir.";

      case 'sleep':
        await BrowserHardware.sleepSystem();
        return "Entering sleep mode, Sir. Goodnight.";

      case 'shutdown':
        const shutdownResult = await BrowserHardware.shutdownSystem();
        return `${shutdownResult.message}. You have 60 seconds to cancel if needed.`;

      case 'restart':
        const restartResult = await BrowserHardware.restartSystem();
        return `${restartResult.message}. You have 60 seconds to cancel if needed.`;

      case 'volume_up':
        const currentVolUp = await this.getCurrentVolume();
        await BrowserHardware.setSystemVolume(Math.min(100, currentVolUp + 10));
        return `Volume increased to ${Math.min(100, currentVolUp + 10)}%.`;

      case 'volume_down':
        const currentVolDown = await this.getCurrentVolume();
        await BrowserHardware.setSystemVolume(Math.max(0, currentVolDown - 10));
        return `Volume decreased to ${Math.max(0, currentVolDown - 10)}%.`;

      case 'volume_set':
        if (value === undefined) return "Please specify a volume level between 0 and 100.";
        await BrowserHardware.setSystemVolume(value);
        return `Volume set to ${value}%, Sir.`;

      case 'mute':
        await BrowserHardware.muteAudio();
        return "Audio muted, Sir.";

      case 'unmute':
        await BrowserHardware.unmuteAudio();
        return "Audio unmuted, Sir.";

      case 'media_play_pause':
        await BrowserHardware.mediaPlayPause();
        return "Toggling media playback.";

      case 'media_next':
        await BrowserHardware.mediaNext();
        return "Skipping to next track.";

      case 'media_prev':
        await BrowserHardware.mediaPrevious();
        return "Going to previous track.";

      default:
        return `Unknown system action: ${action}`;
    }
  }

  private async getCurrentVolume(): Promise<number> {
    // Try to get current volume, default to 50 if unavailable
    return 50; // Placeholder - real implementation would query the system
  }

  /**
   * Open a file or folder
   */
  private async openFileOrFolder(path: string, isFolder?: boolean): Promise<string> {
    if (!BrowserHardware.isElectron()) {
      return "File operations are only available in desktop mode, Sir.";
    }

    const result = isFolder 
      ? await BrowserHardware.openFolder(path)
      : await BrowserHardware.openFile(path);
    
    return result.success 
      ? `Opening ${path}, Sir.`
      : `I couldn't open ${path}. ${result.message}`;
  }

  /**
   * Handle clipboard operations
   */
  private async handleClipboard(action: string, text?: string): Promise<string> {
    if (action === 'write') {
      if (!text) return "Please specify what text to copy to the clipboard.";
      const result = await BrowserHardware.copyToClipboard(text);
      return result.success 
        ? "Copied to clipboard, Sir."
        : `Clipboard operation failed: ${result.message}`;
    }
    
    if (action === 'read') {
      const content = await BrowserHardware.readClipboard();
      if (content === null) return "I couldn't access the clipboard, Sir.";
      if (content === '') return "The clipboard is empty, Sir.";
      return `Clipboard contains: "${content.substring(0, 500)}${content.length > 500 ? '...' : ''}"`;
    }

    return "Please specify 'read' or 'write' for clipboard action.";
  }

  /**
   * Get hardware information
   */
  private async getHardwareInfo(type?: string): Promise<string> {
    if (!BrowserHardware.isElectron()) {
      // Provide basic browser info
      const battery = await BrowserHardware.getBatteryLevel();
      return `Battery: ${battery}%. Detailed hardware info is only available in desktop mode.`;
    }

    const infoType = type || 'all';
    const parts: string[] = [];

    if (infoType === 'all' || infoType === 'cpu') {
      const cpu = await BrowserHardware.getCpuUsage();
      if (cpu) {
        parts.push(`CPU: ${cpu.cores} cores, ${cpu.usage}% usage`);
      }
    }

    if (infoType === 'all' || infoType === 'memory') {
      const memory = await BrowserHardware.getMemoryUsage();
      if (memory) {
        parts.push(`Memory: ${memory.used}GB / ${memory.total}GB (${memory.usagePercent}%)`);
      }
    }

    if (infoType === 'all' || infoType === 'battery') {
      const battery = await BrowserHardware.getBatteryLevel();
      parts.push(`Battery: ${battery}%`);
    }

    if (parts.length === 0) {
      return "Unable to retrieve hardware information, Sir.";
    }

    // Trigger System hologram overlay
    if (this.onOverlayUpdate) {
      this.onOverlayUpdate('SYSTEM', {});
    }

    return `System status: ${parts.join('. ')}.`;
  }

  // ==========================================================================
  // PHASE 4: NETWORK DISCOVERY IMPLEMENTATIONS
  // ==========================================================================

  /**
   * Scan local network for smart devices using SSDP
   */
  private async scanNetworkDevices(): Promise<string> {
    // Trigger the radar hologram overlay
    if (this.onOverlayUpdate) {
      this.onOverlayUpdate('RADAR', {});
    }

    // Check if running in Electron
    if (!BrowserHardware.isElectron()) {
      return "Scanning environment for compatible hardware... Note: Full network discovery is only available in desktop mode, Sir. I'm showing a simulation.";
    }

    try {
      console.log('[Tools] Starting network device scan...');
      const devices = await BrowserHardware.scanNetwork();
      
      if (devices.length === 0) {
        return "Network scan complete. I didn't detect any smart devices on your local network, Sir. Make sure your devices are powered on and connected to the same WiFi.";
      }

      // Categorize devices by type
      const hueBridges = devices.filter(d => d.type === 'hue_bridge');
      const speakers = devices.filter(d => ['sonos_speaker', 'echo'].includes(d.type));
      const media = devices.filter(d => ['chromecast', 'roku', 'nvidia_shield', 'media_renderer'].includes(d.type));
      const hubs = devices.filter(d => ['home_assistant', 'smartthings_hub'].includes(d.type));
      const switches = devices.filter(d => ['wemo_switch', 'lifx_light', 'yeelight'].includes(d.type));

      // Store Hue Bridge IP for later pairing
      if (hueBridges.length > 0) {
        this.lastHueBridgeIP = hueBridges[0].ip;
        console.log(`[Tools] Found Hue Bridge at ${this.lastHueBridgeIP}`);
      }

      const parts: string[] = [];
      parts.push(`I've detected ${devices.length} device${devices.length > 1 ? 's' : ''} on your network`);
      
      // Report Hue bridges with pairing status
      if (hueBridges.length > 0) {
        const bridge = hueBridges[0];
        const pairStatus = await BrowserHardware.hueCheckPaired(bridge.ip);
        
        if (pairStatus.paired) {
          parts.push(`a Philips Hue Bridge at ${bridge.ip} which is already paired and ready`);
        } else {
          parts.push(`a Philips Hue Bridge at ${bridge.ip} that needs pairing. Say 'pair with Hue' to connect`);
        }
      }
      
      if (speakers.length > 0) {
        parts.push(`${speakers.length} speaker${speakers.length > 1 ? 's' : ''}: ${speakers.map(s => s.name).join(', ')}`);
      }
      
      if (media.length > 0) {
        parts.push(`${media.length} media device${media.length > 1 ? 's' : ''}: ${media.map(m => m.name).join(', ')}`);
      }
      
      if (hubs.length > 0) {
        parts.push(`${hubs.length} smart home hub${hubs.length > 1 ? 's' : ''}: ${hubs.map(h => h.name).join(', ')}`);
      }
      
      if (switches.length > 0) {
        parts.push(`${switches.length} smart switch${switches.length > 1 ? 'es' : ''}: ${switches.map(s => s.name).join(', ')}`);
      }

      const result = parts.join('. ') + '.';
      
      // Add suggestion if there are unpaired devices that require it
      const unpairedHue = hueBridges.length > 0 && !(await BrowserHardware.hueCheckPaired(hueBridges[0].ip)).paired;
      if (unpairedHue) {
        return result + " Would you like me to pair with the Hue Bridge, Sir?";
      }
      
      return result;
    } catch (error) {
      console.error('[Tools] Network scan failed:', error);
      return "I encountered an error while scanning your network, Sir. Please check your network connection.";
    }
  }

  /**
   * Get information about local network interfaces
   */
  private async getLocalNetworkInfo(): Promise<string> {
    if (!BrowserHardware.isElectron()) {
      return "Network information is only available in desktop mode, Sir.";
    }

    try {
      const networks = await BrowserHardware.getNetworkInfo();
      
      if (networks.length === 0) {
        return "I couldn't detect any active network interfaces, Sir.";
      }

      const info = networks.map(n => 
        `${n.interface}: ${n.ip} (netmask: ${n.netmask})`
      ).join('; ');

      return `Your network configuration: ${info}.`;
    } catch (error) {
      return "I couldn't retrieve network information, Sir.";
    }
  }

  // ==========================================================================
  // PHASE 5: DEVICE PAIRING IMPLEMENTATIONS
  // ==========================================================================

  // Store the last discovered Hue Bridge IP for convenience
  private lastHueBridgeIP: string | null = null;

  /**
   * Pair with a Philips Hue Bridge
   * This is an interactive process - user must press the link button
   */
  private async pairHueBridge(ip?: string): Promise<string> {
    if (!BrowserHardware.isElectron()) {
      return "Device pairing is only available in desktop mode, Sir. Please run JARVIS as a desktop application.";
    }

    // If no IP provided, try to find one from recent scans
    const bridgeIP = ip || this.lastHueBridgeIP;
    
    if (!bridgeIP) {
      return "I don't have the Hue Bridge IP address, Sir. Please say 'scan for devices' first, or tell me the IP address.";
    }

    try {
      // First check if already paired
      const pairCheck = await BrowserHardware.hueCheckPaired(bridgeIP);
      
      if (pairCheck.paired) {
        return `Good news, Sir. I'm already paired with the Hue Bridge at ${bridgeIP}. I can control your lights now.`;
      }

      // Start the pairing process
      console.log(`[Tools] Starting Hue pairing with bridge at ${bridgeIP}`);
      
      // Tell the user what to do
      const initialMessage = `I've located the Philips Hue Bridge at ${bridgeIP}. Please press the physical link button on top of the bridge within the next 30 seconds. I'll wait for confirmation.`;
      
      // Start pairing
      await BrowserHardware.hueStartPairing(bridgeIP);
      
      // Poll for completion (the user should be pressing the button)
      for (let attempt = 0; attempt < 15; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const result = await BrowserHardware.hueCompletePairing(bridgeIP);
        console.log(`[Tools] Hue pairing attempt ${attempt + 1}:`, result.status);
        
        if (result.status === 'success') {
          return `Excellent, Sir! I've successfully paired with your Philips Hue Bridge. I can now control your lights. Try saying 'turn on the lights' or 'set lights to 50 percent'.`;
        }
        
        if (result.status === 'failed' && !result.message?.includes('link button')) {
          return `I encountered an error while pairing: ${result.message}. Please try again.`;
        }
      }
      
      return "The pairing window has expired, Sir. Please try again and press the link button within 30 seconds.";
      
    } catch (error) {
      console.error('[Tools] Hue pairing error:', error);
      return "I had trouble connecting to the Hue Bridge, Sir. Please make sure it's powered on and connected to your network.";
    }
  }

  /**
   * Control Philips Hue lights
   */
  private async controlHueLights(action: string, brightness?: number, room?: string): Promise<string> {
    if (!BrowserHardware.isElectron()) {
      return "Light control is only available in desktop mode, Sir.";
    }

    // Find a paired Hue bridge
    const bridgeIP = this.lastHueBridgeIP;
    
    if (!bridgeIP) {
      // Try to find one by scanning
      const devices = await BrowserHardware.scanNetwork();
      const hueBridge = devices.find(d => d.type === 'hue_bridge');
      
      if (!hueBridge) {
        return "I don't have a Hue Bridge connected, Sir. Please say 'scan for devices' and pair with your bridge first.";
      }
      
      this.lastHueBridgeIP = hueBridge.ip;
    }

    const ip = this.lastHueBridgeIP!;
    
    // Check if paired
    const pairCheck = await BrowserHardware.hueCheckPaired(ip);
    if (!pairCheck.paired) {
      return "The Hue Bridge isn't paired yet, Sir. Would you like me to start the pairing process?";
    }

    try {
      switch (action) {
        case 'on':
        case 'all_on': {
          // Get all groups (rooms)
          const groups = await BrowserHardware.hueGetGroups(ip);
          if (groups.error) {
            return `I couldn't access the lights: ${groups.error}`;
          }
          
          // Turn on group 0 (all lights) or specific room
          const groupId = room ? this.findGroupByName(groups.groups, room) : '0';
          await BrowserHardware.hueSetGroup(ip, groupId, { on: true });
          return room ? `${room} lights are now on, Sir.` : "All lights are now on, Sir.";
        }
        
        case 'off':
        case 'all_off': {
          const groups = await BrowserHardware.hueGetGroups(ip);
          if (groups.error) {
            return `I couldn't access the lights: ${groups.error}`;
          }
          
          const groupId = room ? this.findGroupByName(groups.groups, room) : '0';
          await BrowserHardware.hueSetGroup(ip, groupId, { on: false });
          return room ? `${room} lights are now off, Sir.` : "All lights are now off, Sir.";
        }
        
        case 'brightness': {
          if (brightness === undefined) {
            return "Please specify a brightness level between 0 and 100, Sir.";
          }
          
          // Convert 0-100 to 0-254 (Hue's brightness range)
          const bri = Math.round((brightness / 100) * 254);
          
          const groups = await BrowserHardware.hueGetGroups(ip);
          if (groups.error) {
            return `I couldn't access the lights: ${groups.error}`;
          }
          
          const groupId = room ? this.findGroupByName(groups.groups, room) : '0';
          await BrowserHardware.hueSetGroup(ip, groupId, { on: true, bri });
          return room 
            ? `${room} lights set to ${brightness}%, Sir.`
            : `All lights set to ${brightness}%, Sir.`;
        }
        
        default:
          return `I don't understand the action '${action}'. Try 'on', 'off', or 'brightness'.`;
      }
    } catch (error) {
      console.error('[Tools] Hue control error:', error);
      return "I had trouble controlling the lights, Sir. Please check the bridge connection.";
    }
  }

  /**
   * Find a Hue group ID by room name
   */
  private findGroupByName(groups: any, name: string): string {
    if (!groups) return '0';
    
    const nameLower = name.toLowerCase();
    
    for (const [id, group] of Object.entries(groups)) {
      const groupData = group as any;
      if (groupData.name?.toLowerCase().includes(nameLower)) {
        return id;
      }
    }
    
    // Default to all lights if room not found
    return '0';
  }

  /**
   * Store a discovered Hue Bridge IP for later use
   */
  public setLastHueBridgeIP(ip: string): void {
    this.lastHueBridgeIP = ip;
    console.log(`[Tools] Stored Hue Bridge IP: ${ip}`);
  }

  // ==========================================================================
  // PHASE 7: DESKTOP VISION
  // ==========================================================================

  /**
   * Analyze the user's screen using vision AI
   */
  private async analyzeScreen(prompt?: string): Promise<string> {
    // Check if we're in Electron
    if (!window.jarvisHost?.captureScreen) {
      return "Screen analysis requires the JARVIS desktop app. I can't see your screen from the browser.";
    }

    try {
      // Capture the screen
      const capture = await window.jarvisHost.captureScreen({ 
        type: 'screen', 
        activeOnly: true 
      });

      if (!capture.success || !capture.image) {
        return "I couldn't capture your screen. Please make sure screen recording permissions are granted.";
      }

      console.log(`[Tools] Captured screen: ${capture.sourceName} (${capture.width}x${capture.height})`);

      // Get the vision endpoint from state or use default
      const visionEndpoint = this.state.profile?.lmStudioUrl || 'http://localhost:1234/v1/chat/completions';
      
      const analysisPrompt = prompt || 
        "Describe what you see on this screen. Focus on: 1) Any error messages or warnings, 2) The application being used, 3) Any code or text visible, 4) UI elements that might need attention. Be specific and helpful.";

      // Send to vision LLM
      const response = await fetch(visionEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.state.profile?.visionModel || 'llava',
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: analysisPrompt },
              { 
                type: 'image_url', 
                image_url: { 
                  url: capture.image,
                  detail: 'high'
                }
              }
            ]
          }],
          max_tokens: 1500,
        }),
      });

      if (!response.ok) {
        throw new Error(`Vision API returned ${response.status}`);
      }

      const data = await response.json();
      const analysis = data.choices?.[0]?.message?.content;

      if (!analysis) {
        return "I captured your screen but couldn't analyze it. The vision model may not be available.";
      }

      return `I can see your screen (${capture.sourceName}). Here's what I observe:\n\n${analysis}`;

    } catch (error) {
      console.error('[Tools] Screen analysis error:', error);
      
      if (error instanceof Error && error.message.includes('fetch')) {
        return "I couldn't connect to the vision model. Make sure LM Studio is running with a vision-capable model like LLaVA.";
      }
      
      return `Screen analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  /**
   * Capture the screen without analysis
   */
  private async captureScreen(type?: string): Promise<string> {
    if (!window.jarvisHost?.captureScreen) {
      return "Screen capture requires the JARVIS desktop app.";
    }

    try {
      const capture = await window.jarvisHost.captureScreen({ 
        type: type || 'screen',
        activeOnly: true 
      });

      if (!capture.success) {
        return `Couldn't capture screen: ${capture.error || 'Unknown error'}`;
      }

      // Store the capture for potential later use
      console.log(`[Tools] Screen captured: ${capture.sourceName} (${capture.width}x${capture.height})`);
      
      return `I've captured a screenshot of "${capture.sourceName}" (${capture.width}x${capture.height}). I can analyze it if you'd like - just ask me what you want to know about it.`;

    } catch (error) {
      console.error('[Tools] Screen capture error:', error);
      return `Screen capture failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  // ==========================================================================
  // PHASE 8: HOME ASSISTANT INTEGRATION
  // ==========================================================================

  /**
   * Configure Home Assistant connection
   */
  private async haSetup(url: string, token: string): Promise<string> {
    try {
      // Clean up URL
      const cleanUrl = url.replace(/\/$/, ''); // Remove trailing slash
      
      const result = await homeAssistant.configure({ url: cleanUrl, token });
      
      if (result.success) {
        // Save config to localStorage for persistence
        localStorage.setItem('jarvis_ha_config', JSON.stringify({ url: cleanUrl, token }));
        
        return `Excellent, Sir! I've connected to Home Assistant successfully. I found ${result.deviceCount} devices. You can now control all your smart home devices through me.`;
      } else {
        return `I couldn't connect to Home Assistant: ${result.error}. Please check the URL and token.`;
      }
    } catch (error) {
      console.error('[Tools] HA setup error:', error);
      return `Home Assistant setup failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  /**
   * Control devices through Home Assistant
   */
  private async haControl(
    action: string, 
    device?: string, 
    area?: string, 
    brightness?: number, 
    temperature?: number
  ): Promise<string> {
    // Check if HA is configured
    if (!homeAssistant.isConfigured()) {
      // Try to restore from localStorage
      const savedConfig = localStorage.getItem('jarvis_ha_config');
      if (savedConfig) {
        try {
          const config = JSON.parse(savedConfig);
          await homeAssistant.configure(config);
        } catch (e) {
          return "Home Assistant is not configured. Please provide your HA URL and access token first. You can say 'Connect to Home Assistant' to set it up.";
        }
      } else {
        return "Home Assistant is not configured. Please provide your HA URL and access token first.";
      }
    }

    try {
      switch (action) {
        case 'turn_on':
          if (area) {
            return await homeAssistant.controlArea(area, 'on', brightness);
          }
          if (!device) {
            return "Please specify which device or area to turn on.";
          }
          return await homeAssistant.turnOn(device, { brightness });

        case 'turn_off':
          if (area) {
            return await homeAssistant.controlArea(area, 'off');
          }
          if (!device) {
            return "Please specify which device or area to turn off.";
          }
          return await homeAssistant.turnOff(device);

        case 'toggle':
          if (!device) {
            return "Please specify which device to toggle.";
          }
          return await homeAssistant.toggle(device);

        case 'set_brightness':
          if (!device && !area) {
            return "Please specify which light or area to adjust.";
          }
          if (brightness === undefined) {
            return "Please specify a brightness level (0-100).";
          }
          if (area) {
            return await homeAssistant.controlArea(area, 'on', brightness);
          }
          return await homeAssistant.setBrightness(device!, brightness);

        case 'set_temperature':
          if (!device) {
            return "Please specify which climate device to adjust.";
          }
          if (temperature === undefined) {
            return "Please specify a temperature.";
          }
          await homeAssistant.callService('climate', 'set_temperature', { temperature }, device);
          return `Temperature set to ${temperature}° on ${device}, Sir.`;

        case 'list_devices':
          const devices = homeAssistant.getAllDevices();
          if (devices.length === 0) {
            return "No devices found in Home Assistant.";
          }
          
          // Group by type
          const byType: Record<string, string[]> = {};
          for (const d of devices) {
            if (!byType[d.type]) byType[d.type] = [];
            byType[d.type].push(d.name);
          }
          
          let response = `I found ${devices.length} devices in Home Assistant:\n`;
          for (const [type, names] of Object.entries(byType)) {
            response += `\n${type.charAt(0).toUpperCase() + type.slice(1)}s: ${names.slice(0, 5).join(', ')}`;
            if (names.length > 5) response += ` and ${names.length - 5} more`;
          }
          return response;

        case 'get_state':
          if (!device) {
            return "Please specify which device to check.";
          }
          const found = homeAssistant.findDevice(device);
          if (!found) {
            return `I couldn't find a device called "${device}".`;
          }
          
          let stateDesc = `${found.name} is currently ${found.state}`;
          if (found.brightness !== undefined) {
            stateDesc += ` at ${found.brightness}% brightness`;
          }
          return stateDesc + ', Sir.';

        default:
          return `I don't understand the action '${action}'. Try 'turn_on', 'turn_off', 'toggle', 'set_brightness', or 'list_devices'.`;
      }
    } catch (error) {
      console.error('[Tools] HA control error:', error);
      return `I had trouble controlling Home Assistant: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }
}

// ============================================================================
// TOOL DEFINITIONS (imported from modular files)
// ============================================================================

// Tool definitions are now in src/tools/ for better maintainability
// Import and re-export the combined JARVIS_TOOLS array
import { JARVIS_TOOLS as TOOLS_FROM_MODULES, TOOL_CATEGORIES, getToolCategory } from '../tools';

// Re-export for backwards compatibility
export const JARVIS_TOOLS = TOOLS_FROM_MODULES;
export { TOOL_CATEGORIES, getToolCategory };

// Additional desktop/network tools not yet in modules
// TODO: Move these to modules as well
const ADDITIONAL_DESKTOP_TOOLS: JarvisTool[] = [
  { 
    name: 'openFile', 
    description: 'Open a file or folder on the computer', 
    parameters: { 
      type: 'object', 
      properties: { 
        path: { type: 'string', description: 'File or folder path to open' },
        isFolder: { type: 'boolean', description: 'True if opening a folder, false for file' }
      }, 
      required: ['path'] 
    } 
  },
  { 
    name: 'clipboard', 
    description: 'Read from or write to the system clipboard', 
    parameters: { 
      type: 'object', 
      properties: { 
        action: { type: 'string', enum: ['read', 'write'], description: 'Read or write to clipboard' },
        text: { type: 'string', description: 'Text to write (only for write action)' }
      }, 
      required: ['action'] 
    } 
  },
  { 
    name: 'getHardwareInfo', 
    description: 'Get detailed system hardware information (CPU, memory, battery)', 
    parameters: { 
      type: 'object', 
      properties: { 
        type: { type: 'string', enum: ['cpu', 'memory', 'battery', 'all'], description: 'Type of info to retrieve' }
      }
    } 
  },
  { 
    name: 'scanDevices', 
    description: 'Scan the local network for smart home devices', 
    parameters: { type: 'object', properties: {} } 
  },
  { 
    name: 'getNetworkInfo', 
    description: 'Get information about local network interfaces', 
    parameters: { type: 'object', properties: {} } 
  },
  { 
    name: 'pairHueBridge', 
    description: 'Pair with a Philips Hue Bridge', 
    parameters: { 
      type: 'object', 
      properties: { ip: { type: 'string', description: 'IP address of the Hue Bridge' } },
      required: ['ip']
    } 
  },
  { 
    name: 'controlHueLights', 
    description: 'Control Philips Hue lights', 
    parameters: { 
      type: 'object', 
      properties: {
        action: { type: 'string', enum: ['on', 'off', 'brightness', 'all_on', 'all_off'] },
        brightness: { type: 'number', description: 'Brightness level 0-100' },
        room: { type: 'string', description: 'Room name (optional)' }
      },
      required: ['action']
    } 
  },
  { 
    name: 'analyzeScreen', 
    description: 'Capture and analyze what is currently on screen', 
    parameters: { 
      type: 'object', 
      properties: { prompt: { type: 'string', description: 'Specific question for analysis' } }
    } 
  },
  { 
    name: 'captureScreen', 
    description: 'Take a screenshot of the user\'s screen', 
    parameters: { 
      type: 'object', 
      properties: { type: { type: 'string', enum: ['screen', 'window'] } }
    } 
  },
  { 
    name: 'haControl', 
    description: 'Control any smart home device through Home Assistant', 
    parameters: { 
      type: 'object', 
      properties: {
        action: { type: 'string', enum: ['turn_on', 'turn_off', 'toggle', 'set_brightness', 'set_temperature', 'list_devices', 'get_state'] },
        device: { type: 'string', description: 'Device name or entity_id' },
        area: { type: 'string', description: 'Area/room name' },
        brightness: { type: 'number', description: 'Brightness level 0-100' },
        temperature: { type: 'number', description: 'Temperature to set' }
      },
      required: ['action']
    } 
  },
  { 
    name: 'haSetup', 
    description: 'Configure Home Assistant connection', 
    parameters: { 
      type: 'object', 
      properties: {
        url: { type: 'string', description: 'Home Assistant URL' },
        token: { type: 'string', description: 'Long-lived access token' }
      },
      required: ['url', 'token']
    } 
  },
];

// Append additional tools to the exported array
JARVIS_TOOLS.push(...ADDITIONAL_DESKTOP_TOOLS);
