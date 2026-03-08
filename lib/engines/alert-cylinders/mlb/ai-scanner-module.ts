import { BaseAIScanner } from '../ai-opportunity-scanner';
import { GameState } from '../../base-engine';
import type { CrossSportContext } from '../../../unified-ai-processor';

export default class MLBAIScannerModule extends BaseAIScanner {
  alertType = 'MLB_AI_SCANNER';
  sport = 'MLB';

  private readonly ELITE_BATTERS = [
    'Ohtani', 'Judge', 'Trout', 'Guerrero', 'Soto', 'Betts', 
    'Freeman', 'Alvarez', 'Acuna', 'Tatis', 'Harper', 'Machado'
  ];

  checkSmartGate(gameState: GameState): boolean {
    const hasEliteBatter = this.isEliteBatterUp(gameState);
    if (!hasEliteBatter) return false;

    const hasRunnersInScoringPosition = (gameState.hasSecond as boolean) || (gameState.hasThird as boolean);
    const basesLoaded = (gameState.hasFirst as boolean) && (gameState.hasSecond as boolean) && (gameState.hasThird as boolean);
    const hasScoringOpportunity = hasRunnersInScoringPosition || basesLoaded;
    if (!hasScoringOpportunity) return false;

    const weather = gameState.weather as { windSpeed?: number } | undefined;
    const windMph = weather?.windSpeed || 0;
    const isHighWind = windMph >= 15;
    const inning = (gameState.inning as number) || 0;
    const isLateInning = inning >= 7;
    const scoreDiff = Math.abs((gameState.homeScore || 0) - (gameState.awayScore || 0));
    const isCloseGame = scoreDiff <= 3;

    return isHighWind || isLateInning || isCloseGame;
  }

  buildAIContext(gameState: GameState): CrossSportContext {
    const weather = gameState.weather as { 
      temperature?: number; 
      condition?: string; 
      windSpeed?: number; 
      humidity?: number; 
      impact?: string;
    } | undefined;

    return {
      sport: 'MLB',
      gameId: gameState.gameId,
      alertType: this.alertType,
      priority: 75,
      probability: 75,
      homeTeam: this.getTeamName(gameState.homeTeam),
      awayTeam: this.getTeamName(gameState.awayTeam),
      homeScore: gameState.homeScore || 0,
      awayScore: gameState.awayScore || 0,
      isLive: gameState.isLive,
      inning: gameState.inning as number | undefined,
      outs: gameState.outs as number | undefined,
      balls: gameState.balls as number | undefined,
      strikes: gameState.strikes as number | undefined,
      period: gameState.inning as number | undefined,
      baseRunners: {
        first: (gameState.hasFirst as boolean) || false,
        second: (gameState.hasSecond as boolean) || false,
        third: (gameState.hasThird as boolean) || false
      },
      weather: weather ? {
        temperature: weather.temperature || 70,
        condition: weather.condition || 'Clear',
        windSpeed: weather.windSpeed,
        humidity: weather.humidity,
        impact: weather.impact
      } : undefined,
      source: 'ai_discovery',
      situationHash: this.generateSituationHash(gameState),
      originalMessage: `AI Discovery: ${this.sport} opportunity detected`,
      originalContext: gameState
    };
  }

  generateSituationHash(gameState: GameState): string {
    const weather = gameState.weather as { windSpeed?: number } | undefined;
    const batter = gameState.currentBatter as { name?: string } | undefined;
    
    const parts = [
      gameState.gameId,
      gameState.inning,
      gameState.outs,
      (gameState.hasFirst as boolean) ? '1' : '0',
      (gameState.hasSecond as boolean) ? '1' : '0',
      (gameState.hasThird as boolean) ? '1' : '0',
      Math.floor((gameState.homeScore || 0) / 2),
      Math.floor((gameState.awayScore || 0) / 2),
      Math.floor((weather?.windSpeed || 0) / 5),
      batter?.name || 'unknown'
    ].join('|');
    
    return this.hashString(parts);
  }

  private isEliteBatterUp(gameState: GameState): boolean {
    const batter = gameState.currentBatter as { name?: string } | undefined;
    const batterName = batter?.name || '';
    return this.ELITE_BATTERS.some(elite => 
      batterName.toLowerCase().includes(elite.toLowerCase())
    );
  }
}
