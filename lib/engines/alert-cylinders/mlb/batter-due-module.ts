import { BaseAlertModule, GameState, AlertResult } from '../../base-engine';
import { advancedPlayerStats, PlayerAdvancedStats, PitcherAdvancedStats, HandednessMatchup } from '../../../advanced-player-stats';

export default class BatterDueModule extends BaseAlertModule {
  alertType = 'MLB_BATTER_DUE';
  sport = 'MLB';

  // RE24 Matrix: Expected runs based on base-out state (2019-2023 MLB averages - accurate values)
  private readonly RE24_MATRIX = {
    '000_0': 0.502,  // Bases empty, 0 outs
    '000_1': 0.257,  // Bases empty, 1 out  
    '000_2': 0.099,  // Bases empty, 2 outs
    '001_0': 0.867,  // Runner on 1st, 0 outs
    '001_1': 0.509,  // Runner on 1st, 1 out
    '001_2': 0.214,  // Runner on 1st, 2 outs
    '010_0': 1.189,  // Runner on 2nd, 0 outs  
    '010_1': 0.657,  // Runner on 2nd, 1 out
    '010_2': 0.305,  // Runner on 2nd, 2 outs
    '011_0': 1.541,  // Runners on 1st and 2nd, 0 outs
    '011_1': 0.927,  // Runners on 1st and 2nd, 1 out
    '011_2': 0.412,  // Runners on 1st and 2nd, 2 outs
    '100_0': 1.373,  // Runner on 3rd, 0 outs
    '100_1': 0.950,  // Runner on 3rd, 1 out
    '100_2': 0.382,  // Runner on 3rd, 2 outs  
    '101_0': 1.740,  // Runners on 1st and 3rd, 0 outs
    '101_1': 1.202,  // Runners on 1st and 3rd, 1 out
    '101_2': 0.489,  // Runners on 1st and 3rd, 2 outs
    '110_0': 1.955,  // Runners on 2nd and 3rd, 0 outs
    '110_1': 1.293,  // Runners on 2nd and 3rd, 1 out
    '110_2': 0.587,  // Runners on 2nd and 3rd, 2 outs
    '111_0': 2.350,  // Bases loaded, 0 outs
    '111_1': 1.546,  // Bases loaded, 1 out
    '111_2': 0.694   // Bases loaded, 2 outs
  };

  // RP24 Matrix: Probability of scoring at least one run (complementing RE24)
  private readonly RP24_MATRIX = {
    '000_0': 0.274,  // Bases empty, 0 outs
    '000_1': 0.157,  // Bases empty, 1 out  
    '000_2': 0.068,  // Bases empty, 2 outs
    '001_0': 0.416,  // Runner on 1st, 0 outs
    '001_1': 0.260,  // Runner on 1st, 1 out
    '001_2': 0.125,  // Runner on 1st, 2 outs
    '010_0': 0.607,  // Runner on 2nd, 0 outs  
    '010_1': 0.407,  // Runner on 2nd, 1 out
    '010_2': 0.214,  // Runner on 2nd, 2 outs
    '011_0': 0.655,  // Runners on 1st and 2nd, 0 outs
    '011_1': 0.459,  // Runners on 1st and 2nd, 1 out
    '011_2': 0.251,  // Runners on 1st and 2nd, 2 outs
    '100_0': 0.841,  // Runner on 3rd, 0 outs
    '100_1': 0.656,  // Runner on 3rd, 1 out
    '100_2': 0.294,  // Runner on 3rd, 2 outs  
    '101_0': 0.867,  // Runners on 1st and 3rd, 0 outs
    '101_1': 0.703,  // Runners on 1st and 3rd, 1 out
    '101_2': 0.351,  // Runners on 1st and 3rd, 2 outs
    '110_0': 0.900,  // Runners on 2nd and 3rd, 0 outs
    '110_1': 0.767,  // Runners on 2nd and 3rd, 1 out
    '110_2': 0.426,  // Runners on 2nd and 3rd, 2 outs
    '111_0': 0.908,  // Bases loaded, 0 outs
    '111_1': 0.782,  // Bases loaded, 1 out
    '111_2': 0.453   // Bases loaded, 2 outs
  };

  // Cached probability to prevent flapping - computed once per unique game state
  private probabilityCache: { [key: string]: number } = {};
  
  // Advanced metrics cache for performance optimization
  private playerStatsCache: { [key: string]: { batter?: PlayerAdvancedStats; pitcher?: PitcherAdvancedStats; timestamp: number } } = {};
  private readonly PLAYER_CACHE_TTL = 30 * 60 * 1000; // 30 minutes for live game player stats
  
  // Hysteresis thresholds to prevent alert flapping
  private readonly TRIGGER_THRESHOLD = 62; // Trigger alert at 62%
  private readonly CLEAR_THRESHOLD = 55;   // Clear alert at 55%
  private lastTriggeredState: { [gameId: string]: boolean } = {};

  isTriggered(gameState: GameState): boolean {
    if (!gameState.isLive) return false;

    // Only trigger in the middle to late innings (4+) when games get more strategic
    if (!gameState.inning || gameState.inning < 4) return false;

    const probability = this.getScoringProbabilitySync(gameState);
    const gameId = gameState.gameId;
    const wasTriggered = this.lastTriggeredState[gameId] || false;
    
    // Implement hysteresis to prevent flapping
    let shouldTrigger;
    if (wasTriggered) {
      // If already triggered, clear only when probability drops below clear threshold
      shouldTrigger = probability >= this.CLEAR_THRESHOLD;
    } else {
      // If not triggered, trigger when probability exceeds trigger threshold
      shouldTrigger = probability >= this.TRIGGER_THRESHOLD;
    }
    
    // Update state
    this.lastTriggeredState[gameId] = shouldTrigger;
    
    return shouldTrigger;
  }

  generateAlert(gameState: GameState): AlertResult | null {
    // isTriggered() already called by engine - removed duplicate check
    // Use cached probability to ensure consistency
    const scoringProbability = this.getScoringProbabilitySync(gameState);
    const gameContext = this.analyzeGameSituation(gameState);
    const lineupContext = this.analyzeLineupData(gameState);
    
    // Get advanced player metrics for sophisticated analysis (simplified for now)
    const { batterStats, pitcherStats, handednessMatchup } = this.getAdvancedPlayerMetricsSync(gameState);
    
    // Create dynamic message based on the specific situation, weather, and advanced metrics
    let alertMessage = this.generateAdvancedAlertMessage(scoringProbability, gameContext, lineupContext, gameState.weatherContext, batterStats, pitcherStats, handednessMatchup, gameState);

    // More granular alertKey with base/out/lineup context
    const baseOutState = this.getBaseOutStateKey(gameState);
    const currentBatter = gameState.currentBatter || 'unknown';
    const alertKey = `${gameState.gameId}_batter_due_${gameState.inning}_${gameState.isTopInning ? 'top' : 'bottom'}_${baseOutState}_${currentBatter.replace(/\s+/g, '_')}`;

    const alertResult = {
      alertKey,
      type: this.alertType,
      message: `${gameState.awayTeam} @ ${gameState.homeTeam} | Batter due`,
      context: {
        gameId: gameState.gameId,
        homeTeam: gameState.homeTeam,
        awayTeam: gameState.awayTeam,
        homeScore: gameState.homeScore,
        awayScore: gameState.awayScore,
        inning: gameState.inning,
        isTopInning: gameState.isTopInning,
        hasFirst: gameState.hasFirst || false,
        hasSecond: gameState.hasSecond || false,
        hasThird: gameState.hasThird || false,
        outs: gameState.outs || 0,
        balls: gameState.balls || 0,
        strikes: gameState.strikes || 0,
        scenarioName: 'Batter Due Prediction',
        scoringProbability: scoringProbability,
        predictionType: 'upcoming_batters',
        gameContext,
        lineupContext,
        re24Value: this.getCurrentRE24Value(gameState),
        rp24Value: this.getCurrentRP24Value(gameState),
        currentBatter: gameState.currentBatter,
        currentPitcher: gameState.currentPitcher,
        baseOutState,
        // Advanced sabermetric context
        batterAdvancedStats: batterStats,
        pitcherAdvancedStats: pitcherStats,
        handednessMatchup: handednessMatchup,
        batterAdvantage: batterStats && pitcherStats ? advancedPlayerStats.calculateBatterAdvantage(batterStats, pitcherStats) : 0,
        // Weather integration context
        weatherContext: gameState.weatherContext,
        weatherImpact: gameState.weatherContext?.impact || 1.0,
        // Predictive metadata
        alertTiming: 'predictive',
        confidence: this.calculateConfidenceLevel(scoringProbability),
        leverageIndex: this.calculateLeverageIndex(gameState)
      },
      priority: Math.min(95, 60 + Math.round(scoringProbability * 0.4)) // More conservative priority scaling
    };

    return alertResult;
  }

  calculateProbability(gameState: GameState): number {
    return this.getScoringProbabilitySync(gameState);
  }

  private getScoringProbabilitySync(gameState: GameState): number {
    // Create unique cache key for this specific game state
    const cacheKey = this.createGameStateKey(gameState);
    
    // Return cached value if available to prevent flapping
    if (this.probabilityCache[cacheKey] !== undefined) {
      return this.probabilityCache[cacheKey];
    }

    // Calculate probability using deterministic baseball statistics
    const probability = this.calculateDeterministicProbabilitySync(gameState);
    
    // Cache the result for this specific game state
    this.probabilityCache[cacheKey] = probability;
    return probability;
  }

  // Keep the async version for future use if needed
  private async getScoringProbability(gameState: GameState): Promise<number> {
    return this.getScoringProbabilitySync(gameState);
  }

  private createGameStateKey(gameState: GameState): string {
    // Create a unique key that represents the exact game state
    return [
      gameState.gameId,
      gameState.inning,
      gameState.isTopInning ? 'top' : 'bottom',
      gameState.hasFirst ? '1' : '0',
      gameState.hasSecond ? '1' : '0', 
      gameState.hasThird ? '1' : '0',
      gameState.outs,
      gameState.balls,
      gameState.strikes,
      gameState.homeScore,
      gameState.awayScore
    ].join('_');
  }

  private calculateDeterministicProbabilitySync(gameState: GameState): number {
    // Use RP24 (Run Probability) as base - more direct measure of scoring likelihood
    const baseRP24 = this.getCurrentRP24Value(gameState);
    const currentRE24 = this.getCurrentRE24Value(gameState);
    
    // Start with RP24 as base probability (already a percentage)
    let probability = baseRP24 * 100;
    
    // Apply logistic scaling for RE24 influence (prevents oversaturation)
    const re24Factor = this.logisticScale(currentRE24, 1.2, 10); // Scale factor and steepness
    probability = probability * (1 + re24Factor);

    // Add situational modifiers
    probability += this.getInningLeverageFactor(gameState.inning || 1);
    probability += this.getGameSituationFactor(gameState);
    probability += this.getCountSituationFactor(gameState.balls || 0, gameState.strikes || 0);
    probability += this.getRealLineupStrengthFactor(gameState);
    probability += this.getPitcherBatterMatchupFactor(gameState);

    // WEATHER INTEGRATION: Simplified for sync operation
    // Weather integration will be handled asynchronously in the future
    // For now, use a neutral weather impact
    const weatherImpact = 1.0;
    probability = probability * weatherImpact;

    // Apply advanced metrics enhancements (simplified for sync)
    if (gameState.currentBatter && gameState.currentPitcher) {
      probability = this.applyAdvancedMetricsBoostSync(probability, gameState);
    }
    
    // Apply calibrated bounds (more realistic than hard caps)
    return this.calibrateScoreBounds(probability, gameState);
  }

  private getCurrentRE24Value(gameState: GameState): number {
    // Build base-out state key for RE24 lookup
    const baseState = [
      gameState.hasThird ? '1' : '0',
      gameState.hasSecond ? '1' : '0', 
      gameState.hasFirst ? '1' : '0'
    ].join('');
    
    const outs = Math.min(2, gameState.outs || 0); // Cap at 2 outs
    const re24Key = `${baseState}_${outs}`;
    
    return this.RE24_MATRIX[re24Key as keyof typeof this.RE24_MATRIX] || 0.25;
  }

  private getInningLeverageFactor(inning: number): number {
    // Leverage increases in later innings (deterministic)
    if (inning >= 9) return 15; // 9th inning and extras - highest leverage
    if (inning >= 7) return 12; // 7-8th innings - high leverage
    if (inning >= 5) return 8;  // 5-6th innings - medium leverage
    if (inning >= 4) return 5;  // 4th inning - building leverage
    return 2; // Earlier innings - lower leverage
  }

  private getGameSituationFactor(gameState: GameState): number {
    const scoreDiff = Math.abs((gameState.homeScore || 0) - (gameState.awayScore || 0));
    
    // Game situation affects scoring urgency (deterministic)
    if (scoreDiff === 0) return 12; // Tied game - maximum urgency
    if (scoreDiff === 1) return 10; // One-run game - high urgency
    if (scoreDiff === 2) return 7;  // Two-run game - moderate urgency
    if (scoreDiff === 3) return 4;  // Three-run game - some urgency
    if (scoreDiff <= 5) return 1;   // Still within reach
    return -3; // Blowout - reduced urgency
  }

  private getCountSituationFactor(balls: number, strikes: number): number {
    // Count situation affects at-bat outcome probability (deterministic)
    if (balls >= 3) return 6; // Full count or walk - high pressure on pitcher
    if (balls >= 2 && strikes <= 1) return 4; // Hitter's count (2-0, 2-1, 3-1)
    if (balls > strikes) return 2; // Ahead in count
    if (strikes >= 2) return -2; // Pitcher ahead (0-2, 1-2)
    return 0; // Neutral count
  }

  private getRealLineupStrengthFactor(gameState: GameState): number {
    const lineupData = gameState.lineupData;
    if (!lineupData) {
      // Fallback to estimative method if no real data available
      return this.getFallbackLineupFactor(gameState);
    }
    
    let lineupFactor = 0;
    
    // Current batter strength from real lineup data
    const currentStrength = lineupData.currentBatterStrength;
    switch (currentStrength) {
      case 'elite': lineupFactor += 8; break;
      case 'strong': lineupFactor += 5; break;
      case 'average': lineupFactor += 2; break;
      case 'weak': lineupFactor += 0; break;
    }
    
    // Next batter strength (smaller impact)
    const nextStrength = lineupData.nextBatterStrength;
    switch (nextStrength) {
      case 'elite': lineupFactor += 4; break;
      case 'strong': lineupFactor += 2; break;
      case 'average': lineupFactor += 1; break;
      case 'weak': lineupFactor += 0; break;
    }
    
    // On-deck batter (even smaller impact)
    const onDeckStrength = lineupData.onDeckBatterStrength;
    switch (onDeckStrength) {
      case 'elite': lineupFactor += 2; break;
      case 'strong': lineupFactor += 1; break;
      case 'average': lineupFactor += 0; break;
      case 'weak': lineupFactor += -1; break;
    }
    
    // Late inning pinch hitting factor
    if ((gameState.inning || 1) >= 7) {
      lineupFactor += 3; // Managers optimize lineups in key situations
    }
    
    return lineupFactor;
  }

  private getFallbackLineupFactor(gameState: GameState): number {
    // Fallback to original synthetic method if no real lineup data
    const inning = gameState.inning || 1;
    const outs = gameState.outs || 0;
    const estimatedPosition = ((inning - 1) * 3 + outs) % 9 + 1;
    
    const strength = this.getBatterStrengthByPosition(estimatedPosition);
    switch (strength) {
      case 'elite': return 6;
      case 'strong': return 4;
      case 'average': return 2;
      case 'weak': return 0;
    }
    return 2;
  }

  private getBatterStrengthByPosition(position: number): 'elite' | 'strong' | 'average' | 'weak' {
    // Standard MLB batting order strength patterns (deterministic)
    if (position >= 1 && position <= 2) return 'elite';   // 1-2: Best contact/speed hitters
    if (position >= 3 && position <= 5) return 'strong';  // 3-5: Best power hitters  
    if (position >= 6 && position <= 7) return 'average'; // 6-7: Average hitters
    return 'weak'; // 8-9: Weakest hitters (including pitcher in NL)
  }

  private generateAlertMessage(scoringProbability: number, gameContext: any, lineupContext: any, weatherContext?: any): string {
    const roundedProb = Math.round(scoringProbability);
    const currentBatter = lineupContext.currentBatterName || 'batter';
    
    // Simple context message without dramatic language
    return `Batter prediction - ${roundedProb}% scoring probability - ${currentBatter} at bat`;
  }

  private analyzeGameSituation(gameState: GameState): any {
    const scoreDiff = Math.abs((gameState.homeScore || 0) - (gameState.awayScore || 0));
    const inning = gameState.inning || 1;
    
    return {
      isCloseGame: scoreDiff <= 2,
      isTiedGame: scoreDiff === 0,
      isLateInning: inning >= 7,
      isExtraInnings: inning >= 10,
      hasRunnersOnBase: gameState.hasFirst || gameState.hasSecond || gameState.hasThird,
      hasRunnersInScoringPosition: gameState.hasSecond || gameState.hasThird,
      isHighLeverage: (inning >= 7 && scoreDiff <= 3) || (inning >= 9 && scoreDiff <= 1),
      outs: gameState.outs || 0,
      inning: inning,
      scoreDifferential: scoreDiff,
      currentRE24: this.getCurrentRE24Value(gameState)
    };
  }

  private calculateConfidenceLevel(probability: number): string {
    // Confidence based on probability strength (deterministic)
    if (probability >= 80) return 'very_high';
    if (probability >= 70) return 'high';
    if (probability >= 60) return 'medium_high';
    if (probability >= 50) return 'medium';
    return 'low';
  }

  // New helper methods for enhanced baseball analysis
  
  private getCurrentRP24Value(gameState: GameState): number {
    const baseOutState = this.getBaseOutStateKey(gameState);
    return this.RP24_MATRIX[baseOutState as keyof typeof this.RP24_MATRIX] || 0.10;
  }
  
  private getBaseOutStateKey(gameState: GameState): string {
    const baseState = [
      gameState.hasThird ? '1' : '0',
      gameState.hasSecond ? '1' : '0', 
      gameState.hasFirst ? '1' : '0'
    ].join('');
    const outs = Math.min(2, gameState.outs || 0);
    return `${baseState}_${outs}`;
  }
  
  private logisticScale(value: number, midpoint: number, steepness: number): number {
    // Logistic function to prevent oversaturation at high values
    return 1 / (1 + Math.exp(-steepness * (value - midpoint))) - 0.5;
  }
  
  private calibrateScoreBounds(probability: number, gameState: GameState): number {
    // More intelligent bounds based on game situation
    const minProb = gameState.hasThird ? 20 : 10; // Higher floor with RISP
    const maxProb = (gameState.inning || 1) >= 9 ? 92 : 88; // Higher ceiling in late innings
    
    return Math.max(minProb, Math.min(probability, maxProb));
  }
  
  private analyzeLineupData(gameState: GameState): any {
    const lineupData = gameState.lineupData;
    const currentBatter = gameState.currentBatter;
    const currentPitcher = gameState.currentPitcher;
    
    // Analyze upcoming hitter strength
    const hasStrongUpcomingHitters = lineupData && 
      (lineupData.currentBatterStrength === 'elite' || lineupData.currentBatterStrength === 'strong') &&
      (lineupData.nextBatterStrength === 'elite' || lineupData.nextBatterStrength === 'strong');
    
    // Analyze pitcher-batter matchup favorability
    const favorablePitcherMatchup = this.assessPitcherBatterMatchup(currentBatter, currentPitcher);
    
    return {
      currentBatterName: currentBatter ? currentBatter.split(' ').slice(-1)[0] : 'unknown', // Last name only
      currentBatterStrength: lineupData?.currentBatterStrength || 'average',
      nextBatterStrength: lineupData?.nextBatterStrength || 'average',
      onDeckBatterStrength: lineupData?.onDeckBatterStrength || 'average',
      hasStrongUpcomingHitters,
      favorablePitcherMatchup,
      battingOrder: lineupData?.currentBatterOrder || 1,
      nextBattingOrder: lineupData?.nextBatterOrder || 2
    };
  }
  
  private getPitcherBatterMatchupFactor(gameState: GameState): number {
    // Placeholder for pitcher-batter matchup analysis
    // In a full implementation, this would analyze L/R handedness, recent performance, etc.
    const currentBatter = gameState.currentBatter;
    const currentPitcher = gameState.currentPitcher;
    
    if (!currentBatter || !currentPitcher) return 0;
    
    // Simple heuristic: favorable matchup adds 2-3 points
    const isFavorable = this.assessPitcherBatterMatchup(currentBatter, currentPitcher);
    return isFavorable ? 3 : 0;
  }
  
  private assessPitcherBatterMatchup(batter: string, pitcher: string): boolean {
    // Placeholder for advanced matchup analysis
    // In full implementation would check handedness, historical performance, etc.
    // For now, return random favorable matchup for demonstration
    if (!batter || !pitcher) return false;
    
    // Simple heuristic based on name hash for demonstration
    const hash = (batter + pitcher).split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0);
      return a & a;
    }, 0);
    
    return Math.abs(hash) % 3 === 0; // ~33% favorable matchups
  }
  
  private calculateLeverageIndex(gameState: GameState): number {
    // Simplified Leverage Index calculation
    const inning = gameState.inning || 1;
    const scoreDiff = Math.abs((gameState.homeScore || 0) - (gameState.awayScore || 0));
    const outs = gameState.outs || 0;
    
    let leverage = 1.0; // Base leverage
    
    // Inning factor
    if (inning >= 9) leverage *= 2.5;
    else if (inning >= 7) leverage *= 1.8;
    else if (inning >= 5) leverage *= 1.3;
    
    // Score differential factor  
    if (scoreDiff === 0) leverage *= 2.0; // Tied game
    else if (scoreDiff === 1) leverage *= 1.7; // One-run game
    else if (scoreDiff === 2) leverage *= 1.3; // Two-run game
    else if (scoreDiff >= 5) leverage *= 0.6; // Blowout
    
    // Outs factor
    if (outs === 2) leverage *= 1.4; // Two outs increases pressure
    else if (outs === 1) leverage *= 1.1;
    
    return Math.round(leverage * 100) / 100; // Round to 2 decimal places
  }

  // === ADVANCED SABERMETRIC METHODS ===

  /**
   * Generate sophisticated alert message with advanced metrics context
   */
  private generateAdvancedAlertMessage(
    probability: number, 
    gameContext: any, 
    lineupContext: any, 
    weatherContext?: any,
    batterStats?: PlayerAdvancedStats,
    pitcherStats?: PitcherAdvancedStats,
    handednessMatchup?: HandednessMatchup,
    gameState?: GameState
  ): string {
    const roundedProb = Math.round(probability);
    const currentBatter = lineupContext.currentBatterName;
    
    // Streamlined message focusing on betting-critical data only
    return `${currentBatter} at bat | ${roundedProb}% scoring probability`;
  }

  /**
   * Fetch and cache advanced player metrics with handedness analysis
   */
  private async getAdvancedPlayerMetrics(gameState: GameState): Promise<{
    batterStats?: PlayerAdvancedStats;
    pitcherStats?: PitcherAdvancedStats;
    handednessMatchup?: HandednessMatchup;
  }> {
    const cacheKey = `${gameState.gameId}_${gameState.currentBatter}_${gameState.currentPitcher}`;
    const now = Date.now();
    
    // Check cache first
    const cached = this.playerStatsCache[cacheKey];
    if (cached && (now - cached.timestamp) < this.PLAYER_CACHE_TTL) {
      const handednessMatchup = cached.batter && cached.pitcher ? 
        advancedPlayerStats.analyzeHandednessMatchup(cached.batter.handedness, cached.pitcher.handedness) : undefined;
      
      return {
        batterStats: cached.batter,
        pitcherStats: cached.pitcher,
        handednessMatchup
      };
    }

    try {
      // Determine batting team for context
      const battingTeam = gameState.isTopInning ? gameState.awayTeam : gameState.homeTeam;
      const pitchingTeam = gameState.isTopInning ? gameState.homeTeam : gameState.awayTeam;
      
      // Fetch advanced stats if player names available
      let batterStats: PlayerAdvancedStats | undefined;
      let pitcherStats: PitcherAdvancedStats | undefined;
      
      if (gameState.currentBatter) {
        batterStats = await advancedPlayerStats.getBatterAdvancedStats(
          gameState.currentBatter, 
          battingTeam
        );
        console.log(`📊 Advanced stats for ${gameState.currentBatter}: xwOBA=${batterStats.xwOBA.toFixed(3)}, wRC+=${batterStats.wRCPlus}, trend=${batterStats.recent.trend}`);
      }
      
      if (gameState.currentPitcher) {
        pitcherStats = await advancedPlayerStats.getPitcherAdvancedStats(
          gameState.currentPitcher, 
          pitchingTeam
        );
        console.log(`⚾ Advanced stats for ${gameState.currentPitcher}: xERA=${pitcherStats.xERA.toFixed(2)}, K%-BB%=${(pitcherStats.kwBB * 100).toFixed(1)}%`);
      }
      
      // Analyze handedness matchup if both players available
      const handednessMatchup = batterStats && pitcherStats ? 
        advancedPlayerStats.analyzeHandednessMatchup(batterStats.handedness, pitcherStats.handedness) : undefined;
      
      if (handednessMatchup) {
        console.log(`🤝 Matchup analysis: ${handednessMatchup.matchupType} - ${handednessMatchup.description} (${(handednessMatchup.expectedWOBAModifier * 100 - 100).toFixed(1)}% modifier)`);
      }
      
      // Cache the results
      this.playerStatsCache[cacheKey] = {
        batter: batterStats,
        pitcher: pitcherStats,
        timestamp: now
      };
      
      return { batterStats, pitcherStats, handednessMatchup };
    } catch (error) {
      console.error('Error fetching advanced player metrics:', error);
      return {};
    }
  }

  /**
   * Apply advanced metrics boost to probability calculations
   */
  private async applyAdvancedMetricsBoost(probability: number, gameState: GameState): Promise<number> {
    try {
      const { batterStats, pitcherStats, handednessMatchup } = await this.getAdvancedPlayerMetrics(gameState);
      
      let enhancedProbability = probability;
      
      // Apply xwOBA quality multiplier
      if (batterStats?.xwOBA) {
        const xwobaMultiplier = this.calculateXwOBAMultiplier(batterStats.xwOBA);
        enhancedProbability *= xwobaMultiplier;
        console.log(`📊 xwOBA multiplier: ${xwobaMultiplier.toFixed(3)} for ${batterStats.xwOBA.toFixed(3)} xwOBA`);
      }
      
      // Apply wRC+ run creation adjustment
      if (batterStats?.wRCPlus) {
        const wrcPlusAdjustment = this.calculateWRCPlusAdjustment(batterStats.wRCPlus);
        enhancedProbability += wrcPlusAdjustment;
        console.log(`💪 wRC+ adjustment: ${wrcPlusAdjustment.toFixed(1)} for ${batterStats.wRCPlus} wRC+`);
      }
      
      // Apply handedness matchup modifier
      if (handednessMatchup) {
        enhancedProbability *= handednessMatchup.expectedWOBAModifier;
        console.log(`🤝 Handedness modifier: ${handednessMatchup.expectedWOBAModifier.toFixed(3)} (${handednessMatchup.matchupType})`);
      }
      
      // Apply recent performance trends
      if (batterStats?.recent.trend) {
        const trendAdjustment = this.calculateTrendAdjustment(batterStats.recent.trend, batterStats.recent.wRCPlus);
        enhancedProbability += trendAdjustment;
        console.log(`🔥 Trend adjustment: ${trendAdjustment.toFixed(1)} for ${batterStats.recent.trend} streak`);
      }
      
      // Apply pitcher quality counter-adjustment
      if (pitcherStats) {
        const pitcherAdjustment = this.calculatePitcherQualityAdjustment(pitcherStats);
        enhancedProbability += pitcherAdjustment;
        console.log(`⚾ Pitcher adjustment: ${pitcherAdjustment.toFixed(1)} for pitcher quality`);
      }
      
      console.log(`🚀 Advanced metrics enhanced probability: ${probability.toFixed(1)}% → ${enhancedProbability.toFixed(1)}%`);
      return enhancedProbability;
    } catch (error) {
      console.error('Error applying advanced metrics boost:', error);
      return probability; // Return original probability if enhancement fails
    }
  }

  // === ADVANCED METRICS HELPER METHODS ===

  private calculateXwOBAMultiplier(xwOBA: number): number {
    const leagueAverage = 0.318; // 2024 MLB league average
    // Convert xwOBA difference to multiplicative factor
    // Range: 0.85 (poor contact) to 1.25 (elite contact)
    const differential = (xwOBA - leagueAverage) / leagueAverage;
    return Math.max(0.85, Math.min(1.25, 1.0 + (differential * 0.8)));
  }

  private calculateWRCPlusAdjustment(wRCPlus: number): number {
    // Direct adjustment based on runs created above/below average
    // Each 10 points of wRC+ = ~1% probability adjustment
    const leagueAverage = 100;
    return Math.max(-8, Math.min(8, (wRCPlus - leagueAverage) / 12.5));
  }

  private calculateTrendAdjustment(trend: 'hot' | 'cold' | 'average', recentWRCPlus: number): number {
    switch (trend) {
      case 'hot':
        // Hot streak bonus scaled by performance level
        return Math.min(6, 2 + (recentWRCPlus - 100) / 25);
      case 'cold':
        // Cold streak penalty capped at reasonable level
        return Math.max(-4, -1 - (100 - recentWRCPlus) / 30);
      default:
        return 0;
    }
  }

  private calculatePitcherQualityAdjustment(pitcherStats: PitcherAdvancedStats): number {
    // Worse pitcher = higher scoring probability
    const avgXERA = 4.28; // 2024 league average
    const avgKwBB = 0.145; // 2024 league average K%-BB%
    
    // xERA adjustment (worse ERA = higher scoring chance)
    const eraAdjustment = Math.max(-3, Math.min(4, (pitcherStats.xERA - avgXERA) * 0.8));
    
    // K%-BB% adjustment (lower strikeout rate = higher scoring chance)
    const kwbbAdjustment = Math.max(-2, Math.min(3, (avgKwBB - pitcherStats.kwBB) * 15));
    
    return eraAdjustment + kwbbAdjustment;
  }

  // Synchronous version of getAdvancedPlayerMetrics (simplified)
  private getAdvancedPlayerMetricsSync(gameState: GameState): any {
    // Simplified synchronous version - returns mock data for now
    // In production, this would use cached data or a synchronous lookup
    return {
      batterStats: undefined,
      pitcherStats: undefined,
      handednessMatchup: undefined
    };
  }

  // Synchronous version of applyAdvancedMetricsBoost (simplified)
  private applyAdvancedMetricsBoostSync(probability: number, gameState: GameState): number {
    // Simplified synchronous version - returns original probability
    // In production, this would use cached metrics data
    return probability;
  }

  private buildAdvancedMetricsContext(
    batterStats?: PlayerAdvancedStats, 
    pitcherStats?: PitcherAdvancedStats, 
    handednessMatchup?: HandednessMatchup
  ): string {
    const contextParts: string[] = [];
    
    // Handedness context
    if (handednessMatchup && handednessMatchup.advantageStrength !== 'neutral') {
      const advantage = handednessMatchup.favorsBatter ? 'favorable' : 'tough';
      contextParts.push(`${advantage} ${handednessMatchup.matchupType}`);
    }
    
    // Recent performance context
    if (batterStats?.recent.trend === 'hot') {
      contextParts.push('hot streak');
    } else if (batterStats?.recent.trend === 'cold') {
      contextParts.push('cold spell');
    }
    
    // Pitcher quality context
    if (pitcherStats?.xERA && pitcherStats.xERA > 4.80) {
      contextParts.push('struggling pitcher');
    } else if (pitcherStats?.kwBB && pitcherStats.kwBB > 0.20) {
      contextParts.push('dominant pitcher');
    }
    
    return contextParts.length > 0 ? ` - ${contextParts.join(', ')}` : '';
  }
}