/**
 * ChirpBot V3 Game State Manager
 * Core game state machine system for weather-on-live architecture
 * 
 * Handles SCHEDULED → PREWARM → LIVE → PAUSED → FINAL → TERMINATED transitions
 * with smart polling and confirmation logic
 */

import { RUNTIME, GameState as RuntimeGameState, WeatherArmReason } from '../config/runtime';
// WebSocket import removed - using HTTP polling architecture
import type { BaseGameData } from './base-sport-api';
import { GamblingInsightsComposer } from './gambling-insights-composer';
import type { AlertResult as EngineAlertResult, GameState } from './engines/base-engine';
import type { AlertResult } from '../../shared/schema';
import type { WeatherChangeEvent } from './weather-on-live-service';
import { unifiedAIProcessor, CrossSportContext } from './unified-ai-processor';

// === CORE INTERFACES ===

export interface GameStateInfo {
  gameId: string;
  sport: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  startTime: string;
  venue?: string;
  timezone?: string;

  // Current state machine data
  currentState: RuntimeGameState;
  previousState: RuntimeGameState;
  stateChangedAt: Date;
  stateConfirmationCount: number;

  // Polling control
  lastPolled: Date;
  nextPollTime: Date;
  currentPollInterval: number;

  // Live confirmation logic
  pendingLiveConfirmation: boolean;
  liveConfirmationAttempts: number;
  liveConfirmationStartedAt?: Date;

  // User monitoring
  isUserMonitored: boolean;
  userIds: Set<string>;

  // Weather arming
  weatherArmed: boolean;
  weatherArmReason?: WeatherArmReason;
  weatherArmedAt?: Date;

  // Metadata
  createdAt: Date;
  lastUpdated: Date;

  // Raw game data from APIs
  rawGameData?: any;
  enhancedData?: any;
}

export interface StateTransitionResult {
  success: boolean;
  previousState: RuntimeGameState;
  newState: RuntimeGameState;
  confirmationRequired: boolean;
  nextPollInterval: number;
  shouldStartEngines: boolean;
  shouldStopEngines: boolean;
  message: string;
}

export interface PollingResult {
  gameId: string;
  polledAt: Date;
  stateChanged: boolean;
  transition?: StateTransitionResult;
  nextPollTime: Date;
  error?: string;
}

// Integration interfaces for other services to implement
export interface CalendarSyncService {
  fetchGameData(gameId: string, sport: string): Promise<BaseGameData>;
  fetchBatchGameData(gameIds: string[], sport: string): Promise<BaseGameData[]>;
}

export interface EngineLifecycleManager {
  startEngines(gameInfo: GameStateInfo): Promise<boolean>;
  stopEngines(gameInfo: GameStateInfo): Promise<boolean>;
  warmupEngines(gameInfo: GameStateInfo): Promise<boolean>;
  pauseEngines(gameInfo: GameStateInfo): Promise<boolean>;
  terminateEngines(gameInfo: GameStateInfo): Promise<boolean>;
  getEngineStatus(sport: string): Promise<any>;
  getEngine(sport: string): any;
}

export interface WeatherService {
  armWeatherMonitoring(gameInfo: GameStateInfo, reason: WeatherArmReason): Promise<boolean>;
  disarmWeatherMonitoring(gameId: string): Promise<boolean>;
}

// === TIMEZONE UTILITIES ===

class TimezoneManager {
  private static readonly VENUE_TIMEZONES: Record<string, string> = {
    // MLB Stadiums
    'Angel Stadium': 'America/Los_Angeles',
    'Minute Maid Park': 'America/Chicago',
    'Yankee Stadium': 'America/New_York',
    'Fenway Park': 'America/New_York',
    'Wrigley Field': 'America/Chicago',
    'Dodger Stadium': 'America/Los_Angeles',
    'AT&T Park': 'America/Los_Angeles',
    'Oracle Park': 'America/Los_Angeles',

    // NFL Stadiums  
    'MetLife Stadium': 'America/New_York',
    'Lambeau Field': 'America/Chicago',
    'Arrowhead Stadium': 'America/Chicago',
    'SoFi Stadium': 'America/Los_Angeles',

    // Common city mappings
    'New York': 'America/New_York',
    'Los Angeles': 'America/Los_Angeles',
    'Chicago': 'America/Chicago',
    'Houston': 'America/Chicago',
    'Phoenix': 'America/Phoenix',
    'Philadelphia': 'America/New_York',
    'San Antonio': 'America/Chicago',
    'San Diego': 'America/Los_Angeles',
    'Dallas': 'America/Chicago',
    'San Jose': 'America/Los_Angeles',
    'Austin': 'America/Chicago',
    'Jacksonville': 'America/New_York',
    'San Francisco': 'America/Los_Angeles',
    'Columbus': 'America/New_York',
    'Charlotte': 'America/New_York',
    'Fort Worth': 'America/Chicago',
    'Indianapolis': 'America/New_York',
    'Seattle': 'America/Los_Angeles',
    'Denver': 'America/Denver',
    'Boston': 'America/New_York',
    'El Paso': 'America/Denver',
    'Detroit': 'America/New_York',
    'Nashville': 'America/Chicago',
    'Portland': 'America/Los_Angeles',
    'Memphis': 'America/Chicago',
    'Oklahoma City': 'America/Chicago',
    'Las Vegas': 'America/Los_Angeles',
    'Louisville': 'America/New_York',
    'Baltimore': 'America/New_York',
    'Milwaukee': 'America/Chicago',
    'Albuquerque': 'America/Denver',
    'Tucson': 'America/Phoenix',
    'Fresno': 'America/Los_Angeles',
    'Sacramento': 'America/Los_Angeles',
    'Mesa': 'America/Phoenix',
    'Kansas City': 'America/Chicago',
    'Atlanta': 'America/New_York',
    'Long Beach': 'America/Los_Angeles',
    'Colorado Springs': 'America/Denver',
    'Raleigh': 'America/New_York',
    'Miami': 'America/New_York',
    'Virginia Beach': 'America/New_York',
    'Omaha': 'America/Chicago',
    'Oakland': 'America/Los_Angeles',
    'Minneapolis': 'America/Chicago',
    'Tulsa': 'America/Chicago',
    'Arlington': 'America/Chicago',
    'New Orleans': 'America/Chicago',
    'Wichita': 'America/Chicago',
    'Cleveland': 'America/New_York',
    'Tampa': 'America/New_York',
    'Bakersfield': 'America/Los_Angeles',
    'Aurora': 'America/Chicago',
    'Honolulu': 'Pacific/Honolulu',
    'Anaheim': 'America/Los_Angeles',
    'Santa Ana': 'America/Los_Angeles',
    'Corpus Christi': 'America/Chicago',
    'Riverside': 'America/Los_Angeles',
    'Lexington': 'America/New_York',
    'Stockton': 'America/Los_Angeles',
    'Henderson': 'America/Los_Angeles',
    'Saint Paul': 'America/Chicago',
    'St. Paul': 'America/Chicago',
    'Cincinnati': 'America/New_York',
    'St. Louis': 'America/Chicago',
    'Pittsburgh': 'America/New_York',
    'Greensboro': 'America/New_York',
    'Lincoln': 'America/Chicago',
    'Plano': 'America/Chicago',
    'Anchorage': 'America/Anchorage',
    'Orlando': 'America/New_York',
    'Irvine': 'America/Los_Angeles',
    'Newark': 'America/New_York',
    'Durham': 'America/New_York',
    'Chula Vista': 'America/Los_Angeles',
    'Toledo': 'America/New_York',
    'Fort Wayne': 'America/New_York',
    'St. Petersburg': 'America/New_York',
    'Laredo': 'America/Chicago',
    'Jersey City': 'America/New_York',
    'Chandler': 'America/Phoenix',
    'Madison': 'America/Chicago',
    'Lubbock': 'America/Chicago',
    'Scottsdale': 'America/Phoenix',
    'Reno': 'America/Los_Angeles',
    'Buffalo': 'America/New_York',
    'Gilbert': 'America/Phoenix',
    'Glendale': 'America/Phoenix',
    'North Las Vegas': 'America/Los_Angeles',
    'Winston-Salem': 'America/New_York',
    'Chesapeake': 'America/New_York',
    'Norfolk': 'America/New_York',
    'Fremont': 'America/Los_Angeles',
    'Garland': 'America/Chicago',
    'Irving': 'America/Chicago',
    'Hialeah': 'America/New_York',
    'Richmond': 'America/New_York',
    'Boise': 'America/Boise',
    'Spokane': 'America/Los_Angeles',
    'San Bernardino': 'America/Los_Angeles'
  };

  static getVenueTimezone(venue?: string, fallback: string = RUNTIME.gameStates.fallbackTimezone): string {
    if (!venue || !RUNTIME.gameStates.useVenueTimezone) {
      return fallback;
    }

    // Direct venue lookup
    if (this.VENUE_TIMEZONES[venue]) {
      return this.VENUE_TIMEZONES[venue];
    }

    // Try to extract city name from venue
    const venueWords = venue.split(/[\s,-]+/);
    for (const word of venueWords) {
      if (this.VENUE_TIMEZONES[word]) {
        return this.VENUE_TIMEZONES[word];
      }
    }

    return fallback;
  }

  static calculateTimeToStart(startTimeStr: string, timezone: string): number {
    try {
      const startTime = new Date(startTimeStr);
      if (isNaN(startTime.getTime())) {
        throw new Error(`Invalid start time: ${startTimeStr}`);
      }

      const now = new Date();
      const msToStart = startTime.getTime() - now.getTime();

      return msToStart;
    } catch (error) {
      console.error(`Timezone calculation error:`, error);
      return Infinity; // Far future to avoid triggering pre-start logic
    }
  }

  static formatTimeInTimezone(date: Date, timezone: string): string {
    try {
      return new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      }).format(date);
    } catch (error) {
      return date.toISOString();
    }
  }
}

// === MAIN GAME STATE MANAGER ===

export class GameStateManager {
  private gameStates: Map<string, GameStateInfo> = new Map();
  private pollingTimers: Map<string, NodeJS.Timeout> = new Map();
  private isRunning: boolean = false;

  // Integration service references
  private calendarSync?: CalendarSyncService;
  private engineManager?: EngineLifecycleManager;
  private weatherService?: WeatherService;
  private weatherOnLiveService?: any; // WeatherOnLiveService - avoiding circular import
  private gamblingInsightsComposer?: GamblingInsightsComposer;
  // WebSocket server setup removed - using HTTP polling architecture

  // Performance tracking
  private stats = {
    totalTransitions: 0,
    confirmationFailures: 0,
    pollingErrors: 0,
    lastCleanup: new Date()
  };

  constructor() {
    console.log('🎯 GameStateManager initialized with weather-on-live architecture');
  }

  // === INTEGRATION SETUP ===

  setCalendarSyncService(service: CalendarSyncService): void {
    this.calendarSync = service;
    console.log('✅ Calendar sync service connected to GameStateManager');
  }

  setEngineLifecycleManager(manager: EngineLifecycleManager): void {
    this.engineManager = manager;
    console.log('✅ Engine lifecycle manager connected to GameStateManager');
  }

  setWeatherService(service: WeatherService): void {
    this.weatherService = service;
    console.log('✅ Weather service connected to GameStateManager');
  }

  setWeatherOnLiveService(service: any): void {
    this.weatherOnLiveService = service;
    console.log('✅ Weather-on-Live service connected to GameStateManager');
  }

  setGamblingInsightsComposer(composer: GamblingInsightsComposer): void {
    this.gamblingInsightsComposer = composer;
    console.log('✅ Gambling insights composer connected to GameStateManager');
  }

  // WebSocket server setup removed - using HTTP polling architecture
  // No longer needed with HTTP polling architecture

  // === GAME MANAGEMENT ===

  async addGame(gameData: BaseGameData, userIds: string[] = []): Promise<GameStateInfo> {
    // If no userIds provided, check database for existing monitors
    let monitoringUsers = userIds;
    if (monitoringUsers.length === 0) {
      try {
        const { default: storage } = await import('../storage');
        const monitoredGames = await storage.getUsersMonitoringGame(gameData.id);
        monitoringUsers = monitoredGames.map(mg => mg.userId);
      } catch (error) {
        // Database check failed, continue with empty list
        console.error(`⚠️ Failed to check for existing monitors on game ${gameData.id}:`, error);
      }
    }

    const gameInfo: GameStateInfo = {
      gameId: gameData.id,
      sport: gameData.sport,
      homeTeam: gameData.homeTeam.name,
      awayTeam: gameData.awayTeam.name,
      homeScore: gameData.homeTeam.score || 0,
      awayScore: gameData.awayTeam.score || 0,
      startTime: gameData.startTime,
      venue: gameData.venue,
      timezone: TimezoneManager.getVenueTimezone(gameData.venue || ''),

      currentState: RuntimeGameState.SCHEDULED,
      previousState: RuntimeGameState.SCHEDULED,
      stateChangedAt: new Date(),
      stateConfirmationCount: 0,

      lastPolled: new Date(0), // Force immediate poll
      nextPollTime: new Date(),
      currentPollInterval: RUNTIME.calendarPoll.defaultMs,

      pendingLiveConfirmation: false,
      liveConfirmationAttempts: 0,

      isUserMonitored: monitoringUsers.length > 0,
      userIds: new Set(monitoringUsers),

      weatherArmed: false,

      createdAt: new Date(),
      lastUpdated: new Date(),

      rawGameData: gameData
    };

    this.gameStates.set(gameData.id, gameInfo);
    console.log(`🎮 Added game ${gameData.id} (${gameInfo.homeTeam} vs ${gameInfo.awayTeam}) in timezone ${gameInfo.timezone}`);

    // Start polling immediately
    await this.scheduleNextPoll(gameInfo);

    // Broadcast state change
    this.broadcastGameStateChange(gameInfo, 'game_added');

    return gameInfo;
  }

  async removeGame(gameId: string): Promise<boolean> {
    const gameInfo = this.gameStates.get(gameId);
    if (!gameInfo) return false;

    // Clean up polling
    this.clearPollingTimer(gameId);

    // Stop engines if running
    if (this.engineManager && (gameInfo.currentState === RuntimeGameState.LIVE || gameInfo.currentState === RuntimeGameState.PAUSED)) {
      await this.engineManager.terminateEngines(gameInfo);
    }

    // Stop weather monitoring
    if (this.weatherOnLiveService && gameInfo.weatherArmed) {
      await this.weatherOnLiveService.stopWeatherMonitoring(gameId);
    } else if (this.weatherService && gameInfo.weatherArmed) {
      await this.weatherService.disarmWeatherMonitoring(gameId);
    }

    this.gameStates.delete(gameId);
    console.log(`🗑️ Removed game ${gameId}`);

    // Broadcast removal
    this.broadcastGameStateChange(gameInfo, 'game_removed');

    return true;
  }

  getGameState(gameId: string): GameStateInfo | undefined {
    return this.gameStates.get(gameId);
  }

  getAllGameStates(): GameStateInfo[] {
    return Array.from(this.gameStates.values());
  }

  getGamesByState(state: RuntimeGameState): GameStateInfo[] {
    return this.getAllGameStates().filter(game => game.currentState === state);
  }

  addUserToGame(gameId: string, userId: string): boolean {
    const gameInfo = this.gameStates.get(gameId);
    if (!gameInfo) return false;

    gameInfo.userIds.add(userId);
    gameInfo.isUserMonitored = true;
    gameInfo.lastUpdated = new Date();

    console.log(`👤 Added user ${userId} to game ${gameId} monitoring`);
    this.broadcastGameStateChange(gameInfo, 'user_added');

    return true;
  }

  removeUserFromGame(gameId: string, userId: string): boolean {
    const gameInfo = this.gameStates.get(gameId);
    if (!gameInfo) return false;

    gameInfo.userIds.delete(userId);
    gameInfo.isUserMonitored = gameInfo.userIds.size > 0;
    gameInfo.lastUpdated = new Date();

    console.log(`👤 Removed user ${userId} from game ${gameId} monitoring`);
    this.broadcastGameStateChange(gameInfo, 'user_removed');

    return true;
  }

  // === STATE MACHINE CORE ===

  private async processStateTransition(gameInfo: GameStateInfo, newGameData: BaseGameData): Promise<StateTransitionResult> {
    const currentState = gameInfo.currentState;
    const apiStatus = newGameData.status;
    const isLive = newGameData.isLive || false;

    // Calculate time to start for pre-game logic
    const msToStart = TimezoneManager.calculateTimeToStart(gameInfo.startTime, gameInfo.timezone || RUNTIME.gameStates.fallbackTimezone);
    const minutesToStart = msToStart / (1000 * 60);

    // Determine target state based on API data and timing
    let targetState = currentState;

    // State transition logic
    if (currentState === RuntimeGameState.SCHEDULED) {
      // Check for PREWARM transition (T-5min)
      if (minutesToStart <= RUNTIME.engine.prewarmTminusMin && minutesToStart > 0) {
        targetState = RuntimeGameState.PREWARM;
      }
      // Check for direct LIVE transition
      else if (isLive || apiStatus.toLowerCase().includes('live') || apiStatus.toLowerCase().includes('in_progress')) {
        targetState = RuntimeGameState.LIVE;
      }
      // Check for FINAL transition
      else if (apiStatus.toLowerCase().includes('final') || apiStatus.toLowerCase().includes('completed')) {
        targetState = RuntimeGameState.FINAL;
      }
    }
    else if (currentState === RuntimeGameState.PREWARM) {
      // Check for LIVE transition
      if (isLive || apiStatus.toLowerCase().includes('live') || apiStatus.toLowerCase().includes('in_progress')) {
        targetState = RuntimeGameState.LIVE;
      }
      // Check for delayed/postponed
      else if (apiStatus.toLowerCase().includes('delayed') || apiStatus.toLowerCase().includes('postponed')) {
        targetState = RuntimeGameState.SCHEDULED; // Back to scheduled
      }
      // Check for FINAL transition (game cancelled)
      else if (apiStatus.toLowerCase().includes('final') || apiStatus.toLowerCase().includes('cancelled')) {
        targetState = RuntimeGameState.FINAL;
      }
    }
    else if (currentState === RuntimeGameState.LIVE) {
      // Check for PAUSED transition
      if (apiStatus.toLowerCase().includes('delayed') || apiStatus.toLowerCase().includes('suspended')) {
        targetState = RuntimeGameState.PAUSED;
      }
      // Check for FINAL transition
      else if (apiStatus.toLowerCase().includes('final') || apiStatus.toLowerCase().includes('completed')) {
        targetState = RuntimeGameState.FINAL;
      }
    }
    else if (currentState === RuntimeGameState.PAUSED) {
      // Check for LIVE transition (resume)
      if (isLive || apiStatus.toLowerCase().includes('live') || apiStatus.toLowerCase().includes('in_progress')) {
        targetState = RuntimeGameState.LIVE;
      }
      // Check for FINAL transition
      else if (apiStatus.toLowerCase().includes('final') || apiStatus.toLowerCase().includes('completed')) {
        targetState = RuntimeGameState.FINAL;
      }
    }
    else if (currentState === RuntimeGameState.FINAL) {
      // FINAL can transition to TERMINATED after cleanup period
      const timeSinceFinal = Date.now() - gameInfo.stateChangedAt.getTime();
      if (timeSinceFinal > RUNTIME.engine.shutdownTimeoutMs * 2) { // Double shutdown timeout for cleanup
        targetState = RuntimeGameState.TERMINATED;
      }
    }

    // Handle confirmation logic for LIVE state
    let confirmationRequired = false;
    let shouldStartEngines = false;
    let shouldStopEngines = false;

    if (targetState === RuntimeGameState.LIVE && currentState !== RuntimeGameState.LIVE) {
      // LIVE transition requires confirmation
      if (!gameInfo.pendingLiveConfirmation) {
        // Start confirmation process
        gameInfo.pendingLiveConfirmation = true;
        gameInfo.liveConfirmationAttempts = 1;
        gameInfo.liveConfirmationStartedAt = new Date();
        confirmationRequired = true;
        targetState = currentState; // Stay in current state for now
      } else {
        // Continue confirmation process
        gameInfo.liveConfirmationAttempts++;

        if (gameInfo.liveConfirmationAttempts >= RUNTIME.calendarPoll.requireConsecutive) {
          // Confirmation complete - proceed to LIVE
          gameInfo.pendingLiveConfirmation = false;
          shouldStartEngines = true;
          confirmationRequired = false;
        } else {
          // Still confirming
          confirmationRequired = true;
          targetState = currentState; // Stay in current state
        }
      }
    } else if (gameInfo.pendingLiveConfirmation && targetState !== RuntimeGameState.LIVE) {
      // Cancel pending confirmation if game is no longer live
      gameInfo.pendingLiveConfirmation = false;
      gameInfo.liveConfirmationAttempts = 0;
      this.stats.confirmationFailures++;
    }

    // Determine engine actions
    if (targetState === RuntimeGameState.FINAL && currentState === RuntimeGameState.LIVE) {
      shouldStopEngines = true;
      
      // Trigger immediate cleanup when game goes final
      this.cleanupFinalGame(gameInfo.gameId, gameInfo.sport).catch(error => {
        console.error(`⚠️ Failed to cleanup final game ${gameInfo.gameId}:`, error);
      });
    } else if (targetState === RuntimeGameState.PAUSED && currentState === RuntimeGameState.LIVE) {
      shouldStopEngines = true;
    } else if (targetState === RuntimeGameState.LIVE && currentState === RuntimeGameState.PAUSED) {
      shouldStartEngines = true;
    }

    // Calculate next poll interval
    const nextPollInterval = this.calculatePollInterval(gameInfo, targetState, confirmationRequired);

    // Update state if changed
    if (targetState !== currentState && !confirmationRequired) {
      gameInfo.previousState = currentState;
      gameInfo.currentState = targetState;
      gameInfo.stateChangedAt = new Date();
      gameInfo.stateConfirmationCount = 0;
      this.stats.totalTransitions++;

      console.log(`🔄 Game ${gameInfo.gameId} transitioned: ${currentState} → ${targetState}`);
    }

    return {
      success: true,
      previousState: currentState,
      newState: targetState,
      confirmationRequired,
      nextPollInterval,
      shouldStartEngines,
      shouldStopEngines,
      message: confirmationRequired ? 
        `Confirming LIVE state (${gameInfo.liveConfirmationAttempts}/${RUNTIME.calendarPoll.requireConsecutive})` :
        `State: ${targetState}`
    };
  }

  private calculatePollInterval(gameInfo: GameStateInfo, targetState: RuntimeGameState, confirmationRequired: boolean): number {
    // Confirmation polling (fast)
    if (confirmationRequired) {
      return RUNTIME.calendarPoll.liveConfirmMs;
    }

    // State-specific intervals
    switch (targetState) {
      case RuntimeGameState.LIVE:
        return RUNTIME.calendarPoll.defaultMs; // Standard live polling

      case RuntimeGameState.PAUSED:
        return RUNTIME.calendarPoll.pausedPollMs;

      case RuntimeGameState.FINAL:
        return RUNTIME.calendarPoll.finalConfirmMs;

      case RuntimeGameState.TERMINATED:
        return 300000; // 5 minutes for terminated games

      case RuntimeGameState.PREWARM:
        return RUNTIME.calendarPoll.preStartPollMs;

      case RuntimeGameState.SCHEDULED:
      default:
        // Calculate time-based interval for scheduled games
        const msToStart = TimezoneManager.calculateTimeToStart(gameInfo.startTime, gameInfo.timezone || RUNTIME.gameStates.fallbackTimezone);
        const minutesToStart = msToStart / (1000 * 60);

        // Pre-start window (T-10m to T+5m): use fast polling
        if (minutesToStart <= RUNTIME.calendarPoll.preStartWindowMin && 
            minutesToStart >= -RUNTIME.calendarPoll.preStartWindowMin/2) {
          return RUNTIME.calendarPoll.preStartPollMs;
        }

        // Default polling for far-future games
        return RUNTIME.calendarPoll.defaultMs;
    }
  }

  // === PUBLIC FORCE EVALUATION ===

  async forceEvaluate(gameId: string, sport?: string, providedGameData?: any): Promise<void> {
    const gameInfo = this.gameStates.get(gameId);
    if (!gameInfo) {
      console.log(`⚠️ GameStateManager: Game ${gameId} not found for force evaluation`);
      return;
    }

    try {
      console.log(`🔄 GameStateManager: Force evaluating game ${gameId}`);

      // Use provided data if available, otherwise fetch fresh data
      let newGameData = providedGameData;
      if (!newGameData) {
        if (!this.calendarSync) {
          throw new Error('Calendar sync service not configured');
        }
        newGameData = await this.calendarSync.fetchGameData(gameId, gameInfo.sport || sport || 'UNKNOWN');
      }

      // Process state transition
      const transition = await this.processStateTransition(gameInfo, newGameData);

      // Handle engine lifecycle immediately
      if (transition.shouldStartEngines && this.engineManager) {
        console.log(`🚀 Starting engines for game ${gameId} (force evaluation)`);
        await this.engineManager.startEngines(gameInfo);
      } else if (transition.shouldStopEngines && this.engineManager) {
        console.log(`🛑 Stopping engines for game ${gameId} (force evaluation)`);
        await this.engineManager.stopEngines(gameInfo);
      }

      // CRITICAL FIX: Trigger alert generation for live games
      if (gameInfo.currentState === RuntimeGameState.LIVE && this.engineManager) {
        // Initialize timeout/possession tracking for ALL live football games (NFL, NCAAF, CFL)
        const footballSports = ['NFL', 'NCAAF', 'CFL'];
        if (footballSports.includes(gameInfo.sport.toUpperCase())) {
          const sport = gameInfo.sport.toUpperCase();
          const engine = this.engineManager.getEngine(sport);
          
          if (engine && engine.initializeTimeoutTracking) {
            try {
              await engine.initializeTimeoutTracking(
                gameInfo.gameId,
                newGameData.homeTeam?.name || gameInfo.homeTeam || 'Home',
                newGameData.awayTeam?.name || gameInfo.awayTeam || 'Away'
              );
            } catch (error) {
              // Silently fail - tracking data is optional
            }
          }
        }
        
        // OPTIMIZATION: Skip alert processing for unmonitored games
        if (!gameInfo.isUserMonitored || gameInfo.userIds.size === 0) {
          console.log(`⏭️ Skipping alert generation for unmonitored game ${gameId}`);
        } else {
          console.log(`🎯 Force evaluating alerts for live game ${gameId}`);

          try {
            // Get the engine instance and trigger alert generation
            const sport = gameInfo.sport.toUpperCase();
            const engine = this.engineManager.getEngine(sport);

          if (engine && engine.generateLiveAlerts) {
            // Convert game data to GameState format for engine (sport-specific fields)
            const gameState = {
              gameId: gameInfo.gameId,
              sport: gameInfo.sport,
              isLive: gameInfo.currentState === RuntimeGameState.LIVE,
              status: 'live',
              homeTeam: newGameData.homeTeam?.name || gameInfo.homeTeam || 'Home',
              awayTeam: newGameData.awayTeam?.name || gameInfo.awayTeam || 'Away', 
              homeScore: gameInfo.homeScore || 0,
              awayScore: gameInfo.awayScore || 0,
              // MLB-specific fields
              inning: newGameData.inning,
              isTopInning: newGameData.isTopInning,
              outs: newGameData.outs,
              balls: newGameData.balls,
              strikes: newGameData.strikes,
              hasFirst: newGameData.hasFirst,
              hasSecond: newGameData.hasSecond, 
              hasThird: newGameData.hasThird,
              currentBatter: newGameData.currentBatter,
              currentPitcher: newGameData.currentPitcher,
              // Basketball-specific fields (NBA, WNBA)
              quarter: newGameData.quarter || newGameData.period,
              timeRemaining: newGameData.timeRemaining || newGameData.clock,
              period: newGameData.period || newGameData.quarter,
              clock: newGameData.clock || newGameData.timeRemaining,
              possession: newGameData.possession,
              // Football-specific fields (NFL, NCAAF, CFL)
              down: newGameData.down,
              yardsToGo: newGameData.yardsToGo,
              yardLine: newGameData.yardLine,
              fieldPosition: newGameData.fieldPosition,
              redZone: newGameData.redZone
            };

            console.log(`🚨 Generating alerts for ${sport} game ${gameId}`);
            let alerts = await engine.generateLiveAlerts(gameState);

            // UNIFIED ENHANCEMENT: Send all alerts through single enhancement pipeline
            if (alerts && alerts.length > 0) {
              console.log(`🔗 GameStateManager: Sending ${alerts.length} alerts through unified enhancement pipeline`);

              // Use UnifiedAIProcessor as the single enhancement pipeline
              // This eliminates duplicate AI processing and ensures consistent contexts
              try {
                // Send each raw alert through unified enhancement pipeline
                for (const rawAlert of alerts) {
                    // Create context for unified enhancement
                    const context: any = {
                      sport: sport.toUpperCase(),
                      alertType: rawAlert.type,
                      gameId: gameId,
                      priority: rawAlert.priority || 75,
                      probability: rawAlert.priority || 75,
                      homeTeam: gameState.homeTeam || 'Home',
                      awayTeam: gameState.awayTeam || 'Away',
                      homeScore: gameState.homeScore || 0,
                      awayScore: gameState.awayScore || 0,
                      isLive: gameState.isLive || false,
                      originalMessage: rawAlert.message,
                      originalContext: rawAlert.context || {}
                    };

                    // Queue raw alert for unified enhancement pipeline (AI + gambling + weather)
                    unifiedAIProcessor.queueAlert(rawAlert, context, 'system').catch(error => {
                      console.warn(`⚠️ Failed to queue alert ${rawAlert.type} for unified enhancement:`, error);
                    });
                  }

                  console.log(`💾 Queued ${alerts.length} alerts for unified enhancement pipeline`);
                } catch (error) {
                  console.error(`❌ Failed to queue enhanced alerts for database storage:`, error);
                }

              console.log(`✅ Generated ${alerts.length} alerts for game ${gameId}`);
            } else {
              console.log(`📝 No alerts generated for game ${gameId} (normal for stable game states)`);
            }
          } else {
            console.log(`⚠️ No engine instance available for ${sport} - skipping alert generation`);
          }
          } catch (alertError) {
            console.error(`❌ Alert generation failed for game ${gameId}:`, alertError);
          }
        }
      }

      // DEBUG: Log game state for alert troubleshooting
      console.log(`🔍 DEBUG: Game ${gameId} - currentState: ${gameInfo.currentState}, engineManager: ${!!this.engineManager}, isLive: ${gameInfo.currentState === RuntimeGameState.LIVE}`);
      
      console.log(`✅ GameStateManager: Force evaluation complete for game ${gameId}`);
    } catch (error) {
      console.error(`❌ GameStateManager: Force evaluation failed for game ${gameId}:`, error);
    }
  }

  // === POLLING LOGIC ===

  private async pollGameState(gameId: string): Promise<PollingResult> {
    const startTime = Date.now();
    const gameInfo = this.gameStates.get(gameId);

    if (!gameInfo) {
      return {
        gameId,
        polledAt: new Date(),
        stateChanged: false,
        nextPollTime: new Date(Date.now() + RUNTIME.calendarPoll.defaultMs),
        error: 'Game not found'
      };
    }

    try {
      // Fetch fresh game data
      if (!this.calendarSync) {
        throw new Error('Calendar sync service not configured');
      }

      const newGameData = await this.calendarSync.fetchGameData(gameId, gameInfo.sport || 'UNKNOWN');

      // Update game info
      gameInfo.homeScore = newGameData.homeTeam.score || 0;
      gameInfo.awayScore = newGameData.awayTeam.score || 0;
      gameInfo.rawGameData = newGameData;
      gameInfo.lastPolled = new Date();
      gameInfo.lastUpdated = new Date();

      // Process state transition
      const transition = await this.processStateTransition(gameInfo, newGameData);

      // Update polling interval
      gameInfo.currentPollInterval = transition.nextPollInterval;
      gameInfo.nextPollTime = new Date(Date.now() + transition.nextPollInterval);

      // Handle engine lifecycle
      if (transition.shouldStartEngines && this.engineManager) {
        console.log(`🚀 Starting engines for game ${gameId}`);
        await this.engineManager.startEngines(gameInfo);
      } else if (transition.shouldStopEngines && this.engineManager) {
        console.log(`🛑 Stopping engines for game ${gameId}`);
        await this.engineManager.stopEngines(gameInfo);
      }

      // Handle weather-on-live monitoring for outdoor sports
      if (gameInfo.currentState === RuntimeGameState.LIVE && !gameInfo.weatherArmed) {
        await this.startWeatherOnLiveMonitoring(gameInfo);
      } else if (gameInfo.currentState === RuntimeGameState.FINAL && gameInfo.weatherArmed) {
        await this.stopWeatherOnLiveMonitoring(gameInfo);
      }

      // Schedule next poll
      await this.scheduleNextPoll(gameInfo);

      // Broadcast changes
      if (transition.previousState !== transition.newState) {
        this.broadcastGameStateChange(gameInfo, 'state_changed', transition);
      }

      const pollDuration = Date.now() - startTime;
      console.log(`📊 Polled game ${gameId}: ${transition.message} (${pollDuration}ms)`);

      return {
        gameId,
        polledAt: gameInfo.lastPolled,
        stateChanged: transition.previousState !== transition.newState,
        transition,
        nextPollTime: gameInfo.nextPollTime
      };

    } catch (error) {
      this.stats.pollingErrors++;
      const errorMsg = error instanceof Error ? error.message : 'Unknown polling error';

      console.error(`❌ Polling error for game ${gameId}:`, errorMsg);

      // Schedule retry with exponential backoff
      const retryInterval = Math.min(RUNTIME.calendarPoll.defaultMs * 2, 120000);
      gameInfo.nextPollTime = new Date(Date.now() + retryInterval);
      await this.scheduleNextPoll(gameInfo);

      return {
        gameId,
        polledAt: new Date(),
        stateChanged: false,
        nextPollTime: gameInfo.nextPollTime,
        error: errorMsg
      };
    }
  }

  private async scheduleNextPoll(gameInfo: GameStateInfo): Promise<void> {
    // Clear existing timer
    this.clearPollingTimer(gameInfo.gameId);

    // Don't poll terminated games
    if (gameInfo.currentState === RuntimeGameState.TERMINATED) {
      return;
    }

    const delay = Math.max(0, gameInfo.nextPollTime.getTime() - Date.now());

    const timer = setTimeout(async () => {
      if (this.isRunning) {
        await this.pollGameState(gameInfo.gameId);
      }
    }, delay);

    this.pollingTimers.set(gameInfo.gameId, timer);
  }

  private clearPollingTimer(gameId: string): void {
    const timer = this.pollingTimers.get(gameId);
    if (timer) {
      clearTimeout(timer);
      this.pollingTimers.delete(gameId);
    }
  }

  // === GAME CLEANUP ===

  private async cleanupFinalGame(gameId: string, sport: string): Promise<void> {
    try {
      // Import and call game monitoring cleanup service
      const { gameMonitoringCleanup } = await import('./game-monitoring-cleanup');
      await gameMonitoringCleanup.cleanupFinalGame(gameId, sport);
    } catch (error) {
      console.error(`❌ GameStateManager: Failed to cleanup final game ${gameId}:`, error);
    }
  }

  // === WEATHER INTEGRATION ===

  private async startWeatherOnLiveMonitoring(gameInfo: GameStateInfo): Promise<void> {
    if (!this.weatherOnLiveService || gameInfo.weatherArmed) return;

    // Only monitor weather for outdoor sports
    const outdoorSports = ['MLB', 'NFL', 'NCAAF', 'CFL'];
    if (!outdoorSports.includes(gameInfo.sport)) return;

    try {
      const success = await this.weatherOnLiveService.startWeatherMonitoring(gameInfo);
      if (success) {
        gameInfo.weatherArmed = true;
        gameInfo.weatherArmReason = WeatherArmReason.CUSTOM;
        gameInfo.weatherArmedAt = new Date();
        console.log(`🌤️ Weather-on-Live monitoring started for game ${gameInfo.gameId} (${gameInfo.sport})`);
      }
    } catch (error) {
      console.error(`❌ Failed to start weather-on-live monitoring for game ${gameInfo.gameId}:`, error);
    }
  }

  private async stopWeatherOnLiveMonitoring(gameInfo: GameStateInfo): Promise<void> {
    if (!this.weatherOnLiveService || !gameInfo.weatherArmed) return;

    try {
      const success = await this.weatherOnLiveService.stopWeatherMonitoring(gameInfo.gameId);
      if (success) {
        gameInfo.weatherArmed = false;
        gameInfo.weatherArmReason = undefined;
        gameInfo.weatherArmedAt = undefined;
        console.log(`🌤️ Weather-on-Live monitoring stopped for game ${gameInfo.gameId}`);
      }
    } catch (error) {
      console.error(`❌ Failed to stop weather-on-live monitoring for game ${gameInfo.gameId}:`, error);
    }
  }

  // Legacy weather integration methods (keep for compatibility)
  private async armWeatherMonitoring(gameInfo: GameStateInfo): Promise<void> {
    if (!this.weatherService || gameInfo.weatherArmed) return;

    // Only arm weather for outdoor sports
    const outdoorSports = ['MLB', 'NFL', 'NCAAF', 'CFL'];
    if (!outdoorSports.includes(gameInfo.sport)) return;

    try {
      const success = await this.weatherService.armWeatherMonitoring(gameInfo, WeatherArmReason.CUSTOM);
      if (success) {
        gameInfo.weatherArmed = true;
        gameInfo.weatherArmReason = WeatherArmReason.CUSTOM;
        gameInfo.weatherArmedAt = new Date();
        console.log(`🌤️ Weather monitoring armed for game ${gameInfo.gameId}`);
      }
    } catch (error) {
      console.error(`❌ Failed to arm weather monitoring for game ${gameInfo.gameId}:`, error);
    }
  }

  private async disarmWeatherMonitoring(gameInfo: GameStateInfo): Promise<void> {
    if (!this.weatherService || !gameInfo.weatherArmed) return;

    try {
      const success = await this.weatherService.disarmWeatherMonitoring(gameInfo.gameId);
      if (success) {
        gameInfo.weatherArmed = false;
        gameInfo.weatherArmReason = undefined;
        gameInfo.weatherArmedAt = undefined;
        console.log(`🌤️ Weather monitoring disarmed for game ${gameInfo.gameId}`);
      }
    } catch (error) {
      console.error(`❌ Failed to disarm weather monitoring for game ${gameInfo.gameId}:`, error);
    }
  }

  // === ALERT ENHANCEMENT METHODS ===

  /**
   * Weather Enhancement - Enhance alerts with weather context for live games
   * Delegates to weatherOnLiveService for consistency with unified-alert-generator
   */
  private async enhanceAlertsWithWeather(
    alerts: EngineAlertResult[], 
    gameState: GameState, 
    sport: string
  ): Promise<EngineAlertResult[]> {
    if (!alerts || alerts.length === 0) return alerts;

    try {
      // For now, return alerts as-is since weather enhancement in forceEvaluate
      // is primarily for the gambling insights pipeline dependency
      // TODO: Add actual weather enhancement integration if needed
      console.log(`🌤️ GameStateManager: Weather context check for ${alerts.length} ${sport} alerts`);
      return alerts;
    } catch (error) {
      console.error(`❌ Weather enhancement failed in GameStateManager:`, error);
      return alerts; // Return original alerts on failure
    }
  }

  /**
   * DISABLED: Gambling Insights Enhancement - Now handled by unified enhancement pipeline
   * This method is disabled to prevent competing enhancement paths
   */
  private async enhanceAlertsWithGamblingInsights(
    alerts: EngineAlertResult[], 
    gameState: GameState, 
    sport: string
  ): Promise<EngineAlertResult[]> {
    console.log(`🚫 DISABLED: GameStateManager gambling insights enhancement bypassed - using unified pipeline only`);
    return alerts; // Return alerts unchanged to prevent competing enhancements
  }

  // === WEBSOCKET BROADCASTING ===

  private broadcastGameStateChange(gameInfo: GameStateInfo, eventType: string, transition?: StateTransitionResult): void {
    // WebSocket broadcasting removed - using HTTP polling architecture
    // This method is kept as no-op to maintain API compatibility
    return;
  }

  // === LIFECYCLE MANAGEMENT ===

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('⚠️ GameStateManager already running');
      return;
    }

    this.isRunning = true;
    console.log('🚀 GameStateManager started');

    // Start polling for all existing games
    for (const gameInfo of this.gameStates.values()) {
      await this.scheduleNextPoll(gameInfo);
    }

    // Start periodic cleanup
    this.startPeriodicCleanup();
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      console.log('⚠️ GameStateManager already stopped');
      return;
    }

    this.isRunning = false;
    console.log('🛑 GameStateManager stopping...');

    // Clear all polling timers
    for (const [gameId, timer] of this.pollingTimers) {
      clearTimeout(timer);
    }
    this.pollingTimers.clear();

    // Stop engines for all live games
    if (this.engineManager) {
      for (const gameInfo of this.gameStates.values()) {
        if (gameInfo.currentState === RuntimeGameState.LIVE || gameInfo.currentState === RuntimeGameState.PAUSED) {
          await this.engineManager.terminateEngines(gameInfo);
        }
      }
    }

    // Disarm all weather monitoring
    if (this.weatherService) {
      for (const gameInfo of this.gameStates.values()) {
        if (gameInfo.weatherArmed) {
          await this.weatherService.disarmWeatherMonitoring(gameInfo.gameId);
        }
      }
    }

    console.log('✅ GameStateManager stopped');
  }

  private startPeriodicCleanup(): void {
    const cleanup = async () => {
      if (!this.isRunning) return;

      const now = new Date();
      const cutoffTime = new Date(now.getTime() - (24 * 60 * 60 * 1000)); // 24 hours ago
      let removedCount = 0;

      for (const [gameId, gameInfo] of this.gameStates) {
        // Remove old terminated games
        if (gameInfo.currentState === RuntimeGameState.TERMINATED && gameInfo.stateChangedAt < cutoffTime) {
          await this.removeGame(gameId);
          removedCount++;
        }
      }

      if (removedCount > 0) {
        console.log(`🧹 Cleaned up ${removedCount} terminated games`);
      }

      this.stats.lastCleanup = now;

      // Schedule next cleanup
      setTimeout(cleanup, 60 * 60 * 1000); // Every hour
    };

    // Start cleanup in 5 minutes
    setTimeout(cleanup, 5 * 60 * 1000);
  }

  // === STATISTICS ===

  getStats(): any {
    return {
      isRunning: this.isRunning,
      totalGames: this.gameStates.size,
      gamesByState: {
        scheduled: this.getGamesByState(RuntimeGameState.SCHEDULED).length,
        prewarm: this.getGamesByState(RuntimeGameState.PREWARM).length,
        live: this.getGamesByState(RuntimeGameState.LIVE).length,
        paused: this.getGamesByState(RuntimeGameState.PAUSED).length,
        final: this.getGamesByState(RuntimeGameState.FINAL).length,
        terminated: this.getGamesByState(RuntimeGameState.TERMINATED).length
      },
      performance: {
        totalTransitions: this.stats.totalTransitions,
        confirmationFailures: this.stats.confirmationFailures,
        pollingErrors: this.stats.pollingErrors,
        activeTimers: this.pollingTimers.size
      },
      lastCleanup: this.stats.lastCleanup
    };
  }
}

// Export singleton instance
export const gameStateManager = new GameStateManager();