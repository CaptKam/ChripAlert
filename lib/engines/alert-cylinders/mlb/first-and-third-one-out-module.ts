import { BaseAlertModule, GameState, AlertResult } from '../../base-engine';

export default class FirstAndThirdOneOutModule extends BaseAlertModule {
  alertType = 'MLB_FIRST_AND_THIRD_ONE_OUT';
  sport = 'MLB';

  isTriggered(gameState: GameState): boolean {
    if (!gameState.isLive) return false;

    const { hasFirst, hasSecond, hasThird, outs } = gameState;

    // Specifically: 1st + 3rd, 1 out (~68% scoring probability)
    return hasFirst && !hasSecond && hasThird && outs === 1;
  }

  generateAlert(gameState: GameState): AlertResult | null {
    // Get current batter and on-deck information
    const currentBatter = gameState.currentBatter || 'Current Batter';
    const onDeckBatter = gameState.onDeckBatter || '';
    const currentPitcher = gameState.currentPitcher || '';
    
    // Calculate enhanced probability based on multiple factors
    let baseProbability = 68; // Base probability for 1st & 3rd, 1 out
    
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
    
    const totalProbability = Math.min(85, baseProbability + windBonus + clutchBonus);
    
    // Build simple context message
    let message = `Runners on 1st and 3rd, 1 out | ${currentBatter} at bat | ${totalProbability}% scoring probability${windText}`;

    // Create unique alert key including batter and out count
    const alertKey = `${gameState.gameId}_first_third_one_out_${gameState.inning}_${gameState.isTopInning ? 'top' : 'bottom'}_${currentBatter.replace(/\s+/g, '_')}`;

    const alertResult = {
      alertKey,
      type: this.alertType,
      message: `${gameState.awayTeam} @ ${gameState.homeTeam} | Runners on 1st & 3rd, 1 out`,
      context: {
        gameId: gameState.gameId,
        homeTeam: gameState.homeTeam,
        awayTeam: gameState.awayTeam,
        homeScore: gameState.homeScore,
        awayScore: gameState.awayScore,
        inning: gameState.inning,
        isTopInning: gameState.isTopInning,
        hasFirst: true,
        hasSecond: false,
        hasThird: true,
        outs: 1,
        balls: gameState.balls,
        strikes: gameState.strikes,
        currentBatter,
        currentPitcher,
        onDeckBatter,
        windSpeed: gameState.weatherContext?.windSpeed,
        windDirection: gameState.weatherContext?.windDirection,
        scenarioName: 'Runners on 1st & 3rd, One Out',
        scoringProbability: totalProbability
      },
      priority: Math.min(90, 80 + Math.floor(totalProbability / 15))
    };

    return alertResult;
  }

  calculateProbability(): number {
    return 68;
  }
}