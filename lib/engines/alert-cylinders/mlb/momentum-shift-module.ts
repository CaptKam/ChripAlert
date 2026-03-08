
import { BaseAlertModule, GameState, AlertResult } from '../../base-engine';

export default class MomentumShiftModule extends BaseAlertModule {
  alertType = 'MLB_MOMENTUM_SHIFT';
  sport = 'MLB';
  
  private lastScores: Map<string, { home: number; away: number; inning: number }> = new Map();

  isTriggered(gameState: GameState): boolean {
    if (!gameState.isLive) return false;
    
    const gameId = gameState.gameId;
    const currentScore = { 
      home: gameState.homeScore || 0, 
      away: gameState.awayScore || 0,
      inning: gameState.inning || 1
    };
    
    const lastScore = this.lastScores.get(gameId);
    this.lastScores.set(gameId, currentScore);
    
    if (!lastScore) return false;
    
    // Check for momentum shifts
    const homeRuns = currentScore.home - lastScore.home;
    const awayRuns = currentScore.away - lastScore.away;
    
    // Multi-run inning
    if (homeRuns >= 2 || awayRuns >= 2) {
      console.log(`🎯 MLB MOMENTUM SHIFT: ${homeRuns || awayRuns}-run inning!`);
      return true;
    }
    
    // Comeback scenario
    const wasLosingTeamHome = lastScore.away > lastScore.home;
    const isNowTiedOrAhead = wasLosingTeamHome ? 
      (currentScore.home >= currentScore.away && homeRuns > 0) :
      (currentScore.away >= currentScore.home && awayRuns > 0);
      
    if (isNowTiedOrAhead && currentScore.inning >= 6) {
      console.log(`🎯 MLB MOMENTUM SHIFT: Late-game comeback!`);
      return true;
    }
    
    return false;
  }

  generateAlert(gameState: GameState): AlertResult | null {
    const homeRuns = (gameState.homeScore || 0);
    const awayRuns = (gameState.awayScore || 0);
    const scoreDiff = Math.abs(homeRuns - awayRuns);
    
    let message = `${gameState.awayTeam} @ ${gameState.homeTeam} | Momentum shift`;
    
    if (scoreDiff <= 1) {
      message += ` - Game tied/close ${homeRuns}-${awayRuns}`;
    } else {
      message += ` - Score ${homeRuns}-${awayRuns}`;
    }

    return {
      alertKey: `${gameState.gameId}_momentum_${gameState.inning}_${gameState.isTopInning ? 'top' : 'bot'}`,
      type: this.alertType,
      message,
      context: {
        gameId: gameState.gameId,
        homeTeam: gameState.homeTeam,
        awayTeam: gameState.awayTeam,
        homeScore: gameState.homeScore,
        awayScore: gameState.awayScore,
        inning: gameState.inning,
        isTopInning: gameState.isTopInning,
        momentumType: scoreDiff <= 1 ? 'comeback' : 'big_inning'
      },
      priority: 88
    };
  }

  calculateProbability(): number {
    return 88;
  }
}
