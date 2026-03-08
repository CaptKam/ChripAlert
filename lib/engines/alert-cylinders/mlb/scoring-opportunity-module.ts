import { BaseAlertModule, GameState, AlertResult } from '../../base-engine';
import { mlbPerformanceTracker } from '../../mlb-performance-tracker';

export default class ScoringOpportunityModule extends BaseAlertModule {
  alertType = 'MLB_SCORING_OPPORTUNITY';
  sport = 'MLB';

  isTriggered(gameState: GameState): boolean {
    console.log(`🔍 MLB Scoring Opportunity check for ${gameState.gameId}: hasSecond=${gameState.hasSecond}, hasThird=${gameState.hasThird}, outs=${gameState.outs}`);
    
    // Must be a live game
    if (!gameState.isLive) {
      console.log(`❌ Scoring Opportunity: Game not live`);
      return false;
    }
    
    // Check for runners in scoring position (2nd or 3rd base)
    const hasRunnerSecond = gameState.hasSecond || false;
    const hasRunnerThird = gameState.hasThird || false;
    
    if (!hasRunnerSecond && !hasRunnerThird) {
      console.log(`❌ Scoring Opportunity: No runners in scoring position`);
      return false;
    }
    
    // Don't trigger with 3 outs (inning over)
    if (gameState.outs >= 3) {
      console.log(`❌ Scoring Opportunity: Inning is over (3 outs)`);
      return false;
    }
    
    // Enhanced triggering logic - also consider late innings and close games
    const isLateInning = (gameState.inning || 1) >= 6;
    const scoreDiff = Math.abs((gameState.homeScore || 0) - (gameState.awayScore || 0));
    const isCloseGame = scoreDiff <= 3;
    
    // Trigger for high-leverage situations even with only one runner
    if (isLateInning && isCloseGame && gameState.outs <= 1) {
      console.log(`🎯 MLB HIGH-LEVERAGE SCORING OPPORTUNITY! Late inning + close game`);
      return true;
    }
    
    console.log(`🎯 MLB SCORING OPPORTUNITY TRIGGERED! Runners: 2nd=${hasRunnerSecond}, 3rd=${hasRunnerThird}`);
    return true;
  }

  generateAlert(gameState: GameState): AlertResult | null {
    const hasRunnerSecond = gameState.hasSecond || false;
    const hasRunnerThird = gameState.hasThird || false;
    const hasRunnerFirst = gameState.hasFirst || false;
    const inningText = gameState.isTopInning ? `Top ${gameState.inning}` : `Bottom ${gameState.inning}`;
    
    // Get real performance data from tracker
    const batterId = gameState.currentBatterId || `batter_${(gameState.currentBatter || 'Unknown').replace(/\s+/g, '_')}`;
    const batterPerformance = mlbPerformanceTracker.getBatterSummary(gameState.gameId, batterId);
    const pitcherId = gameState.currentPitcherId || `pitcher_${(gameState.currentPitcher || 'Unknown').replace(/\s+/g, '_')}`;
    const pitcherPerformance = mlbPerformanceTracker.getPitcherSummary(gameState.gameId, pitcherId);
    const teamMomentum = mlbPerformanceTracker.getTeamMomentumSummary(
      gameState.gameId,
      gameState.isTopInning ? 'away' : 'home'
    );
    const patterns = mlbPerformanceTracker.detectUnusualPatterns(gameState.gameId);
    
    // Streamlined message focused on betting-critical data
    let message = '';
    
    // Base runner situation (core betting data)
    if (hasRunnerThird && hasRunnerSecond && hasRunnerFirst) {
      message += `Bases loaded`;
    } else if (hasRunnerThird && hasRunnerSecond) {
      message += `Runners on 2nd & 3rd`;
    } else if (hasRunnerThird) {
      message += `Runner on 3rd`;
    } else if (hasRunnerSecond) {
      message += `Runner on 2nd`;
    }
    
    message += `, ${gameState.outs} out${gameState.outs !== 1 ? 's' : ''}`;
    
    if (gameState.currentBatter) {
      message += ` | ${gameState.currentBatter} at bat`;
    }
    
    // Add batter performance if hot
    if (batterPerformance) {
      const match = batterPerformance.match(/(\d+)-for-(\d+)/);
      if (match) {
        const hits = parseInt(match[1]);
        const atBats = parseInt(match[2]);
        const avg = atBats > 0 ? hits / atBats : 0;
        if (avg >= 0.400 || (hits >= 2 && atBats <= 4)) {
          message += ` | Hot batter: ${batterPerformance}`;
        } else if (batterPerformance.includes('HR') || batterPerformance.includes('RBI')) {
          message += ` | ${batterPerformance}`;
        }
      }
    }
    
    // Add pitcher struggles  
    if (pitcherPerformance && (pitcherPerformance.includes('consecutive balls') || pitcherPerformance.includes('walked'))) {
      message += ` | Pitcher struggling: ${pitcherPerformance}`;
    }
    
    // Add team momentum for rally context
    if (teamMomentum) {
      if (teamMomentum.includes('rally') || teamMomentum.includes('scored in')) {
        message += ` | ${teamMomentum}`;
      } else if (teamMomentum.includes('stranded') && gameState.outs <= 1) {
        message += ` | Must capitalize: ${teamMomentum}`;
      }
    }
    
    // Add patterns if relevant
    if (patterns && patterns.length > 0) {
      const scoringPattern = patterns.find(p => 
        p.includes('RISP') || p.includes('scoring') || p.includes('clutch')
      );
      if (scoringPattern) {
        message += ` | ${scoringPattern}`;
      }
    }
    
    const alertResult = {
      alertKey: `${gameState.gameId}_scoring_opp_${gameState.inning}_${gameState.isTopInning ? 'T' : 'B'}_${hasRunnerSecond ? '2' : ''}${hasRunnerThird ? '3' : ''}_${gameState.outs}out`,
      type: this.alertType,
      message: `${gameState.awayTeam} @ ${gameState.homeTeam} | Scoring opportunity`,
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
        currentBatter: gameState.currentBatter,
        currentPitcher: gameState.currentPitcher
      },
      priority: hasRunnerThird ? 88 : 85
    };

    return alertResult;
  }

  calculateProbability(gameState: GameState): number {
    if (!this.isTriggered(gameState)) return 0;
    
    const hasRunnerThird = gameState.hasThird || false;
    const hasRunnerSecond = gameState.hasSecond || false;
    
    // Higher probability with runner on third
    if (hasRunnerThird && hasRunnerSecond) return 90;
    if (hasRunnerThird) return 85;
    if (hasRunnerSecond) return 75;
    
    return 70;
  }
}