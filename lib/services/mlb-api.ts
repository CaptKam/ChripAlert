import { getPacificDate } from '../utils/timezone';
import { mlbApiCircuit, protectedFetch } from '../middleware/circuit-breaker';
import { BaseSportApi, type BaseGameData } from './base-sport-api';

type BatterStrength = 'elite' | 'strong' | 'average' | 'weak';

interface EnhancedLiveData {
  runners: { first: boolean; second: boolean; third: boolean };
  balls: number;
  strikes: number;
  outs: number;
  inning: number;
  inningState: 'Top' | 'Bottom' | 'Middle' | 'End' | null;
  isTopInning: boolean;
  homeScore: number;
  awayScore: number;
  gameState?: any;
  lineupData: {
    battingTeam: 'home' | 'away';
    currentBatterOrder: number;
    nextBatterOrder: number;
    onDeckBatterOrder: number;
    currentBatterStrength: BatterStrength;
    nextBatterStrength: BatterStrength;
    onDeckBatterStrength: BatterStrength;
  };
  currentBatter: string | null;
  currentBatterId: number | null;
  currentPitcher: string | null;
  currentPitcherId: number | null;
  onDeckBatter: string | null;
  lastPlay: {
    description: string | null;
    event: string | null;
    rbi: number;
    homeScore: number | null;
    awayScore: number | null;
  } | null;
  lastPitch: {
    pitchType: string | null;
    startSpeed: number | null;
    endSpeed: number | null;
    call: string | null;
    isStrike: boolean;
    isBall: boolean;
  } | null;
  pitchCount: number;
  lastUpdated: string;
}

export class MLBApiService extends BaseSportApi {
  // Optional lightweight ETag cache to reduce payloads on /feed/live
  private etags = new Map<string, string>();

  constructor() {
    super({
      baseUrl: 'https://statsapi.mlb.com/api',
      circuit: mlbApiCircuit,
      sportTag: 'MLB',
      rateLimits: {
        live: 200,        // 200ms for live games (high priority)
        scheduled: 4000,  // 4s for scheduled games (aligns with 5s polling cadence)
        final: 30000,     // 30s for final games
        delayed: 3000,    // 3s for delayed games
        default: 250
      },
      cacheTtl: {
        live: 500,         // 500ms for live game data
        scheduled: 15000,  // 15s for scheduled games
        final: 120000,     // 2min for finals
        delayed: 5000,     // 5s for delayed games
        batch: 8000,       // 8s for batch requests
        default: 1000
      }
    });
  }

  // ---- BaseSportApi required methods ---------------------------------------

  protected buildTodaysGamesUrl(targetDate: string): string {
    // Use /v1 for schedule lookups (lightweight)
    return `${this.config.baseUrl}/v1/schedule?sportId=1&date=${targetDate}&hydrate=team,linescore,venue,game(content(summary))`;
  }

  protected parseGamesResponse(data: any): BaseGameData[] {
    if (!data?.dates?.length) return [];

    const games = data.dates[0].games ?? [];
    return games.map((game: any) => {
      const homeScore = coerceInt(game?.linescore?.teams?.home?.runs, game?.teams?.home?.score, 0);
      const awayScore = coerceInt(game?.linescore?.teams?.away?.runs, game?.teams?.away?.score, 0);

      const gameId = String(game?.gamePk ?? '');
      const statusDetail: string = game?.status?.detailedState ?? '';
      const status = this.mapGameStatus(statusDetail);

      // Do not override official status with isLive; keep both
      const isLive = status === 'live';

      return {
        id: gameId,
        gameId,
        sport: 'MLB',
        homeTeam: {
          id: String(game?.teams?.home?.team?.id ?? ''),
          name: game?.teams?.home?.team?.name ?? 'Home',
          abbreviation: game?.teams?.home?.team?.abbreviation ?? '',
          score: homeScore
        },
        awayTeam: {
          id: String(game?.teams?.away?.team?.id ?? ''),
          name: game?.teams?.away?.team?.name ?? 'Away',
          abbreviation: game?.teams?.away?.team?.abbreviation ?? '',
          score: awayScore
        },
        status,
        startTime: game?.gameDate ?? null,
        venue: game?.venue?.name ?? null,
        isLive,
        // MLB-specific
        inning: coerceInt(game?.linescore?.currentInning, null),
        inningState: normalizeInningState(game?.linescore?.inningState)
      } as BaseGameData;
    });
  }

  protected buildEnhancedGameUrl(gameId: string): string {
    // Use /v1.1 feed/live for richer live data (plays, pitch events, etc.)
    return `${this.config.baseUrl}/v1.1/game/${gameId}/feed/live`;
  }

  protected async parseEnhancedGameResponse(data: any, gameId: string): Promise<EnhancedLiveData> {
    const liveData = data?.liveData ?? {};
    const gameData = data?.gameData ?? {};
    const linescore = liveData?.linescore ?? {};
    const currentPlay = liveData?.plays?.currentPlay;

    const runners = extractRunners(currentPlay, linescore);

    const count = currentPlay?.count ?? {};
    const balls = coerceInt(count?.balls, 0);
    const strikes = coerceInt(count?.strikes, 0);
    const outs = coerceInt(linescore?.outs, 0);

    const inning = coerceInt(linescore?.currentInning, 1);
    const inningState = normalizeInningState(linescore?.inningState);
    const isTopInning = inningState === 'Top';

    const homeScore = coerceInt(linescore?.teams?.home?.runs, 0);
    const awayScore = coerceInt(linescore?.teams?.away?.runs, 0);

    const lineupData = this.extractLineupData(liveData, gameData, isTopInning);
    const playerData = this.extractPlayerData(liveData, gameData, isTopInning);

    const lastPlay = this.extractLastPlay(liveData);
    const lastPitch = this.extractLastPitch(liveData);
    const pitchEvents = (currentPlay?.playEvents ?? []).filter((e: any) => e?.isPitch || e?.details?.isPitch);
    const pitchCount = pitchEvents.length;

    if (process.env.NODE_ENV !== 'production') {
      // Keep noise down in prod
      console.debug?.(`MLB live ${gameId}`, {
        inning, inningState, outs, balls, strikes, runners, homeScore, awayScore,
        batter: playerData.currentBatter, pitcher: playerData.currentPitcher
      });
    }

    return {
      runners,
      balls,
      strikes,
      outs,
      inning,
      inningState,
      isTopInning,
      homeScore,
      awayScore,
      gameState: liveData.gameState,
      lineupData,
      currentBatter: playerData.currentBatter,
      currentBatterId: playerData.currentBatterId,
      currentPitcher: playerData.currentPitcher,
      currentPitcherId: playerData.currentPitcherId,
      onDeckBatter: playerData.onDeckBatter,
      lastPlay,
      lastPitch,
      pitchCount,
      lastUpdated: new Date().toISOString()
    };
  }

  // ---- Convenience helpers exposed in your class ---------------------------

  // Uses ETag if available to reduce payload/latency. Falls back if not supported.
  async getLiveFeed(gameId: string): Promise<any> {
    const url = this.buildEnhancedGameUrl(gameId);

    const headers: Record<string, string> = {};
    const etag = this.etags.get(gameId);
    if (etag) headers['If-None-Match'] = etag;

    try {
      const response = await protectedFetch(mlbApiCircuit, url, { headers });
      if (response.status === 304) {
        // Not modified; upstream cache should already hold last JSON if you store it.
        // Return null here and let caller decide to reuse previous snapshot.
        return null;
      }
      if (!response.ok) {
        throw new Error(`MLB Live Feed API error: ${response.status}`);
      }
      const newEtag = response.headers.get('ETag');
      if (newEtag) this.etags.set(gameId, newEtag);

      return await response.json();
    } catch (error) {
      console.error('Error fetching live feed:', error);
      return null;
    }
  }

  protected getFallbackGameData(): EnhancedLiveData {
    return {
      runners: { first: false, second: false, third: false },
      balls: 0,
      strikes: 0,
      outs: 0,
      inning: 1,
      inningState: 'Top',
      isTopInning: true,
      lineupData: {
        battingTeam: 'home',
        currentBatterOrder: 1,
        nextBatterOrder: 2,
        onDeckBatterOrder: 3,
        currentBatterStrength: 'average',
        nextBatterStrength: 'average',
        onDeckBatterStrength: 'average'
      },
      currentBatter: null,
      currentBatterId: null,
      currentPitcher: null,
      currentPitcherId: null,
      onDeckBatter: null,
      homeScore: 0,
      awayScore: 0,
      lastPlay: null,
      lastPitch: null,
      pitchCount: 0,
      lastUpdated: new Date().toISOString()
    };
  }

  protected mapGameStatus(detailedState: string): 'scheduled' | 'live' | 'final' | 'delayed' {
    const s = (detailedState ?? '').toLowerCase();

    // Live variants from MLB API
    if (s.includes('progress') || s.includes('live') || s.includes('inning') || s.includes('in progress')) {
      return 'live';
    }
    // Completed/final
    if (s.includes('final') || s.includes('completed') || s.includes('game over')) {
      return 'final';
    }
    // Weather/administrative delays
    if (s.includes('delayed') || s.includes('postponed') || s.includes('suspended') || s.includes('warmup') || s.includes('manager challenge') || s.includes('review')) {
      return 'delayed';
    }
    // Preview, pre-game, scheduled
    return 'scheduled';
  }

  // ---- Private helpers -----------------------------------------------------

  private extractLineupData(liveData: any, gameData: any, isTopInning: boolean) {
    try {
      const battingTeam: 'home' | 'away' = isTopInning ? 'away' : 'home';
      const offense = liveData?.linescore?.offense ?? {};

      // MLB API often returns battingOrder as string like "101", "202" etc. Normalize to 1..9.
      const rawOrder = offense?.battingOrder;
      const orderNum = normalizeBattingOrder(rawOrder);

      const current = clamp(orderNum, 1, 9);
      const next = ((current) % 9) + 1;
      const onDeck = ((current + 1) % 9) + 1;

      return {
        battingTeam,
        currentBatterOrder: current,
        nextBatterOrder: next,
        onDeckBatterOrder: onDeck,
        currentBatterStrength: this.getBatterStrengthByPosition(current),
        nextBatterStrength: this.getBatterStrengthByPosition(next),
        onDeckBatterStrength: this.getBatterStrengthByPosition(onDeck)
      };
    } catch (err) {
      console.warn('Lineup data fallback:', (err as Error).message);
      return {
        battingTeam: (isTopInning ? 'away' : 'home') as 'home' | 'away',
        currentBatterOrder: 1,
        nextBatterOrder: 2,
        onDeckBatterOrder: 3,
        currentBatterStrength: 'average' as BatterStrength,
        nextBatterStrength: 'average' as BatterStrength,
        onDeckBatterStrength: 'average' as BatterStrength
      };
    }
  }

  private getBatterStrengthByPosition(position: number): BatterStrength {
    if (position >= 1 && position <= 2) return 'elite';   // table-setters / OBP
    if (position >= 3 && position <= 5) return 'strong';  // power core
    if (position >= 6 && position <= 7) return 'average';
    return 'weak'; // 8–9
  }

  private extractPlayerData(liveData: any, gameData: any, isTopInning: boolean) {
    try {
      const currentPlay = liveData?.plays?.currentPlay;
      const offense = liveData?.linescore?.offense;
      const boxscore = liveData?.boxscore;
      const battingTeamKey: 'home' | 'away' = isTopInning ? 'away' : 'home';
      const pitchingTeamKey: 'home' | 'away' = isTopInning ? 'home' : 'away';

      let currentBatter: string | null = null;
      let currentBatterId: number | null = null;
      let currentPitcher: string | null = null;
      let currentPitcherId: number | null = null;
      let onDeckBatter: string | null = null;

      // Strategy 1: currentPlay matchup
      if (currentPlay?.matchup) {
        currentBatter = currentPlay?.batter?.fullName ?? currentPlay?.matchup?.batter?.fullName ?? null;
        currentBatterId = coerceInt(currentPlay?.batter?.id ?? currentPlay?.matchup?.batter?.id, null);
        currentPitcher = currentPlay?.pitcher?.fullName ?? currentPlay?.matchup?.pitcher?.fullName ?? null;
        currentPitcherId = coerceInt(currentPlay?.pitcher?.id ?? currentPlay?.matchup?.pitcher?.id, null);
      }

      // Strategy 2: linescore offense (if present)
      if ((!currentBatter || !currentPitcher) && offense) {
        currentBatter = currentBatter ?? offense?.batter?.fullName ?? null;
        currentBatterId = currentBatterId ?? coerceInt(offense?.batter?.id, null);
        currentPitcher = currentPitcher ?? offense?.pitcher?.fullName ?? null;
        currentPitcherId = currentPitcherId ?? coerceInt(offense?.pitcher?.id, null);
        onDeckBatter = onDeckBatter ?? offense?.onDeck?.fullName ?? null;
      }

      // Strategy 3: boxscore lineup inference
      if (boxscore && (!currentBatter || !onDeckBatter)) {
        const teamBox = boxscore?.teams?.[battingTeamKey];
        const battingOrder = normalizeBattingOrder(liveData?.linescore?.offense?.battingOrder);
        const batters: number[] = Array.isArray(teamBox?.batters) ? teamBox!.batters : [];

        if (batters.length > 0) {
          const curIdx = ((battingOrder - 1) % batters.length + batters.length) % batters.length;
          const onDeckIdx = ((battingOrder) % batters.length + batters.length) % batters.length;

          if (!currentBatter) {
            const batterId = batters[curIdx];
            const batterInfo = teamBox?.players?.[`ID${batterId}`];
            currentBatter = batterInfo?.person?.fullName ?? currentBatter ?? null;
            currentBatterId = currentBatterId ?? coerceInt(batterInfo?.person?.id, null);
          }

          if (!onDeckBatter) {
            const onDeckId = batters[onDeckIdx];
            const onDeckInfo = teamBox?.players?.[`ID${onDeckId}`];
            onDeckBatter = onDeckInfo?.person?.fullName ?? onDeckBatter ?? null;
          }
        }

        // Pitcher inference
        if (!currentPitcher) {
          const pitchingBox = boxscore?.teams?.[pitchingTeamKey];
          const pitcherIds: number[] = Array.isArray(pitchingBox?.pitchers) ? pitchingBox!.pitchers : [];
          // Heuristic: pick last pitcher with non-zero IP, else last id
          let chosenId: number | null = null;
          for (let i = pitcherIds.length - 1; i >= 0; i--) {
            const pid = pitcherIds[i];
            const info = pitchingBox?.players?.[`ID${pid}`];
            const ip = info?.stats?.pitching?.inningsPitched;
            if (ip && ip !== '0.0') { chosenId = pid; break; }
          }
          if (chosenId == null && pitcherIds.length) chosenId = pitcherIds[pitcherIds.length - 1];

          if (chosenId != null) {
            const info = pitchingBox?.players?.[`ID${chosenId}`];
            currentPitcher = info?.person?.fullName ?? currentPitcher ?? null;
            currentPitcherId = currentPitcherId ?? coerceInt(info?.person?.id, null);
          }
        }
      }

      // Strategy 4: fallback labels
      if (!currentBatter || !currentPitcher || !onDeckBatter) {
        const fallback = this.generateFallbackPlayerData(gameData, isTopInning);
        currentBatter = currentBatter ?? fallback.currentBatter;
        currentPitcher = currentPitcher ?? fallback.currentPitcher;
        onDeckBatter = onDeckBatter ?? fallback.onDeckBatter;
      }

      return {
        currentBatter,
        currentBatterId,
        currentPitcher,
        currentPitcherId,
        onDeckBatter
      };
    } catch (error) {
      console.error('Error extracting player data:', error);
      return {
        ...this.generateFallbackPlayerData(gameData, isTopInning),
        currentBatterId: null,
        currentPitcherId: null
      };
    }
  }

  private extractLastPlay(liveData: any) {
    const cp = liveData?.plays?.currentPlay;
    if (!cp) return null;
    return {
      description: cp?.result?.description ?? null,
      event: cp?.result?.event ?? null,
      rbi: coerceInt(cp?.result?.rbi, 0),
      homeScore: coerceInt(cp?.result?.homeScore, null),
      awayScore: coerceInt(cp?.result?.awayScore, null)
    };
  }

  private extractLastPitch(liveData: any) {
    const events = liveData?.plays?.currentPlay?.playEvents ?? [];
    const pitch = [...events].reverse().find((e: any) => e?.isPitch || e?.details?.isPitch);
    if (!pitch) return null;

    const callCode = pitch?.details?.call?.code;
    return {
      pitchType: pitch?.details?.type?.description ?? pitch?.details?.type?.code ?? null,
      startSpeed: coerceFloat(pitch?.pitchData?.startSpeed, null),
      endSpeed: coerceFloat(pitch?.pitchData?.endSpeed, null),
      call: pitch?.details?.call?.description ?? null,
      isStrike: callCode === 'S' || callCode === 'C' || callCode === 'K',
      isBall: callCode === 'B'
    };
  }

  private generateFallbackPlayerData(gameData: any, isTopInning: boolean) {
    const battingTeam = isTopInning ? gameData?.teams?.away : gameData?.teams?.home;
    const pitchingTeam = isTopInning ? gameData?.teams?.home : gameData?.teams?.away;
    const teamName = battingTeam?.teamName || 'Batting';
    const pitchingTeamName = pitchingTeam?.teamName || 'Pitching';

    return {
      currentBatter: `${teamName} Batter`,
      currentPitcher: `${pitchingTeamName} Pitcher`,
      onDeckBatter: `${teamName} On-Deck`
    };
  }
}

// Export a singleton instance
export const mlbApiService = new MLBApiService();

// ---- local helpers ---------------------------------------------------------

function coerceInt(...values: any[]): number {
  for (const v of values) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}
function coerceFloat(v: any, fallback: number | null): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeInningState(v: any): 'Top' | 'Bottom' | 'Middle' | 'End' | null {
  const s = String(v ?? '').toLowerCase();
  if (!s) return null;
  if (s.startsWith('top')) return 'Top';
  if (s.startsWith('bot')) return 'Bottom';
  if (s.startsWith('mid')) return 'Middle';
  if (s.startsWith('end')) return 'End';
  return null;
}

// MLB battingOrder sometimes appears as strings like "101", "502". Reduce to 1..9.
function normalizeBattingOrder(raw: any): number {
  if (raw == null) return 1;
  const s = String(raw).trim();
  // Use last digit if formatted like "503"
  const lastDigit = Number(s.slice(-1));
  if (Number.isFinite(lastDigit) && lastDigit >= 1 && lastDigit <= 9) return lastDigit;
  const n = Number(s);
  if (Number.isFinite(n)) return ((n - 1) % 9) + 1;
  return 1;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function extractRunners(currentPlay: any, linescore: any) {
  const runners = { first: false, second: false, third: false };

  // Prefer linescore.offense if present (fewer transient misreads between plays)
  const offense = linescore?.offense;
  if (offense) {
    if (offense.first) runners.first = true;
    if (offense.second) runners.second = true;
    if (offense.third) runners.third = true;
  }

  // Fallback / reconcile with currentPlay (covers some feeds where offense isn't populated yet)
  const cpRunners = currentPlay?.runners ?? [];
  for (const r of cpRunners) {
    const end = r?.movement?.end;
    if (end === '1B') runners.first = true;
    if (end === '2B') runners.second = true;
    if (end === '3B') runners.third = true;
  }

  return runners;
}
