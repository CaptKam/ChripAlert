import { BaseAlertModule, GameState, AlertResult } from '../../base-engine';

export default class RunnerOnThirdTwoOutsModule extends BaseAlertModule {
  alertType = 'MLB_RUNNER_ON_THIRD_TWO_OUTS';
  sport = 'MLB';

  isTriggered(gameState: GameState): boolean {
    if (!gameState.isLive) return false;

    const { hasFirst, hasSecond, hasThird, outs } = gameState;

    // Specifically: Runner on 3rd, 2 outs (~42% scoring probability)
    return !hasFirst && !hasSecond && hasThird && outs === 2;
  }

  generateAlert(gameState: GameState): AlertResult | null {
    const currentBatter = gameState.currentBatter || 'Current Batter';
    const currentPitcher = gameState.currentPitcher || '';
    
    // Base probability for runner on 3rd with 2 outs
    let baseProbability = 42;
    
    // Two-out pressure multiplier
    const scoreDiff = Math.abs((gameState.homeScore || 0) - (gameState.awayScore || 0));
    const pressureBonus = scoreDiff <= 1 ? 8 : scoreDiff <= 3 ? 5 : 0;
    
    // Late inning bonus
    const inning = gameState.inning || 1;
    const lateInningBonus = inning >= 7 ? 5 : 0;
    
    const totalProbability = Math.min(65, baseProbability + pressureBonus + lateInningBonus);
    
    // High-pressure situation messaging
    let situationText = '';
    if (scoreDiff <= 1) {
      situationText = 'GAME-CHANGING AT-BAT | ';
    } else if (inning >= 7) {
      situationText = 'LATE-INNING CLUTCH | ';
    } else {
      situationText = 'PRESSURE MOMENT | ';
    }

    const message = `Runner on 3rd, 2 outs | ${currentBatter} needs clutch hit | ${totalProbability}% scoring chance | ${situationText.replace(' | ', '').toLowerCase()}`;

    const alertKey = `${gameState.gameId}_runner_third_two_outs_${gameState.inning}_${gameState.isTopInning ? 'top' : 'bottom'}_${currentBatter.replace(/\s+/g, '_')}`;

    const alertResult = {
      alertKey,
      type: this.alertType,
      message: `${gameState.awayTeam} @ ${gameState.homeTeam} | Runner on 3rd, 2 outs`,
      context: {
        gameId: gameState.gameId,
        homeTeam: gameState.homeTeam,
        awayTeam: gameState.awayTeam,
        homeScore: gameState.homeScore,
        awayScore: gameState.awayScore,
        inning: gameState.inning,
        isTopInning: gameState.isTopInning,
        hasFirst: false,
        hasSecond: false,
        hasThird: true,
        outs: 2,
        balls: gameState.balls,
        strikes: gameState.strikes,
        currentBatter,
        currentPitcher,
        scenarioName: 'Runner on 3rd, Two Outs',
        scoringProbability: totalProbability,
        pressureLevel: 'HIGH'
      },
      priority: 45
    };

    return alertResult;
  }

  calculateProbability(): number {
    return 42;
  }
}