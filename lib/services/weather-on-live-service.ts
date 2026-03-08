/**
 * ChirpBot V3 Weather-on-Live Service
 * Dynamic weather monitoring system that only activates when games are LIVE
 * 
 * Key Features:
 * - Only starts weather monitoring when games transition to LIVE state
 * - Sport-specific weather triggers from RUNTIME configuration
 * - Dynamic polling cadence with arming/disarming logic
 * - Weather change detection and alert generation
 * - Integration with GameStateManager and SSE broadcasting
 */

import { RUNTIME, GameState as RuntimeGameState, WeatherArmReason } from '../config/runtime';
import { WeatherService, type WeatherData } from './weather-service';
import { unifiedDeduplicator } from './unified-deduplicator';
import { storage } from '../storage';
// WebSocket import removed - using HTTP polling architecture
import type { GameStateInfo } from './game-state-manager';
import type { InsertAlert } from '../../shared/schema';

// === CORE INTERFACES ===

export interface WeatherMonitoringConfig {
  gameId: string;
  sport: string;
  homeTeam: string;
  awayTeam: string;
  venue?: string;
  
  // Weather monitoring state
  isMonitoring: boolean;
  isArmed: boolean;
  armReason?: WeatherArmReason;
  armedAt?: Date;
  armedUntil?: Date;
  
  // Polling configuration
  currentPollInterval: number;
  lastPolled?: Date;
  nextPollTime?: Date;
  consecutiveFailures: number;
  
  // Weather data tracking
  lastWeatherData?: WeatherData;
  lastSignificantChange?: Date;
  
  // Metadata
  startedAt: Date;
  lastUpdated: Date;
}

export interface WeatherChangeEvent {
  gameId: string;
  sport: string;
  changeType: WeatherChangeType;
  severity: 'low' | 'moderate' | 'high' | 'extreme';
  previousWeather: WeatherData;
  currentWeather: WeatherData;
  thresholdExceeded: string;
  shouldAlert: boolean;
  alertCooldownUntil?: Date;
}

export enum WeatherChangeType {
  WIND_SHIFT = 'WIND_SHIFT',
  WIND_SPEED_CHANGE = 'WIND_SPEED_CHANGE',
  TEMPERATURE_CHANGE = 'TEMPERATURE_CHANGE',
  PRECIPITATION_START = 'PRECIPITATION_START',
  PRECIPITATION_STOP = 'PRECIPITATION_STOP',
  HUMIDITY_SPIKE = 'HUMIDITY_SPIKE',
  PRESSURE_CHANGE = 'PRESSURE_CHANGE',
  ROOF_STATE_CHANGE = 'ROOF_STATE_CHANGE',
  LIGHTNING_WARNING = 'LIGHTNING_WARNING',
  VENUE_ADVISORY = 'VENUE_ADVISORY'
}

// === SPORT-SPECIFIC WEATHER EVALUATORS ===

interface WeatherEvaluator {
  evaluateWeatherChange(previous: WeatherData, current: WeatherData, venue?: string): WeatherChangeEvent[];
  getSportThresholds(): any;
}

class MLBWeatherEvaluator implements WeatherEvaluator {
  private readonly thresholds = RUNTIME.cylinders.mlb;
  
  getSportThresholds() {
    return this.thresholds;
  }
  
  evaluateWeatherChange(previous: WeatherData, current: WeatherData, venue?: string): WeatherChangeEvent[] {
    const changes: WeatherChangeEvent[] = [];
    
    // Wind direction change detection
    const windDirectionChange = Math.abs(current.windDirection - previous.windDirection);
    const normalizedChange = Math.min(windDirectionChange, 360 - windDirectionChange);
    
    if (normalizedChange >= this.thresholds.windShiftDeg && current.windSpeed >= this.thresholds.windMinMph) {
      changes.push({
        gameId: '', // Will be set by caller
        sport: 'MLB',
        changeType: WeatherChangeType.WIND_SHIFT,
        severity: normalizedChange >= 45 ? 'high' : normalizedChange >= 30 ? 'moderate' : 'low',
        previousWeather: previous,
        currentWeather: current,
        thresholdExceeded: `Wind direction shift: ${normalizedChange.toFixed(1)}° (threshold: ${this.thresholds.windShiftDeg}°)`,
        shouldAlert: true
      });
    }
    
    // Outbound/Inbound wind detection (requires stadium orientation)
    if (current.windSpeed >= this.thresholds.windOutMph) {
      const isOutboundWind = this.isOutboundWind(current.windDirection, venue);
      const isInboundWind = this.isInboundWind(current.windDirection, venue);
      
      if (isOutboundWind || isInboundWind) {
        changes.push({
          gameId: '',
          sport: 'MLB',
          changeType: WeatherChangeType.WIND_SPEED_CHANGE,
          severity: current.windSpeed >= 20 ? 'high' : current.windSpeed >= 16 ? 'moderate' : 'low',
          previousWeather: previous,
          currentWeather: current,
          thresholdExceeded: `${isOutboundWind ? 'Outbound' : 'Inbound'} wind: ${current.windSpeed}mph (threshold: ${this.thresholds.windOutMph}mph)`,
          shouldAlert: true
        });
      }
    }
    
    // Temperature extreme detection
    if (current.temperature <= this.thresholds.tempColdF) {
      changes.push({
        gameId: '',
        sport: 'MLB',
        changeType: WeatherChangeType.TEMPERATURE_CHANGE,
        severity: current.temperature <= 35 ? 'extreme' : current.temperature <= 40 ? 'high' : 'moderate',
        previousWeather: previous,
        currentWeather: current,
        thresholdExceeded: `Cold temperature: ${current.temperature}°F (threshold: ${this.thresholds.tempColdF}°F)`,
        shouldAlert: true
      });
    } else if (current.temperature >= this.thresholds.tempHotF) {
      changes.push({
        gameId: '',
        sport: 'MLB',
        changeType: WeatherChangeType.TEMPERATURE_CHANGE,
        severity: current.temperature >= 100 ? 'extreme' : current.temperature >= 95 ? 'high' : 'moderate',
        previousWeather: previous,
        currentWeather: current,
        thresholdExceeded: `Hot temperature: ${current.temperature}°F (threshold: ${this.thresholds.tempHotF}°F)`,
        shouldAlert: true
      });
    }
    
    // Humidity spike detection
    const humidityChange = Math.abs(current.humidity - previous.humidity);
    if (humidityChange >= this.thresholds.humidityDeltaPct) {
      changes.push({
        gameId: '',
        sport: 'MLB',
        changeType: WeatherChangeType.HUMIDITY_SPIKE,
        severity: humidityChange >= 20 ? 'high' : humidityChange >= 15 ? 'moderate' : 'low',
        previousWeather: previous,
        currentWeather: current,
        thresholdExceeded: `Humidity change: ${humidityChange.toFixed(1)}% (threshold: ${this.thresholds.humidityDeltaPct}%)`,
        shouldAlert: humidityChange >= 15 // Only alert on significant spikes
      });
    }
    
    // Precipitation detection
    if (this.thresholds.precipitationSensitive) {
      const wasPrecipitation = this.hasPrecipitation(previous.condition);
      const isPrecipitation = this.hasPrecipitation(current.condition);
      
      if (!wasPrecipitation && isPrecipitation) {
        changes.push({
          gameId: '',
          sport: 'MLB',
          changeType: WeatherChangeType.PRECIPITATION_START,
          severity: current.condition.toLowerCase().includes('heavy') ? 'high' : 'moderate',
          previousWeather: previous,
          currentWeather: current,
          thresholdExceeded: `Precipitation started: ${current.condition}`,
          shouldAlert: true
        });
      } else if (wasPrecipitation && !isPrecipitation) {
        changes.push({
          gameId: '',
          sport: 'MLB',
          changeType: WeatherChangeType.PRECIPITATION_STOP,
          severity: 'low',
          previousWeather: previous,
          currentWeather: current,
          thresholdExceeded: `Precipitation stopped: ${current.condition}`,
          shouldAlert: true
        });
      }
    }
    
    return changes;
  }
  
  private hasPrecipitation(condition: string): boolean {
    const lowerCondition = condition.toLowerCase();
    return lowerCondition.includes('rain') || 
           lowerCondition.includes('drizzle') || 
           lowerCondition.includes('shower') ||
           lowerCondition.includes('snow') || 
           lowerCondition.includes('sleet');
  }
  
  private isOutboundWind(windDirection: number, venue?: string): boolean {
    // This would use stadium-specific orientation data
    // For now, assume 180-270 degrees is generally outbound for most stadiums
    return windDirection >= 180 && windDirection <= 270;
  }
  
  private isInboundWind(windDirection: number, venue?: string): boolean {
    // Generally opposite of outbound
    return windDirection >= 0 && windDirection <= 90 || windDirection >= 270 && windDirection <= 360;
  }
}

class FootballWeatherEvaluator implements WeatherEvaluator {
  private readonly thresholds: any;
  
  constructor(sport: 'NFL' | 'NCAAF' | 'CFL') {
    switch (sport) {
      case 'NFL':
        this.thresholds = RUNTIME.cylinders.nfl;
        break;
      case 'NCAAF':
        this.thresholds = RUNTIME.cylinders.ncaaf;
        break;
      case 'CFL':
        this.thresholds = RUNTIME.cylinders.cfl;
        break;
    }
  }
  
  getSportThresholds() {
    return this.thresholds;
  }
  
  evaluateWeatherChange(previous: WeatherData, current: WeatherData, venue?: string): WeatherChangeEvent[] {
    const changes: WeatherChangeEvent[] = [];
    
    // Sustained wind monitoring
    if (current.windSpeed >= this.thresholds.sustainedWindMph) {
      changes.push({
        gameId: '',
        sport: 'NFL',
        changeType: WeatherChangeType.WIND_SPEED_CHANGE,
        severity: current.windSpeed >= 25 ? 'extreme' : current.windSpeed >= 22 ? 'high' : 'moderate',
        previousWeather: previous,
        currentWeather: current,
        thresholdExceeded: `Sustained wind: ${current.windSpeed}mph (threshold: ${this.thresholds.sustainedWindMph}mph)`,
        shouldAlert: true
      });
    }
    
    // Wind gust monitoring (if available)
    if (current.windGust && current.windGust >= this.thresholds.gustMph) {
      changes.push({
        gameId: '',
        sport: 'NFL',
        changeType: WeatherChangeType.WIND_SPEED_CHANGE,
        severity: current.windGust >= 35 ? 'extreme' : current.windGust >= 30 ? 'high' : 'moderate',
        previousWeather: previous,
        currentWeather: current,
        thresholdExceeded: `Wind gust: ${current.windGust}mph (threshold: ${this.thresholds.gustMph}mph)`,
        shouldAlert: true
      });
    }
    
    // Cold weather monitoring
    if (current.temperature <= this.thresholds.coldF) {
      changes.push({
        gameId: '',
        sport: 'NFL',
        changeType: WeatherChangeType.TEMPERATURE_CHANGE,
        severity: current.temperature <= 0 ? 'extreme' : current.temperature <= 10 ? 'high' : 'moderate',
        previousWeather: previous,
        currentWeather: current,
        thresholdExceeded: `Cold temperature: ${current.temperature}°F (threshold: ${this.thresholds.coldF}°F)`,
        shouldAlert: true
      });
    }
    
    // Heat index monitoring
    if (current.temperature >= this.thresholds.heatIndexF) {
      changes.push({
        gameId: '',
        sport: 'NFL',
        changeType: WeatherChangeType.TEMPERATURE_CHANGE,
        severity: current.temperature >= 110 ? 'extreme' : current.temperature >= 105 ? 'high' : 'moderate',
        previousWeather: previous,
        currentWeather: current,
        thresholdExceeded: `High heat index: ${current.temperature}°F (threshold: ${this.thresholds.heatIndexF}°F)`,
        shouldAlert: true
      });
    }
    
    // Precipitation monitoring
    if (this.thresholds.precipitationSensitive) {
      const wasPrecipitation = this.hasPrecipitation(previous.condition);
      const isPrecipitation = this.hasPrecipitation(current.condition);
      
      if (!wasPrecipitation && isPrecipitation) {
        changes.push({
          gameId: '',
          sport: 'NFL',
          changeType: WeatherChangeType.PRECIPITATION_START,
          severity: this.getPrecipitationSeverity(current.condition),
          previousWeather: previous,
          currentWeather: current,
          thresholdExceeded: `Precipitation started: ${current.condition}`,
          shouldAlert: true
        });
      } else if (wasPrecipitation && !isPrecipitation) {
        changes.push({
          gameId: '',
          sport: 'NFL',
          changeType: WeatherChangeType.PRECIPITATION_STOP,
          severity: 'low',
          previousWeather: previous,
          currentWeather: current,
          thresholdExceeded: `Precipitation stopped: ${current.condition}`,
          shouldAlert: true
        });
      }
    }
    
    return changes;
  }
  
  private hasPrecipitation(condition: string): boolean {
    const lowerCondition = condition.toLowerCase();
    return lowerCondition.includes('rain') || 
           lowerCondition.includes('snow') || 
           lowerCondition.includes('sleet') ||
           lowerCondition.includes('drizzle') || 
           lowerCondition.includes('shower');
  }
  
  private getPrecipitationSeverity(condition: string): 'low' | 'moderate' | 'high' | 'extreme' {
    const lowerCondition = condition.toLowerCase();
    if (lowerCondition.includes('heavy') || lowerCondition.includes('storm')) {
      return 'high';
    } else if (lowerCondition.includes('moderate') || lowerCondition.includes('steady')) {
      return 'moderate';
    }
    return 'low';
  }
}

class IndoorSportWeatherEvaluator implements WeatherEvaluator {
  private readonly sport: string;
  
  constructor(sport: 'WNBA' | 'NBA') {
    this.sport = sport;
  }
  
  getSportThresholds() {
    return RUNTIME.cylinders[this.sport.toLowerCase() as keyof typeof RUNTIME.cylinders];
  }
  
  evaluateWeatherChange(previous: WeatherData, current: WeatherData, venue?: string): WeatherChangeEvent[] {
    const changes: WeatherChangeEvent[] = [];
    
    // Indoor sports have minimal weather impact
    // Only check for venue-specific advisories or extreme conditions that might affect travel/attendance
    
    if (current.temperature <= 10 || current.temperature >= 110) {
      changes.push({
        gameId: '',
        sport: this.sport,
        changeType: WeatherChangeType.VENUE_ADVISORY,
        severity: 'moderate',
        previousWeather: previous,
        currentWeather: current,
        thresholdExceeded: `Extreme temperature outside venue: ${current.temperature}°F`,
        shouldAlert: false // Indoor sports don't typically alert for weather
      });
    }
    
    return changes;
  }
}

// === MAIN WEATHER ON LIVE SERVICE ===

export class WeatherOnLiveService {
  private weatherService: WeatherService;
  private monitoringConfigs: Map<string, WeatherMonitoringConfig> = new Map();
  private pollingTimers: Map<string, NodeJS.Timeout> = new Map();
  private weatherEvaluators: Map<string, WeatherEvaluator> = new Map();
  private alertCooldowns: Map<string, Date> = new Map();
  // WebSocket server removed - using HTTP polling architecture
  
  // Circuit breaker state
  private consecutiveApiFailures: number = 0;
  private circuitBreakerOpen: boolean = false;
  private circuitBreakerResetTime?: Date;
  private readonly maxConsecutiveFailures = 5;
  private readonly circuitBreakerTimeoutMs = 5 * 60 * 1000; // 5 minutes
  
  constructor() {
    this.weatherService = new WeatherService();
    this.initializeEvaluators();
  }
  
  private initializeEvaluators(): void {
    this.weatherEvaluators.set('MLB', new MLBWeatherEvaluator());
    this.weatherEvaluators.set('NFL', new FootballWeatherEvaluator('NFL'));
    this.weatherEvaluators.set('NCAAF', new FootballWeatherEvaluator('NCAAF'));
    this.weatherEvaluators.set('CFL', new FootballWeatherEvaluator('CFL'));
    this.weatherEvaluators.set('WNBA', new IndoorSportWeatherEvaluator('WNBA'));
    this.weatherEvaluators.set('NBA', new IndoorSportWeatherEvaluator('NBA'));
  }
  
  // === PUBLIC API METHODS ===
  
  /**
   * Start weather monitoring for a game that has gone LIVE
   */
  async startWeatherMonitoring(gameInfo: GameStateInfo): Promise<boolean> {
    try {
      if (this.isCircuitBreakerOpen()) {
        console.log(`🚫 Weather monitoring circuit breaker open - skipping ${gameInfo.gameId}`);
        return false;
      }
      
      const config: WeatherMonitoringConfig = {
        gameId: gameInfo.gameId,
        sport: gameInfo.sport,
        homeTeam: gameInfo.homeTeam,
        awayTeam: gameInfo.awayTeam,
        venue: gameInfo.venue,
        isMonitoring: true,
        isArmed: false,
        currentPollInterval: RUNTIME.weather.livePollMs,
        consecutiveFailures: 0,
        startedAt: new Date(),
        lastUpdated: new Date()
      };
      
      this.monitoringConfigs.set(gameInfo.gameId, config);
      
      console.log(`🌤️ Weather-on-Live: Starting monitoring for ${gameInfo.sport} game ${gameInfo.gameId} (${gameInfo.homeTeam} vs ${gameInfo.awayTeam})`);
      
      // Get initial weather reading
      await this.performWeatherCheck(config);
      
      // Start polling timer
      this.startPollingTimer(config);
      
      return true;
    } catch (error) {
      console.error(`❌ Failed to start weather monitoring for ${gameInfo.gameId}:`, error);
      return false;
    }
  }
  
  /**
   * Stop weather monitoring for a game that has gone FINAL/TERMINATED
   */
  async stopWeatherMonitoring(gameId: string): Promise<boolean> {
    try {
      const config = this.monitoringConfigs.get(gameId);
      if (!config) {
        return true; // Already stopped
      }
      
      console.log(`🌤️ Weather-on-Live: Stopping monitoring for game ${gameId}`);
      
      // Stop polling timer
      const timer = this.pollingTimers.get(gameId);
      if (timer) {
        clearTimeout(timer);
        this.pollingTimers.delete(gameId);
      }
      
      // Clean up config
      this.monitoringConfigs.delete(gameId);
      
      // Clean up alert cooldowns
      for (const [key, _] of this.alertCooldowns) {
        if (key.startsWith(`${gameId}-`)) {
          this.alertCooldowns.delete(key);
        }
      }
      
      return true;
    } catch (error) {
      console.error(`❌ Failed to stop weather monitoring for ${gameId}:`, error);
      return false;
    }
  }
  
  /**
   * Arm weather monitoring for weather-sensitive alerts
   */
  async armWeatherMonitoring(gameId: string, reason: WeatherArmReason): Promise<boolean> {
    try {
      const config = this.monitoringConfigs.get(gameId);
      if (!config) {
        console.warn(`⚠️ Cannot arm weather monitoring - game ${gameId} not being monitored`);
        return false;
      }
      
      config.isArmed = true;
      config.armReason = reason;
      config.armedAt = new Date();
      config.armedUntil = new Date(Date.now() + (RUNTIME.weather.armedDecayMin * 60 * 1000));
      config.currentPollInterval = RUNTIME.weather.armedPollMs;
      config.lastUpdated = new Date();
      
      console.log(`🎯 Weather-on-Live: Armed monitoring for game ${gameId} (reason: ${reason}) - polling every ${config.currentPollInterval}ms`);
      
      // Restart timer with new interval
      this.restartPollingTimer(config);
      
      return true;
    } catch (error) {
      console.error(`❌ Failed to arm weather monitoring for ${gameId}:`, error);
      return false;
    }
  }
  
  /**
   * Disarm weather monitoring and return to normal cadence
   */
  async disarmWeatherMonitoring(gameId: string): Promise<boolean> {
    try {
      const config = this.monitoringConfigs.get(gameId);
      if (!config) {
        return true; // Already stopped
      }
      
      config.isArmed = false;
      config.armReason = undefined;
      config.armedAt = undefined;
      config.armedUntil = undefined;
      config.currentPollInterval = RUNTIME.weather.livePollMs;
      config.lastUpdated = new Date();
      
      console.log(`🎯 Weather-on-Live: Disarmed monitoring for game ${gameId} - returning to ${config.currentPollInterval}ms polling`);
      
      // Restart timer with normal interval
      this.restartPollingTimer(config);
      
      return true;
    } catch (error) {
      console.error(`❌ Failed to disarm weather monitoring for ${gameId}:`, error);
      return false;
    }
  }
  
  /**
   * Get current weather monitoring status
   */
  getMonitoringStatus(): {
    totalGames: number;
    armedGames: number;
    games: Array<{
      gameId: string;
      sport: string;
      teams: string;
      isArmed: boolean;
      armReason?: WeatherArmReason;
      pollInterval: number;
      lastPolled?: Date;
      nextPoll?: Date;
    }>;
    circuitBreakerOpen: boolean;
    consecutiveFailures: number;
  } {
    const games = Array.from(this.monitoringConfigs.values()).map(config => ({
      gameId: config.gameId,
      sport: config.sport,
      teams: `${config.awayTeam} @ ${config.homeTeam}`,
      isArmed: config.isArmed,
      armReason: config.armReason,
      pollInterval: config.currentPollInterval,
      lastPolled: config.lastPolled,
      nextPoll: config.nextPollTime
    }));
    
    return {
      totalGames: this.monitoringConfigs.size,
      armedGames: games.filter(g => g.isArmed).length,
      games,
      circuitBreakerOpen: this.circuitBreakerOpen,
      consecutiveFailures: this.consecutiveApiFailures
    };
  }
  
  /**
   * WebSocket server setup removed - using HTTP polling architecture
   */
  // No longer needed with HTTP polling architecture
  
  // === PRIVATE WEATHER MONITORING METHODS ===
  
  private async performWeatherCheck(config: WeatherMonitoringConfig): Promise<void> {
    try {
      // Get weather for venue (use home team)
      const currentWeather = await this.weatherService.getWeatherForTeam(config.homeTeam);
      
      config.lastPolled = new Date();
      config.nextPollTime = new Date(Date.now() + config.currentPollInterval);
      
      // Check for arming decay
      if (config.isArmed && config.armedUntil && new Date() > config.armedUntil) {
        await this.disarmWeatherMonitoring(config.gameId);
        return; // Config updated by disarm, continue with new interval
      }
      
      // Compare with previous reading if available
      if (config.lastWeatherData) {
        const weatherChanges = await this.evaluateWeatherChanges(
          config,
          config.lastWeatherData,
          currentWeather
        );
        
        // Generate alerts for significant changes
        for (const change of weatherChanges) {
          if (change.shouldAlert && await this.shouldGenerateAlert(change)) {
            await this.generateWeatherAlert(change);
          }
        }
      }
      
      // Store current weather for next comparison
      config.lastWeatherData = currentWeather;
      config.lastUpdated = new Date();
      
      // Reset failure count on success
      config.consecutiveFailures = 0;
      this.consecutiveApiFailures = 0;
      if (this.circuitBreakerOpen) {
        this.circuitBreakerOpen = false;
        this.circuitBreakerResetTime = undefined;
        console.log(`✅ Weather API circuit breaker closed - service restored`);
      }
      
    } catch (error) {
      console.error(`❌ Weather check failed for game ${config.gameId}:`, error);
      
      // Increment failure counts
      config.consecutiveFailures++;
      this.consecutiveApiFailures++;
      
      // Check circuit breaker threshold
      if (this.consecutiveApiFailures >= this.maxConsecutiveFailures && !this.circuitBreakerOpen) {
        this.circuitBreakerOpen = true;
        this.circuitBreakerResetTime = new Date(Date.now() + this.circuitBreakerTimeoutMs);
        console.log(`🚫 Weather API circuit breaker opened after ${this.consecutiveApiFailures} failures - service paused for ${this.circuitBreakerTimeoutMs / 1000}s`);
      }
      
      // Use exponential backoff for this specific game
      config.currentPollInterval = Math.min(
        config.currentPollInterval * Math.pow(2, Math.min(config.consecutiveFailures, 4)),
        10 * 60 * 1000 // Cap at 10 minutes
      );
      
      config.nextPollTime = new Date(Date.now() + config.currentPollInterval);
    }
  }
  
  private async evaluateWeatherChanges(
    config: WeatherMonitoringConfig,
    previous: WeatherData,
    current: WeatherData
  ): Promise<WeatherChangeEvent[]> {
    const evaluator = this.weatherEvaluators.get(config.sport);
    if (!evaluator) {
      console.warn(`⚠️ No weather evaluator found for sport: ${config.sport}`);
      return [];
    }
    
    const changes = evaluator.evaluateWeatherChange(previous, current, config.venue);
    
    // Set game ID on all changes
    changes.forEach(change => {
      change.gameId = config.gameId;
    });
    
    return changes;
  }
  
  private async shouldGenerateAlert(change: WeatherChangeEvent): Promise<boolean> {
    // Check alert cooldown
    const cooldownKey = `${change.gameId}-${change.changeType}`;
    const cooldownUntil = this.alertCooldowns.get(cooldownKey);
    
    if (cooldownUntil && new Date() < cooldownUntil) {
      return false; // Still in cooldown
    }
    
    // Set cooldown period based on severity
    let cooldownMinutes = 5; // Default 5 minutes
    switch (change.severity) {
      case 'extreme':
        cooldownMinutes = 2; // Short cooldown for extreme conditions
        break;
      case 'high':
        cooldownMinutes = 3;
        break;
      case 'moderate':
        cooldownMinutes = 5;
        break;
      case 'low':
        cooldownMinutes = 10; // Longer cooldown for minor changes
        break;
    }
    
    this.alertCooldowns.set(cooldownKey, new Date(Date.now() + cooldownMinutes * 60 * 1000));
    
    return true;
  }
  
  private async generateWeatherAlert(change: WeatherChangeEvent): Promise<void> {
    try {
      const config = this.monitoringConfigs.get(change.gameId);
      if (!config) {
        return;
      }
      
      // Create weather alert
      const alertKey = `weather_${change.gameId}_${change.changeType}_${Date.now()}`;
      const weatherAlert: Partial<InsertAlert> = {
        alertKey: alertKey,
        type: `WEATHER_${change.changeType}`,
        sport: change.sport,
        gameId: change.gameId,
        state: 'active',
        score: this.getSeverityPriority(change.severity),
        payload: {
          homeTeam: config.homeTeam,
          awayTeam: config.awayTeam,
          confidence: 0.9,
          message: this.generateWeatherAlertMessage(change, config),
          context: this.generateWeatherAlertContext(change, config),
          changeType: change.changeType,
          severity: change.severity,
          thresholdExceeded: change.thresholdExceeded,
          previousWeather: change.previousWeather,
          currentWeather: change.currentWeather,
          venue: config.venue
        }
      };
      
      // Check for duplicates using unified deduplicator
      const dedupKey = {
        gameId: change.gameId,
        type: change.changeType,
        sport: change.sport
      };
      if (!unifiedDeduplicator.shouldSendAlert(dedupKey)) {
        console.log(`🔄 Weather alert deduplicated: ${alertKey}`);
        return;
      }
      
      // Store alert - ensure all required fields are present
      const completeAlert = {
        alertKey: alertKey,
        sport: change.sport,
        gameId: change.gameId,
        type: `WEATHER_${change.changeType}`,
        state: 'active',
        payload: weatherAlert.payload || {},
        score: weatherAlert.score || 5
      };
      const savedAlert = await storage.createAlert(completeAlert);
      if (!savedAlert) {
        throw new Error('Failed to save weather alert');
      }
      
      console.log(`🌤️ Weather Alert Generated: ${(weatherAlert.payload as any)?.message} (Game: ${change.gameId})`);
      
      // Broadcast via SSE using global broadcast function
      try {
        const broadcastFunction = (global as any).broadcastAlertAfterSave;
        if (broadcastFunction) {
          broadcastFunction({
            type: 'weather_alert',
            alert: savedAlert,
            timestamp: new Date().toISOString()
          });
        } else {
          console.log('📡 SSE broadcast function not available for weather alert');
        }
      } catch (error) {
        console.error('Failed to send weather alert via SSE:', error);
      }
      
    } catch (error) {
      console.error(`❌ Failed to generate weather alert:`, error);
    }
  }
  
  private getSeverityPriority(severity: WeatherChangeEvent['severity']): number {
    switch (severity) {
      case 'extreme': return 10;
      case 'high': return 8;
      case 'moderate': return 6;
      case 'low': return 4;
      default: return 5;
    }
  }
  
  private generateWeatherAlertMessage(change: WeatherChangeEvent, config: WeatherMonitoringConfig): string {
    const gameInfo = `${config.awayTeam} @ ${config.homeTeam}`;
    
    switch (change.changeType) {
      case WeatherChangeType.WIND_SHIFT:
        return `🌬️ Wind direction shift affecting ${gameInfo} - ${change.thresholdExceeded}`;
      
      case WeatherChangeType.WIND_SPEED_CHANGE:
        return `💨 Strong winds impacting ${gameInfo} - ${change.thresholdExceeded}`;
      
      case WeatherChangeType.TEMPERATURE_CHANGE:
        return `🌡️ Extreme temperature affecting ${gameInfo} - ${change.thresholdExceeded}`;
      
      case WeatherChangeType.PRECIPITATION_START:
        return `🌧️ Precipitation starting at ${gameInfo} - Game conditions changing`;
      
      case WeatherChangeType.PRECIPITATION_STOP:
        return `☀️ Precipitation stopped at ${gameInfo} - Field conditions improving`;
      
      case WeatherChangeType.HUMIDITY_SPIKE:
        return `💧 Humidity spike at ${gameInfo} - ${change.thresholdExceeded}`;
      
      default:
        return `🌤️ Weather change detected at ${gameInfo} - ${change.thresholdExceeded}`;
    }
  }
  
  private generateWeatherAlertContext(change: WeatherChangeEvent, config: WeatherMonitoringConfig): string {
    const venue = config.venue || `${config.homeTeam} venue`;
    const current = change.currentWeather;
    
    let context = `Weather conditions at ${venue}: ${current.temperature}°F, ${current.condition}, `;
    context += `${current.windSpeed}mph winds from ${current.windDirection}°`;
    
    if (current.windGust) {
      context += `, gusts to ${current.windGust}mph`;
    }
    
    context += `, ${current.humidity}% humidity`;
    
    // Add sport-specific context
    if (config.sport === 'MLB') {
      const homeRunFactor = this.weatherService.calculateHomeRunFactor(current);
      if (homeRunFactor > 1.1) {
        context += ` - Conditions favor offensive production`;
      } else if (homeRunFactor < 0.9) {
        context += ` - Conditions suppress offensive output`;
      }
    } else if (['NFL', 'NCAAF', 'CFL'].includes(config.sport)) {
      if (current.windSpeed >= 15) {
        context += ` - High winds affecting passing game and field goals`;
      }
      if (current.temperature <= 32) {
        context += ` - Freezing conditions impacting ball handling`;
      }
    }
    
    return context;
  }
  
  // === POLLING TIMER MANAGEMENT ===
  
  private startPollingTimer(config: WeatherMonitoringConfig): void {
    const timer = setTimeout(async () => {
      if (this.monitoringConfigs.has(config.gameId)) {
        await this.performWeatherCheck(config);
        if (this.monitoringConfigs.has(config.gameId)) {
          this.startPollingTimer(config); // Schedule next check
        }
      }
    }, config.currentPollInterval);
    
    this.pollingTimers.set(config.gameId, timer);
  }
  
  private restartPollingTimer(config: WeatherMonitoringConfig): void {
    // Clear existing timer
    const existingTimer = this.pollingTimers.get(config.gameId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    
    // Start new timer with updated interval
    this.startPollingTimer(config);
  }
  
  private isCircuitBreakerOpen(): boolean {
    if (!this.circuitBreakerOpen) {
      return false;
    }
    
    // Check if circuit breaker should reset
    if (this.circuitBreakerResetTime && new Date() >= this.circuitBreakerResetTime) {
      this.circuitBreakerOpen = false;
      this.circuitBreakerResetTime = undefined;
      this.consecutiveApiFailures = 0;
      console.log(`🔄 Weather API circuit breaker reset - attempting to restore service`);
      return false;
    }
    
    return true;
  }
  
  // === CLEANUP METHODS ===
  
  /**
   * Stop all weather monitoring (for service shutdown)
   */
  async stopAllMonitoring(): Promise<void> {
    console.log(`🌤️ Weather-on-Live: Stopping all monitoring (${this.monitoringConfigs.size} games)`);
    
    // Clear all timers
    for (const timer of this.pollingTimers.values()) {
      clearTimeout(timer);
    }
    this.pollingTimers.clear();
    
    // Clear all configs
    this.monitoringConfigs.clear();
    
    // Clear alert cooldowns
    this.alertCooldowns.clear();
    
    console.log(`✅ Weather-on-Live: All monitoring stopped`);
  }
  
  /**
   * Get service health metrics
   */
  getHealthMetrics() {
    return {
      monitoredGames: this.monitoringConfigs.size,
      armedGames: Array.from(this.monitoringConfigs.values()).filter(c => c.isArmed).length,
      activeTimers: this.pollingTimers.size,
      alertCooldowns: this.alertCooldowns.size,
      circuitBreakerOpen: this.circuitBreakerOpen,
      consecutiveFailures: this.consecutiveApiFailures,
      circuitBreakerResetTime: this.circuitBreakerResetTime?.toISOString()
    };
  }
}

// Export singleton instance
export const weatherOnLiveService = new WeatherOnLiveService();