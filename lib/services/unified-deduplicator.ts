/**
 * Unified Deduplicator Service
 * 
 * Provides context-aware deduplication for alerts across all sports.
 * Prevents duplicate alerts from being generated for the same game situation.
 */

import type { Request, Response, NextFunction } from 'express';

interface DuplicationCacheEntry {
  timestamp: number;
  count: number;
  lastSeen: number;
}

interface DeduplicationStats {
  totalChecks: number;
  duplicatesBlocked: number;
  cacheSize: number;
  hitRate: number;
}

export class UnifiedDeduplicator {
  private alertCache: Map<string, DuplicationCacheEntry> = new Map();
  private requestCache: Map<string, number> = new Map();
  private readonly ALERT_TTL = 5 * 60 * 1000; // 5 minutes for alert deduplication
  private readonly REQUEST_TTL = 30 * 1000; // 30 seconds for request deduplication
  private stats = {
    totalChecks: 0,
    duplicatesBlocked: 0,
  };

  /**
   * Check if an alert is a duplicate based on context
   */
  isDuplicate(
    alertType: string,
    gameId: string,
    sport: string,
    context?: Record<string, any>
  ): boolean {
    this.stats.totalChecks++;

    // Create a unique key based on alert type, game, and critical context
    const contextKey = this.generateContextKey(alertType, gameId, sport, context);
    const cached = this.alertCache.get(contextKey);
    const now = Date.now();

    if (cached && (now - cached.lastSeen) < this.ALERT_TTL) {
      // Update last seen timestamp
      cached.lastSeen = now;
      cached.count++;
      this.stats.duplicatesBlocked++;
      return true; // This is a duplicate
    }

    // Not a duplicate - add to cache
    this.alertCache.set(contextKey, {
      timestamp: now,
      lastSeen: now,
      count: 1,
    });

    // Cleanup old entries periodically
    if (this.stats.totalChecks % 100 === 0) {
      this.cleanupCache();
    }

    return false;
  }

  /**
   * Generate a unique context key for deduplication
   */
  private generateContextKey(
    alertType: string,
    gameId: string,
    sport: string,
    context?: Record<string, any>
  ): string {
    const parts = [sport, gameId, alertType];

    // Add context-specific parts for finer-grained deduplication
    if (context) {
      // If this is an AI-discovered alert, use situationHash
      if (context.source === 'ai_discovery' && context.situationHash) {
        parts.push(`HASH${context.situationHash}`);
        return parts.join(':');
      }

      // For MLB: include inning and outs
      if (context.inning !== undefined) parts.push(`I${context.inning}`);
      if (context.outs !== undefined) parts.push(`O${context.outs}`);

      // For football: include quarter, down, and field position
      if (context.quarter !== undefined) parts.push(`Q${context.quarter}`);
      if (context.down !== undefined) parts.push(`D${context.down}`);
      if (context.fieldPosition !== undefined) parts.push(`FP${context.fieldPosition}`);

      // For basketball: include period and time
      if (context.period !== undefined) parts.push(`P${context.period}`);
      if (context.timeRemaining !== undefined) parts.push(`T${context.timeRemaining}`);

      // For score-based alerts
      if (context.homeScore !== undefined && context.awayScore !== undefined) {
        parts.push(`S${context.homeScore}-${context.awayScore}`);
      }
    }

    return parts.join(':');
  }

  /**
   * Clear duplicate tracking for a specific game (e.g., when game ends)
   */
  clearGame(gameId: string): void {
    const keysToDelete: string[] = [];
    
    for (const [key] of this.alertCache) {
      if (key.includes(gameId)) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => this.alertCache.delete(key));
  }

  /**
   * Cleanup expired cache entries
   */
  private cleanupCache(): void {
    const now = Date.now();
    const alertsToDelete: string[] = [];
    const requestsToDelete: string[] = [];

    // Cleanup alert cache
    for (const [key, entry] of this.alertCache) {
      if (now - entry.lastSeen > this.ALERT_TTL) {
        alertsToDelete.push(key);
      }
    }

    // Cleanup request cache
    for (const [key, timestamp] of this.requestCache) {
      if (now - timestamp > this.REQUEST_TTL) {
        requestsToDelete.push(key);
      }
    }

    alertsToDelete.forEach(key => this.alertCache.delete(key));
    requestsToDelete.forEach(key => this.requestCache.delete(key));
  }

  /**
   * Express middleware for request deduplication
   * Prevents duplicate API requests within a short time window
   */
  requestMiddleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      // Only deduplicate GET requests to prevent blocking legitimate POST/PUT/DELETE
      if (req.method !== 'GET') {
        return next();
      }

      // Create request key based on path and user session
      const userId = (req.session as any)?.userId || 'anonymous';
      const requestKey = `${userId}:${req.path}:${req.query.toString()}`;
      
      const now = Date.now();
      const lastRequest = this.requestCache.get(requestKey);

      // If duplicate request within TTL, return cached response marker
      if (lastRequest && (now - lastRequest) < this.REQUEST_TTL) {
        // Don't actually block, just mark it (frontend handles caching)
        res.setHeader('X-Deduplicated', 'true');
      }

      // Update request cache
      this.requestCache.set(requestKey, now);

      // Cleanup periodically
      if (this.requestCache.size > 1000) {
        this.cleanupCache();
      }

      next();
    };
  }

  /**
   * Get deduplication statistics
   */
  getStats(): DeduplicationStats {
    return {
      totalChecks: this.stats.totalChecks,
      duplicatesBlocked: this.stats.duplicatesBlocked,
      cacheSize: this.alertCache.size,
      hitRate: this.stats.totalChecks > 0 
        ? (this.stats.duplicatesBlocked / this.stats.totalChecks) * 100 
        : 0,
    };
  }

  /**
   * Reset all caches (useful for testing)
   */
  reset(): void {
    this.alertCache.clear();
    this.requestCache.clear();
    this.stats = {
      totalChecks: 0,
      duplicatesBlocked: 0,
    };
  }

  /**
   * Get cache size for monitoring
   */
  getCacheSize(): { alerts: number; requests: number } {
    return {
      alerts: this.alertCache.size,
      requests: this.requestCache.size,
    };
  }

  /**
   * Legacy method for backward compatibility
   * Checks if alert should be sent (inverse of isDuplicate)
   */
  shouldSendAlert(alertKey: any): boolean {
    const { gameId, type, ...context } = alertKey;
    const sport = alertKey.sport || 'UNKNOWN';
    
    // Extract paId if it's the situation key
    if (alertKey.paId) {
      return !this.isDuplicate(type, gameId, sport, context);
    }
    
    return !this.isDuplicate(type, gameId, sport, context);
  }
}

// Export singleton instance
export const unifiedDeduplicator = new UnifiedDeduplicator();
