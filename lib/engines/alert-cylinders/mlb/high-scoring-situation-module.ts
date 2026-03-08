import { BaseAlertModule, GameState, AlertResult } from '../../base-engine';
import { mlbPerformanceTracker } from '../../mlb-performance-tracker';

export default class RunnersOnHighScoringModule extends BaseAlertModule {
  alertType = 'MLB_HIGH_SCORING_SITUATION';
  sport = 'MLB';

  // Run expectancy matrix (2025 data)
  private readonly runExpectancy: Record<string, Record<number, number>> = {
    '---': { 0: 0.48, 1: 0.25, 2: 0.10 },
    '1--': { 0: 0.87, 1: 0.48, 2: 0.21 },
    '-2-': { 0: 1.12, 1: 0.67, 2: 0.31 },
    '--3': { 0: 1.38, 1: 0.86, 2: 0.32 },
    '12-': { 0: 1.55, 1: 0.96, 2: 0.42 },
    '1-3': { 0: 1.78, 1: 1.31, 2: 0.48 },
    '-23': { 0: 2.04, 1: 1.41, 2: 0.67 },
    '123': { 0: 2.69, 1: 1.61, 2: 0.96 },
  };

  private readonly runExpectancyThreshold = 0.65;
  private readonly strongWind = 8; // mph
  private readonly alertCooldown = 5 * 60 * 1000;
  private lastAlertTime: { [gameId: string]: number } = {};

  isTriggered(gameState: GameState): boolean {
    if (!gameState.isLive) return false;

    const baseKey = this.getBaseKey(gameState);
    const outs = gameState.outs;
    const expRuns = this.runExpectancy[baseKey]?.[outs] ?? 0;

    if (expRuns < this.runExpectancyThreshold) return false;

    // Cooldown check
    const now = Date.now();
    const last = this.lastAlertTime[gameState.gameId] || 0;
    if (now - last < this.alertCooldown) return false;

    this.lastAlertTime[gameState.gameId] = now;
    return true;
  }

  generateAlert(gameState: GameState): AlertResult | null {
    const baseKey = this.getBaseKey(gameState);
    const outs = gameState.outs;
    const expectedRuns = this.runExpectancy[baseKey]?.[outs] ?? 0;

    // Determine wind impact
    const windSpeed = gameState.weatherContext?.windSpeed || 0;
    const windDir = gameState.weatherContext?.windDirection?.toLowerCase() || '';
    let windMsg = '';
    let windImpact: 'favorable' | 'neutral' | 'unfavorable' = 'neutral';

    if (windSpeed >= this.strongWind) {
      if (windDir.includes('in') && windDir.includes('center')) {
        windMsg = `${windSpeed} mph wind blowing in from center`;
        windImpact = 'unfavorable';
      } else if (windDir.includes('out') && windDir.includes('left')) {
        windMsg = `${windSpeed} mph wind blowing out to left`;
        windImpact = 'favorable';
      } else {
        windMsg = `${windSpeed} mph wind (${windDir})`;
      }
    }

    // On‑deck hitter context
    const onDeck = gameState.onDeckBatter ? ` | ${gameState.onDeckBatter} on deck` : '';

    // Performance summaries
    const batterId = gameState.currentBatterId ||
      `batter_${(gameState.currentBatter || 'Unknown').replace(/\s+/g, '_')}`;
    const batterPerf = mlbPerformanceTracker.getBatterSummary(gameState.gameId, batterId);
    const pitcherId = gameState.currentPitcherId ||
      `pitcher_${(gameState.currentPitcher || 'Unknown').replace(/\s+/g, '_')}`;
    const pitcherPerf = mlbPerformanceTracker.getPitcherSummary(gameState.gameId, pitcherId);

    // Compose message
    let message = `${this.describeBaseKey(baseKey)}, ${outs} out${outs !== 1 ? 's' : ''} – `;
    message += `expected runs ≈${expectedRuns.toFixed(2)}`;
    if (windMsg) message += ` | ${windMsg}`;
    if (onDeck) message += onDeck;

    // Priority: raise for favorable wind or slugger on deck
    let priority = 85 + (windImpact === 'favorable' ? 5 : 0) + (gameState.onDeckBatter ? 5 : 0);

    const alertResult = {
      alertKey: `${gameState.gameId}_high_scoring_${baseKey}_${outs}_${gameState.inning}_${gameState.isTopInning ? 'top' : 'bot'}`,
      type: this.alertType,
      message: `${gameState.awayTeam} @ ${gameState.homeTeam} | High scoring situation`,
      context: {
        gameId: gameState.gameId,
        homeTeam: gameState.homeTeam,
        awayTeam: gameState.awayTeam,
        inning: gameState.inning,
        isTopInning: gameState.isTopInning,
        baseState: baseKey,
        outs,
        expectedRuns,
        scoringProbability: 70, // assume ≈70% when run expectancy ≥0.65
        windSpeed,
        windDirection: gameState.weatherContext?.windDirection,
        windImpact,
        onDeckBatter: gameState.onDeckBatter || null,
        batterPerformance: batterPerf,
        pitcherPerformance: pitcherPerf,
      },
      priority,
    };

    return alertResult;
  }

  calculateProbability(): number {
    // Baseline probability (can refine using expectedRuns)
    return 70;
  }

  private getBaseKey(gameState: GameState): string {
    const { hasFirst, hasSecond, hasThird } = gameState;
    const first = hasFirst ? '1' : '-';
    const second = hasSecond ? '2' : '-';
    const third = hasThird ? '3' : '-';
    return `${first}${second}${third}`;
  }

  private describeBaseKey(key: string): string {
    // Turn '1-3' into a human‑readable description
    switch (key) {
      case '1--': return 'Runner on first';
      case '-2-': return 'Runner on second';
      case '--3': return 'Runner on third';
      case '12-': return 'Runners on first and second';
      case '1-3': return 'Runners on first and third';
      case '-23': return 'Runners on second and third';
      case '123': return 'Bases loaded';
      default: return 'Runners on';
    }
  }
}