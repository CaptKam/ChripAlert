
import { BaseAlertModule, GameState, AlertResult } from '../../base-engine';

export default class RunnerOnThirdOneOutModule extends BaseAlertModule {
  alertType = 'MLB_RUNNER_ON_THIRD_ONE_OUT';
  sport = 'MLB';

  isTriggered(gameState: GameState): boolean {
    if (!gameState.isLive) return false;

    const { hasFirst, hasSecond, hasThird, outs } = gameState;

    // Specifically: Runner on 3rd, 1 out (~66% scoring probability)
    return !hasFirst && !hasSecond && hasThird && outs === 1;
  }

  generateAlert(gameState: GameState): AlertResult | null {
    // Get current batter information
    const currentBatter = gameState.currentBatter || 'Current Batter';
    const currentPitcher = gameState.currentPitcher || '';
    const onDeckBatter = gameState.onDeckBatter || '';
    
    // Create unique alert key including batter and inning details
    const alertKey = `${gameState.gameId}_runner_third_one_out_${gameState.inning}_${gameState.isTopInning ? 'top' : 'bottom'}_${currentBatter.replace(/\s+/g, '_')}`;

    const alertResult = {
      alertKey,
      type: this.alertType,
      message: `${gameState.awayTeam} @ ${gameState.homeTeam} | Runner on 3rd, 1 out`,
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
        outs: 1,
        balls: gameState.balls,
        strikes: gameState.strikes,
        currentBatter,
        currentPitcher,
        onDeckBatter,
        scenarioName: 'Runner on 3rd',
        scoringProbability: 66
      },
      priority: 45
    };

    return alertResult;
  }

  calculateProbability(): number {
    return 66;
  }
}
