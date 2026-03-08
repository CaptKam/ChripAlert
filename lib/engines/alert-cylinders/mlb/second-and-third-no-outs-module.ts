
import { BaseAlertModule, GameState, AlertResult } from '../../base-engine';

export default class SecondAndThirdNoOutsModule extends BaseAlertModule {
  alertType = 'MLB_SECOND_AND_THIRD_NO_OUTS';
  sport = 'MLB';

  isTriggered(gameState: GameState): boolean {
    if (!gameState.isLive) return false;

    const hasFirst = Boolean(gameState.hasFirst);
    const hasSecond = Boolean(gameState.hasSecond);
    const hasThird = Boolean(gameState.hasThird);
    const outs = Number(gameState.outs) || 0;

    // Specifically: 2nd + 3rd, 0 outs (~85% scoring probability)
    return !hasFirst && hasSecond && hasThird && outs === 0;
  }

  generateAlert(gameState: GameState): AlertResult | null {
    // isTriggered() already called by engine - removed duplicate check
    const alertResult = {
      alertKey: `${gameState.gameId}_second_third_no_outs`,
      type: this.alertType,
      message: `${gameState.awayTeam} @ ${gameState.homeTeam} | Runners on 2nd & 3rd, 0 outs`,
      context: {
        gameId: gameState.gameId,
        homeTeam: gameState.homeTeam,
        awayTeam: gameState.awayTeam,
        homeScore: gameState.homeScore,
        awayScore: gameState.awayScore,
        inning: gameState.inning,
        isTopInning: gameState.isTopInning,
        hasFirst: gameState.hasFirst,
        hasSecond: gameState.hasSecond,
        hasThird: gameState.hasThird,
        outs: gameState.outs || 0,
        balls: gameState.balls,
        strikes: gameState.strikes,
        scenarioName: 'Runners on 2nd & 3rd',
        scoringProbability: 85
      },
      priority: 96
    };

    return alertResult;
  }

  calculateProbability(): number {
    return 85;
  }
}
