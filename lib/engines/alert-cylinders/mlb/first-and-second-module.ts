import { BaseAlertModule, GameState, AlertResult } from '../../base-engine';

export default class FirstAndSecondModule extends BaseAlertModule {
  alertType = 'MLB_FIRST_AND_SECOND';
  sport = 'MLB';

  isTriggered(gameState: GameState): boolean {
    if (!gameState.isLive) {
      console.log(`🔍 MLB_FIRST_AND_SECOND: Game ${gameState.gameId} not live`);
      return false;
    }

    const { hasFirst, hasSecond, hasThird, outs } = gameState;

    console.log(`🔍 MLB_FIRST_AND_SECOND Check: Game ${gameState.gameId} - 1B:${hasFirst}, 2B:${hasSecond}, 3B:${hasThird}, outs:${outs}`);

    // Specifically: 1st + 2nd, any outs (~58% scoring probability)
    const triggered = hasFirst && hasSecond && !hasThird;

    if (triggered) {
      console.log(`✅ MLB_FIRST_AND_SECOND: TRIGGERED for game ${gameState.gameId}`);
    } else {
      console.log(`⏸️ MLB_FIRST_AND_SECOND: Not triggered for game ${gameState.gameId}`);
    }

    return triggered;
  }

  generateAlert(gameState: GameState): AlertResult | null {
    // isTriggered() already called by engine - removed duplicate check
    const scoringProb = gameState.outs === 0 ? 68 : gameState.outs === 1 ? 58 : 42;
    const priority = gameState.outs === 0 ? 40 : gameState.outs === 1 ? 35 : 30;

    const alertResult = {
      alertKey: `${gameState.gameId}_first_second_${gameState.outs}_out`,
      type: this.alertType,
      message: `${gameState.awayTeam} @ ${gameState.homeTeam} | Runners on 1st & 2nd`,
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
        hasThird: false,
        outs: gameState.outs,
        scenarioName: 'Runners on 1st & 2nd',
        scoringProbability: scoringProb
      },
      priority
    };

    return alertResult;
  }

  calculateProbability(): number {
    return 58; // Average probability across different out scenarios
  }
}