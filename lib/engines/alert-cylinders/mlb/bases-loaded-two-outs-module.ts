import { BaseAlertModule, GameState, AlertResult } from '../../base-engine';
import { mlbPerformanceTracker } from '../../mlb-performance-tracker';

export default class BasesLoadedTwoOutsModule extends BaseAlertModule {
  alertType = 'MLB_BASES_LOADED_TWO_OUTS';
  sport = 'MLB';
  
  // Historical data for enhanced context
  private readonly historicalStats = {
    averageRunsScored: 0.99,
    scoringProbability: 43,
    clutchHitProbability: 31,
    strikeoutProbability: 28,
    walkProbability: 8,
    multipleRunsProbability: 22
  };

  isTriggered(gameState: GameState): boolean {
    if (!gameState.isLive) return false;

    const { hasFirst, hasSecond, hasThird, outs } = gameState;

    // Specifically: Bases loaded, 2 outs (~43% scoring probability)
    return hasFirst && hasSecond && hasThird && outs === 2;
  }

  generateAlert(gameState: GameState): AlertResult | null {
    // Enhanced context for high-pressure situation
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
    
    // Analyze two-out clutch situation
    const clutchContext = this.analyzeClutchSituation(gameState);
    
    // Pitcher pressure analysis
    const pressureContext = this.analyzePressureSituation(gameState);

    const alertResult = {
      alertKey: `${gameState.gameId}_bases_loaded_two_outs_${gameState.inning}_${gameState.isTopInning ? 'T' : 'B'}_${gameState.outs}`,
      type: this.alertType,
      message: `${gameState.awayTeam} @ ${gameState.homeTeam} | Bases loaded, 2 outs`,
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
        outs: 2,
        balls: gameState.balls || 0,
        strikes: gameState.strikes || 0,
        
        // Two-out pressure context
        scenarioName: 'Bases Loaded - Two Outs Pressure',
        scoringProbability: 43,
        clutchHitProbability: 31,
        expectedRuns: 0.99,
        strandedRunnersRisk: 57,
        
        // Situational factors
        criticality: criticalityFactor,
        isHighLeverage: true,
        pressureLevel: 'maximum',
        clutchFactor: 'extreme',
        
        // Historical context
        historicalAverage: this.historicalStats.averageRunsScored,
        twoOutClutchSuccess: '31% of batters deliver in this spot',
        commonOutcome: 'Stranded runners in 57% of situations',
        
        // Pressure dynamics
        pitcherPressure: pressureContext.pitcherStress,
        batterPressure: clutchContext.batterPressure,
        crowdImpact: isCloseGame ? 'deafening' : 'intense',
        
        // Key matchup factors
        twoOutApproach: 'Protect the plate - extend at-bat',
        pitcherStrategy: 'No free passes - attack the zone',
        criticalPitch: 'Next pitch could clear bases or end threat',
        
        // Timing elements
        timeToAct: '30-60 seconds',
        situationWindow: 'This at-bat only',
        criticalMoment: 'Immediate - every pitch matters',
        
        // Strategic insights
        keyInsight: clutchContext.recentClutch 
          ? 'Batter has delivered in 2-out situations recently'
          : pressureContext.pitcherStress === 'extreme'
          ? 'Pitcher showing signs of pressure - control issues likely'
          : 'Classic two-out pressure cooker - execution crucial',
        
        // Betting angles
        bettingImplication: 'High variance spot - runs or nothing',
        propOpportunity: 'RBI props, strikeout props at peak value',
        lineMovement: 'Live totals sensitive to this outcome',
        clutchPremium: 'Two-out RBI worth monitoring for player props',
        
        // Psychological factors
        mentalGame: 'Peak psychological pressure on both pitcher and batter',
        focusRequired: 'Single mistake can change game trajectory',
        momentumSwing: isLateInning ? 'Game-deciding potential' : 'Major momentum shift possible'
      },
      priority: 88
    };

    return alertResult;
  }
  
  private analyzeClutchSituation(gameState: GameState): any {
    const batter = gameState.currentBatter || {};
    
    return {
      batterPressure: 'extreme',
      twoOutAverage: batter.twoOutAvg || .220,
      basesLoadedTwoOut: batter.basesLoadedTwoOutAvg || .200,
      recentClutch: batter.last5ClutchHits || 0,
      seasonClutchRating: batter.clutchRating || 'average',
      approachChange: 'Likely more aggressive - protect the plate'
    };
  }
  
  private analyzePressureSituation(gameState: GameState): any {
    const pitchCount = gameState.pitchCount || 0;  // Direct access to available field
    
    return {
      pitcherStress: pitchCount > 25 ? 'extreme' : 'high',
      cannotWalk: 'Must throw strikes - walk forces in run',
      previousTwoOutSuccess: 3.50,  // Default value, would need separate tracking
      pressureRating: 'maximum',
      likelyPitch: gameState.strikes >= 2 ? 'Waste pitch possible' : 'Strike zone attack'
    };
  }

  calculateProbability(): number {
    return 43;
  }

  private buildEnhancedMessage(
    gameState: GameState,
    batterPerformance?: string | null,
    pitcherPerformance?: string | null,
    teamMomentum?: string | null,
    patterns?: string[] | null
  ): string {
    let message = `Bases loaded, 2 outs | 43% scoring probability`;
    
    // Add batter clutch performance
    if (batterPerformance) {
      const match = batterPerformance.match(/(\d+)-for-(\d+)/);
      if (match) {
        const hits = parseInt(match[1]);
        const atBats = parseInt(match[2]);
        const avg = atBats > 0 ? hits / atBats : 0;
        if (avg >= 0.333) {
          message += ` | Clutch batter hot: ${batterPerformance}`;
        } else if (avg <= 0.100 && atBats >= 3) {
          message += ` | Batter struggling: ${batterPerformance}`;
        }
      }
    }
    
    // Add pitcher fatigue with proper parsing
    if (pitcherPerformance) {
      // Parse pitch count correctly - look for "X pitches" pattern
      const pitchMatch = pitcherPerformance.match(/(\d+)\s*pitches/i);
      const pitchCount = pitchMatch ? parseInt(pitchMatch[1]) : gameState.pitchCount || 0;
      
      // Parse velocity changes
      const velocityMatch = pitcherPerformance.match(/velocity\s*(down|up)\s*(\d+)\s*mph/i);
      
      if (pitcherPerformance.includes('consecutive balls') || pitcherPerformance.includes('walked')) {
        message += ` | Pitcher control issues: ${pitcherPerformance}`;
      } else if (pitchCount > 90) {
        message += ` | Pitcher fatigue risk: ${pitchCount} pitches`;
        if (velocityMatch && parseInt(velocityMatch[2]) > 2) {
          message += `, velocity ${velocityMatch[1]} ${velocityMatch[2]}mph`;
        }
      } else if (velocityMatch && parseInt(velocityMatch[2]) > 2) {
        message += ` | Velocity ${velocityMatch[1]} ${velocityMatch[2]}mph`;
      }
    }
    
    // Add unusual patterns that suggest pressure
    if (patterns && patterns.length > 0) {
      const relevantPattern = patterns.find(p => 
        p.includes('strikeout') || p.includes('walk') || p.includes('stranded')
      );
      if (relevantPattern) {
        message += ` | ${relevantPattern}`;
      }
    }
    
    // Team momentum in clutch
    if (teamMomentum && teamMomentum.includes('rally')) {
      message += ` | ${teamMomentum}`;
    }
    
    // Always include the pressure element
    message += ` | LIVE TENSION PEAK`;
    
    return message;
  }
}