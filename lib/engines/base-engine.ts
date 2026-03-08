/**
 * V4 Base Engine — Consolidated from 6 duplicated sport engines
 *
 * All shared logic lives here:
 * - parseTimeToSeconds, perf metrics, isAlertEnabled, initializeForUser
 * - loadAlertModule (dynamic with optional moduleMap override)
 * - initializeUserAlertModules (with change-detection caching)
 * - Possession tracking, timeout tracking
 * - getPerformanceMetrics, cleanupPerformanceMetrics
 * - Deduplication (single implementation)
 *
 * Sport engines only override:
 * - calculateProbability() — sport-specific weighting
 * - enhanceGameStateWithLiveData() — sport-specific API enrichment
 * - generateLiveAlerts() — only if sport needs pre/post processing
 * - getModuleMap() — optional hardcoded module paths
 * - getSportSpecificMetrics() — optional extra metric counters
 * - trackSportSpecificMetrics() — optional per-tick metric tracking
 */

import type { AlertResult } from '../../../shared/schema';
import { unifiedSettings } from '../../storage';
import { storage } from '../../storage';

export type { AlertResult };

export interface GameState {
  gameId: string;
  sport: string;
  homeTeam: string | { name?: string; abbreviation?: string; shortName?: string; displayName?: string };
  awayTeam: string | { name?: string; abbreviation?: string; shortName?: string; displayName?: string };
  homeScore: number;
  awayScore: number;
  status: string;
  isLive: boolean;
  [key: string]: unknown;
}

// ---- Performance metrics (shared shape) ------------------------------------

export interface EnginePerformanceMetrics {
  alertGenerationTime: number[];
  moduleLoadTime: number[];
  enhanceDataTime: number[];
  probabilityCalculationTime: number[];
  gameStateEnhancementTime: number[];
  totalRequests: number;
  totalAlerts: number;
  cacheHits: number;
  cacheMisses: number;
  [key: string]: number[] | number;  // allow sport-specific counters
}

function createBaseMetrics(): EnginePerformanceMetrics {
  return {
    alertGenerationTime: [],
    moduleLoadTime: [],
    enhanceDataTime: [],
    probabilityCalculationTime: [],
    gameStateEnhancementTime: [],
    totalRequests: 0,
    totalAlerts: 0,
    cacheHits: 0,
    cacheMisses: 0,
  };
}

// ---- Possession tracking ---------------------------------------------------

interface PossessionTracking {
  homeTeam: string;
  awayTeam: string;
  homePossessions: number;
  awayPossessions: number;
  currentPossession: 'home' | 'away' | null;
  lastPossessionChange: number;
  possessionHistory: Array<{
    team: 'home' | 'away';
    startTime: number;
    quarter?: number;
    fieldPosition?: number;
  }>;
}

// ---- Timeout tracking ------------------------------------------------------

interface TimeoutTracking {
  homeTeam: string;
  awayTeam: string;
  homeTimeoutsRemaining: number;
  awayTimeoutsRemaining: number;
  homeTimeoutsUsed: number;
  awayTimeoutsUsed: number;
  timeoutHistory: Array<{
    team: 'home' | 'away';
    quarter: number;
    timeRemaining?: string;
    timestamp: number;
  }>;
}

// ---- Base alert module (unchanged interface) --------------------------------

export abstract class BaseAlertModule {
  abstract alertType: string;
  abstract sport: string;
  abstract isTriggered(gameState: GameState): boolean;
  abstract generateAlert(gameState: GameState): AlertResult | null | Promise<AlertResult | null>;
  abstract calculateProbability(gameState: GameState): number;
  minConfidence?: number;
  dedupeWindowMs?: number;

  protected clampProb(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.round(Math.max(0, Math.min(100, value)));
  }

  protected getTeamName(team: unknown): string {
    if (!team) return 'Team';
    if (typeof team === 'string') return team;
    if (typeof team === 'object') {
      const t = team as Record<string, unknown>;
      return (t.name as string) || (t.abbreviation as string) || (t.displayName as string) || (t.shortName as string) || 'Team';
    }
    return 'Team';
  }

  protected composeMessage(parts: Array<string | undefined | null>): string {
    return parts.filter(Boolean).join(' • ');
  }

  protected tryDedupe(key: string, ttlMs = this.dedupeWindowMs ?? 15_000): boolean {
    return LocalDedupeLedger.touch(key, ttlMs);
  }
}

// ---- Single dedup ledger (process-local TTL) --------------------------------

class LocalDedupeLedger {
  private static map = new Map<string, number>();
  static touch(key: string, ttlMs: number): boolean {
    const now = Date.now();
    const last = this.map.get(key) ?? 0;
    if (now - last < ttlMs) return false;
    this.map.set(key, now);
    if (this.map.size > 5000) {
      const entries = Array.from(this.map.entries()).sort((a, b) => a[1] - b[1]);
      for (let i = 0; i < 1000; i++) this.map.delete(entries[i][0]);
    }
    return true;
  }
}

// ---- Base engine ------------------------------------------------------------

const DEBUG = process.env.NODE_ENV !== 'production';
const PERF_CAP = 100;

function trimArray(arr: number[]): number[] {
  return arr.length > PERF_CAP ? arr.slice(-PERF_CAP) : arr;
}

function avg(arr: number[]): number {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

export abstract class BaseSportEngine {
  protected sport: string;
  protected alertModules: Map<string, BaseAlertModule> = new Map();
  protected metrics: EnginePerformanceMetrics;

  // Tracking systems (opt-in per sport via constructor flags)
  private possessionTracking = new Map<string, PossessionTracking>();
  private timeoutTracking = new Map<string, TimeoutTracking>();
  protected defaultTimeoutsPerHalf: number;

  constructor(sport: string, opts?: { defaultTimeouts?: number }) {
    this.sport = sport;
    this.metrics = createBaseMetrics();
    this.defaultTimeoutsPerHalf = opts?.defaultTimeouts ?? 3;
  }

  // ---- Time parsing (was duplicated 20+ times) ----------------------------

  parseTimeToSeconds(timeString: string | unknown): number {
    if (!timeString || timeString === '0:00') return 0;
    try {
      const clean = String(timeString).trim().split(' ')[0];
      if (clean.includes(':')) {
        const [m, s] = clean.split(':').map(n => parseInt(n, 10) || 0);
        return m * 60 + s;
      }
      return parseInt(clean, 10) || 0;
    } catch {
      return 0;
    }
  }

  // ---- Alert enablement check (was copy-pasted in all 6 engines) ----------

  async isAlertEnabled(alertType: string): Promise<boolean> {
    try {
      const validAlerts = await this.getAvailableAlertTypes();
      if (!validAlerts.includes(alertType)) {
        if (DEBUG) console.log(`[${this.sport}] ${alertType} has no cylinder module — skipping`);
        return false;
      }
      return await unifiedSettings.isAlertEnabled(this.sport, alertType);
    } catch (error) {
      console.error(`[${this.sport}] Settings lookup error for ${alertType}:`, error);
      return true; // fail-open
    }
  }

  // ---- User initialization (was copy-pasted in all 6 engines) -------------

  async initializeForUser(userId: string): Promise<void> {
    try {
      const userPrefs = await storage.getUserAlertPreferencesBySport(userId, this.sport);
      if (userPrefs.length === 0) {
        if (DEBUG) console.log(`[${this.sport}] No preferences for user ${userId}`);
        return;
      }

      const enabledTypes = userPrefs.filter(p => p.enabled).map(p => String(p.alertType));
      const validAlerts = await this.getAvailableAlertTypes();
      const validEnabled = enabledTypes.filter(t => validAlerts.includes(t));

      const globallyEnabled: string[] = [];
      for (const alertType of validEnabled) {
        if (await this.isAlertEnabled(alertType)) {
          globallyEnabled.push(alertType);
        }
      }

      if (DEBUG) console.log(`[${this.sport}] Initializing for user ${userId}: ${globallyEnabled.length} alerts`);
      await this.initializeUserAlertModules(globallyEnabled);
    } catch (error) {
      console.error(`[${this.sport}] initializeForUser failed for ${userId}:`, error);
    }
  }

  // ---- Module loading (consolidated from all engines) ---------------------

  /** Override to provide a hardcoded module map for fast-path loading */
  protected getModuleMap(): Record<string, string> {
    return {};
  }

  async loadAlertModule(alertType: string): Promise<BaseAlertModule | null> {
    const t0 = Date.now();
    try {
      // Try sport-specific hardcoded map first
      const moduleMap = this.getModuleMap();
      let modulePath = moduleMap[alertType];

      if (!modulePath) {
        // Fall back to convention-based path
        const baseName = alertType
          .toLowerCase()
          .replace(`${this.sport.toLowerCase()}_`, '')
          .replace(/_/g, '-');
        modulePath = `./alert-cylinders/${this.sport.toLowerCase()}/${baseName}-module.ts`;
      }

      const imported = await import(modulePath);
      const ModuleClass = (imported.default ?? imported[Object.keys(imported)[0]]) as new () => BaseAlertModule;
      const instance = new ModuleClass();

      if (instance.sport && instance.sport.toUpperCase() !== this.sport.toUpperCase()) {
        console.warn(`[${this.sport}] Module sport mismatch for ${alertType}: got ${instance.sport}`);
      }

      const dt = Date.now() - t0;
      this.metrics.moduleLoadTime.push(dt);
      if (dt > 50 && DEBUG) console.log(`[${this.sport}] Slow module load: ${alertType} ${dt}ms`);
      return instance;
    } catch (error) {
      console.error(`[${this.sport}] Failed to load module ${alertType}:`, error);
      return null;
    }
  }

  // ---- Module initialization (with change-detection caching) --------------

  async initializeUserAlertModules(enabledAlertTypes: string[]): Promise<void> {
    const current = Array.from(this.alertModules.keys()).sort();
    const next = Array.from(new Set(
      (enabledAlertTypes ?? []).filter(Boolean).map(t => String(t).trim().toUpperCase())
    )).sort();

    if (JSON.stringify(current) === JSON.stringify(next) && this.alertModules.size > 0) {
      if (DEBUG) console.log(`[${this.sport}] Modules unchanged (${this.alertModules.size} loaded)`);
      return;
    }

    this.alertModules.clear();

    let loaded = 0;
    for (const alertType of next) {
      const mod = await this.loadAlertModule(alertType);
      if (mod) {
        this.alertModules.set(alertType, mod);
        loaded++;
      }
    }
    if (DEBUG) console.log(`[${this.sport}] Loaded ${loaded}/${next.length} modules`);
  }

  // ---- Alert generation ---------------------------------------------------

  abstract calculateProbability(gameState: GameState): Promise<number>;

  async generateLiveAlerts(gameState: GameState): Promise<AlertResult[]> {
    const alerts: AlertResult[] = [];
    if (!gameState?.isLive) return alerts;

    for (const [alertType, module] of this.alertModules) {
      try {
        if (!module.isTriggered(gameState)) continue;
        const alert = await Promise.resolve(module.generateAlert(gameState));
        if (alert) alerts.push(alert);
      } catch (error) {
        console.error(`[${this.sport}] Error in ${alertType}:`, error);
      }
    }
    return alerts;
  }

  // ---- Alert type discovery -----------------------------------------------

  async getAvailableAlertTypes(): Promise<string[]> {
    try {
      const fs = await import('fs');
      const path = await import('path');
      const { fileURLToPath } = await import('url');

      const currentDir = path.dirname(fileURLToPath(import.meta.url));
      const cylinderDir = path.join(currentDir, `alert-cylinders/${this.sport.toLowerCase()}`);

      if (!fs.existsSync(cylinderDir)) return [];

      const MODULE_SUFFIXES = ['-module.ts', '-module.tsx', '-module.js', '-module.mjs', '-module.cjs'];
      return fs.readdirSync(cylinderDir)
        .filter((file: string) => MODULE_SUFFIXES.some(sfx => file.endsWith(sfx)))
        .map((file: string) => {
          const base = MODULE_SUFFIXES.reduce((name, sfx) => name.replace(sfx, ''), file);
          return `${this.sport}_${base.replace(/-/g, '_').toUpperCase()}`;
        })
        .sort();
    } catch (error) {
      console.error(`[${this.sport}] Error discovering alert types:`, error);
      return [];
    }
  }

  // ---- Possession tracking (was in NFL, CFL, NCAAF) ----------------------

  trackPossessionChange(
    gameId: string,
    homeTeam: string,
    awayTeam: string,
    possessionSide: 'home' | 'away' | null,
    quarter?: number,
    fieldPosition?: number
  ): void {
    if (!possessionSide) return;

    let tracking = this.possessionTracking.get(gameId);
    if (!tracking) {
      tracking = { homeTeam, awayTeam, homePossessions: 0, awayPossessions: 0, currentPossession: null, lastPossessionChange: Date.now(), possessionHistory: [] };
      this.possessionTracking.set(gameId, tracking);
    }

    if (tracking.currentPossession !== possessionSide) {
      if (possessionSide === 'home') tracking.homePossessions++;
      else tracking.awayPossessions++;

      tracking.possessionHistory.push({ team: possessionSide, startTime: Date.now(), quarter, fieldPosition });
      tracking.currentPossession = possessionSide;
      tracking.lastPossessionChange = Date.now();
    }
  }

  public getPossessionStats(gameId: string): any {
    const tracking = this.possessionTracking.get(gameId);
    if (!tracking) return { gameId, tracked: false, message: 'No possession data tracked for this game' };

    return {
      gameId, tracked: true,
      homeTeam: tracking.homeTeam, awayTeam: tracking.awayTeam,
      homePossessions: tracking.homePossessions, awayPossessions: tracking.awayPossessions,
      currentPossession: tracking.currentPossession,
      currentPossessionTeam: tracking.currentPossession === 'home' ? tracking.homeTeam : tracking.awayTeam,
      totalPossessions: tracking.homePossessions + tracking.awayPossessions,
      possessionHistory: tracking.possessionHistory,
      lastChange: new Date(tracking.lastPossessionChange).toISOString()
    };
  }

  public getAllPossessionStats(): any[] {
    return Array.from(this.possessionTracking.entries()).map(([gameId, t]) => ({
      gameId, homeTeam: t.homeTeam, awayTeam: t.awayTeam,
      homePossessions: t.homePossessions, awayPossessions: t.awayPossessions,
      currentPossession: t.currentPossession,
      currentPossessionTeam: t.currentPossession === 'home' ? t.homeTeam : t.awayTeam,
      totalPossessions: t.homePossessions + t.awayPossessions
    }));
  }

  public clearPossessionTracking(gameId: string): void {
    this.possessionTracking.delete(gameId);
  }

  // ---- Timeout tracking (was in NFL, CFL, NCAAF) -------------------------

  public async initializeTimeoutTracking(gameId: string, homeTeam: string, awayTeam: string): Promise<void> {
    await this.updateTimeoutsFromESPN(gameId, homeTeam, awayTeam, null, null, 1);
  }

  async updateTimeoutsFromESPN(
    gameId: string, homeTeam: string, awayTeam: string,
    homeTimeoutsRemaining: number | null | undefined,
    awayTimeoutsRemaining: number | null | undefined,
    quarter: number
  ): Promise<void> {
    let tracking = this.timeoutTracking.get(gameId);

    if (!tracking) {
      tracking = {
        homeTeam, awayTeam,
        homeTimeoutsRemaining: homeTimeoutsRemaining ?? this.defaultTimeoutsPerHalf,
        awayTimeoutsRemaining: awayTimeoutsRemaining ?? this.defaultTimeoutsPerHalf,
        homeTimeoutsUsed: 0, awayTimeoutsUsed: 0,
        timeoutHistory: []
      };
      this.timeoutTracking.set(gameId, tracking);

      if (homeTimeoutsRemaining == null && awayTimeoutsRemaining == null) {
        try {
          const { getSportsDataApi } = await import('../sportsdata-api');
          const sportsDataApi = getSportsDataApi();
          const data = await sportsDataApi.getTimeoutData(this.sport, gameId);
          if (data.homeTimeoutsRemaining !== null || data.awayTimeoutsRemaining !== null) {
            homeTimeoutsRemaining = data.homeTimeoutsRemaining ?? undefined;
            awayTimeoutsRemaining = data.awayTimeoutsRemaining ?? undefined;
          } else {
            return;
          }
        } catch {
          return;
        }
      }
    }

    if (homeTimeoutsRemaining == null && awayTimeoutsRemaining == null) return;

    const prevHome = tracking.homeTimeoutsRemaining;
    const prevAway = tracking.awayTimeoutsRemaining;

    if (homeTimeoutsRemaining != null) {
      tracking.homeTimeoutsRemaining = homeTimeoutsRemaining;
      tracking.homeTimeoutsUsed = this.defaultTimeoutsPerHalf - homeTimeoutsRemaining;
      if (homeTimeoutsRemaining < prevHome) {
        tracking.timeoutHistory.push({ team: 'home', quarter, timestamp: Date.now() });
      }
    }

    if (awayTimeoutsRemaining != null) {
      tracking.awayTimeoutsRemaining = awayTimeoutsRemaining;
      tracking.awayTimeoutsUsed = this.defaultTimeoutsPerHalf - awayTimeoutsRemaining;
      if (awayTimeoutsRemaining < prevAway) {
        tracking.timeoutHistory.push({ team: 'away', quarter, timestamp: Date.now() });
      }
    }
  }

  public getTimeoutStats(gameId: string): any {
    const tracking = this.timeoutTracking.get(gameId);
    if (!tracking) return { gameId, tracked: false, message: 'No timeout data tracked for this game' };

    return {
      gameId, tracked: true,
      homeTeam: tracking.homeTeam, awayTeam: tracking.awayTeam,
      homeTimeoutsRemaining: tracking.homeTimeoutsRemaining,
      awayTimeoutsRemaining: tracking.awayTimeoutsRemaining,
      homeTimeoutsUsed: tracking.homeTimeoutsUsed,
      awayTimeoutsUsed: tracking.awayTimeoutsUsed,
      timeoutHistory: tracking.timeoutHistory
    };
  }

  public clearTimeoutTracking(gameId: string): void {
    this.timeoutTracking.delete(gameId);
  }

  // ---- Performance metrics (was copy-pasted 6 times) ---------------------

  protected pushMetric(key: keyof EnginePerformanceMetrics, value: number): void {
    const arr = this.metrics[key];
    if (Array.isArray(arr)) {
      arr.push(value);
      if (arr.length > PERF_CAP) {
        (this.metrics as any)[key] = arr.slice(-PERF_CAP);
      }
    }
  }

  protected incrementMetric(key: keyof EnginePerformanceMetrics, amount = 1): void {
    if (typeof this.metrics[key] === 'number') {
      (this.metrics as any)[key] += amount;
    }
  }

  /** Override to add sport-specific metric fields to the report */
  protected getSportSpecificMetrics(): Record<string, any> {
    return {};
  }

  /** Override to track sport-specific counters each tick */
  protected trackSportSpecificMetrics(_gameState: GameState): void {}

  getPerformanceMetrics(): any {
    const avgCalc = avg(this.metrics.probabilityCalculationTime);
    const avgAlert = avg(this.metrics.alertGenerationTime);
    const avgEnhance = avg(this.metrics.gameStateEnhancementTime);
    const total = this.metrics.cacheHits + this.metrics.cacheMisses;
    const cacheHitRate = total > 0 ? (this.metrics.cacheHits / total) * 100 : 0;

    return {
      sport: this.sport,
      performance: {
        avgResponseTime: avgCalc + avgAlert + avgEnhance,
        avgCalculationTime: avgCalc,
        avgAlertGenerationTime: avgAlert,
        avgEnhancementTime: avgEnhance,
        cacheHitRate,
        totalRequests: this.metrics.totalRequests,
        totalAlerts: this.metrics.totalAlerts,
        cacheHits: this.metrics.cacheHits,
        cacheMisses: this.metrics.cacheMisses,
      },
      sportSpecific: this.getSportSpecificMetrics(),
      recentPerformance: {
        calculationTimes: this.metrics.probabilityCalculationTime.slice(-20),
        alertTimes: this.metrics.alertGenerationTime.slice(-20),
        enhancementTimes: this.metrics.gameStateEnhancementTime.slice(-20),
      }
    };
  }

  cleanupPerformanceMetrics(): void {
    for (const key of Object.keys(this.metrics)) {
      const val = this.metrics[key];
      if (Array.isArray(val) && val.length > PERF_CAP) {
        (this.metrics as any)[key] = val.slice(-PERF_CAP);
      }
    }
  }

  // ---- Team name helper ---------------------------------------------------

  protected getTeamNameString(team: unknown): string {
    if (!team) return '';
    if (typeof team === 'string') return team;
    if (typeof team === 'object') {
      const t = team as Record<string, unknown>;
      return (t.name as string) || (t.abbreviation as string) || (t.displayName as string) || '';
    }
    return '';
  }
}
