/**
 * PROACTIVE INTELLIGENCE - UNIFIED ALERT SYSTEM
 * 
 * Smart, contextual alerts that combine multiple data sources:
 * - Calendar + Traffic = "Leave now to make your meeting"
 * - Weather + Calendar = "Bring umbrella for outdoor event"
 * - Health + Schedule = "Low recovery, consider rescheduling workout"
 * - Patterns + Time = "You usually order coffee around now"
 * - Email urgency + Context = "3 urgent emails from boss, you haven't responded"
 * - Battery monitoring = "Battery at 20%, find a charger"
 * 
 * This file merges the previous ProactiveAlerts.ts functionality into a single
 * unified system. Basic alert scheduling from ProactiveAlerts is now integrated
 * with smart contextual analysis.
 * 
 * This is what makes JARVIS actually useful vs basic alerts.
 */

import { HealthSummary } from './HealthService';
import { CalendarEvent } from './GoogleService';

// =============================================================================
// TYPES
// =============================================================================

export interface SmartAlert {
  id: string;
  type: SmartAlertType;
  title: string;
  message: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  context: Record<string, any>;
  suggestedActions?: string[];
  expiresAt?: Date;
  dismissed: boolean;
  createdAt: Date;
}

export type SmartAlertType =
  | 'leave_now'
  | 'calendar_reminder'
  | 'weather_prep'
  | 'health_insight'
  | 'email_urgent'
  | 'pattern_reminder'
  | 'commute_update'
  | 'meeting_prep'
  | 'schedule_conflict'
  | 'low_battery'
  | 'home_security'
  | 'package_arriving'
  | 'bill_due'
  | 'habit_streak'
  | 'social_reminder'
  | 'custom';

/** Legacy alert type for backwards compatibility */
export interface LegacyProactiveAlert {
  id: string;
  type: 'CALENDAR' | 'REMINDER' | 'TIMER' | 'WEATHER' | 'BATTERY' | 'CUSTOM';
  message: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  triggerTime: number;
  triggered: boolean;
  data?: any;
}

export interface DataContext {
  calendar?: {
    nextEvent?: { title: string; startTime: Date; location?: string };
    todayEvents?: { title: string; startTime: Date }[];
  };
  weather?: {
    current: string;
    temperature: number;
    willRain: boolean;
    rainTime?: string;
    alerts?: string[];
  };
  health?: HealthSummary;
  traffic?: {
    homeToWork: number;
    currentDelay: number;
  };
  email?: {
    unreadCount: number;
    urgentCount: number;
    needsResponse: { from: string; subject: string; waitingDays: number }[];
  };
  patterns?: UserPattern[];
  location?: {
    isHome: boolean;
    isWork: boolean;
    current?: string;
  };
  battery?: number;
}

export interface UserPattern {
  type: 'time_based' | 'location_based' | 'sequence';
  description: string;
  trigger: string;
  action: string;
  confidence: number;
  lastTriggered?: Date;
}

export interface IntelligenceConfig {
  enableLeaveReminders: boolean;
  enableWeatherAlerts: boolean;
  enableHealthInsights: boolean;
  enableEmailDigest: boolean;
  enablePatternLearning: boolean;
  enableBatteryAlerts: boolean;
  enableCalendarReminders: boolean;
  commutePrepTime: number;
  morningBriefingTime: string;
  eveningReviewTime: string;
  calendarAlertTimes: number[];
  batteryThreshold: number;
}

const DEFAULT_CONFIG: IntelligenceConfig = {
  enableLeaveReminders: true,
  enableWeatherAlerts: true,
  enableHealthInsights: true,
  enableEmailDigest: true,
  enablePatternLearning: true,
  enableBatteryAlerts: true,
  enableCalendarReminders: true,
  commutePrepTime: 15,
  morningBriefingTime: '07:30',
  eveningReviewTime: '21:00',
  calendarAlertTimes: [15, 5],
  batteryThreshold: 20,
};

// =============================================================================
// PROACTIVE INTELLIGENCE CLASS
// =============================================================================

export class ProactiveIntelligence {
  private config: IntelligenceConfig;
  private alerts: Map<string, SmartAlert> = new Map();
  private patterns: UserPattern[] = [];
  private lastContext: DataContext = {};
  private onAlert?: (alert: SmartAlert) => void;
  private checkInterval?: ReturnType<typeof setInterval>;
  private calendarCheckTimeout?: ReturnType<typeof setTimeout>;
  
  // Rate limiting
  private lastBatteryAlert: number = 0;
  private lastWeatherAlert: number = 0;
  private scheduledCalendarAlerts: Set<string> = new Set();
  
  private dataProviders: {
    getCalendar?: () => Promise<DataContext['calendar']>;
    getCalendarEvents?: () => Promise<CalendarEvent[]>;
    getWeather?: () => Promise<DataContext['weather']>;
    getHealth?: () => Promise<HealthSummary | null>;
    getTraffic?: (origin: string, dest: string) => Promise<number>;
    getEmail?: () => Promise<DataContext['email']>;
    getLocation?: () => Promise<DataContext['location']>;
    getBatteryLevel?: () => Promise<number>;
  } = {};

  constructor(
    config?: Partial<IntelligenceConfig>,
    onAlert?: (alert: SmartAlert) => void
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.onAlert = onAlert;
    this.loadState();
  }

  private loadState(): void {
    try {
      const saved = localStorage.getItem('jarvis_intelligence');
      if (saved) {
        const state = JSON.parse(saved);
        this.patterns = state.patterns || [];
        this.config = { ...this.config, ...state.config };
      }
    } catch (e) {
      console.error('[Intelligence] Failed to load state:', e);
    }
  }

  private saveState(): void {
    try {
      localStorage.setItem('jarvis_intelligence', JSON.stringify({
        patterns: this.patterns,
        config: this.config,
      }));
    } catch (e) {
      console.error('[Intelligence] Failed to save state:', e);
    }
  }

  setDataProviders(providers: typeof this.dataProviders): void {
    this.dataProviders = { ...this.dataProviders, ...providers };
  }

  start(): void {
    console.log('[Intelligence] Starting proactive intelligence engine');
    
    this.checkInterval = setInterval(() => {
      this.analyze();
    }, 5 * 60 * 1000);

    this.startCalendarMonitoring();
    setTimeout(() => this.analyze(), 5000);
  }

  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
    if (this.calendarCheckTimeout) {
      clearTimeout(this.calendarCheckTimeout);
    }
    console.log('[Intelligence] Stopped');
  }

  // ===========================================================================
  // CALENDAR MONITORING (absorbed from ProactiveAlerts)
  // ===========================================================================

  private startCalendarMonitoring(): void {
    const checkCalendar = async () => {
      if (this.config.enableCalendarReminders) {
        await this.scheduleCalendarAlerts();
        await this.checkPendingCalendarAlerts();
      }
      
      if (this.config.enableBatteryAlerts) {
        await this.checkBattery();
      }
      
      this.calendarCheckTimeout = setTimeout(checkCalendar, 60000);
    };
    
    checkCalendar();
  }

  private async scheduleCalendarAlerts(): Promise<void> {
    if (!this.dataProviders.getCalendarEvents) return;
    
    try {
      const events = await this.dataProviders.getCalendarEvents();
      const now = Date.now();
      
      for (const event of events) {
        const eventTime = event.start.getTime();
        
        for (const minutesBefore of this.config.calendarAlertTimes) {
          const alertTime = eventTime - (minutesBefore * 60 * 1000);
          const alertId = `calendar-${event.id}-${minutesBefore}`;
          
          if (alertTime > now && !this.scheduledCalendarAlerts.has(alertId)) {
            const timeDesc = minutesBefore >= 60 
              ? `${Math.round(minutesBefore / 60)} hour${minutesBefore >= 120 ? 's' : ''}`
              : `${minutesBefore} minutes`;
            
            const alert: SmartAlert = {
              id: alertId,
              type: 'calendar_reminder',
              title: 'Upcoming Event',
              message: `Sir, you have "${event.title}" in ${timeDesc}.${event.location ? ` Location: ${event.location}.` : ''}`,
              priority: minutesBefore <= 5 ? 'high' : 'medium',
              context: { eventId: event.id, event, triggerTime: alertTime, minutesBefore },
              dismissed: false,
              createdAt: new Date(),
              expiresAt: new Date(eventTime),
            };
            
            this.alerts.set(alertId, alert);
            this.scheduledCalendarAlerts.add(alertId);
          }
        }
      }
    } catch (error) {
      console.error('[Intelligence] Calendar scheduling failed:', error);
    }
  }

  private async checkPendingCalendarAlerts(): Promise<void> {
    const now = Date.now();
    
    for (const [id, alert] of this.alerts) {
      if (alert.type === 'calendar_reminder' && !alert.dismissed) {
        const triggerTime = alert.context?.triggerTime;
        
        if (triggerTime && triggerTime <= now) {
          this.onAlert?.(alert);
          alert.dismissed = true;
        }
      }
    }
    
    this.cleanExpiredAlerts();
  }

  private async checkBattery(): Promise<void> {
    if (!this.dataProviders.getBatteryLevel) return;
    
    try {
      const level = await this.dataProviders.getBatteryLevel();
      const now = Date.now();
      
      if (level <= this.config.batteryThreshold && now - this.lastBatteryAlert > 3600000) {
        this.lastBatteryAlert = now;
        
        const alert: SmartAlert = {
          id: `battery-${now}`,
          type: 'low_battery',
          title: 'Low Battery',
          message: `Sir, device battery is at ${level}%. You may want to find a charger.`,
          priority: level <= 10 ? 'urgent' : 'medium',
          context: { batteryLevel: level },
          suggestedActions: ['Find charger'],
          dismissed: false,
          createdAt: new Date(),
        };
        
        this.alerts.set(alert.id, alert);
        this.onAlert?.(alert);
      }
    } catch (error) {
      // Battery API not available
    }
  }

  // ===========================================================================
  // MAIN ANALYSIS
  // ===========================================================================

  async analyze(): Promise<void> {
    try {
      const context = await this.gatherContext();
      this.lastContext = context;

      const newAlerts: SmartAlert[] = [];

      if (this.config.enableLeaveReminders) {
        newAlerts.push(...this.analyzeLeaveTime(context));
      }

      if (this.config.enableWeatherAlerts) {
        newAlerts.push(...this.analyzeWeather(context));
      }

      if (this.config.enableHealthInsights) {
        newAlerts.push(...this.analyzeHealth(context));
      }

      if (this.config.enableEmailDigest) {
        newAlerts.push(...this.analyzeEmail(context));
      }

      newAlerts.push(...this.analyzeMeetingPrep(context));
      newAlerts.push(...this.analyzePatterns(context));

      for (const alert of newAlerts) {
        if (!this.alerts.has(alert.id)) {
          this.alerts.set(alert.id, alert);
          this.onAlert?.(alert);
        }
      }

      this.cleanExpiredAlerts();
    } catch (e) {
      console.error('[Intelligence] Analysis failed:', e);
    }
  }

  private async gatherContext(): Promise<DataContext> {
    const context: DataContext = {};

    if (this.dataProviders.getCalendar) {
      context.calendar = await this.dataProviders.getCalendar();
    }

    if (this.dataProviders.getWeather) {
      context.weather = await this.dataProviders.getWeather();
    }

    if (this.dataProviders.getHealth) {
      const health = await this.dataProviders.getHealth();
      if (health) context.health = health;
    }

    if (this.dataProviders.getEmail) {
      context.email = await this.dataProviders.getEmail();
    }

    if (this.dataProviders.getLocation) {
      context.location = await this.dataProviders.getLocation();
    }
    
    if (this.dataProviders.getBatteryLevel) {
      context.battery = await this.dataProviders.getBatteryLevel();
    }

    context.patterns = this.patterns;

    return context;
  }

  // ===========================================================================
  // ANALYZERS
  // ===========================================================================

  private analyzeLeaveTime(context: DataContext): SmartAlert[] {
    const alerts: SmartAlert[] = [];
    
    if (!context.calendar?.nextEvent) return alerts;

    const event = context.calendar.nextEvent;
    const now = new Date();
    const eventTime = new Date(event.startTime);
    const minutesUntil = (eventTime.getTime() - now.getTime()) / 60000;

    if (event.location) {
      const travelTime = context.traffic?.homeToWork || 30;
      const prepTime = this.config.commutePrepTime;
      const leaveIn = minutesUntil - travelTime - prepTime;

      if (leaveIn > 0 && leaveIn <= 15) {
        alerts.push({
          id: `leave-${event.title}-${eventTime.getTime()}`,
          type: 'leave_now',
          title: 'Time to Leave',
          message: `Leave in ${Math.round(leaveIn)} minutes to arrive on time for "${event.title}". ${travelTime > 30 ? `Traffic is ${context.traffic?.currentDelay || 0} minutes heavier than usual.` : ''}`,
          priority: leaveIn <= 5 ? 'high' : 'medium',
          context: { event, travelTime, leaveIn },
          suggestedActions: ['Get directions', 'Notify running late'],
          expiresAt: eventTime,
          dismissed: false,
          createdAt: now,
        });
      }
    }

    return alerts;
  }

  private analyzeWeather(context: DataContext): SmartAlert[] {
    const alerts: SmartAlert[] = [];
    
    if (!context.weather) return alerts;
    
    const now = new Date();
    const condition = context.weather.current.toLowerCase();
    
    if (Date.now() - this.lastWeatherAlert < 3600000) {
      return alerts;
    }

    if (context.weather.willRain && context.calendar?.todayEvents?.length) {
      this.lastWeatherAlert = Date.now();
      alerts.push({
        id: `weather-rain-${now.toDateString()}`,
        type: 'weather_prep',
        title: 'Rain Expected',
        message: `Rain expected ${context.weather.rainTime || 'later today'}. You have ${context.calendar.todayEvents.length} events - consider bringing an umbrella.`,
        priority: 'medium',
        context: { weather: context.weather, events: context.calendar.todayEvents },
        suggestedActions: ['Check full forecast'],
        expiresAt: new Date(now.getTime() + 12 * 3600000),
        dismissed: false,
        createdAt: now,
      });
    }
    
    if (condition.includes('storm')) {
      this.lastWeatherAlert = Date.now();
      alerts.push({
        id: `weather-storm-${now.toDateString()}`,
        type: 'weather_prep',
        title: 'Storm Warning',
        message: `Sir, there are storms in the forecast. Please exercise caution if traveling.`,
        priority: 'high',
        context: { weather: context.weather },
        dismissed: false,
        createdAt: now,
      });
    }
    
    if (condition.includes('snow')) {
      this.lastWeatherAlert = Date.now();
      alerts.push({
        id: `weather-snow-${now.toDateString()}`,
        type: 'weather_prep',
        title: 'Snow Expected',
        message: `Sir, snow is expected today. Roads may be affected.`,
        priority: 'medium',
        context: { weather: context.weather },
        dismissed: false,
        createdAt: now,
      });
    }

    if (context.weather.alerts?.length) {
      this.lastWeatherAlert = Date.now();
      alerts.push({
        id: `weather-alert-${now.getTime()}`,
        type: 'weather_prep',
        title: 'Weather Alert',
        message: context.weather.alerts.join('. '),
        priority: 'high',
        context: { alerts: context.weather.alerts },
        dismissed: false,
        createdAt: now,
      });
    }

    const temp = context.weather.temperature;
    if (temp > 35) {
      this.lastWeatherAlert = Date.now();
      alerts.push({
        id: `weather-hot-${now.toDateString()}`,
        type: 'weather_prep',
        title: 'Extreme Heat',
        message: `Sir, it's quite hot today at ${temp}°. Stay hydrated.`,
        priority: 'medium',
        context: { temperature: temp },
        dismissed: false,
        createdAt: now,
      });
    } else if (temp < 0) {
      this.lastWeatherAlert = Date.now();
      alerts.push({
        id: `weather-cold-${now.toDateString()}`,
        type: 'weather_prep',
        title: 'Freezing Conditions',
        message: `Sir, it's below freezing at ${temp}°. Bundle up if you're heading out.`,
        priority: 'medium',
        context: { temperature: temp },
        dismissed: false,
        createdAt: now,
      });
    }

    return alerts;
  }

  private analyzeHealth(context: DataContext): SmartAlert[] {
    const alerts: SmartAlert[] = [];
    
    if (!context.health) return alerts;

    const now = new Date();
    const health = context.health;

    if (health.recovery && health.recovery.score < 34) {
      alerts.push({
        id: `health-recovery-${now.toDateString()}`,
        type: 'health_insight',
        title: 'Low Recovery',
        message: `Your recovery score is ${health.recovery.score}%. Consider taking it easy today. ${health.recovery.recommendation}`,
        priority: 'medium',
        context: { recovery: health.recovery },
        suggestedActions: ['Reschedule workout', 'Review sleep tips'],
        dismissed: false,
        createdAt: now,
      });
    }

    if (health.sleep && health.sleep.duration < 360) {
      const hours = Math.floor(health.sleep.duration / 60);
      alerts.push({
        id: `health-sleep-${now.toDateString()}`,
        type: 'health_insight',
        title: 'Sleep Deficit',
        message: `You only slept ${hours} hours last night. Consider an earlier bedtime tonight.`,
        priority: 'low',
        context: { sleep: health.sleep },
        suggestedActions: ['Set bedtime reminder'],
        dismissed: false,
        createdAt: now,
      });
    }

    if (health.activity?.strain && health.activity.strain > 18 && health.recovery?.score && health.recovery.score < 50) {
      alerts.push({
        id: `health-strain-${now.toDateString()}`,
        type: 'health_insight',
        title: 'Recovery Day Recommended',
        message: `High strain (${health.activity.strain.toFixed(1)}) yesterday with low recovery (${health.recovery.score}%). Active recovery or rest recommended.`,
        priority: 'medium',
        context: { strain: health.activity.strain, recovery: health.recovery.score },
        dismissed: false,
        createdAt: now,
      });
    }

    return alerts;
  }

  private analyzeEmail(context: DataContext): SmartAlert[] {
    const alerts: SmartAlert[] = [];
    
    if (!context.email) return alerts;

    const now = new Date();

    if (context.email.urgentCount > 0) {
      alerts.push({
        id: `email-urgent-${now.toDateString()}-${context.email.urgentCount}`,
        type: 'email_urgent',
        title: 'Urgent Emails',
        message: `You have ${context.email.urgentCount} urgent email${context.email.urgentCount > 1 ? 's' : ''} requiring attention.`,
        priority: 'high',
        context: { urgentCount: context.email.urgentCount },
        suggestedActions: ['Open email'],
        dismissed: false,
        createdAt: now,
      });
    }

    if (context.email.needsResponse?.length) {
      const longWaiting = context.email.needsResponse.filter(e => e.waitingDays >= 3);
      if (longWaiting.length > 0) {
        alerts.push({
          id: `email-waiting-${now.toDateString()}`,
          type: 'email_urgent',
          title: 'Emails Awaiting Response',
          message: `${longWaiting.length} email${longWaiting.length > 1 ? 's have' : ' has'} been waiting for your response for 3+ days.`,
          priority: 'medium',
          context: { emails: longWaiting },
          suggestedActions: ['Review emails'],
          dismissed: false,
          createdAt: now,
        });
      }
    }

    return alerts;
  }

  private analyzeMeetingPrep(context: DataContext): SmartAlert[] {
    const alerts: SmartAlert[] = [];
    
    if (!context.calendar?.nextEvent) return alerts;

    const event = context.calendar.nextEvent;
    const now = new Date();
    const eventTime = new Date(event.startTime);
    const minutesUntil = (eventTime.getTime() - now.getTime()) / 60000;

    if (minutesUntil > 30 && minutesUntil <= 60) {
      const title = event.title.toLowerCase();
      const isImportant = title.includes('interview') || 
                          title.includes('board') || 
                          title.includes('review') ||
                          title.includes('presentation');

      if (isImportant) {
        alerts.push({
          id: `meeting-prep-${eventTime.getTime()}`,
          type: 'meeting_prep',
          title: 'Meeting Preparation',
          message: `"${event.title}" starts in ${Math.round(minutesUntil)} minutes. Have you prepared?`,
          priority: 'medium',
          context: { event },
          suggestedActions: ['Review materials', 'Test video/audio'],
          expiresAt: eventTime,
          dismissed: false,
          createdAt: now,
        });
      }
    }

    return alerts;
  }

  private analyzePatterns(context: DataContext): SmartAlert[] {
    const alerts: SmartAlert[] = [];
    const now = new Date();
    const currentHour = now.getHours();
    const currentDay = now.getDay();

    for (const pattern of this.patterns) {
      if (pattern.type === 'time_based' && pattern.confidence > 0.7) {
        const triggerMatch = pattern.trigger.includes(`${currentHour}:`) ||
                            pattern.trigger.includes(`day:${currentDay}`);
        
        if (triggerMatch && (!pattern.lastTriggered || 
            now.getTime() - new Date(pattern.lastTriggered).getTime() > 20 * 3600000)) {
          alerts.push({
            id: `pattern-${pattern.description}-${now.toDateString()}`,
            type: 'pattern_reminder',
            title: 'Suggestion',
            message: pattern.description,
            priority: 'low',
            context: { pattern },
            suggestedActions: [pattern.action],
            dismissed: false,
            createdAt: now,
          });

          pattern.lastTriggered = now;
          this.saveState();
        }
      }
    }

    return alerts;
  }

  private cleanExpiredAlerts(): void {
    const now = new Date();
    const oneHourAgo = now.getTime() - 3600000;
    
    for (const [id, alert] of this.alerts) {
      if (alert.expiresAt && new Date(alert.expiresAt) < now) {
        this.alerts.delete(id);
        this.scheduledCalendarAlerts.delete(id);
        continue;
      }
      
      if (alert.dismissed && alert.createdAt.getTime() < oneHourAgo) {
        this.alerts.delete(id);
        this.scheduledCalendarAlerts.delete(id);
      }
    }
  }

  // ===========================================================================
  // PATTERN LEARNING
  // ===========================================================================

  recordAction(action: string, context?: Record<string, any>): void {
    console.log('[Intelligence] Recorded action:', action, context);
  }

  addPattern(pattern: Omit<UserPattern, 'confidence' | 'lastTriggered'>): void {
    this.patterns.push({
      ...pattern,
      confidence: 0.8,
    });
    this.saveState();
  }

  // ===========================================================================
  // ALERT MANAGEMENT
  // ===========================================================================

  getActiveAlerts(): SmartAlert[] {
    return Array.from(this.alerts.values()).filter(a => !a.dismissed);
  }

  getPendingAlerts(): SmartAlert[] {
    const now = Date.now();
    return Array.from(this.alerts.values()).filter(a => {
      if (a.dismissed) return false;
      const triggerTime = a.context?.triggerTime;
      return triggerTime && triggerTime > now;
    });
  }

  dismissAlert(id: string): void {
    const alert = this.alerts.get(id);
    if (alert) {
      alert.dismissed = true;
    }
  }

  cancelAlert(id: string): boolean {
    const existed = this.alerts.has(id);
    this.alerts.delete(id);
    this.scheduledCalendarAlerts.delete(id);
    return existed;
  }

  clearAlerts(): void {
    this.alerts.clear();
    this.scheduledCalendarAlerts.clear();
  }
  
  addCustomAlert(alert: Omit<SmartAlert, 'id' | 'dismissed' | 'createdAt'>): SmartAlert {
    const newAlert: SmartAlert = {
      ...alert,
      id: crypto.randomUUID(),
      dismissed: false,
      createdAt: new Date(),
    };
    
    this.alerts.set(newAlert.id, newAlert);
    return newAlert;
  }

  // ===========================================================================
  // MORNING/EVENING BRIEFING (absorbed from ProactiveAlerts)
  // ===========================================================================

  async getMorningBriefingItems(): Promise<string[]> {
    const items: string[] = [];
    
    try {
      if (this.dataProviders.getCalendarEvents) {
        const events = await this.dataProviders.getCalendarEvents();
        if (events.length > 0) {
          items.push(`You have ${events.length} event${events.length > 1 ? 's' : ''} today.`);
        }
      }
      
      if (this.dataProviders.getWeather) {
        const weather = await this.dataProviders.getWeather();
        if (weather) {
          items.push(`It's currently ${weather.temperature}° and ${weather.current.toLowerCase()}.`);
        }
      }
      
      if (this.dataProviders.getBatteryLevel) {
        const battery = await this.dataProviders.getBatteryLevel();
        if (battery < 50) {
          items.push(`Device battery is at ${battery}%.`);
        }
      }
    } catch (error) {
      console.error('[Intelligence] Briefing preparation failed:', error);
    }
    
    return items;
  }

  async generateMorningBriefing(): Promise<string> {
    const context = await this.gatherContext();
    const parts: string[] = [];

    parts.push("Good morning, sir.");

    if (context.weather) {
      parts.push(`It's currently ${context.weather.temperature}° and ${context.weather.current}.`);
      if (context.weather.willRain) {
        parts.push(`Rain expected ${context.weather.rainTime || 'later'}.`);
      }
    }

    if (context.health?.recovery) {
      const rec = context.health.recovery;
      parts.push(`Your recovery score is ${rec.score}%. ${rec.recommendation}`);
    }

    if (context.calendar?.todayEvents?.length) {
      const count = context.calendar.todayEvents.length;
      parts.push(`You have ${count} event${count > 1 ? 's' : ''} today.`);
      if (context.calendar.nextEvent) {
        const next = context.calendar.nextEvent;
        const time = new Date(next.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        parts.push(`First up: "${next.title}" at ${time}.`);
      }
    } else {
      parts.push("Your calendar is clear today.");
    }

    if (context.email && context.email.unreadCount > 0) {
      parts.push(`You have ${context.email.unreadCount} unread email${context.email.unreadCount > 1 ? 's' : ''}.`);
      if (context.email.urgentCount > 0) {
        parts.push(`${context.email.urgentCount} marked urgent.`);
      }
    }
    
    if (context.battery && context.battery < 50) {
      parts.push(`Device battery is at ${context.battery}%.`);
    }

    return parts.join(' ');
  }

  async generateEveningReview(): Promise<string> {
    const context = await this.gatherContext();
    const parts: string[] = [];

    parts.push("Here's your evening summary, sir.");

    if (context.health?.activity) {
      const activity = context.health.activity;
      if (activity.strain) {
        parts.push(`Today's strain: ${activity.strain.toFixed(1)}.`);
      }
      if (activity.steps > 0) {
        parts.push(`${activity.steps.toLocaleString()} steps, ${activity.activeCalories} calories burned.`);
      }
    }

    if (context.health?.recovery?.score && context.health.recovery.score < 50) {
      parts.push("Consider an early night for better recovery.");
    }

    return parts.join(' ');
  }
}

// =============================================================================
// LEGACY COMPATIBILITY (absorbed from ProactiveAlerts)
// =============================================================================

/**
 * @deprecated Use ProactiveIntelligence instead
 */
export class ProactiveAlertsSystem {
  private intelligence: ProactiveIntelligence;
  
  constructor(callbacks: {
    onAlert: (alert: LegacyProactiveAlert) => void;
    getCalendarEvents: () => Promise<CalendarEvent[]>;
    getBatteryLevel: () => Promise<number>;
    getWeather: () => Promise<{ temp: number; condition: string } | null>;
  }) {
    const convertedOnAlert = (alert: SmartAlert) => {
      const legacyAlert: LegacyProactiveAlert = {
        id: alert.id,
        type: this.convertAlertType(alert.type),
        message: alert.message,
        priority: alert.priority.toUpperCase() as LegacyProactiveAlert['priority'],
        triggerTime: alert.context?.triggerTime || alert.createdAt.getTime(),
        triggered: alert.dismissed,
        data: alert.context,
      };
      callbacks.onAlert(legacyAlert);
    };
    
    this.intelligence = new ProactiveIntelligence({}, convertedOnAlert);
    
    this.intelligence.setDataProviders({
      getCalendarEvents: callbacks.getCalendarEvents,
      getBatteryLevel: callbacks.getBatteryLevel,
      getWeather: async () => {
        const weather = await callbacks.getWeather();
        if (!weather) return undefined;
        return {
          current: weather.condition,
          temperature: weather.temp,
          willRain: weather.condition.toLowerCase().includes('rain'),
        };
      },
    });
  }
  
  private convertAlertType(type: SmartAlertType): LegacyProactiveAlert['type'] {
    switch (type) {
      case 'calendar_reminder':
      case 'leave_now':
      case 'meeting_prep':
        return 'CALENDAR';
      case 'weather_prep':
        return 'WEATHER';
      case 'low_battery':
        return 'BATTERY';
      default:
        return 'CUSTOM';
    }
  }
  
  start(): void { this.intelligence.start(); }
  stop(): void { this.intelligence.stop(); }
  
  addAlert(alert: Omit<LegacyProactiveAlert, 'id' | 'triggered'>): LegacyProactiveAlert {
    const smartAlert = this.intelligence.addCustomAlert({
      type: 'custom',
      title: alert.type,
      message: alert.message,
      priority: alert.priority.toLowerCase() as SmartAlert['priority'],
      context: { triggerTime: alert.triggerTime, ...alert.data },
    });
    
    return {
      id: smartAlert.id,
      type: alert.type,
      message: alert.message,
      priority: alert.priority,
      triggerTime: alert.triggerTime,
      triggered: false,
      data: alert.data,
    };
  }
  
  cancelAlert(id: string): boolean { return this.intelligence.cancelAlert(id); }
  
  getPendingAlerts(): LegacyProactiveAlert[] {
    return this.intelligence.getPendingAlerts().map(alert => ({
      id: alert.id,
      type: this.convertAlertType(alert.type),
      message: alert.message,
      priority: alert.priority.toUpperCase() as LegacyProactiveAlert['priority'],
      triggerTime: alert.context?.triggerTime || alert.createdAt.getTime(),
      triggered: alert.dismissed,
      data: alert.context,
    }));
  }
  
  async checkWeather(): Promise<void> { await this.intelligence.analyze(); }
  async getMorningBriefingItems(): Promise<string[]> { return this.intelligence.getMorningBriefingItems(); }
}
