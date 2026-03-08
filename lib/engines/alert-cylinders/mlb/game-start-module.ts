import { BaseAlertModule, GameState, AlertResult } from '../../base-engine';

type NormStatus = 'scheduled' | 'live' | 'final' | 'delay' | 'other';

export default class GameStartModule extends BaseAlertModule {
  alertType = 'MLB_GAME_START';
  sport = 'MLB';

  // Best-effort memory-only guard (durability handled by deduper/DB)
  private triggeredGames = new Set<string>();
  // Debounce LIVE flaps (ms since first LIVE sighting)
  private firstLiveSeenAt = new Map<string, number>();

  private normStatus(raw?: string): NormStatus {
    const s = (raw || '').trim().toLowerCase();
    if (s === 'live' || s === 'in progress' || s === 'inprogress') return 'live';
    if (s === 'final' || s === 'completed') return 'final';
    if (s.includes('delay') || s === 'delayed' || s === 'suspended') return 'delay';
    if (s === 'scheduled' || s === 'pregame' || s === 'pre' || s === 'warmup') return 'scheduled';
    return 'other';
  }

  private isTopFirst(gs: GameState): boolean {
    return gs.inning === 1 && gs.isTopInning === true && gs.outs === 0;
  }

  private liveDebounced(gameId: string, isLive: boolean, now: number, debounceMs = 2500): boolean {
    if (!isLive) {
      this.firstLiveSeenAt.delete(gameId);
      return false;
    }
    const first = this.firstLiveSeenAt.get(gameId) ?? now;
    this.firstLiveSeenAt.set(gameId, first);
    return (now - first) >= debounceMs;
  }

  isTriggered(gameState: GameState): boolean {
    const id = gameState.gameId;
    if (!id) return false;

    const status = this.normStatus(gameState.status);
    const now = Date.now();

    // Final => clean up and never fire again
    if (status === 'final') {
      this.triggeredGames.delete(id);
      this.firstLiveSeenAt.delete(id);
      return false;
    }

    // Ignore during delays/suspended
    if (status === 'delay') return false;

    // Already fired?
    if (this.triggeredGames.has(id)) return false;

    // Must be live (with small debounce to avoid pre-pitch flakes)
    const liveOk = this.liveDebounced(id, gameState.isLive === true || status === 'live', now);
    if (!liveOk) return false;

    // Prefer a concrete first-pitch signal:
    // If you have pitch counts, use (gameState.totalPitches ?? 0) > 0
    const firstFrame = this.isTopFirst(gameState)
      || ((gameState.inning === 1) && (gameState.outs === 0) && gameState.isTopInning === true);

    if (firstFrame) {
      this.triggeredGames.add(id);
      return true;
    }
    return false;
  }

  generateAlert(gameState: GameState): AlertResult | null {
    const alertKey = `mlb_game_start_${gameState.gameId}`;

    const alert: AlertResult = {
      alertKey,
      type: this.alertType,
      message: `${gameState.awayTeam} @ ${gameState.homeTeam} | Top 1st — First pitch`,
      context: {
        gameId: gameState.gameId,
        sport: this.sport,
        homeTeam: gameState.homeTeam,
        awayTeam: gameState.awayTeam,
        homeScore: gameState.homeScore,
        awayScore: gameState.awayScore,
        inning: gameState.inning,
        isTopInning: gameState.isTopInning,
        outs: gameState.outs,
        isLive: gameState.isLive,
        status: gameState.status,
      },
      priority: 50,
    };

    // If your engine supports a global deduper, call it here (idempotence across restarts)
    // this.tryDedupe?.(alertKey, { ttlMs: 'forever' });

    return alert;
  }

  calculateProbability(gameState: GameState): number {
    return (gameState.isLive && this.isTopFirst(gameState)) ? 100 : 0;
  }
}
