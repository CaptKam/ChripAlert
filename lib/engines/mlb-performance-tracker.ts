/**
 * MLB Performance Tracker
 * Tracks in-game performance metrics for batters, pitchers, teams and patterns
 * Provides context for alert generation and pattern detection
 */

// Interfaces for tracking various performance aspects

export interface BatterPerformance {
  playerId: string;
  playerName: string;
  gameId: string;
  teamId: string;
  // Current game stats
  atBats: number;
  hits: number;
  runs: number;
  rbis: number;
  walks: number;
  strikeouts: number;
  homeRuns: number;
  doubles: number;
  triples: number;
  stolenBases: number;
  caughtStealing: number;
  leftOnBase: number;
  // Recent performance
  lastFiveAtBats: Array<{
    outcome: 'hit' | 'walk' | 'strikeout' | 'out' | 'homerun' | 'double' | 'triple';
    inning: number;
    pitcher: string;
    pitchCount: number;
    rbis?: number;
  }>;
  currentStreak: {
    type: 'hitting' | 'on-base' | 'strikeout' | 'hitless' | null;
    count: number;
  };
  // Situational stats
  runnersInScoringPosition: {
    atBats: number;
    hits: number;
  };
  twoOutRBI: number;
  // Tracking
  lastUpdated: number;
}

export interface PitcherPerformance {
  playerId: string;
  playerName: string;
  gameId: string;
  teamId: string;
  // Pitch counts
  totalPitches: number;
  strikes: number;
  balls: number;
  pitchesThisInning: number;
  // Outcomes
  strikeouts: number;
  walks: number;
  hits: number;
  homeRuns: number;
  earnedRuns: number;
  battersFaced: number;
  // Recent pitch sequence (last 10 pitches)
  recentPitches: Array<{
    type: 'strike' | 'ball' | 'foul' | 'hit' | 'homerun';
    velocity?: number;
    location?: string;
    batter: string;
  }>;
  // Efficiency metrics
  firstPitchStrikes: number;
  threeBallCounts: number;
  fullCounts: number;
  pitchesPerInning: number;
  // Patterns
  consecutiveBalls: number;
  consecutiveStrikes: number;
  currentTrend: 'improving' | 'declining' | 'stable';
  // Tracking
  lastUpdated: number;
  inningsPitched: number;
  pitchVelocityTrend: number[]; // Last 5 pitch velocities
}

export interface TeamMomentum {
  teamId: string;
  teamName: string;
  gameId: string;
  // Scoring patterns
  runsByInning: number[];
  totalRuns: number;
  hits: number;
  errors: number;
  leftOnBase: number;
  // Recent momentum
  lastThreeInnings: {
    runs: number;
    hits: number;
    strikeouts: number;
  };
  currentRally: {
    active: boolean;
    runsScored: number;
    hitsInInning: number;
    startedWith: number; // Number of outs when rally started
  };
  // Streaks
  scoringStreak: {
    innings: number; // Consecutive innings with runs
    runs: number; // Total runs in streak
  };
  scorelessStreak: {
    innings: number; // Consecutive innings without runs
    lastScored: number; // Inning when last scored
  };
  // Situational
  twoOutRuns: number;
  runnersScoredFromThird: number;
  doublePlaysTurned: number;
  // Big innings
  biggestInning: {
    inning: number;
    runs: number;
  };
  // Tracking
  lastUpdated: number;
}

export interface PatternDetection {
  gameId: string;
  lastOccurred?: number; // Timestamp for cleanup tracking
  lastInning?: number; // Track last inning for reset detection
  // Unusual sequences
  consecutiveStrikeouts: {
    current: number;
    max: number;
    lastOccurred: number; // Inning
  };
  consecutiveWalks: {
    current: number;
    max: number;
    lastOccurred: number;
  };
  consecutiveHits: {
    current: number;
    max: number;
    lastOccurred: number;
  };
  // Pitcher patterns
  pitcherDominance: {
    active: boolean;
    strikeoutsLast3Innings: number;
    hitsAllowedLast3Innings: number;
  };
  pitcherStruggles: {
    active: boolean;
    walksLast2Innings: number;
    pitchesLast2Innings: number;
  };
  // Team patterns
  rallyMode: {
    active: boolean;
    startInning: number;
    runsScored: number;
    consecutiveBaserunners: number;
  };
  defensiveGem: {
    active: boolean;
    inningsWithoutError: number;
    doublePlaysinGame: number;
  };
  // Rare events
  rareEvents: Array<{
    type: 'triple_play' | 'grand_slam' | 'perfect_inning' | 'four_strikeout_inning' | 'stolen_home' | 'cycle_alert';
    inning: number;
    description: string;
    timestamp: number;
  }>;
  // Statistical anomalies
  anomalies: Array<{
    type: string;
    description: string;
    severity: 'low' | 'medium' | 'high';
    timestamp: number;
  }>;
}

// Main Performance Tracker Class
export class MLBPerformanceTracker {
  // Storage maps for different performance aspects
  private batterPerformance: Map<string, Map<string, BatterPerformance>> = new Map(); // gameId -> playerId -> performance
  private pitcherPerformance: Map<string, Map<string, PitcherPerformance>> = new Map();
  private teamMomentum: Map<string, Map<string, TeamMomentum>> = new Map(); // gameId -> teamId -> momentum
  private patterns: Map<string, PatternDetection> = new Map(); // gameId -> patterns

  // Cache management
  private lastCleanup: number = Date.now();
  private readonly CLEANUP_INTERVAL = 3600000; // 1 hour
  private readonly MAX_GAME_AGE = 14400000; // 4 hours

  constructor() {
    console.log('🎯 MLB Performance Tracker initialized');
  }

  /**
   * Update batter performance based on an at-bat outcome
   */
  updateBatterPerformance(
    gameId: string,
    playerId: string,
    playerName: string,
    teamId: string,
    outcome: {
      type: 'hit' | 'walk' | 'strikeout' | 'out' | 'homerun' | 'double' | 'triple';
      inning: number;
      pitcher: string;
      pitchCount: number;
      rbis?: number;
      runnersOn?: boolean;
      runnersInScoringPosition?: boolean;
      outs?: number;
    }
  ): void {
    // Initialize if needed
    if (!this.batterPerformance.has(gameId)) {
      this.batterPerformance.set(gameId, new Map());
    }

    const gamePerformance = this.batterPerformance.get(gameId)!;
    
    // Get or create batter record
    let batter = gamePerformance.get(playerId);
    if (!batter) {
      batter = this.initializeBatterPerformance(playerId, playerName, gameId, teamId);
      gamePerformance.set(playerId, batter);
    }

    // Update basic stats
    batter.atBats++;
    
    switch (outcome.type) {
      case 'hit':
        batter.hits++;
        break;
      case 'homerun':
        batter.hits++;
        batter.homeRuns++;
        batter.runs++;
        break;
      case 'double':
        batter.hits++;
        batter.doubles++;
        break;
      case 'triple':
        batter.hits++;
        batter.triples++;
        break;
      case 'walk':
        batter.walks++;
        batter.atBats--; // Walks don't count as at-bats
        break;
      case 'strikeout':
        batter.strikeouts++;
        break;
    }

    // Update RBIs
    if (outcome.rbis) {
      batter.rbis += outcome.rbis;
      // Track two-out RBIs based on actual out count
      if (outcome.outs === 2) {
        batter.twoOutRBI += outcome.rbis;
      }
    }

    // Update situational stats - only count runners on 2nd or 3rd as RISP
    if (outcome.runnersInScoringPosition) {
      batter.runnersInScoringPosition.atBats++;
      if (['hit', 'double', 'triple', 'homerun'].includes(outcome.type)) {
        batter.runnersInScoringPosition.hits++;
      }
    }

    // Track last 5 at-bats
    batter.lastFiveAtBats.push({
      outcome: outcome.type,
      inning: outcome.inning,
      pitcher: outcome.pitcher,
      pitchCount: outcome.pitchCount,
      rbis: outcome.rbis
    });
    
    if (batter.lastFiveAtBats.length > 5) {
      batter.lastFiveAtBats.shift();
    }

    // Update current streak
    this.updateBatterStreak(batter, outcome.type);
    
    batter.lastUpdated = Date.now();

    // Update pattern detection
    this.updatePatternDetection(gameId, 'batter', outcome.type, outcome.inning);
  }

  /**
   * Update pitcher performance
   */
  updatePitcherPerformance(
    gameId: string,
    playerId: string,
    playerName: string,
    teamId: string,
    pitchOutcome: {
      type: 'strike' | 'ball' | 'foul' | 'hit' | 'homerun';
      velocity?: number;
      batter: string;
      inning: number;
      balls?: number;
      strikes?: number;
      isFullCount?: boolean;
      isThreeBalls?: boolean;
      isFirstPitch?: boolean;
    }
  ): void {
    if (!this.pitcherPerformance.has(gameId)) {
      this.pitcherPerformance.set(gameId, new Map());
    }

    const gamePerformance = this.pitcherPerformance.get(gameId)!;
    
    let pitcher = gamePerformance.get(playerId);
    if (!pitcher) {
      pitcher = this.initializePitcherPerformance(playerId, playerName, gameId, teamId);
      gamePerformance.set(playerId, pitcher);
    }

    // Update pitch counts
    pitcher.totalPitches++;
    pitcher.pitchesThisInning++;

    // Update outcome counts
    switch (pitchOutcome.type) {
      case 'strike':
      case 'foul':
        pitcher.strikes++;
        pitcher.consecutiveStrikes++;
        pitcher.consecutiveBalls = 0;
        // Track first pitch strikes
        if (pitchOutcome.isFirstPitch) {
          pitcher.firstPitchStrikes++;
        }
        break;
      case 'ball':
        pitcher.balls++;
        pitcher.consecutiveBalls++;
        pitcher.consecutiveStrikes = 0;
        // Track full counts and three-ball counts
        if (pitchOutcome.isFullCount) {
          pitcher.fullCounts++;
        }
        if (pitchOutcome.isThreeBalls) {
          pitcher.threeBallCounts++;
        }
        break;
      case 'hit':
        pitcher.hits++;
        pitcher.consecutiveBalls = 0;
        pitcher.consecutiveStrikes = 0;
        break;
      case 'homerun':
        pitcher.hits++;
        pitcher.homeRuns++;
        pitcher.earnedRuns++; // Simplified - would need more context in reality
        pitcher.consecutiveBalls = 0;
        pitcher.consecutiveStrikes = 0;
        break;
    }

    // Track recent pitches
    pitcher.recentPitches.push({
      type: pitchOutcome.type,
      velocity: pitchOutcome.velocity,
      location: undefined, // Would need actual location data
      batter: pitchOutcome.batter
    });

    if (pitcher.recentPitches.length > 10) {
      pitcher.recentPitches.shift();
    }

    // Track velocity trend if available
    if (pitchOutcome.velocity) {
      pitcher.pitchVelocityTrend.push(pitchOutcome.velocity);
      if (pitcher.pitchVelocityTrend.length > 5) {
        pitcher.pitchVelocityTrend.shift();
      }
    }

    // Update trend analysis
    pitcher.currentTrend = this.analyzePitcherTrend(pitcher);
    
    pitcher.lastUpdated = Date.now();

    // Update pattern detection
    this.updatePatternDetection(gameId, 'pitcher', pitchOutcome.type, pitchOutcome.inning);
  }

  /**
   * Update team momentum
   */
  updateTeamMomentum(
    gameId: string,
    teamId: string,
    teamName: string,
    inning: number,
    event: {
      type: 'run' | 'hit' | 'strikeout' | 'error' | 'double_play' | 'inning_end';
      runs?: number;
      outs?: number;
    }
  ): void {
    if (!this.teamMomentum.has(gameId)) {
      this.teamMomentum.set(gameId, new Map());
    }

    const gameMomentum = this.teamMomentum.get(gameId)!;
    
    let momentum = gameMomentum.get(teamId);
    if (!momentum) {
      momentum = this.initializeTeamMomentum(teamId, teamName, gameId);
      gameMomentum.set(teamId, momentum);
    }

    // Ensure runsByInning array is long enough
    while (momentum.runsByInning.length <= inning) {
      momentum.runsByInning.push(0);
    }

    // Update based on event type
    switch (event.type) {
      case 'run':
        const runsScored = event.runs || 1;
        momentum.runsByInning[inning] += runsScored;
        momentum.totalRuns += runsScored;
        
        // Update rally info
        if (!momentum.currentRally.active) {
          momentum.currentRally = {
            active: true,
            runsScored: runsScored,
            hitsInInning: 0,
            startedWith: 0 // Would need out count from game state
          };
        } else {
          momentum.currentRally.runsScored += runsScored;
        }

        // Update scoring streak
        if (momentum.scorelessStreak.innings > 0) {
          momentum.scorelessStreak.innings = 0;
        }
        momentum.scoringStreak.innings++;
        momentum.scoringStreak.runs += runsScored;

        // Check for big inning
        if (momentum.runsByInning[inning] > momentum.biggestInning.runs) {
          momentum.biggestInning = {
            inning: inning,
            runs: momentum.runsByInning[inning]
          };
        }
        break;

      case 'hit':
        momentum.hits++;
        if (momentum.currentRally.active) {
          momentum.currentRally.hitsInInning++;
        }
        break;

      case 'strikeout':
        // Track for momentum shifts - this is tracked in the team momentum
        // Store the out count when it happens
        break;

      case 'error':
        momentum.errors++;
        break;

      case 'double_play':
        momentum.doublePlaysTurned++;
        break;

      case 'inning_end':
        // Reset rally if no runs scored
        if (momentum.currentRally.active && momentum.currentRally.runsScored === 0) {
          momentum.currentRally.active = false;
        }
        
        // Update scoreless streak
        if (momentum.runsByInning[inning] === 0) {
          momentum.scorelessStreak.innings++;
        } else {
          momentum.scorelessStreak.innings = 0;
          momentum.scorelessStreak.lastScored = inning;
        }
        break;
    }

    // Update last three innings stats
    if (momentum.runsByInning.length >= 3) {
      const lastThree = momentum.runsByInning.slice(-3);
      momentum.lastThreeInnings.runs = lastThree.reduce((sum, r) => sum + r, 0);
    }

    momentum.lastUpdated = Date.now();
  }

  /**
   * Get batter's recent performance summary
   */
  getBatterSummary(gameId: string, playerId: string): string | null {
    const gamePerformance = this.batterPerformance.get(gameId);
    if (!gamePerformance) return null;

    const batter = gamePerformance.get(playerId);
    if (!batter) return null;

    const avg = batter.atBats > 0 ? (batter.hits / batter.atBats).toFixed(3) : '.000';
    
    // Build performance string
    const parts: string[] = [];
    
    // Basic stats
    parts.push(`${batter.hits}-for-${batter.atBats}`);
    
    // Notable achievements
    if (batter.homeRuns > 0) parts.push(`${batter.homeRuns} HR`);
    if (batter.rbis > 0) parts.push(`${batter.rbis} RBI`);
    if (batter.strikeouts >= 3) parts.push(`${batter.strikeouts} K`);
    
    // Current streak
    if (batter.currentStreak.type && batter.currentStreak.count >= 2) {
      parts.push(`${batter.currentStreak.count}-game ${batter.currentStreak.type} streak`);
    }
    
    // Clutch hitting
    if (batter.runnersInScoringPosition.atBats > 0) {
      const rispAvg = (batter.runnersInScoringPosition.hits / batter.runnersInScoringPosition.atBats).toFixed(3);
      if (parseFloat(rispAvg) >= 0.400) {
        parts.push(`${rispAvg} w/RISP`);
      }
    }

    return parts.join(', ');
  }

  /**
   * Get pitcher's current status
   */
  getPitcherSummary(gameId: string, playerId: string): string | null {
    const gamePerformance = this.pitcherPerformance.get(gameId);
    if (!gamePerformance) return null;

    const pitcher = gamePerformance.get(playerId);
    if (!pitcher) return null;

    const parts: string[] = [];
    
    // Pitch count and efficiency
    parts.push(`${pitcher.totalPitches} pitches`);
    
    const strikeRate = pitcher.totalPitches > 0 
      ? ((pitcher.strikes / pitcher.totalPitches) * 100).toFixed(0)
      : '0';
    parts.push(`${strikeRate}% strikes`);
    
    // Performance indicators
    if (pitcher.strikeouts >= 5) parts.push(`${pitcher.strikeouts} K`);
    if (pitcher.walks >= 3) parts.push(`${pitcher.walks} BB`);
    
    // Current patterns
    if (pitcher.consecutiveBalls >= 4) {
      parts.push(`${pitcher.consecutiveBalls} straight balls`);
    } else if (pitcher.consecutiveStrikes >= 3) {
      parts.push(`${pitcher.consecutiveStrikes} straight strikes`);
    }
    
    // Trend
    if (pitcher.currentTrend !== 'stable') {
      parts.push(`trend: ${pitcher.currentTrend}`);
    }
    
    // Velocity drop (if significant)
    if (pitcher.pitchVelocityTrend.length >= 3) {
      const earlyVelo = pitcher.pitchVelocityTrend.slice(0, 2).reduce((a, b) => a + b, 0) / 2;
      const recentVelo = pitcher.pitchVelocityTrend.slice(-2).reduce((a, b) => a + b, 0) / 2;
      const veloDrop = earlyVelo - recentVelo;
      
      if (veloDrop >= 3) {
        parts.push(`velocity down ${veloDrop.toFixed(1)} mph`);
      }
    }

    return parts.join(', ');
  }

  /**
   * Get team momentum summary
   */
  getTeamMomentumSummary(gameId: string, teamId: string): string | null {
    const gameMomentum = this.teamMomentum.get(gameId);
    if (!gameMomentum) return null;

    const momentum = gameMomentum.get(teamId);
    if (!momentum) return null;

    const parts: string[] = [];
    
    // Recent performance
    if (momentum.lastThreeInnings.runs > 0) {
      parts.push(`${momentum.lastThreeInnings.runs} runs in last 3 innings`);
    }
    
    // Current rally
    if (momentum.currentRally.active && momentum.currentRally.runsScored > 0) {
      parts.push(`${momentum.currentRally.runsScored}-run rally`);
    }
    
    // Streaks
    if (momentum.scoringStreak.innings >= 2) {
      parts.push(`scored in ${momentum.scoringStreak.innings} straight innings`);
    } else if (momentum.scorelessStreak.innings >= 3) {
      parts.push(`${momentum.scorelessStreak.innings} scoreless innings`);
    }
    
    // Big inning
    if (momentum.biggestInning.runs >= 3) {
      parts.push(`${momentum.biggestInning.runs}-run ${this.getInningString(momentum.biggestInning.inning)}`);
    }
    
    // Clutch hitting
    if (momentum.twoOutRuns >= 3) {
      parts.push(`${momentum.twoOutRuns} two-out runs`);
    }

    return parts.length > 0 ? parts.join(', ') : null;
  }

  /**
   * Get detected patterns for a game
   */
  getPatterns(gameId: string): PatternDetection | null {
    return this.patterns.get(gameId) || null;
  }

  /**
   * Check for unusual patterns
   */
  detectUnusualPatterns(gameId: string): string[] {
    const patterns = this.patterns.get(gameId);
    if (!patterns) return [];

    const unusual: string[] = [];
    
    // Consecutive strikeouts
    if (patterns.consecutiveStrikeouts.current >= 3) {
      unusual.push(`${patterns.consecutiveStrikeouts.current} consecutive strikeouts`);
    }
    
    // Consecutive walks
    if (patterns.consecutiveWalks.current >= 3) {
      unusual.push(`${patterns.consecutiveWalks.current} consecutive walks`);
    }
    
    // Consecutive hits
    if (patterns.consecutiveHits.current >= 4) {
      unusual.push(`${patterns.consecutiveHits.current} consecutive hits`);
    }
    
    // Pitcher dominance
    if (patterns.pitcherDominance.active) {
      unusual.push(`Pitcher dominating: ${patterns.pitcherDominance.strikeoutsLast3Innings} K in last 3 innings`);
    }
    
    // Pitcher struggles
    if (patterns.pitcherStruggles.active) {
      unusual.push(`Pitcher struggling: ${patterns.pitcherStruggles.walksLast2Innings} walks in last 2 innings`);
    }
    
    // Rally mode
    if (patterns.rallyMode.active) {
      unusual.push(`Rally in progress: ${patterns.rallyMode.runsScored} runs, ${patterns.rallyMode.consecutiveBaserunners} straight baserunners`);
    }

    // Rare events
    patterns.rareEvents.forEach(event => {
      unusual.push(`RARE: ${event.description}`);
    });

    return unusual;
  }

  /**
   * Clean up old game data
   */
  cleanupOldGames(): void {
    const now = Date.now();
    
    if (now - this.lastCleanup < this.CLEANUP_INTERVAL) {
      return;
    }

    console.log('🧹 Cleaning up old MLB performance data');

    // Clean up each storage map
    this.cleanupMap(this.batterPerformance);
    this.cleanupMap(this.pitcherPerformance);
    this.cleanupMap(this.teamMomentum);
    
    // Clean up patterns (single level map)
    for (const [gameId, pattern] of this.patterns) {
      if (this.isGameDataOld(pattern.lastOccurred || 0)) {
        this.patterns.delete(gameId);
        console.log(`🗑️ Removed pattern data for game ${gameId}`);
      }
    }

    this.lastCleanup = now;
  }

  /**
   * Clear all data for a specific game
   */
  clearGameData(gameId: string): void {
    this.batterPerformance.delete(gameId);
    this.pitcherPerformance.delete(gameId);
    this.teamMomentum.delete(gameId);
    this.patterns.delete(gameId);
    
    console.log(`🧹 Cleared all performance data for game ${gameId}`);
  }

  // Private helper methods

  private initializeBatterPerformance(playerId: string, playerName: string, gameId: string, teamId: string): BatterPerformance {
    return {
      playerId,
      playerName,
      gameId,
      teamId,
      atBats: 0,
      hits: 0,
      runs: 0,
      rbis: 0,
      walks: 0,
      strikeouts: 0,
      homeRuns: 0,
      doubles: 0,
      triples: 0,
      stolenBases: 0,
      caughtStealing: 0,
      leftOnBase: 0,
      lastFiveAtBats: [],
      currentStreak: {
        type: null,
        count: 0
      },
      runnersInScoringPosition: {
        atBats: 0,
        hits: 0
      },
      twoOutRBI: 0,
      lastUpdated: Date.now()
    };
  }

  private initializePitcherPerformance(playerId: string, playerName: string, gameId: string, teamId: string): PitcherPerformance {
    return {
      playerId,
      playerName,
      gameId,
      teamId,
      totalPitches: 0,
      strikes: 0,
      balls: 0,
      pitchesThisInning: 0,
      strikeouts: 0,
      walks: 0,
      hits: 0,
      homeRuns: 0,
      earnedRuns: 0,
      battersFaced: 0,
      recentPitches: [],
      firstPitchStrikes: 0,
      threeBallCounts: 0,
      fullCounts: 0,
      pitchesPerInning: 0,
      consecutiveBalls: 0,
      consecutiveStrikes: 0,
      currentTrend: 'stable',
      lastUpdated: Date.now(),
      inningsPitched: 0,
      pitchVelocityTrend: []
    };
  }

  private initializeTeamMomentum(teamId: string, teamName: string, gameId: string): TeamMomentum {
    return {
      teamId,
      teamName,
      gameId,
      runsByInning: [],
      totalRuns: 0,
      hits: 0,
      errors: 0,
      leftOnBase: 0,
      lastThreeInnings: {
        runs: 0,
        hits: 0,
        strikeouts: 0
      },
      currentRally: {
        active: false,
        runsScored: 0,
        hitsInInning: 0,
        startedWith: 0
      },
      scoringStreak: {
        innings: 0,
        runs: 0
      },
      scorelessStreak: {
        innings: 0,
        lastScored: 0
      },
      twoOutRuns: 0,
      runnersScoredFromThird: 0,
      doublePlaysTurned: 0,
      biggestInning: {
        inning: 0,
        runs: 0
      },
      lastUpdated: Date.now()
    };
  }

  private updateBatterStreak(batter: BatterPerformance, outcome: string): void {
    if (['hit', 'double', 'triple', 'homerun'].includes(outcome)) {
      if (batter.currentStreak.type === 'hitting') {
        batter.currentStreak.count++;
      } else {
        batter.currentStreak = { type: 'hitting', count: 1 };
      }
    } else if (outcome === 'strikeout') {
      if (batter.currentStreak.type === 'strikeout') {
        batter.currentStreak.count++;
      } else {
        batter.currentStreak = { type: 'strikeout', count: 1 };
      }
    } else if (outcome === 'walk') {
      if (batter.currentStreak.type === 'on-base') {
        batter.currentStreak.count++;
      } else {
        batter.currentStreak = { type: 'on-base', count: 1 };
      }
    } else if (outcome === 'out') {
      if (batter.currentStreak.type === 'hitless') {
        batter.currentStreak.count++;
      } else {
        batter.currentStreak = { type: 'hitless', count: 1 };
      }
    }
  }

  private analyzePitcherTrend(pitcher: PitcherPerformance): 'improving' | 'declining' | 'stable' {
    // Analyze recent performance to determine trend
    if (pitcher.consecutiveBalls >= 5) return 'declining';
    if (pitcher.consecutiveStrikes >= 4) return 'improving';
    
    // Check velocity trend
    if (pitcher.pitchVelocityTrend.length >= 3) {
      const earlyVelo = pitcher.pitchVelocityTrend.slice(0, 2).reduce((a, b) => a + b, 0) / 2;
      const recentVelo = pitcher.pitchVelocityTrend.slice(-2).reduce((a, b) => a + b, 0) / 2;
      
      if (recentVelo - earlyVelo > 2) return 'improving';
      if (earlyVelo - recentVelo > 3) return 'declining';
    }
    
    // Check recent pitch efficiency
    const recentBalls = pitcher.recentPitches.filter(p => p.type === 'ball').length;
    const recentStrikes = pitcher.recentPitches.filter(p => p.type === 'strike' || p.type === 'foul').length;
    
    if (recentStrikes > recentBalls * 2) return 'improving';
    if (recentBalls > recentStrikes * 1.5) return 'declining';
    
    return 'stable';
  }

  private updatePatternDetection(gameId: string, type: 'batter' | 'pitcher', outcome: string, currentInning?: number): void {
    if (!this.patterns.has(gameId)) {
      this.patterns.set(gameId, this.initializePatternDetection(gameId));
    }
    
    const patterns = this.patterns.get(gameId)!;
    
    if (currentInning !== undefined && patterns.lastInning !== undefined && currentInning !== patterns.lastInning) {
      console.log(`🔄 Inning changed from ${patterns.lastInning} to ${currentInning} - resetting patterns for game ${gameId}`);
      this.resetInningPatterns(gameId);
    }
    
    if (currentInning !== undefined) {
      patterns.lastInning = currentInning;
    }
    
    if (type === 'batter') {
      switch (outcome) {
        case 'strikeout':
          patterns.consecutiveStrikeouts.current++;
          patterns.consecutiveWalks.current = 0;
          patterns.consecutiveHits.current = 0;
          
          if (patterns.consecutiveStrikeouts.current > patterns.consecutiveStrikeouts.max) {
            patterns.consecutiveStrikeouts.max = patterns.consecutiveStrikeouts.current;
          }
          break;
          
        case 'walk':
          patterns.consecutiveWalks.current++;
          patterns.consecutiveStrikeouts.current = 0;
          patterns.consecutiveHits.current = 0;
          
          if (patterns.consecutiveWalks.current > patterns.consecutiveWalks.max) {
            patterns.consecutiveWalks.max = patterns.consecutiveWalks.current;
          }
          break;
          
        case 'hit':
        case 'double':
        case 'triple':
        case 'homerun':
          patterns.consecutiveHits.current++;
          patterns.consecutiveStrikeouts.current = 0;
          patterns.consecutiveWalks.current = 0;
          
          if (patterns.consecutiveHits.current > patterns.consecutiveHits.max) {
            patterns.consecutiveHits.max = patterns.consecutiveHits.current;
          }
          
          // Check for rally mode
          if (patterns.consecutiveHits.current >= 3) {
            patterns.rallyMode.active = true;
            patterns.rallyMode.consecutiveBaserunners = patterns.consecutiveHits.current;
          }
          break;
          
        default:
          // Reset consecutive counters for outs
          patterns.consecutiveStrikeouts.current = 0;
          patterns.consecutiveWalks.current = 0;
          patterns.consecutiveHits.current = 0;
          patterns.rallyMode.active = false;
      }
    }
    
    // Update pitcher patterns (simplified)
    if (type === 'pitcher' && outcome === 'strikeout') {
      patterns.pitcherDominance.strikeoutsLast3Innings++;
      
      if (patterns.pitcherDominance.strikeoutsLast3Innings >= 5) {
        patterns.pitcherDominance.active = true;
      }
    }
  }

  resetInningPatterns(gameId: string): void {
    if (!this.patterns.has(gameId)) {
      return;
    }
    
    const patterns = this.patterns.get(gameId)!;
    
    console.log(`🔄 Resetting inning patterns for game ${gameId} (was: ${patterns.consecutiveHits.current} hits, ${patterns.consecutiveBaserunners} baserunners)`);
    
    patterns.consecutiveStrikeouts.current = 0;
    patterns.consecutiveWalks.current = 0;
    patterns.consecutiveHits.current = 0;
    patterns.rallyMode.active = false;
    patterns.rallyMode.runsScored = 0;
    patterns.rallyMode.consecutiveBaserunners = 0;
  }

  private initializePatternDetection(gameId: string): PatternDetection {
    return {
      gameId,
      consecutiveStrikeouts: {
        current: 0,
        max: 0,
        lastOccurred: 0
      },
      consecutiveWalks: {
        current: 0,
        max: 0,
        lastOccurred: 0
      },
      consecutiveHits: {
        current: 0,
        max: 0,
        lastOccurred: 0
      },
      pitcherDominance: {
        active: false,
        strikeoutsLast3Innings: 0,
        hitsAllowedLast3Innings: 0
      },
      pitcherStruggles: {
        active: false,
        walksLast2Innings: 0,
        pitchesLast2Innings: 0
      },
      rallyMode: {
        active: false,
        startInning: 0,
        runsScored: 0,
        consecutiveBaserunners: 0
      },
      defensiveGem: {
        active: false,
        inningsWithoutError: 0,
        doublePlaysinGame: 0
      },
      rareEvents: [],
      anomalies: []
    };
  }

  private getInningString(inning: number): string {
    const suffixes = ['th', 'st', 'nd', 'rd'];
    const remainder = inning % 10;
    const suffix = (remainder <= 3 && remainder > 0 && (inning < 11 || inning > 13)) 
      ? suffixes[remainder] 
      : suffixes[0];
    return `${inning}${suffix} inning`;
  }

  private cleanupMap<T extends { lastUpdated: number }>(map: Map<string, Map<string, T>>): void {
    for (const [gameId, innerMap] of map) {
      let hasRecentData = false;
      
      for (const [, data] of innerMap) {
        if (!this.isGameDataOld(data.lastUpdated)) {
          hasRecentData = true;
          break;
        }
      }
      
      if (!hasRecentData) {
        map.delete(gameId);
        console.log(`🗑️ Removed performance data for game ${gameId}`);
      }
    }
  }

  private isGameDataOld(timestamp: number): boolean {
    return Date.now() - timestamp > this.MAX_GAME_AGE;
  }

  /**
   * Generate enhanced context for batter performance
   */
  generateBatterContext(gameId: string, batterName: string): string | null {
    const gameData = this.batterPerformance.get(gameId);
    if (!gameData) return null;

    // Find batter by name since we may not have exact player ID
    let batter: BatterPerformance | null = null;
    for (const [playerId, performance] of gameData) {
      if (performance.playerName === batterName) {
        batter = performance;
        break;
      }
    }
    
    if (!batter) return null;

    const contexts: string[] = [];
    
    // Current game performance
    if (batter.atBats > 0) {
      const avg = (batter.hits / batter.atBats * 1000).toFixed(0);
      contexts.push(`${batter.hits}-for-${batter.atBats} (.${avg})`);
    }
    
    // RBIs if any
    if (batter.rbis > 0) {
      contexts.push(`${batter.rbis} RBI${batter.rbis > 1 ? 's' : ''}`);
    }
    
    // Current streak
    if (batter.currentStreak.type && batter.currentStreak.count > 1) {
      const streakText = batter.currentStreak.type === 'hitting' ? 'hit streak' :
                        batter.currentStreak.type === 'on-base' ? 'on-base streak' :
                        batter.currentStreak.type === 'strikeout' ? 'strikeout streak' : 'hitless streak';
      contexts.push(`${batter.currentStreak.count}-game ${streakText}`);
    }
    
    // RISP performance
    if (batter.runnersInScoringPosition.atBats > 0) {
      const rispAvg = (batter.runnersInScoringPosition.hits / batter.runnersInScoringPosition.atBats * 1000).toFixed(0);
      contexts.push(`RISP: ${batter.runnersInScoringPosition.hits}/${batter.runnersInScoringPosition.atBats} (.${rispAvg})`);
    }
    
    // Two-out RBIs
    if (batter.twoOutRBI > 0) {
      contexts.push(`${batter.twoOutRBI} clutch 2-out RBI${batter.twoOutRBI > 1 ? 's' : ''}`);
    }
    
    // Recent at-bats pattern
    if (batter.lastFiveAtBats.length >= 3) {
      const lastThree = batter.lastFiveAtBats.slice(-3);
      const hitTypes = lastThree.filter(ab => ['hit', 'double', 'triple', 'homerun'].includes(ab.outcome));
      if (hitTypes.length === 3) {
        contexts.push('3 straight hits');
      } else if (lastThree.every(ab => ab.outcome === 'strikeout')) {
        contexts.push('3 straight strikeouts');
      }
    }
    
    return contexts.length > 0 ? contexts.join(', ') : null;
  }

  /**
   * Generate enhanced context for pitcher performance  
   */
  generatePitcherContext(gameId: string, pitcherName: string): string | null {
    const gameData = this.pitcherPerformance.get(gameId);
    if (!gameData) return null;

    // Find pitcher by name
    let pitcher: PitcherPerformance | null = null;
    for (const [playerId, performance] of gameData) {
      if (performance.playerName === pitcherName) {
        pitcher = performance;
        break;
      }
    }
    
    if (!pitcher) return null;

    const contexts: string[] = [];
    
    // Pitch count and fatigue indicators
    if (pitcher.totalPitches > 0) {
      contexts.push(`${pitcher.totalPitches} pitches`);
      
      if (pitcher.totalPitches > 100) {
        contexts.push('fatigue concern');
      } else if (pitcher.totalPitches > 85) {
        contexts.push('high pitch count');
      }
    }
    
    // Velocity trend
    if (pitcher.pitchVelocityTrend.length >= 3) {
      const recent = pitcher.pitchVelocityTrend.slice(-3);
      const early = pitcher.pitchVelocityTrend.slice(0, 3);
      if (recent.length > 0 && early.length > 0) {
        const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
        const earlyAvg = early.reduce((a, b) => a + b, 0) / early.length;
        const diff = earlyAvg - recentAvg;
        if (diff >= 3) {
          contexts.push(`velocity down ${diff.toFixed(1)}mph`);
        }
      }
    }
    
    // Strikeout dominance
    if (pitcher.strikeouts >= 5) {
      contexts.push(`${pitcher.strikeouts} strikeouts`);
    }
    
    // Control issues
    if (pitcher.walks >= 3) {
      contexts.push(`${pitcher.walks} walks`);
    }
    
    // Efficiency
    if (pitcher.battersFaced > 0) {
      const strikePercentage = (pitcher.strikes / pitcher.totalPitches * 100).toFixed(0);
      if (parseInt(strikePercentage) >= 70) {
        contexts.push(`${strikePercentage}% strikes`);
      } else if (parseInt(strikePercentage) < 60) {
        contexts.push(`${strikePercentage}% strikes (struggling)`);
      }
    }
    
    // Current trend
    if (pitcher.currentTrend === 'declining') {
      contexts.push('losing effectiveness');
    } else if (pitcher.currentTrend === 'improving') {
      contexts.push('gaining momentum');
    }
    
    // Recent pitch sequence patterns
    if (pitcher.consecutiveBalls >= 4) {
      contexts.push(`${pitcher.consecutiveBalls} straight balls`);
    } else if (pitcher.consecutiveStrikes >= 5) {
      contexts.push(`${pitcher.consecutiveStrikes} straight strikes`);
    }
    
    return contexts.length > 0 ? contexts.join(', ') : null;
  }

  /**
   * Generate enhanced context for team momentum
   */
  generateTeamMomentumContext(gameId: string, teamName: string): string | null {
    const gameData = this.teamMomentum.get(gameId);
    if (!gameData) return null;

    // Find team by name (assuming team ID matches name or similar)
    let team: TeamMomentum | null = null;
    for (const [teamId, momentum] of gameData) {
      if (momentum.teamName === teamName || teamId === teamName) {
        team = momentum;
        break;
      }
    }
    
    if (!team) return null;

    const contexts: string[] = [];
    
    // Scoring streak
    if (team.scoringStreak.innings >= 2) {
      contexts.push(`scored in ${team.scoringStreak.innings} straight innings`);
    }
    
    // Scoreless streak  
    if (team.scorelessStreak.innings >= 3) {
      contexts.push(`${team.scorelessStreak.innings} innings without scoring`);
    }
    
    // Current rally
    if (team.currentRally.active && team.currentRally.runsScored > 0) {
      contexts.push(`rally: ${team.currentRally.runsScored} runs this inning`);
    }
    
    // Recent momentum (last 3 innings)
    if (team.lastThreeInnings.runs > 0) {
      contexts.push(`${team.lastThreeInnings.runs} runs in last 3 innings`);
    }
    
    // Two-out production
    if (team.twoOutRuns >= 2) {
      contexts.push(`${team.twoOutRuns} clutch 2-out runs`);
    }
    
    // Big inning potential
    if (team.biggestInning.runs >= 4) {
      contexts.push(`${team.biggestInning.runs}-run ${this.getInningString(team.biggestInning.inning)}`);
    }
    
    return contexts.length > 0 ? contexts.join(', ') : null;
  }

  /**
   * Generate situational game context combining multiple performance aspects
   */
  generateGameSituationContext(gameId: string, currentBatter?: string, currentPitcher?: string): string | null {
    const patterns = this.patterns.get(gameId);
    const contexts: string[] = [];
    
    // Pattern-based context
    if (patterns) {
      // Consecutive strikeouts
      if (patterns.consecutiveStrikeouts.current >= 3) {
        contexts.push(`${patterns.consecutiveStrikeouts.current} straight Ks`);
      }
      
      // Consecutive hits
      if (patterns.consecutiveHits.current >= 3) {
        contexts.push(`${patterns.consecutiveHits.current} straight hits`);
      }
      
      // Pitcher dominance
      if (patterns.pitcherDominance.active) {
        contexts.push(`pitcher dominating: ${patterns.pitcherDominance.strikeoutsLast3Innings}K in 3 innings`);
      }
      
      // Pitcher struggles
      if (patterns.pitcherStruggles.active) {
        contexts.push(`pitcher struggling: ${patterns.pitcherStruggles.walksLast2Innings} walks, ${patterns.pitcherStruggles.pitchesLast2Innings} pitches`);
      }
      
      // Rally mode
      if (patterns.rallyMode.active) {
        contexts.push(`rally mode: ${patterns.rallyMode.runsScored} runs, ${patterns.rallyMode.consecutiveBaserunners} straight baserunners`);
      }
    }
    
    // Add specific player context if provided
    if (currentBatter) {
      const batterContext = this.generateBatterContext(gameId, currentBatter);
      if (batterContext) {
        contexts.push(`Batter: ${batterContext}`);
      }
    }
    
    if (currentPitcher) {
      const pitcherContext = this.generatePitcherContext(gameId, currentPitcher);
      if (pitcherContext) {
        contexts.push(`Pitcher: ${pitcherContext}`);
      }
    }
    
    return contexts.length > 0 ? contexts.join(' | ') : null;
  }

  /**
   * Get comprehensive game performance summary
   */
  getGamePerformanceSummary(gameId: string): {
    batters: Map<string, BatterPerformance>;
    pitchers: Map<string, PitcherPerformance>;
    teams: Map<string, TeamMomentum>;
    patterns: PatternDetection | null;
    unusualPatterns: string[];
  } | null {
    const batters = this.batterPerformance.get(gameId);
    const pitchers = this.pitcherPerformance.get(gameId);
    const teams = this.teamMomentum.get(gameId);
    const patterns = this.patterns.get(gameId);
    
    if (!batters && !pitchers && !teams && !patterns) {
      return null;
    }

    return {
      batters: batters || new Map(),
      pitchers: pitchers || new Map(),
      teams: teams || new Map(),
      patterns: patterns || null,
      unusualPatterns: this.detectUnusualPatterns(gameId)
    };
  }
}

// Export singleton instance
export const mlbPerformanceTracker = new MLBPerformanceTracker();