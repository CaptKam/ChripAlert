
import { BaseAlertModule, GameState, AlertResult } from '../../base-engine';
import { mlbPerformanceTracker } from '../../mlb-performance-tracker';

export default class BasesLoadedOneOutModule extends BaseAlertModule {
  alertType = 'MLB_BASES_LOADED_ONE_OUT';
  sport = 'MLB';

  isTriggered(gameState: GameState): boolean {
    if (!gameState.isLive) return false;

    const { hasFirst, hasSecond, hasThird, outs } = gameState;

    // Specifically: Bases loaded, 1 out (~66% scoring probability)
    return hasFirst && hasSecond && hasThird && outs === 1;
  }

  generateAlert(gameState: GameState): AlertResult | null {
    // isTriggered() already called by engine - removed duplicate check
    
    // Get real performance data from tracker
    const batterId = gameState.currentBatterId || `batter_${(gameState.currentBatter || 'Unknown').replace(/\s+/g, '_')}`;
    const batterPerformance = mlbPerformanceTracker.getBatterSummary(gameState.gameId, batterId);
    const pitcherId = gameState.currentPitcherId || `pitcher_${(gameState.currentPitcher || 'Unknown').replace(/\s+/g, '_')}`;
    const pitcherPerformance = mlbPerformanceTracker.getPitcherSummary(gameState.gameId, pitcherId);
    const teamMomentum = mlbPerformanceTracker.getTeamMomentumSummary(
      gameState.gameId,
      gameState.isTopInning ? 'away' : 'home'
    );
    
    const alertResult = {
      alertKey: `${gameState.gameId}_bases_loaded_one_out`,
      type: this.alertType,
      message: `${gameState.awayTeam} @ ${gameState.homeTeam} | Bases loaded, 1 out`,
      context: {
        gameId: gameState.gameId,
        homeTeam: gameState.homeTeam,
        awayTeam: gameState.awayTeam,
        homeScore: gameState.homeScore,
        awayScore: gameState.awayScore,
        inning: gameState.inning,
        isTopInning: gameState.isTopInning,
        hasFirst: true,
        hasSecond: true,
        hasThird: true,
        outs: 1,
        scenarioName: 'Bases Loaded',
        scoringProbability: 66
      },
      priority: 75
    };

    return alertResult;
  }

  calculateProbability(): number {
    return 66;
  }

  private buildEnhancedMessage(
    gameState: GameState,
    batterPerformance?: string | null,
    pitcherPerformance?: string | null,
    teamMomentum?: string | null
  ): string {
    let message = `Bases loaded, 1 out | 66% scoring chance`;
    
    // Add pitcher performance with proper parsing
    if (pitcherPerformance) {
      // Parse pitch count correctly - look for "X pitches" pattern
      const pitchMatch = pitcherPerformance.match(/(\d+)\s*pitches/i);
      const pitchCount = pitchMatch ? parseInt(pitchMatch[1]) : gameState.pitchCount || 0;
      
      // Parse velocity changes  
      const velocityMatch = pitcherPerformance.match(/velocity\s*(down|up)\s*(\d+)\s*mph/i);
      
      if (pitcherPerformance.includes('consecutive balls')) {
        message += ` | Pitcher control breaking down: ${pitcherPerformance}`;
      } else if (pitchCount > 70) {
        message += ` | Pitcher workload: ${pitchCount} pitches`;
        if (velocityMatch && parseInt(velocityMatch[2]) > 2) {
          message += `, velocity ${velocityMatch[1]} ${velocityMatch[2]}mph`;
        }
      } else if (velocityMatch && parseInt(velocityMatch[2]) > 2) {
        message += ` | Velocity ${velocityMatch[1]} ${velocityMatch[2]}mph`;
      }
    }
    
    // Add batter performance
    if (batterPerformance && batterPerformance.includes('-for-')) {
      message += ` | Batter: ${batterPerformance}`;
    }
    
    // Add team momentum
    if (teamMomentum && (teamMomentum.includes('rally') || teamMomentum.includes('runs in last'))) {
      message += ` | ${teamMomentum}`;
    }
    
    // Always include double play vs grand slam dynamic
    message += ` | Double play threat vs grand slam potential`;
    
    return message;
  }
}
