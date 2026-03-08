
import { BaseAlertModule, GameState, AlertResult } from '../../base-engine';

export default class FirstAndThirdNoOutsModule extends BaseAlertModule {
  alertType = 'MLB_FIRST_AND_THIRD_NO_OUTS';
  sport = 'MLB';

  isTriggered(gameState: GameState): boolean {
    if (!gameState.isLive) return false;

    const { hasFirst, hasSecond, hasThird, outs } = gameState;

    // Specifically: 1st + 3rd, 0 outs (~86% scoring probability)
    return hasFirst && !hasSecond && hasThird && outs === 0;
  }

  generateAlert(gameState: GameState): AlertResult | null {
    // isTriggered() already called by engine - removed duplicate check
    // Get current batter and on-deck information
    const currentBatter = gameState.currentBatter || 'Current Batter';
    const onDeckBatter = gameState.onDeckBatter || '';
    const currentPitcher = gameState.currentPitcher || '';
    
    // Calculate enhanced probability based on multiple factors
    let baseProbability = 86; // Base probability for 1st & 3rd, 0 outs
    
    // Add wind factor if available
    let windBonus = 0;
    let windText = '';
    if (gameState.weatherContext?.windSpeed) {
      const windSpeed = gameState.weatherContext.windSpeed;
      const windDir = gameState.weatherContext.windDirection || '';
      if (windSpeed >= 10 && (windDir.includes('out') || windDir.includes('center'))) {
        windBonus = 5;
        windText = ` | Wind: ${windSpeed}mph ${windDir} ⚡`;
      }
    }
    
    // Adjust for game situation
    const scoreDiff = Math.abs((gameState.homeScore || 0) - (gameState.awayScore || 0));
    const clutchBonus = scoreDiff <= 2 ? 3 : 0; // Close game bonus
    
    const totalProbability = Math.min(95, baseProbability + windBonus + clutchBonus);
    
    // Build simple context message
    let message = `Runners on 1st and 3rd, no outs | ${currentBatter} at bat | ${totalProbability}% scoring probability${windText}`;

    // Create unique alert key including batter
    const alertKey = `${gameState.gameId}_first_third_no_outs_${gameState.inning}_${gameState.isTopInning ? 'top' : 'bottom'}_${currentBatter.replace(/\s+/g, '_')}`;

    const alertResult = {
      alertKey,
      type: this.alertType,
      message: `${gameState.awayTeam} @ ${gameState.homeTeam} | Runners on 1st & 3rd, 0 outs`,
      context: {
        gameId: gameState.gameId,
        homeTeam: gameState.homeTeam,
        awayTeam: gameState.awayTeam,
        homeScore: gameState.homeScore,
        awayScore: gameState.awayScore,
        inning: gameState.inning,
        isTopInning: gameState.isTopInning,
        hasFirst: gameState.hasFirst || true,
        hasSecond: gameState.hasSecond || false,
        hasThird: gameState.hasThird || true,
        outs: gameState.outs || 0,
        balls: gameState.balls,
        strikes: gameState.strikes,
        currentBatter,
        currentPitcher,
        onDeckBatter,
        windSpeed: gameState.weatherContext?.windSpeed,
        windDirection: gameState.weatherContext?.windDirection,
        scenarioName: 'Runners on 1st & 3rd',
        scoringProbability: totalProbability
      },
      priority: Math.min(99, 95 + Math.floor(totalProbability / 20))
    };

    return alertResult;
  }

  calculateProbability(): number {
    return 86;
  }
}
