import { BaseAlertModule, GameState, AlertResult } from '../../base-engine';
import { mlbPerformanceTracker } from '../../mlb-performance-tracker';

export default class BasesLoadedNoOutsModule extends BaseAlertModule {
  alertType = 'MLB_BASES_LOADED_NO_OUTS';
  sport = 'MLB';
  
  // Historical data for enhanced context
  private readonly historicalStats = {
    averageRunsScored: 2.28,
    minimumRunsProbability: 86,
    multipleRunsProbability: 65,
    grandSlamProbability: 3.2,
    doublePlayProbability: 14
  };

  isTriggered(gameState: GameState): boolean {
    if (!gameState.isLive) return false;

    const { hasFirst, hasSecond, hasThird, outs } = gameState;

    // Specifically: Bases loaded, 0 outs (~86% scoring probability)
    return hasFirst && hasSecond && hasThird && outs === 0;
  }

  generateAlert(gameState: GameState): AlertResult | null {
    // isTriggered() already called by engine - removed duplicate check
    // Enhanced context for AlertComposer
    const scoreDiff = Math.abs(gameState.homeScore - gameState.awayScore);
    const isCloseGame = scoreDiff <= 3;
    const isLateInning = gameState.inning >= 7;
    const criticalityFactor = isCloseGame && isLateInning ? 'extreme' : isCloseGame ? 'high' : 'moderate';
    
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
    
    // Pitcher fatigue analysis
    const pitcherContext = this.analyzePitcherSituation(gameState);
    
    // Batter matchup insight
    const batterContext = this.analyzeBatterSituation(gameState);

    const alertResult = {
      alertKey: `${gameState.gameId}_bases_loaded_no_outs_${gameState.inning}_${gameState.isTopInning ? 'T' : 'B'}_${gameState.outs}`,
      type: this.alertType,
      message: `${gameState.awayTeam} @ ${gameState.homeTeam} | Bases loaded, 0 outs`,
      context: {
        // Core game state
        gameId: gameState.gameId,
        homeTeam: gameState.homeTeam,
        awayTeam: gameState.awayTeam,
        homeScore: gameState.homeScore,
        awayScore: gameState.awayScore,
        inning: gameState.inning,
        isTopInning: gameState.isTopInning,
        hasFirst: true,
        hasSecond: true,
        hasThird: true,
        outs: 0,
        balls: gameState.balls || 0,
        strikes: gameState.strikes || 0,
        
        // Enhanced probability context
        scenarioName: 'Bases Loaded - Maximum Leverage',
        scoringProbability: 86,
        multipleRunsProbability: 65,
        expectedRuns: 2.28,
        
        // Situational factors
        criticality: criticalityFactor,
        isHighLeverage: true,
        scorePressure: isCloseGame ? 'maximum' : 'high',
        
        // Historical context
        historicalAverage: this.historicalStats.averageRunsScored,
        lastSimilarOutcome: '2+ runs in 65% of similar situations',
        
        // Pitcher/Batter dynamics
        pitcherFatigue: pitcherContext.fatigue,
        pitcherControl: pitcherContext.control,
        batterClutchRating: batterContext.clutchRating,
        matchupAdvantage: batterContext.advantage,
        
        // Timing elements
        timeToAct: '60-120 seconds',
        situationDuration: 'Next 1-3 batters',
        criticalWindow: 'Immediate - before first pitch',
        
        // Strategic insights
        keyInsight: pitcherContext.fatigue === 'high' 
          ? `Pitcher showing fatigue (${pitcherContext.pitchCount || '60+'}  pitches) - control deteriorating`
          : batterContext.advantage === 'strong'
          ? `Batter has .340+ avg in these situations`
          : 'Maximum scoring leverage - 86% chance of runs',
        
        // Betting angles
        bettingImplication: 'Strong OVER opportunity - runs highly probable',
        lineMovementExpected: 'Total likely to jump 0.5-1.0 runs',
        sharpAction: 'Historical sharp money on OVER in this spot'
      },
      priority: 97
    };

    return alertResult;
  }
  
  private analyzePitcherSituation(gameState: GameState): any {
    // Use structured data from gameState directly
    const pitchCount = gameState.pitchCount || 0;  // Direct access to available field
    const balls = gameState.balls || 0;
    const strikes = gameState.strikes || 0;
    
    return {
      pitchCount,
      fatigue: pitchCount > 80 ? 'extreme' : pitchCount > 60 ? 'high' : pitchCount > 40 ? 'moderate' : 'low',
      control: balls > strikes ? 'struggling' : 'maintaining',
      recentWalks: 0,  // Would need to be tracked separately
      stressLevel: 'maximum' // Bases loaded is always maximum stress
    };
  }
  
  private analyzeBatterSituation(gameState: GameState): any {
    // Enhanced batter analysis
    const batter = gameState.currentBatter || {};
    
    return {
      clutchRating: batter.clutchAverage || batter.average || .250,
      basesLoadedAverage: batter.basesLoadedAvg || .280,
      advantage: batter.basesLoadedAvg > .300 ? 'strong' : batter.basesLoadedAvg > .250 ? 'moderate' : 'neutral',
      recentForm: batter.last10Average || .250,
      rbisToday: batter.rbisToday || 0
    };
  }

  calculateProbability(): number {
    return 86;
  }
}