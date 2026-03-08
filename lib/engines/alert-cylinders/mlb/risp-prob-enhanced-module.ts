import { BaseAlertModule, GameState, AlertResult } from '../../base-engine';
import { enhanceAlertWithProbability } from './mlb-prob-integration';

export default class RISPProbEnhancedModule extends BaseAlertModule {
  alertType = 'MLB_RISP_PROB_ENHANCED';
  sport = 'MLB';

  isTriggered(gameState: GameState): boolean {
    if (!gameState.isLive) return false;

    const hasRISP = gameState.hasSecond || gameState.hasThird;
    const isLateInning = (gameState.inning || 0) >= 7;
    const scoreDiff = Math.abs((gameState.homeScore || 0) - (gameState.awayScore || 0));
    const isCloseGame = scoreDiff <= 2;

    return hasRISP && (isLateInning || isCloseGame);
  }

  generateAlert(gameState: GameState): AlertResult | null {
    const baseContext = {
      gameId: gameState.gameId,
      homeTeam: gameState.homeTeam,
      awayTeam: gameState.awayTeam,
      homeScore: gameState.homeScore,
      awayScore: gameState.awayScore,
      inning: gameState.inning,
      isTopInning: gameState.isTopInning,
      outs: gameState.outs,
      hasFirst: gameState.hasFirst,
      hasSecond: gameState.hasSecond,
      hasThird: gameState.hasThird,
      balls: gameState.balls || 0,
      strikes: gameState.strikes || 0,
      currentBatter: gameState.currentBatter,
      currentPitcher: gameState.currentPitcher
    };

    const { enhancedContext, probScore } = enhanceAlertWithProbability(
      gameState,
      baseContext,
      {
        windMph: gameState.weather?.windSpeed,
        windDir: this.mapWindDirection(gameState.weather?.windDirection),
        tempF: gameState.weather?.temperature
      }
    );

    const probabilityText = probScore 
      ? ` | ${Math.round(probScore.p_event * 100)}% scoring probability (${probScore.priority})`
      : '';

    const leverageText = probScore?.leverage 
      ? ` | Leverage: ${Math.round(probScore.leverage * 100)}%`
      : '';

    const aiText = probScore?.aiText 
      ? ` | AI: ${probScore.aiText}`
      : '';

    return {
      alertKey: probScore?.dedupeKey || `${gameState.gameId}_risp_enhanced_${gameState.inning}_${gameState.isTopInning ? 'T' : 'B'}`,
      type: this.alertType,
      message: `${gameState.awayTeam} @ ${gameState.homeTeam} | RISP Situation${probabilityText}${leverageText}`,
      context: enhancedContext,
      priority: this.calculatePriorityFromProb(probScore)
    };
  }

  calculateProbability(): number {
    return 75;
  }

  private calculatePriorityFromProb(probScore: any): number {
    if (!probScore) return 75;
    
    switch (probScore.priority) {
      case 'P90': return 90;
      case 'P75': return 75;
      case 'P50': return 60;
      case 'P25': return 50;
      default: return 75;
    }
  }

  private mapWindDirection(direction?: string): 'out'|'in'|'left'|'right'|'cross'|'unknown' {
    if (!direction) return 'unknown';
    
    const dir = direction.toLowerCase();
    if (dir.includes('out')) return 'out';
    if (dir.includes('in')) return 'in';
    if (dir.includes('left')) return 'left';
    if (dir.includes('right')) return 'right';
    if (dir.includes('cross')) return 'cross';
    return 'unknown';
  }
}
