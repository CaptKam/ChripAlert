import { BaseAlertModule, GameState, AlertResult } from '../../base-engine';

export default class FirstAndThirdTwoOutsModule extends BaseAlertModule {
  alertType = 'MLB_FIRST_AND_THIRD_TWO_OUTS';
  sport = 'MLB';

  isTriggered(gameState: GameState): boolean {
    if (!gameState.isLive) return false;

    const { hasFirst, hasSecond, hasThird, outs } = gameState;

    // Specifically: 1st + 3rd, 2 outs (~46% scoring probability)
    return hasFirst && !hasSecond && hasThird && outs === 2;
  }

  generateAlert(gameState: GameState): AlertResult | null {
    const currentBatter = gameState.currentBatter || 'Current Batter';
    const currentPitcher = gameState.currentPitcher || '';
    
    // Base probability for 1st & 3rd with 2 outs  
    let baseProbability = 46;
    
    // High-pressure situation adjustments
    const scoreDiff = Math.abs((gameState.homeScore || 0) - (gameState.awayScore || 0));
    const clutchBonus = scoreDiff <= 1 ? 12 : scoreDiff <= 2 ? 8 : 0;
    
    // Late inning multiplier
    const inning = gameState.inning || 1;
    const lateInningBonus = inning >= 7 ? 6 : 0;
    
    // Count leverage (full count = maximum pressure)
    const countBonus = (gameState.balls === 3 && gameState.strikes === 2) ? 4 : 0;
    
    const totalProbability = Math.min(75, baseProbability + clutchBonus + lateInningBonus + countBonus);
    
    // Dynamic messaging based on game state
    let intensityLevel = 'MAXIMUM PRESSURE';
    if (scoreDiff <= 1 && inning >= 7) {
      intensityLevel = 'WIN-OR-LOSE MOMENT';
    } else if (countBonus > 0) {
      intensityLevel = 'FULL COUNT DRAMA';
    } else if (clutchBonus >= 8) {
      intensityLevel = 'CLUTCH SITUATION';
    }

    const message = `Runners on 1st & 3rd, 2 outs | ${currentBatter} at bat | ${totalProbability}% scoring chance | ${intensityLevel.toLowerCase()}`;

    const alertKey = `${gameState.gameId}_first_third_two_outs_${gameState.inning}_${gameState.isTopInning ? 'top' : 'bottom'}_${currentBatter.replace(/\s+/g, '_')}`;

    const alertResult = {
      alertKey,
      type: this.alertType,
      message: `${gameState.awayTeam} @ ${gameState.homeTeam} | Runners on 1st & 3rd, 2 outs`,
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
        outs: 2,
        balls: gameState.balls,
        strikes: gameState.strikes,
        currentBatter,
        currentPitcher,
        scenarioName: '1st & 3rd, Two Outs',
        scoringProbability: totalProbability,
        pressureLevel: 'MAXIMUM',
        leverageIndex: inning >= 7 && scoreDiff <= 2 ? 'ULTRA-HIGH' : 'HIGH'
      },
      priority: Math.min(92, 75 + Math.floor(totalProbability / 10))
    };

    return alertResult;
  }

  calculateProbability(): number {
    return 46;
  }
}