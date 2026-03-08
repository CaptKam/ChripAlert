import { BaseAlertModule, GameState, AlertResult } from '../../base-engine';

type NormStatus = 'scheduled' | 'live' | 'final' | 'other';

export default class LateInningCloseModule extends BaseAlertModule {
  // Keep the existing identifiers so you don't have to touch settings/routes
  alertType = 'MLB_LATE_INNING_CLOSE';
  sport = 'MLB';

  // Fire-once tracking
  private top7Triggered = new Set<string>();

  // (Optional) track last seen inning/half for debugging or future needs
  private lastSeenHalf = new Map<string, { inning: number; isTop: boolean }>();

  private normStatus(raw?: string): NormStatus {
    const s = (raw || '').trim().toLowerCase();
    if (s === 'live' || s === 'in progress' || s === 'inprogress') return 'live';
    if (s === 'final' || s === 'completed') return 'final';
    if (s === 'scheduled' || s === 'pregame' || s === 'pre') return 'scheduled';
    return 'other';
    }

  isTriggered(gameState: GameState): boolean {
    const { gameId } = gameState;
    if (!gameId) return false;

    // Optional hygiene: if the feed marks final, clear memory for this game
    if (this.normStatus(gameState.status) === 'final') {
      this.top7Triggered.delete(gameId);
      this.lastSeenHalf.delete(gameId);
      return false;
    }

    if (!gameState.isLive) return false;

    // We only care about the *first* entry into Top 7
    const inning = gameState.inning ?? 0;
    const isTop = !!gameState.isTopInning;

    // Check if game is actually close (≤3 runs)
    const scoreDiff = Math.abs((gameState.homeScore || 0) - (gameState.awayScore || 0));
    const isCloseGame = scoreDiff <= 3;

    // Update last seen (non-mutating for trigger decision)
    const prev = this.lastSeenHalf.get(gameId);

    const isTop7Now = inning === 7 && isTop;

    // Already fired for this game?
    if (this.top7Triggered.has(gameId)) {
      this.lastSeenHalf.set(gameId, { inning, isTop });
      return false;
    }

    // Trigger as soon as we detect Top 7 AND game is close (transition-friendly)
    if (isTop7Now && isCloseGame) {
      this.top7Triggered.add(gameId);
      this.lastSeenHalf.set(gameId, { inning, isTop });
      return true;
    }

    // Keep state fresh for future transition checks
    this.lastSeenHalf.set(gameId, { inning, isTop });
    return false;
  }

  generateAlert(gameState: GameState): AlertResult | null {
    const inningText = 'Top 7';

    const alert = {
      alertKey: `${gameState.gameId}_top7_start`,
      type: this.alertType,
      message: `${gameState.awayTeam} @ ${gameState.homeTeam} | ${inningText}`,
      context: {
        gameId: gameState.gameId,
        homeTeam: gameState.homeTeam,
        awayTeam: gameState.awayTeam,
        homeScore: gameState.homeScore,
        awayScore: gameState.awayScore,
        inning: gameState.inning,
        isTopInning: gameState.isTopInning,
        outs: gameState.outs,
      },
      // Mid-level priority; bump if you want it to sit higher in the feed
      priority: 60,
    };

    return alert;
  }

  calculateProbability(): number {
    return 60;
  }
}