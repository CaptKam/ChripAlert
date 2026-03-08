import { BaseSportEngine, GameState, AlertResult } from './base-engine';
import { mlbPerformanceTracker } from './mlb-performance-tracker';

const DEBUG = process.env.NODE_ENV !== 'production';

export class MLBEngine extends BaseSportEngine {
  constructor() {
    super('MLB');
    this.metrics.basesLoadedSituations = 0;
    this.metrics.seventhInningDetections = 0;
    this.metrics.runnerScoringOpportunities = 0;
  }

  protected getModuleMap(): Record<string, string> {
    return {
      'MLB_GAME_START': './alert-cylinders/mlb/game-start-module.ts',
      'MLB_SEVENTH_INNING_STRETCH': './alert-cylinders/mlb/seventh-inning-stretch-module.ts',
      'MLB_BASES_LOADED_ONE_OUT': './alert-cylinders/mlb/bases-loaded-one-out-module.ts',
      'MLB_RUNNER_ON_THIRD_NO_OUTS': './alert-cylinders/mlb/runner-on-third-no-outs-module.ts',
      'MLB_FIRST_AND_THIRD_NO_OUTS': './alert-cylinders/mlb/first-and-third-no-outs-module.ts',
      'MLB_SECOND_AND_THIRD_NO_OUTS': './alert-cylinders/mlb/second-and-third-no-outs-module.ts',
      'MLB_BASES_LOADED_NO_OUTS': './alert-cylinders/mlb/bases-loaded-no-outs-module.ts',
      'MLB_RUNNER_ON_THIRD_ONE_OUT': './alert-cylinders/mlb/runner-on-third-one-out-module.ts',
      'MLB_FIRST_AND_THIRD_ONE_OUT': './alert-cylinders/mlb/first-and-third-one-out-module.ts',
      'MLB_SECOND_AND_THIRD_ONE_OUT': './alert-cylinders/mlb/second-and-third-one-out-module.ts',
      'MLB_RUNNER_ON_THIRD_TWO_OUTS': './alert-cylinders/mlb/runner-on-third-two-outs-module.ts',
      'MLB_FIRST_AND_THIRD_TWO_OUTS': './alert-cylinders/mlb/first-and-third-two-outs-module.ts',
      'MLB_RUNNER_ON_SECOND_NO_OUTS': './alert-cylinders/mlb/runner-on-second-no-outs-module.ts',
      'MLB_BATTER_DUE': './alert-cylinders/mlb/batter-due-module.ts',
      'MLB_STEAL_LIKELIHOOD': './alert-cylinders/mlb/steal-likelihood-module.ts',
      'MLB_ON_DECK_PREDICTION': './alert-cylinders/mlb/on-deck-prediction-module.ts',
      'MLB_WIND_CHANGE': './alert-cylinders/mlb/wind-change-module.ts',
      'MLB_FIRST_AND_SECOND': './alert-cylinders/mlb/first-and-second-module.ts',
      'MLB_LATE_INNING_CLOSE': './alert-cylinders/mlb/late-inning-close-module.ts',
      'MLB_SCORING_OPPORTUNITY': './alert-cylinders/mlb/scoring-opportunity-module.ts',
      'MLB_PITCHING_CHANGE': './alert-cylinders/mlb/pitching-change-module.ts',
      'MLB_BASES_LOADED_TWO_OUTS': './alert-cylinders/mlb/bases-loaded-two-outs-module.ts',
      'MLB_HIGH_SCORING_SITUATION': './alert-cylinders/mlb/high-scoring-situation-module.ts',
      'MLB_STRIKEOUT': './alert-cylinders/mlb/strikeout-module.ts',
      'MLB_MOMENTUM_SHIFT': './alert-cylinders/mlb/momentum-shift-module.ts',
      'MLB_CLUTCH_SITUATION': './alert-cylinders/mlb/clutch-situation-module.ts',
      'MLB_RISP_PROB_ENHANCED': './alert-cylinders/mlb/risp-prob-enhanced-module.ts',
    };
  }

  async calculateProbability(gameState: GameState): Promise<number> {
    const t0 = Date.now();
    try {
      if (!gameState.isLive) return 0;

      const { inning, outs, homeScore, awayScore } = gameState;
      let p = 40;

      if ((inning as number) >= 7) p += 20;
      else if ((inning as number) >= 4) p += 10;
      else p += 5;

      if (outs === 0) p += 20;
      else if (outs === 1) p += 10;
      else p += 5;

      const scoreDiff = Math.abs(homeScore - awayScore);
      if (scoreDiff <= 1) p += 25;
      else if (scoreDiff <= 3) p += 15;
      else if (scoreDiff <= 6) p += 5;
      else p -= 10;

      if (gameState.hasThird) p += 15;
      if (gameState.hasSecond) p += 10;
      if (gameState.hasFirst) p += 5;

      return Math.min(Math.max(p, 15), 90);
    } finally {
      this.pushMetric('probabilityCalculationTime', Date.now() - t0);
      this.incrementMetric('totalRequests');
    }
  }

  async generateLiveAlerts(gameState: GameState): Promise<AlertResult[]> {
    const t0 = Date.now();
    try {
      if (!gameState.gameId) return [];

      const enhanced = await this.enhanceGameStateWithLiveData(gameState);
      this.updatePerformanceTracking(enhanced);

      const performanceSummary = mlbPerformanceTracker.getGamePerformanceSummary(enhanced.gameId);
      const unusualPatterns = performanceSummary ? performanceSummary.unusualPatterns : [];

      // Run multiplier-stack edge engine for probability scoring
      try {
        const { convertGameStateToMLBState, enhanceAlertWithProbability } = await import('./alert-cylinders/mlb/mlb-prob-integration');
        const { scoreMlbAlert } = await import('./mlb-prob-model');
        const mlbState = convertGameStateToMLBState(enhanced);
        const edgeScore = scoreMlbAlert(mlbState);
        if (edgeScore) {
          (enhanced as any).edgeScore = edgeScore;
          (enhanced as any).chirpLevel = edgeScore.chirpLevel;
          (enhanced as any).edgeFactors = edgeScore.edge;
        }
      } catch { /* edge engine unavailable */ }

      const rawAlerts = await super.generateLiveAlerts(enhanced);

      // Enrich alerts with performance + edge context
      if (rawAlerts.length > 0 && performanceSummary) {
        for (const alert of rawAlerts) {
          if (enhanced.currentBatter && performanceSummary.batters.size > 0) {
            const batterSummary = mlbPerformanceTracker.getBatterSummary(enhanced.gameId, enhanced.currentBatterId || 'unknown');
            if (batterSummary) alert.context.batterPerformance = batterSummary;
          }
          if (enhanced.currentPitcher && performanceSummary.pitchers.size > 0) {
            const pitcherSummary = mlbPerformanceTracker.getPitcherSummary(enhanced.gameId, enhanced.currentPitcherId || 'unknown');
            if (pitcherSummary) alert.context.pitcherPerformance = pitcherSummary;
          }
          const teamId = enhanced.isTopInning ? 'away' : 'home';
          const momentumSummary = mlbPerformanceTracker.getTeamMomentumSummary(enhanced.gameId, teamId);
          if (momentumSummary) alert.context.teamMomentum = momentumSummary;
          if (unusualPatterns.length > 0) alert.context.unusualPatterns = unusualPatterns;
          if ((enhanced as any).edgeScore) {
            alert.context.edgeScore = (enhanced as any).edgeScore;
            alert.context.chirpLevel = (enhanced as any).chirpLevel;
          }
        }
      }

      // Track MLB metrics
      if (enhanced.hasFirst && enhanced.hasSecond && enhanced.hasThird) this.incrementMetric('basesLoadedSituations');
      if (enhanced.inning === 7) this.incrementMetric('seventhInningDetections');
      if (enhanced.hasThird && (enhanced.outs as number) <= 1) this.incrementMetric('runnerScoringOpportunities');
      this.incrementMetric('totalAlerts', rawAlerts.length);

      return rawAlerts;
    } finally {
      this.pushMetric('alertGenerationTime', Date.now() - t0);
    }
  }

  private async enhanceGameStateWithLiveData(gameState: GameState): Promise<GameState> {
    const t0 = Date.now();
    try {
      if (!gameState.gameId || gameState.status === 'final') return gameState;

      const { MLBApiService } = await import('../mlb-api');
      const mlbApi = new MLBApiService();
      const enhancedData = await mlbApi.getEnhancedGameData(gameState.gameId);

      if (!enhancedData || enhancedData.error) {
        this.incrementMetric('cacheMisses');
        return gameState;
      }

      this.incrementMetric('cacheHits');

      let weatherContext = gameState.weatherContext;
      try {
        const { WeatherService } = await import('../weather-service');
        const ws = new WeatherService();
        const weatherData = await ws.getWeatherForTeam(gameState.homeTeam);
        if (weatherData) {
          weatherContext = {
            windSpeed: weatherData.windSpeed, windDirection: weatherData.windDirection,
            temperature: weatherData.temperature, humidity: weatherData.humidity
          };
        }
      } catch { /* weather unavailable */ }

      return {
        ...gameState,
        hasFirst: enhancedData.runners?.first || false,
        hasSecond: enhancedData.runners?.second || false,
        hasThird: enhancedData.runners?.third || false,
        balls: enhancedData.balls || 0,
        strikes: enhancedData.strikes || 0,
        outs: enhancedData.outs || 0,
        inning: enhancedData.inning || gameState.inning || 1,
        isTopInning: enhancedData.isTopInning,
        homeScore: enhancedData.homeScore || gameState.homeScore,
        awayScore: enhancedData.awayScore || gameState.awayScore,
        currentBatter: enhancedData.currentBatter || gameState.currentBatter,
        currentBatterId: enhancedData.currentBatterId || gameState.currentBatterId,
        currentPitcher: enhancedData.currentPitcher || gameState.currentPitcher,
        currentPitcherId: enhancedData.currentPitcherId || gameState.currentPitcherId,
        onDeckBatter: enhancedData.onDeckBatter || gameState.onDeckBatter,
        lastPlay: enhancedData.lastPlay || gameState.lastPlay,
        lastPitch: enhancedData.lastPitch || gameState.lastPitch,
        pitchCount: enhancedData.pitchCount || gameState.pitchCount || 0,
        weatherContext,
        isLive: gameState.status === 'final' ? false : gameState.isLive,
      };
    } catch (error) {
      console.error('[MLB] enhance failed:', error);
      this.incrementMetric('cacheMisses');
      return gameState;
    } finally {
      this.pushMetric('gameStateEnhancementTime', Date.now() - t0);
    }
  }

  // ---- MLB-specific performance tracking (unique to baseball) -------------

  private updatePerformanceTracking(gameState: GameState): void {
    try {
      const gameId = gameState.gameId;
      const inning = (gameState.inning as number) || 1;
      const outs = (gameState.outs as number) || 0;

      if (gameState.currentBatter && gameState.lastPlay?.description) {
        const outcome = this.parsePlayOutcome(gameState.lastPlay.description);
        if (outcome) {
          const runnersInScoringPosition = gameState.hasSecond || gameState.hasThird;
          mlbPerformanceTracker.updateBatterPerformance(
            gameId,
            gameState.currentBatterId || `batter_${String(gameState.currentBatter).replace(/\s+/g, '_')}`,
            gameState.currentBatter,
            gameState.isTopInning ? gameState.awayTeam : gameState.homeTeam,
            { type: outcome.type, inning, pitcher: gameState.currentPitcher || 'Unknown', pitchCount: (gameState.pitchCount as number) || 0, rbis: outcome.rbis, runnersOn: gameState.hasFirst || gameState.hasSecond || gameState.hasThird, runnersInScoringPosition, outs }
          );
        }
      }

      if (gameState.currentPitcher && gameState.lastPitch?.call) {
        const pitchOutcome = this.parsePitchOutcome(gameState.lastPitch.call);
        if (pitchOutcome) {
          mlbPerformanceTracker.updatePitcherPerformance(
            gameId,
            gameState.currentPitcherId || `pitcher_${String(gameState.currentPitcher).replace(/\s+/g, '_')}`,
            gameState.currentPitcher,
            gameState.isTopInning ? gameState.homeTeam : gameState.awayTeam,
            { type: pitchOutcome.type, velocity: pitchOutcome.velocity, batter: gameState.currentBatter || 'Unknown', inning, balls: (gameState.balls as number) || 0, strikes: (gameState.strikes as number) || 0, isFullCount: (gameState.balls === 3 && gameState.strikes === 2), isThreeBalls: (gameState.balls === 3) }
          );
        }
      }

      const scoringTeam = gameState.isTopInning ? gameState.awayTeam : gameState.homeTeam;
      const teamId = gameState.isTopInning ? 'away' : 'home';

      if (gameState.lastPlay?.description) {
        const play = String(gameState.lastPlay.description).toLowerCase();
        let eventType: string | null = null;
        let runs: number | undefined;

        if (play.includes('scores') || play.includes('run')) { eventType = 'run'; runs = this.extractRBIs(play) || 1; }
        else if (play.includes('single') || play.includes('double') || play.includes('triple') || play.includes('hit')) eventType = 'hit';
        else if (play.includes('strikes out') || play.includes('struck out')) eventType = 'strikeout';
        else if (play.includes('error')) eventType = 'error';
        else if (play.includes('double play')) eventType = 'double_play';

        if (eventType) {
          mlbPerformanceTracker.updateTeamMomentum(gameId, teamId, scoringTeam, inning, { type: eventType, runs, outs });
        }
      }

      if (outs === 3 || gameState.inningJustEnded) {
        mlbPerformanceTracker.updateTeamMomentum(gameId, teamId, scoringTeam, inning, { type: 'inning_end', outs: 3 });
        mlbPerformanceTracker.resetInningPatterns(gameId);
      }

      mlbPerformanceTracker.cleanupOldGames();
    } catch (error) {
      console.error('[MLB] Performance tracking error:', error);
    }
  }

  private parsePlayOutcome(playDescription: string): { type: 'hit' | 'walk' | 'strikeout' | 'out' | 'homerun' | 'double' | 'triple'; rbis?: number } | null {
    if (!playDescription) return null;
    const play = playDescription.toLowerCase();
    if (play.includes('home run') || play.includes('homer')) return { type: 'homerun', rbis: this.extractRBIs(play) };
    if (play.includes('triple')) return { type: 'triple', rbis: this.extractRBIs(play) };
    if (play.includes('double')) return { type: 'double', rbis: this.extractRBIs(play) };
    if (play.includes('single') || play.includes('hit')) return { type: 'hit', rbis: this.extractRBIs(play) };
    if (play.includes('walk') || play.includes('bb')) return { type: 'walk' };
    if (play.includes('strikes out') || play.includes('struck out')) return { type: 'strikeout' };
    if (play.includes('grounds out') || play.includes('flies out') || play.includes('lines out')) return { type: 'out' };
    return null;
  }

  private parsePitchOutcome(pitchDescription: string): { type: 'strike' | 'ball' | 'foul' | 'hit' | 'homerun'; velocity?: number } | null {
    if (!pitchDescription) return null;
    const pitch = pitchDescription.toLowerCase();
    const velocityMatch = pitch.match(/(\d+)\s*mph/);
    const velocity = velocityMatch ? parseInt(velocityMatch[1]) : undefined;
    if (pitch.includes('strike')) return { type: 'strike', velocity };
    if (pitch.includes('ball')) return { type: 'ball', velocity };
    if (pitch.includes('foul')) return { type: 'foul', velocity };
    if (pitch.includes('home run') || pitch.includes('homer')) return { type: 'homerun', velocity };
    if (pitch.includes('hit') || pitch.includes('single') || pitch.includes('double') || pitch.includes('triple')) return { type: 'hit', velocity };
    return null;
  }

  private extractRBIs(playDescription: string): number {
    const rbiMatch = playDescription.match(/(\d+)\s*rbi/i);
    if (rbiMatch) return parseInt(rbiMatch[1]);
    if (playDescription.includes('grand slam')) return 4;
    if (playDescription.includes('scores') || playDescription.includes('driven in')) {
      const scoreMatches = playDescription.match(/scores/gi);
      return scoreMatches ? scoreMatches.length : 1;
    }
    return 0;
  }

  protected getSportSpecificMetrics() {
    return {
      basesLoadedSituations: this.metrics.basesLoadedSituations,
      seventhInningDetections: this.metrics.seventhInningDetections,
      runnerScoringOpportunities: this.metrics.runnerScoringOpportunities,
    };
  }
}
