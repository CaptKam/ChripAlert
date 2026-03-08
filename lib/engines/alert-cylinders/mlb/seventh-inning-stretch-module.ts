import { BaseAlertModule, GameState, AlertResult } from '../../base-engine';
// import { unifiedDeduplicator } from '../../unified-deduplicator'; // if available
import { mlbPerformanceTracker } from '../../mlb-performance-tracker';

export default class SeventhInningStretchModule extends BaseAlertModule {
  alertType = 'MLB_SEVENTH_INNING_STRETCH';
  sport = 'MLB';
  private triggeredGames = new Set<string>();

  // Fire exactly at the CHANGEOVER into bottom 7th:
  // outs just reset to 0, inning === 7, isTopInning === false, and game is live.
  private atStretchMoment(gs: GameState): boolean {
    return !!(gs.isLive && gs.inning === 7 && gs.isTopInning === false && gs.outs === 0);
  }

  isTriggered(gameState: GameState): boolean {
    const id = gameState.gameId;
    if (!id || !gameState.isLive) return false;

    // Hygiene: clear memory hint if the feed marks final
    if ((gameState.status || '').toLowerCase().includes('final')) {
      this.triggeredGames.delete(id);
      return false;
    }
    if (this.triggeredGames.has(id)) return false;

    return this.atStretchMoment(gameState);
  }

  generateAlert(gameState: GameState): AlertResult | null {
    // assume engine checked isTriggered() already; avoid a second check to prevent races
    if (!gameState?.gameId) return null;

    const homeTeam = (gameState.homeTeam || 'Home Team').toString();
    const awayTeam = (gameState.awayTeam || 'Away Team').toString();
    const homeScore = Number.isFinite(gameState.homeScore) ? gameState.homeScore : 0;
    const awayScore = Number.isFinite(gameState.awayScore) ? gameState.awayScore : 0;

    const alertKey = `mlb_seventh_inning_stretch_${gameState.gameId}`;
    const scoreDiff = Math.abs(homeScore - awayScore);
    const totalRuns = homeScore + awayScore;
    const isCloseGame = scoreDiff <= 2;

    // Optional: durable dedupe (best place is DB unique index on alert_key)
    // this.tryDedupe?.(alertKey, { ttlMs: Number.MAX_SAFE_INTEGER });

    const enhancedMsg = this.generateEnhancedSeventhInningMessage(gameState);

    const alert: AlertResult = {
      alertKey,
      type: this.alertType,
      priority: isCloseGame ? 45 : 35,
      message: `${awayTeam} @ ${homeTeam} • Seventh-inning stretch`,
      context: {
        gameId: gameState.gameId,
        sport: this.sport,
        inning: gameState.inning,
        half: 'B7', // changeover into bottom 7th
        homeTeam,
        awayTeam,
        homeScore,
        awayScore,
        // Clear, non-speculative context only:
        gameState: {
          competitiveness: isCloseGame ? 'High' : scoreDiff > 5 ? 'Low' : 'Medium',
          runPace: totalRuns > 8 ? 'High' : totalRuns < 4 ? 'Low' : 'Average',
          leader: homeScore === awayScore ? 'Tied' : (homeScore > awayScore ? 'Home' : 'Away')
        },
        performance: {
          batter: gameState.currentBatter
            ? mlbPerformanceTracker.generateBatterContext(gameState.gameId, gameState.currentBatter) : null,
          pitcher: gameState.currentPitcher
            ? mlbPerformanceTracker.generatePitcherContext(gameState.gameId, gameState.currentPitcher) : null,
          momentum: mlbPerformanceTracker.generateTeamMomentumContext(gameState.gameId, homeTeam)
        },
        weatherImpact: gameState.weatherContext?.windSpeed
          ? `Wind ${gameState.weatherContext.windSpeed} mph`
          : null,
        ai_hint: enhancedMsg // let AI enhancer use it; UI can ignore
      }
    };

    // Memory hint: mark emitted. (Durability should be in DB/deduper.)
    this.triggeredGames.add(gameState.gameId);
    return alert;
  }

  calculateProbability(gameState: GameState): number {
    return this.atStretchMoment(gameState) ? 100 : 0;
  }

  private generateEnhancedSeventhInningMessage(gs: GameState): string {
    const contexts: string[] = ['Seventh-inning stretch'];
    const batter = gs.currentBatter
      ? mlbPerformanceTracker.generateBatterContext(gs.gameId, gs.currentBatter) : null;
    const pitcher = gs.currentPitcher
      ? mlbPerformanceTracker.generatePitcherContext(gs.gameId, gs.currentPitcher) : null;
    const momentum = mlbPerformanceTracker.generateTeamMomentumContext(gs.gameId, gs.homeTeam);

    if (pitcher) contexts.push(`P: ${pitcher}`);
    if (batter) contexts.push(`B: ${batter}`);
    if (momentum) contexts.push(`Momentum: ${momentum}`);

    const diff = Math.abs((gs.homeScore ?? 0) - (gs.awayScore ?? 0));
    contexts.push(diff <= 2 ? 'Close game—clutch time' : 'Manage the lead');

    return contexts.join(' | ');
  }
}
