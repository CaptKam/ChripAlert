
import { BaseAlertModule, GameState, AlertResult } from '../../base-engine';

export default class RunnerOnThirdNoOutsModule extends BaseAlertModule {
  alertType = 'MLB_RUNNER_ON_THIRD_NO_OUTS';
  sport = 'MLB';

  isTriggered(gameState: GameState): boolean {
    if (!gameState.isLive) {
      console.log(`🔍 MLB_RUNNER_ON_THIRD_NO_OUTS: Game ${gameState.gameId} not live`);
      return false;
    }

    const { hasFirst, hasSecond, hasThird, outs } = gameState;
    
    console.log(`🔍 MLB_RUNNER_ON_THIRD_NO_OUTS Check: Game ${gameState.gameId} - 1B:${hasFirst}, 2B:${hasSecond}, 3B:${hasThird}, outs:${outs}`);

    // Specifically: Runner on 3rd, 0 outs (~84% scoring probability)
    const triggered = !hasFirst && !hasSecond && hasThird && outs === 0;
    
    if (triggered) {
      console.log(`✅ MLB_RUNNER_ON_THIRD_NO_OUTS: TRIGGERED for game ${gameState.gameId}`);
    } else {
      console.log(`⏸️ MLB_RUNNER_ON_THIRD_NO_OUTS: Not triggered for game ${gameState.gameId}`);
    }
    
    return triggered;
  }

  generateAlert(gameState: GameState): AlertResult | null {
    const alertResult = {
      alertKey: `${gameState.gameId}_runner_on_third_no_outs`,
      type: this.alertType,
      message: `${gameState.awayTeam} @ ${gameState.homeTeam} | Runner on 3rd, 0 outs`,
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
        outs: 0,
        scenarioName: 'Runner on Third, No Outs',
        scoringProbability: 84
      },
      priority: 45
    };

    return alertResult;
  }

  calculateProbability(): number {
    return 84;
  }
}
