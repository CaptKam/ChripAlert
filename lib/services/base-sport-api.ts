import { getPacificDate } from '../utils/timezone';
import { CircuitBreaker, protectedFetch } from '../middleware/circuit-breaker';

// Configuration interface for sport-specific settings
interface SportApiConfiguration {
  baseUrl: string;
  circuit: CircuitBreaker;
  sportTag: string;
  rateLimits: {
    live: number;
    scheduled: number;
    final: number;
    delayed: number;
    default: number;
  };
  cacheTtl: {
    live: number;
    scheduled: number;
    final: number;
    delayed: number;
    batch: number;
    default: number;
  };
  enableMetrics?: boolean;
}

// Performance metrics interface
interface PerformanceMetrics {
  requests: number[];
  apiLatency: number[];
  cacheHits: number;
  cacheMisses: number;
  totalRequests: number;
  rateLimitHits: number;
  errorCount: number;
}

// Cache entry interface
interface CacheEntry {
  data: any;
  timestamp: number;
  ttl: number;
}

// Base game data interface
export interface BaseGameData {
  id: string;
  sport: string;
  homeTeam: {
    id: string;
    name: string;
    abbreviation: string;
    score: number;
  };
  awayTeam: {
    id: string;
    name: string;
    abbreviation: string;
    score: number;
  };
  startTime: string;
  status: string;
  isLive: boolean;
  venue: string;
  [key: string]: any; // Allow sport-specific fields
}

export abstract class BaseSportApi {
  protected readonly config: SportApiConfiguration;
  private lastCall: { [key: string]: number } = {};
  private cache: { [key: string]: CacheEntry } = {};
  private performanceMetrics?: PerformanceMetrics;

  constructor(config: SportApiConfiguration) {
    this.config = config;
    
    if (config.enableMetrics) {
      this.performanceMetrics = {
        requests: [],
        apiLatency: [],
        cacheHits: 0,
        cacheMisses: 0,
        totalRequests: 0,
        rateLimitHits: 0,
        errorCount: 0
      };
    }
  }

  // Abstract methods that each sport must implement
  protected abstract buildTodaysGamesUrl(targetDate: string): string;
  protected abstract parseGamesResponse(data: any): BaseGameData[];
  protected abstract buildEnhancedGameUrl(gameId: string): string;
  protected abstract parseEnhancedGameResponse(data: any, gameId: string): Promise<any>;

  // Shared rate limiting logic
  protected canMakeCall(endpoint: string, gameState: string = 'default'): boolean {
    const now = Date.now();
    const lastCallTime = this.lastCall[endpoint] || 0;
    const rateLimit = this.config.rateLimits[gameState as keyof typeof this.config.rateLimits] || this.config.rateLimits.default;
    
    if (now - lastCallTime < rateLimit) {
      if (this.performanceMetrics) {
        this.performanceMetrics.rateLimitHits++;
      }
      console.log(`🚫 ${this.config.sportTag} API: Rate limited ${endpoint} (${rateLimit}ms cooldown for ${gameState})`);
      return false;
    }
    
    this.lastCall[endpoint] = now;
    return true;
  }

  // OPTIMIZED: Faster caching logic with reduced overhead
  protected getCached(key: string, forceCheck: boolean = false): any | null {
    const cached = this.cache[key];
    if (cached) {
      const age = Date.now() - cached.timestamp;
      const isExpired = age >= cached.ttl;
      
      if (!isExpired && !forceCheck) {
        if (this.performanceMetrics) {
          this.performanceMetrics.cacheHits++;
        }
        // OPTIMIZED: Reduced console logging for performance
        if (age > 5000) { // Only log if cache is older than 5s
          console.log(`📋 ${this.config.sportTag} API: Using cached data for ${key} (${Math.round(age/1000)}s old, TTL: ${Math.round(cached.ttl/1000)}s)`);
        }
        return cached.data;
      }
    }
    
    if (this.performanceMetrics) {
      this.performanceMetrics.cacheMisses++;
    }
    return null;
  }

  // OPTIMIZED: Enhanced cache setting with automatic cleanup
  protected setCache(key: string, data: any, cacheType: string = 'default'): void {
    const ttl = this.config.cacheTtl[cacheType as keyof typeof this.config.cacheTtl] || this.config.cacheTtl.default;
    
    // OPTIMIZED: For live games, use shorter TTL for fresher data
    const optimizedTtl = cacheType === 'live' && this.config.sportTag === 'NCAAF' ? 
      Math.min(ttl, 5000) : ttl; // NCAAF live games get max 5s cache
    
    this.cache[key] = { 
      data, 
      timestamp: Date.now(),
      ttl: optimizedTtl
    };
    
    // OPTIMIZED: Periodic cache cleanup to prevent memory bloat (every 50 cache sets)
    if (Object.keys(this.cache).length % 50 === 0) {
      this.cleanupExpiredCache();
    }
  }

  // Shared request logic with circuit breaker integration
  protected async requestJson(url: string, options?: RequestInit): Promise<any> {
    const startTime = Date.now();
    
    if (this.performanceMetrics) {
      this.performanceMetrics.totalRequests++;
    }

    try {
      const response = await protectedFetch(this.config.circuit, url, options);
      
      if (!response.ok) {
        throw new Error(`${this.config.sportTag} API error: ${response.status}`);
      }

      const data = await response.json();
      
      if (this.performanceMetrics) {
        const latency = Date.now() - startTime;
        this.performanceMetrics.apiLatency.push(latency);
        this.performanceMetrics.requests.push(Date.now());
      }

      return data;
    } catch (error) {
      if (this.performanceMetrics) {
        this.performanceMetrics.errorCount++;
      }
      throw error;
    }
  }

  // Shared game status mapping logic
  // OPTIMIZED: Automatic cache cleanup
  protected cleanupExpiredCache(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];
    
    for (const [key, entry] of Object.entries(this.cache)) {
      if (now - entry.timestamp >= entry.ttl) {
        keysToDelete.push(key);
      }
    }
    
    for (const key of keysToDelete) {
      delete this.cache[key];
    }
  }

  protected mapGameStatus(statusName: string): string {
    const lowerStatus = statusName.toLowerCase();
    
    if (lowerStatus.includes('in_progress') || lowerStatus.includes('live') || lowerStatus.includes('status_in_progress')) {
      return 'live';
    }
    if (lowerStatus.includes('final') || lowerStatus.includes('status_final')) {
      return 'final';
    }
    if (lowerStatus.includes('postponed') || lowerStatus.includes('delayed') || lowerStatus.includes('status_postponed')) {
      return 'delayed';
    }
    
    return 'scheduled';
  }

  // Standardized live game detection logic across all sports
  protected isGameLive(game: any, apiType: 'mlb' | 'espn' = 'espn'): boolean {
    try {
      if (apiType === 'mlb') {
        // MLB API format - more strict criteria from mlb-api.ts
        const status = game.status || {};
        
        // Check if status explicitly indicates live state
        const statusIndicatesLive = status.abstractGameState === 'Live' || 
                                   status.detailedState?.toLowerCase().includes('progress') ||
                                   status.detailedState?.toLowerCase().includes('inning');
        
        // Check if game is finished (must respect final status)
        const isGameFinished = status.abstractGameState === 'Final' || 
                              status.detailedState?.toLowerCase().includes('final') ||
                              status.detailedState?.toLowerCase().includes('completed');
        
        // Check if game is in pre-game/scheduled state
        const isPreGameOrScheduled = status.abstractGameState === 'Preview' || 
                                   status.detailedState?.toLowerCase().includes('pre-game') ||
                                   status.detailedState?.toLowerCase().includes('scheduled') ||
                                   status.detailedState?.toLowerCase().includes('warmup');
        
        // Only mark as live if status explicitly indicates live AND not pre-game AND not finished
        return statusIndicatesLive && !isPreGameOrScheduled && !isGameFinished;
        
      } else {
        // ESPN API format - used by NFL, NBA, NCAAF, WNBA, CFL
        const statusState = game.status?.type?.state;
        const statusName = game.status?.type?.name?.toLowerCase() || '';
        
        // Apply similar strict criteria as MLB to prevent false live detection
        if (!statusState) return false;
        
        // Consider both 'in' state and halftime as live
        const isInProgress = statusState === 'in';
        const isHalftime = statusName.includes('halftime') || statusName.includes('status_halftime');
        
        if (!isInProgress && !isHalftime) return false;
        
        // Additional safety checks to avoid pre-game false positives
        // But allow halftime to pass through
        if (!isHalftime) {
          // Explicitly exclude known non-live states only if not halftime
          if (statusName.includes('pre') || 
              statusName.includes('scheduled') || 
              statusName.includes('final') || 
              statusName.includes('completed') ||
              statusName.includes('postponed') ||
              statusName.includes('delayed')) {
            return false;
          }
        }
        
        return true;
      }
    } catch (error) {
      console.error(`❌ Error in standardized live detection for ${this.config.sportTag}:`, error);
      return false; // Safe default - don't mark as live if we can't determine
    }
  }

  // Main getTodaysGames method using template pattern
  async getTodaysGames(date?: string, requestType: 'batch' | 'individual' = 'batch'): Promise<BaseGameData[]> {
    const targetDate = date || getPacificDate();
    const cacheKey = `${this.config.sportTag.toLowerCase()}_games_${targetDate}`;
    
    try {
      // Check cache first with appropriate TTL
      const cached = this.getCached(cacheKey);
      if (cached) return cached;
      
      // Rate limiting based on request type
      const gameState = requestType === 'batch' ? 'scheduled' : 'default';
      if (!this.canMakeCall('getTodaysGames', gameState)) {
        return this.getCached(cacheKey) || [];
      }
      
      const url = this.buildTodaysGamesUrl(targetDate);
      console.log(`🔄 ${this.config.sportTag} API: Fetching today's games for ${targetDate}`);

      const data = await this.requestJson(url);
      
      if (!data.events && !data.dates) {
        // Cache empty result with shorter TTL
        this.setCache(cacheKey, [], 'scheduled');
        return [];
      }

      const processedGames = this.parseGamesResponse(data);

      // Cache the result with appropriate TTL
      this.setCache(cacheKey, processedGames, 'batch');
      return processedGames;
    } catch (error) {
      console.error(`Error fetching ${this.config.sportTag} games:`, error);
      // Return cached data if available during error
      return this.getCached(cacheKey) || [];
    }
  }

  // Enhanced game data method using template pattern
  async getEnhancedGameData(gameId: string, gameState: 'live' | 'scheduled' | 'final' | 'delayed' = 'live'): Promise<any> {
    const cacheKey = `${this.config.sportTag.toLowerCase()}_enhanced_${gameId}`;
    
    try {
      // Check cache first with state-specific TTL
      const cached = this.getCached(cacheKey);
      if (cached) return cached;
      
      // Rate limiting based on game state
      if (!this.canMakeCall(`getEnhancedGameData_${gameId}`, gameState)) {
        return this.getCached(cacheKey) || this.getFallbackGameData();
      }

      console.log(`🔄 ${this.config.sportTag} API: Fetching enhanced data for ${gameState} game ${gameId}`);
      const url = this.buildEnhancedGameUrl(gameId);
      const data = await this.requestJson(url);

      const enhancedData = await this.parseEnhancedGameResponse(data, gameId);

      // Cache the result with state-specific TTL
      this.setCache(cacheKey, enhancedData, gameState);
      return enhancedData;
    } catch (error) {
      console.error(`❌ Error fetching enhanced ${this.config.sportTag} data for game ${gameId}:`, error);
      return this.getCached(cacheKey) || { error: true, message: error instanceof Error ? error.message : String(error) };
    }
  }

  // Fallback data for when enhanced data is unavailable
  protected getFallbackGameData(): any {
    return {
      error: true,
      message: `${this.config.sportTag} enhanced data temporarily unavailable`,
      fallback: true
    };
  }

  // Get performance metrics (if enabled)
  getPerformanceMetrics(): PerformanceMetrics | null {
    return this.performanceMetrics || null;
  }

  // Get cache statistics
  getCacheStats(): any {
    const cacheSize = Object.keys(this.cache).length;
    const now = Date.now();
    const expiredEntries = Object.values(this.cache).filter(entry => now - entry.timestamp >= entry.ttl).length;
    
    return {
      totalEntries: cacheSize,
      expiredEntries,
      activeEntries: cacheSize - expiredEntries,
      ...(this.performanceMetrics && {
        cacheHits: this.performanceMetrics.cacheHits,
        cacheMisses: this.performanceMetrics.cacheMisses,
        hitRatio: this.performanceMetrics.cacheHits / (this.performanceMetrics.cacheHits + this.performanceMetrics.cacheMisses)
      })
    };
  }

  // Manual cache cleanup
  clearExpiredCache(): void {
    const now = Date.now();
    let removedCount = 0;
    
    for (const [key, entry] of Object.entries(this.cache)) {
      if (now - entry.timestamp >= entry.ttl) {
        delete this.cache[key];
        removedCount++;
      }
    }
    
    if (removedCount > 0) {
      console.log(`🧹 ${this.config.sportTag} API: Cleared ${removedCount} expired cache entries`);
    }
  }
}