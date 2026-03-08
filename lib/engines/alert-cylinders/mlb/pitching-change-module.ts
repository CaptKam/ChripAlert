import { BaseAlertModule, GameState, AlertResult } from '../../base-engine';

export default class PitchingChangeModule extends BaseAlertModule {
  alertType = 'MLB_PITCHING_CHANGE';
  sport = 'MLB';
  
  // Track pitchers per game
  private lastPitchers: Map<string, string> = new Map();

  isTriggered(gameState: GameState): boolean {
    console.log(`🔍 MLB Pitching Change check for ${gameState.gameId}: pitcher=${gameState.currentPitcher}`);
    
    // Must be a live game
    if (!gameState.isLive) {
      console.log(`❌ Pitching Change: Game not live`);
      return false;
    }
    
    // Must have current pitcher info
    if (!gameState.currentPitcher) {
      console.log(`❌ Pitching Change: No pitcher info`);
      return false;
    }
    
    const gameId = gameState.gameId;
    const lastPitcher = this.lastPitchers.get(gameId);
    
    // First time seeing this game - track but don't trigger
    if (!lastPitcher) {
      this.lastPitchers.set(gameId, gameState.currentPitcher);
      console.log(`📋 Pitching Change: Initial pitcher tracked for ${gameId}: ${gameState.currentPitcher}`);
      return false;
    }
    
    // Check if pitcher changed
    const pitcherChanged = lastPitcher !== gameState.currentPitcher;
    
    if (pitcherChanged) {
      console.log(`🎯 MLB PITCHING CHANGE TRIGGERED! Old: ${lastPitcher}, New: ${gameState.currentPitcher}`);
      // Update tracked pitcher
      this.lastPitchers.set(gameId, gameState.currentPitcher);
      return true;
    }
    
    return false;
  }

  generateAlert(gameState: GameState): AlertResult | null {
    const inningText = gameState.isTopInning ? `Top ${gameState.inning}` : `Bottom ${gameState.inning}`;
    
    // Build message focusing on betting-critical leverage without duplicate team/score info
    let message = `⚾ PITCHING CHANGE! ${inningText} | New pitcher: ${gameState.currentPitcher}`;
    
    // Add leverage indicators for betting context
    const leverageIndicators: string[] = [];
    
    // Determine if this is a high-leverage situation
    const scoreDiff = Math.abs(gameState.homeScore - gameState.awayScore);
    const isCloseGame = scoreDiff <= 3;
    const isLateInning = gameState.inning >= 7;
    
    if (isLateInning && isCloseGame) {
      leverageIndicators.push('High leverage');
    }
    
    if (gameState.inning >= 9) {
      leverageIndicators.push('Critical moment');
    }
    
    // Check for runners in scoring position
    if (gameState.hasSecond || gameState.hasThird) {
      leverageIndicators.push('Runners in scoring position');
    }
    
    // Add reliever role context if late inning
    if (gameState.inning >= 8) {
      leverageIndicators.push('Setup/closer role');
    }
    
    if (leverageIndicators.length > 0) {
      message += ` | ${leverageIndicators.join(', ')}`;
    } else {
      message += ` | Standard substitution`;
    }
    
    const alertResult = {
      alertKey: `${gameState.gameId}_pitching_change_${gameState.inning}_${gameState.isTopInning ? 'top' : 'bot'}`,
      type: this.alertType,
      message: `${gameState.awayTeam} @ ${gameState.homeTeam} | Pitching change`,
      context: {
        gameId: gameState.gameId,
        homeTeam: gameState.homeTeam,
        awayTeam: gameState.awayTeam,
        homeScore: gameState.homeScore,
        awayScore: gameState.awayScore,
        inning: gameState.inning,
        isTopInning: gameState.isTopInning,
        newPitcher: gameState.currentPitcher,
        currentBatter: gameState.currentBatter
      },
      priority: 50
    };

    return alertResult;
  }

  calculateProbability(gameState: GameState): number {
    if (!this.isTriggered(gameState)) return 0;
    return 100; // Certain when pitcher changes
  }
}