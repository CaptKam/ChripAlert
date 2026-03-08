import { z } from 'zod';
import pRetry from 'p-retry';

// Odds API response interfaces
interface OddsBookmaker {
  key: string;
  title: string;
  last_update: string;
  markets: {
    key: string; // 'h2h', 'spreads', 'totals'
    outcomes: {
      name: string;
      price: number;
      point?: number; // For spreads and totals
    }[];
  }[];
}

interface OddsApiEvent {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: OddsBookmaker[];
}

// Processed odds data for our system
export interface ProcessedOdds {
  gameId: string;
  sport: string;
  homeTeam: string;
  awayTeam: string;
  markets: {
    moneyline?: {
      home: number;
      away: number;
      bookmaker: string;
    };
    spread?: {
      points: number;
      home: number;
      away: number;
      bookmaker: string;
    };
    total?: {
      points: number;
      over: number;
      under: number;
      bookmaker: string;
    };
  };
  lastUpdated: string;
  dataQuality: 'excellent' | 'good' | 'limited' | 'poor';
}

// Cache structure for odds data
interface CachedOdds {
  data: ProcessedOdds[];
  timestamp: number;
  sport: string;
}

// Rate limiter class
class RateLimiter {
  private requests: number[] = [];
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(maxRequests = 450, windowMs = 30 * 24 * 60 * 60 * 1000) { // 450 requests per month
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  canMakeRequest(): boolean {
    const now = Date.now();
    // Remove old requests outside the window
    this.requests = this.requests.filter(time => now - time < this.windowMs);
    
    return this.requests.length < this.maxRequests;
  }

  recordRequest(): void {
    this.requests.push(Date.now());
  }

  getUsage(): { used: number; limit: number; resetDate: Date } {
    const now = Date.now();
    this.requests = this.requests.filter(time => now - time < this.windowMs);
    
    const oldestRequest = Math.min(...this.requests);
    const resetDate = new Date(oldestRequest + this.windowMs);
    
    return {
      used: this.requests.length,
      limit: this.maxRequests,
      resetDate
    };
  }
}

// Main Odds API Service
export class OddsApiService {
  private cache = new Map<string, CachedOdds>();
  private rateLimiter = new RateLimiter();
  private readonly baseUrl = 'https://api.the-odds-api.com/v4';
  private readonly cacheTimeoutMs = 5 * 60 * 1000; // 5 minutes
  private readonly fallbackCacheTimeoutMs = 10 * 60 * 1000; // 10 minutes fallback

  // Sport key mapping for The Odds API
  private sportKeyMap: Record<string, string> = {
    'MLB': 'baseball_mlb',
    'NFL': 'americanfootball_nfl',
    'NCAAF': 'americanfootball_ncaa',
    'NBA': 'basketball_nba',
    'WNBA': 'basketball_wnba',
    'CFL': 'americanfootball_cfl'
  };

  /**
   * Get processed odds data for a specific sport
   * Implements intelligent caching and graceful fallback
   */
  async getOddsForSport(sport: string, apiKey?: string): Promise<ProcessedOdds[]> {
    try {
      // Check cache first
      const cached = this.getCachedOdds(sport);
      if (cached && !this.isCacheExpired(cached)) {
        console.log(`📊 Odds Cache Hit: Using cached ${sport} odds (${Math.round((Date.now() - cached.timestamp) / 1000)}s old)`);
        return cached.data;
      }

      // Check rate limits
      if (!this.rateLimiter.canMakeRequest()) {
        console.warn(`⚠️ Odds API Rate Limit: Using stale cache for ${sport}`);
        return cached?.data || [];
      }

      // Fetch fresh data
      const oddsData = await this.fetchOddsFromApi(sport, apiKey);
      
      // Cache the results
      this.setCachedOdds(sport, oddsData);
      
      console.log(`✅ Odds API: Fresh ${sport} odds fetched and cached (${oddsData.length} games)`);
      return oddsData;

    } catch (error) {
      console.error(`❌ Odds API Error for ${sport}:`, error);
      
      // Return stale cache as fallback
      const staleCache = this.getCachedOdds(sport);
      if (staleCache) {
        console.warn(`🔄 Odds API: Using stale cache due to error for ${sport}`);
        return staleCache.data;
      }
      
      // No cache available, return empty array (graceful fallback)
      return [];
    }
  }

  /**
   * Fetch odds data from The Odds API with retry logic
   */
  private async fetchOddsFromApi(sport: string, apiKey?: string): Promise<ProcessedOdds[]> {
    const apiKeyToUse = apiKey || process.env.ODDS_API_KEY;
    
    if (!apiKeyToUse) {
      throw new Error('No Odds API key available');
    }

    const sportKey = this.sportKeyMap[sport];
    if (!sportKey) {
      throw new Error(`Unsupported sport: ${sport}`);
    }

    const url = `${this.baseUrl}/sports/${sportKey}/odds/`;
    const params = new URLSearchParams({
      apiKey: apiKeyToUse,
      regions: 'us',
      markets: 'h2h,spreads,totals',
      oddsFormat: 'american',
      dateFormat: 'iso'
    });

    return pRetry(async () => {
      this.rateLimiter.recordRequest();
      
      const response = await fetch(`${url}?${params}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'ChirpBot-Odds-Integration'
        },
        timeout: 10000 // 10 second timeout
      });

      if (!response.ok) {
        throw new Error(`Odds API HTTP ${response.status}: ${response.statusText}`);
      }

      const data: OddsApiEvent[] = await response.json();
      return this.processOddsData(data, sport);

    }, {
      retries: 2,
      minTimeout: 1000,
      maxTimeout: 3000,
      onFailedAttempt: (error) => {
        console.warn(`🔄 Odds API Retry ${error.attemptNumber}/3:`, error.message);
      }
    });
  }

  /**
   * Process raw odds data into our standardized format
   */
  private processOddsData(rawData: OddsApiEvent[], sport: string): ProcessedOdds[] {
    return rawData.map(event => {
      const markets: ProcessedOdds['markets'] = {};
      
      // Find the best bookmaker data (prioritize DraftKings, FanDuel, then any)
      const prioritizedBookmaker = this.findBestBookmaker(event.bookmakers);
      
      if (prioritizedBookmaker) {
        // Process moneyline
        const moneylineMarket = prioritizedBookmaker.markets.find(m => m.key === 'h2h');
        if (moneylineMarket && moneylineMarket.outcomes.length >= 2) {
          const homeOutcome = moneylineMarket.outcomes.find(o => o.name === event.home_team);
          const awayOutcome = moneylineMarket.outcomes.find(o => o.name === event.away_team);
          
          if (homeOutcome && awayOutcome) {
            markets.moneyline = {
              home: homeOutcome.price,
              away: awayOutcome.price,
              bookmaker: prioritizedBookmaker.title
            };
          }
        }

        // Process spread
        const spreadMarket = prioritizedBookmaker.markets.find(m => m.key === 'spreads');
        if (spreadMarket && spreadMarket.outcomes.length >= 2) {
          const homeOutcome = spreadMarket.outcomes.find(o => o.name === event.home_team);
          const awayOutcome = spreadMarket.outcomes.find(o => o.name === event.away_team);
          
          if (homeOutcome && awayOutcome && homeOutcome.point !== undefined) {
            markets.spread = {
              points: homeOutcome.point,
              home: homeOutcome.price,
              away: awayOutcome.price,
              bookmaker: prioritizedBookmaker.title
            };
          }
        }

        // Process totals
        const totalsMarket = prioritizedBookmaker.markets.find(m => m.key === 'totals');
        if (totalsMarket && totalsMarket.outcomes.length >= 2) {
          const overOutcome = totalsMarket.outcomes.find(o => o.name === 'Over');
          const underOutcome = totalsMarket.outcomes.find(o => o.name === 'Under');
          
          if (overOutcome && underOutcome && overOutcome.point !== undefined) {
            markets.total = {
              points: overOutcome.point,
              over: overOutcome.price,
              under: underOutcome.price,
              bookmaker: prioritizedBookmaker.title
            };
          }
        }
      }

      // Determine data quality based on available markets
      let dataQuality: ProcessedOdds['dataQuality'] = 'poor';
      const marketCount = Object.keys(markets).length;
      if (marketCount >= 3) dataQuality = 'excellent';
      else if (marketCount >= 2) dataQuality = 'good';
      else if (marketCount >= 1) dataQuality = 'limited';

      return {
        gameId: event.id,
        sport,
        homeTeam: event.home_team,
        awayTeam: event.away_team,
        markets,
        lastUpdated: new Date().toISOString(),
        dataQuality
      };
    });
  }

  /**
   * Find the best bookmaker based on priority and data completeness
   */
  private findBestBookmaker(bookmakers: OddsBookmaker[]): OddsBookmaker | null {
    if (!bookmakers.length) return null;

    // Priority bookmakers (most reliable odds)
    const priorities = ['draftkings', 'fanduel', 'betmgm', 'caesars'];
    
    for (const priority of priorities) {
      const bookmaker = bookmakers.find(b => 
        b.key.toLowerCase().includes(priority) && 
        b.markets.length > 0
      );
      if (bookmaker) return bookmaker;
    }

    // Fall back to any bookmaker with the most markets
    return bookmakers.reduce((best, current) => 
      current.markets.length > best.markets.length ? current : best
    );
  }

  /**
   * Cache management methods
   */
  private getCachedOdds(sport: string): CachedOdds | null {
    return this.cache.get(sport) || null;
  }

  private setCachedOdds(sport: string, data: ProcessedOdds[]): void {
    this.cache.set(sport, {
      data,
      timestamp: Date.now(),
      sport
    });
  }

  private isCacheExpired(cached: CachedOdds): boolean {
    const age = Date.now() - cached.timestamp;
    return age > this.cacheTimeoutMs;
  }

  /**
   * Get rate limiter usage statistics
   */
  getUsageStats() {
    return this.rateLimiter.getUsage();
  }

  /**
   * Clear cache for a specific sport or all sports
   */
  clearCache(sport?: string): void {
    if (sport) {
      this.cache.delete(sport);
      console.log(`🗑️ Odds Cache: Cleared cache for ${sport}`);
    } else {
      this.cache.clear();
      console.log(`🗑️ Odds Cache: Cleared all cached odds data`);
    }
  }

  /**
   * Check if odds API is available and configured
   */
  isAvailable(apiKey?: string): boolean {
    const key = apiKey || process.env.ODDS_API_KEY;
    return !!key && this.rateLimiter.canMakeRequest();
  }

  /**
   * Test API connection and return status
   */
  async testConnection(apiKey?: string): Promise<{
    success: boolean;
    message: string;
    usage?: { used: number; limit: number; resetDate: Date };
  }> {
    try {
      const keyToUse = apiKey || process.env.ODDS_API_KEY;
      
      if (!keyToUse) {
        return { success: false, message: 'No API key provided' };
      }

      if (!this.rateLimiter.canMakeRequest()) {
        return { 
          success: false, 
          message: 'Rate limit exceeded', 
          usage: this.rateLimiter.getUsage() 
        };
      }

      // Test with a simple sports list call (doesn't count against quota)
      const response = await fetch(`${this.baseUrl}/sports/?apiKey=${keyToUse}`, {
        timeout: 5000
      });

      if (response.ok) {
        return { 
          success: true, 
          message: 'Connection successful',
          usage: this.rateLimiter.getUsage()
        };
      } else {
        return { 
          success: false, 
          message: `API returned ${response.status}: ${response.statusText}` 
        };
      }

    } catch (error: any) {
      return { 
        success: false, 
        message: error.message || 'Connection failed' 
      };
    }
  }
}

// Export singleton instance
export const oddsApiService = new OddsApiService();