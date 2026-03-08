
import { BaseAlertModule, GameState, AlertResult } from '../../base-engine';

export default class ClutchSituationModule extends BaseAlertModule {
  alertType = 'MLB_CLUTCH_SITUATION';
  sport = 'MLB';

  isTriggered(gameState: GameState): boolean {
    if (!gameState.isLive) return false;
    
    const inning = gameState.inning || 1;
    const outs = gameState.outs || 0;
    const scoreDiff = Math.abs((gameState.homeScore || 0) - (gameState.awayScore || 0));
    
    // Late inning (7+), close game (≤2 runs), high leverage situation
    const isLateInning = inning >= 7;
    const isCloseGame = scoreDiff <= 2;
    const hasRunners = gameState.hasFirst || gameState.hasSecond || gameState.hasThird;
    
    // 9th inning or extra innings with runners
    if (inning >= 9 && hasRunners && isCloseGame) {
      console.log(`🎯 MLB CLUTCH: 9th+ inning with runners`);
      return true;
    }
    
    // 8th inning, 2 outs, runners on base
    if (inning === 8 && outs === 2 && hasRunners && isCloseGame) {
      console.log(`🎯 MLB CLUTCH: 8th inning, 2 outs, runners on`);
      return true;
    }
    
    // 7th inning stretch with high leverage
    if (inning === 7 && isCloseGame && (gameState.hasSecond || gameState.hasThird)) {
      console.log(`🎯 MLB CLUTCH: 7th inning stretch leverage`);
      return true;
    }
    
    return false;
  }

  generateAlert(gameState: GameState): AlertResult | null {
    const inning = gameState.inning || 1;
    const outs = gameState.outs || 0;
    const isExtraInnings = inning > 9;
    
    let situationDesc = '';
    if (isExtraInnings) {
      situationDesc = `Extra innings clutch moment`;
    } else if (inning === 9) {
      situationDesc = `9th inning pressure`;
    } else if (inning === 8 && outs === 2) {
      situationDesc = `8th inning, 2-out pressure`;
    } else {
      situationDesc = `Late-inning clutch situation`;
    }

    return {
      alertKey: `${gameState.gameId}_clutch_${inning}_${outs}_${gameState.isTopInning ? 'top' : 'bot'}`,
      type: this.alertType,
      message: `${gameState.awayTeam} @ ${gameState.homeTeam} | ${situationDesc}`,
      context: {
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
        clutchLevel: isExtraInnings ? 'extreme' : inning === 9 ? 'high' : 'moderate'
      },
      priority: isExtraInnings ? 95 : inning === 9 ? 90 : 85
    };
  }

  calculateProbability(): number {
    return 90;
  }
}
