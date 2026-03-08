
import { BaseAlertModule, GameState, AlertResult } from '../../base-engine';

export default class RunnerOnSecondNoOutsModule extends BaseAlertModule {
  alertType = 'MLB_RUNNER_ON_SECOND_NO_OUTS';
  sport = 'MLB';

  isTriggered(gameState: GameState): boolean {
    if (!gameState.isLive) return false;

    const { hasFirst, hasSecond, hasThird, outs } = gameState;

    // Specifically: Runner on 2nd, 0 outs (~60% scoring probability)
    return !hasFirst && hasSecond && !hasThird && outs === 0;
  }

  generateAlert(gameState: GameState): AlertResult | null {
    // isTriggered() already called by engine - removed duplicate check
    const alertResult = {
      alertKey: `${gameState.gameId}_runner_second_no_outs`,
      type: this.alertType,
      message: `${gameState.awayTeam} @ ${gameState.homeTeam} | Runner on 2nd, 0 outs`,
      context: {
        gameId: gameState.gameId,
        homeTeam: gameState.homeTeam,
        awayTeam: gameState.awayTeam,
        homeScore: gameState.homeScore,
        awayScore: gameState.awayScore,
        inning: gameState.inning,
        isTopInning: gameState.isTopInning,
        hasFirst: false,
        hasSecond: true,
        hasThird: false,
        outs: 0,
        balls: gameState.balls,
        strikes: gameState.strikes,
        scenarioName: 'Runner on 2nd',
        scoringProbability: 60
      },
      priority: 45
    };

    return alertResult;
  }

  calculateProbability(): number {
    return 60;
  }
}
