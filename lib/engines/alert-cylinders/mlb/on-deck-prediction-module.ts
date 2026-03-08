/**
 * MLB — On Deck Prediction Module (V3.1)
 * Improvements:
 * - Safer null handling + normalization for runners/outs/inning context
 * - Probability pipeline: base situation → player multiplier → environment bonus → clamp
 * - Uses BaseAlertModule helpers: clampProb(), getTeamName(), composeMessage(), tryDedupe()
 * - Dedupe guard (15s default) to avoid rapid-fire repeats in same game state
 * - Stable alertKey with inning/half/outs/runners/batter fingerprint
 * - Wind bonus is resilient to various shapes (string or object direction)
 * - Late-inning + close-game boosts tuned and capped to 95
 */

import { BaseAlertModule, GameState, AlertResult } from '../../base-engine';

type RunnersState = { first: boolean; second: boolean; third: boolean };

export default class OnDeckPredictionModule extends BaseAlertModule {
  alertType = 'MLB_ON_DECK_PREDICTION';
  sport = 'MLB';

  // Optional gates (engines may also apply pre-AI thresholds)
  minConfidence = 65;         // trigger threshold
  dedupeWindowMs = 15_000;    // module-level cooldown for identical situations

  // Situation priors (coarse run-scoring likelihood)
  private readonly SITUATION_PROBABILITIES: Record<string, number> = {
    bases_loaded: 90,
    runners_2nd_3rd: 85,
    runner_3rd: 75,
    runners_1st_3rd: 70,
    runner_2nd: 65,
    runners_1st_2nd: 60,
    runner_1st: 45,
    bases_empty: 30,
  };

  // Lightweight power indicator (can be replaced by real stats)
  private readonly POWER_HITTERS = new Set([
    'ohtani','judge','acuña','acuna','betts','freeman','alvarez','guerrero',
    'trout','harper','soto','goldschmidt','arenado','machado','devers'
  ]);

  // ---------- Core triggers ----------

  isTriggered(gameState: GameState): boolean {
    if (!gameState?.isLive) return false;

    // Require an identifiable on-deck batter & an inning in progress
    const onDeck = String(gameState.onDeckBatter ?? '').trim();
    if (!onDeck) return false;

    const inning = Number(gameState.inning ?? 0);
    if (!Number.isFinite(inning) || inning < 3) return false; // reduce early-game noise

    const baseProb = this.calculateBaseSituationProbability(gameState);
    const playerMult = this.getPlayerMultiplier(onDeck);
    const envBonus = this.getWindBonus(gameState) + this.getLeverageBonus(gameState);

    const total = this.clampProb(baseProb * playerMult + envBonus);
    return total >= this.minConfidence!;
  }

  generateAlert(gameState: GameState): AlertResult | null {
    const onDeck = String(gameState.onDeckBatter ?? 'Unknown').trim();
    const runners = this.normalizeRunners(gameState);
    const outs = Number(gameState.outs ?? 0);
    const inning = Number(gameState.inning ?? 0);
    const half = (gameState.isTopInning === false) ? 'BOT' : 'TOP';

    // Probability breakdown
    const baseProb = this.calculateBaseSituationProbability(gameState);
    const playerMult = this.getPlayerMultiplier(onDeck);
    const envBonus = this.getWindBonus(gameState) + this.getLeverageBonus(gameState);
    const totalProbability = this.clampProb(baseProb * playerMult + envBonus);

    // Dedupe key: game/inning/half/outs/runners/batter
    const sitKey = this.getSituationKey(runners, outs);
    const dedupeKey = `${gameState.gameId}:${this.alertType}:${inning}:${half}:${sitKey}:${onDeck.toLowerCase()}`;
    if (!this.tryDedupe(dedupeKey, this.dedupeWindowMs)) return null;

    const homeTeam = this.getTeamName(gameState.homeTeam);
    const awayTeam = this.getTeamName(gameState.awayTeam);

    // Message
    const msg = this.composeMessage([
      `${awayTeam} @ ${homeTeam}`,
      `On deck: ${onDeck}`,
      `${half} ${inning || 1}`,
      `${this.describeSituation(runners)}, ${outs === 1 ? '1 out' : `${outs} outs`}`,
      `${totalProbability}% scoring probability`,
    ]);

    const alertKey = `${gameState.gameId}_MLB_ON_DECK_${half}_${inning}_${sitKey}_${onDeck.replace(/\s+/g, '_')}`;

    const isPower = this.isPowerHitter(onDeck);

    const alert: AlertResult = {
      alertKey,
      type: this.alertType,
      message: msg,
      context: {
        gameId: gameState.gameId,
        sport: 'MLB',
        homeTeam,
        awayTeam,
        homeScore: Number(gameState.homeScore ?? 0),
        awayScore: Number(gameState.awayScore ?? 0),
        inning,
        half,
        outs,
        runners,
        onDeckBatter: onDeck,
        currentBatter: gameState.currentBatter ?? null,
        currentPitcher: gameState.currentPitcher ?? null,
        weather: gameState.weatherContext ?? gameState.context?.weather ?? null,
        scoringProbability: totalProbability,
        situationType: 'ON_DECK_PREDICTION',
        isPowerHitter: isPower,
      },
      // Priority scales with probability (80..95)
      priority: Math.min(95, 80 + Math.floor(totalProbability / 5)),
    };

    return alert;
  }

  calculateProbability(gameState: GameState): number {
    // Mirrors isTriggered pipeline but returns numeric (used by engines as a hint)
    if (!gameState?.isLive) return 0;
    const onDeck = String(gameState.onDeckBatter ?? '').trim();
    if (!onDeck) return 0;

    const baseProb = this.calculateBaseSituationProbability(gameState);
    const playerMult = this.getPlayerMultiplier(onDeck);
    const envBonus = this.getWindBonus(gameState) + this.getLeverageBonus(gameState);

    return this.clampProb(baseProb * playerMult + envBonus);
  }

  // ---------- Probability components ----------

  private calculateBaseSituationProbability(gameState: GameState): number {
    const runners = this.normalizeRunners(gameState);
    const outs = Number(gameState.outs ?? 0);

    // Situation class
    let situation = 'bases_empty';
    if (runners.first && runners.second && runners.third) situation = 'bases_loaded';
    else if (runners.second && runners.third) situation = 'runners_2nd_3rd';
    else if (runners.first && runners.third) situation = 'runners_1st_3rd';
    else if (runners.first && runners.second) situation = 'runners_1st_2nd';
    else if (runners.third) situation = 'runner_3rd';
    else if (runners.second) situation = 'runner_2nd';
    else if (runners.first) situation = 'runner_1st';

    let p = this.SITUATION_PROBABILITIES[situation] ?? 30;

    // Outs adjustment
    if (outs === 0) p *= 1.2;
    else if (outs === 1) p *= 1.1;
    else p *= 0.8;

    // Late-inning leverage
    const inning = Number(gameState.inning ?? 0);
    if (inning >= 7) p *= 1.15;

    // Close game leverage
    const home = Number(gameState.homeScore ?? 0);
    const away = Number(gameState.awayScore ?? 0);
    if (Math.abs(home - away) <= 2) p *= 1.1;

    return this.clampProb(p);
    }

  private getPlayerMultiplier(batterName: string): number {
    if (!batterName) return 1.0;
    const key = batterName.toLowerCase();
    // quick contains for surnames listed
    for (const name of this.POWER_HITTERS) {
      if (key.includes(name)) return 1.25;
    }
    return 1.0;
  }

  private getWindBonus(gameState: GameState): number {
    const wx = (gameState as any).weatherContext ?? (gameState as any).context?.weather;
    if (!wx) return 0;

    const speed = Number(wx.windSpeed ?? wx.wind?.speed ?? 0) || 0;
    const dirRaw = wx.windDirection ?? wx.wind?.direction ?? '';
    const dir = typeof dirRaw === 'string' ? dirRaw.toLowerCase() : '';

    if (speed < 10) return 0;

    if (dir.includes('out') || dir.includes('center')) return 10; // carries
    if (dir.includes('in')) return -5;                              // knocks down
    return 0;
  }

  private getLeverageBonus(gameState: GameState): number {
    // Modest bump for high-leverage contexts not captured by base matrix
    const inning = Number(gameState.inning ?? 0);
    const home = Number(gameState.homeScore ?? 0);
    const away = Number(gameState.awayScore ?? 0);
    const diff = Math.abs(home - away);

    let bonus = 0;
    if (inning >= 8) bonus += 5;
    if (diff <= 1) bonus += 5;
    return bonus;
  }

  // ---------- Normalization / keys / text ----------

  private normalizeRunners(gs: GameState): RunnersState {
    // Prefer explicit booleans if present; else derive from typical shapes
    const hasFirst = Boolean((gs as any).hasFirst ?? (gs as any).runners?.first ?? (gs as any).runners?.onFirst);
    const hasSecond = Boolean((gs as any).hasSecond ?? (gs as any).runners?.second ?? (gs as any).runners?.onSecond);
    const hasThird = Boolean((gs as any).hasThird ?? (gs as any).runners?.third ?? (gs as any).runners?.onThird);
    return { first: !!hasFirst, second: !!hasSecond, third: !!hasThird };
  }

  private getSituationKey(r: RunnersState, outs: number): string {
    return `${r.first ? 1 : 0}${r.second ? 1 : 0}${r.third ? 1 : 0}_${outs ?? 0}`;
  }

  private describeSituation(r: RunnersState): string {
    if (r.first && r.second && r.third) return 'bases loaded';
    if (r.second && r.third) return 'runners on 2nd & 3rd';
    if (r.first && r.third) return 'runners on 1st & 3rd';
    if (r.first && r.second) return 'runners on 1st & 2nd';
    if (r.third) return 'runner on 3rd';
    if (r.second) return 'runner on 2nd';
    if (r.first) return 'runner on 1st';
    return 'bases empty';
  }

  private isPowerHitter(name: string): boolean {
    const key = name.toLowerCase();
    for (const n of this.POWER_HITTERS) if (key.includes(n)) return true;
    return false;
  }
}
