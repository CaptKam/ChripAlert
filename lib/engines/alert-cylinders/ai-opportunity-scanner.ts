import { BaseAlertModule, GameState, AlertResult } from '../base-engine';
import type { CrossSportContext, UnifiedAIResponse } from '../../unified-ai-processor';
import { AIFeatures } from '../../../config/ai-features';
import crypto from 'crypto';

export interface AIDiscoveryResult {
  isOpportunity: boolean;
  alertType: string;
  primary: string;
  secondary?: string;
  confidence: number;
  reasoning: string;
}

export abstract class BaseAIScanner extends BaseAlertModule {
  protected rateLimitMap = new Map<string, number>();
  protected readonly RATE_LIMIT_MS = 90000; // 90 seconds

  abstract buildAIContext(gameState: GameState): CrossSportContext;
  abstract checkSmartGate(gameState: GameState): boolean;
  abstract generateSituationHash(gameState: GameState): string;

  isTriggered(gameState: GameState): boolean {
    if (!AIFeatures.enableAIScanner) return false;
    if (!gameState.isLive) return false;

    const gameId = gameState.gameId;
    const now = Date.now();
    const lastScan = this.rateLimitMap.get(gameId) || 0;

    if (now - lastScan < this.RATE_LIMIT_MS) {
      return false;
    }

    const passedGate = this.checkSmartGate(gameState);
    if (passedGate) {
      this.rateLimitMap.set(gameId, now);
    }

    return passedGate;
  }

  async generateAlert(gameState: GameState): Promise<AlertResult | null> {
    const context = this.buildAIContext(gameState);
    const situationHash = this.generateSituationHash(gameState);
    
    const aiResponse = await this.callAISync(context);
    
    if (!aiResponse || !aiResponse.isOpportunity) {
      return null;
    }

    const alertKey = `${gameState.gameId}_ai_discovery_${situationHash}`;
    
    const primary = aiResponse.primary || `${this.sport} AI Discovery Alert`;
    const secondary = aiResponse.secondary || '';
    const confidence = aiResponse.confidence || 70;
    const alertType = aiResponse.alertType || `AI_DISCOVERED_${this.sport}_OPPORTUNITY`;
    const reasoning = aiResponse.reasoning || 'Multi-factor opportunity detected';

    const message = secondary 
      ? `${primary} | ${secondary}` 
      : primary;

    const priority = Math.max(50, Math.min(95, confidence));
    
    return {
      alertKey,
      type: alertType,
      message: message,
      context: {
        ...context,
        source: 'ai_discovery',
        situationHash,
        aiReasoning: reasoning,
        aiPrimary: primary,
        aiSecondary: secondary,
        aiConfidence: confidence
      },
      priority: priority
    };
  }

  calculateProbability(gameState: GameState): number {
    return this.checkSmartGate(gameState) ? 75 : 0;
  }

  protected buildAIPrompt(context: CrossSportContext): string {
    const homeTeam = typeof context.homeTeam === 'string' ? context.homeTeam : context.homeTeam;
    const awayTeam = typeof context.awayTeam === 'string' ? context.awayTeam : context.awayTeam;
    
    let situationDetails = '';
    
    if (context.sport === 'MLB') {
      const runners = context.baseRunners || { first: false, second: false, third: false };
      situationDetails = `
Inning: ${context.inning} (${context.period})
Outs: ${context.outs}
Count: ${context.balls}-${context.strikes}
Runners: ${runners.first ? '1B ' : ''}${runners.second ? '2B ' : ''}${runners.third ? '3B' : 'Empty'}
${context.weather ? `Weather: ${context.weather.condition}, Wind: ${context.weather.windSpeed}mph` : ''}`;
    } else if (['NFL', 'NCAAF', 'CFL'].includes(context.sport)) {
      situationDetails = `
Quarter: ${context.quarter}
Time: ${context.timeRemaining}
Down & Distance: ${context.down} & ${context.yardsToGo}
Field Position: ${context.fieldPosition}-yard line
Possession: ${context.possession}
${context.redZone ? 'RED ZONE' : ''}
${context.weather ? `Weather: ${context.weather.condition}, Wind: ${context.weather.windSpeed}mph` : ''}`;
    } else if (['NBA', 'WNBA'].includes(context.sport)) {
      situationDetails = `
Period: Q${context.period}
Time Remaining: ${context.timeLeft}
Shot Clock: ${context.shotClock}
Fouls: Home ${context.fouls?.home || 0}, Away ${context.fouls?.away || 0}`;
    }

    return `You are analyzing a live sports game for high-value betting opportunities.

GAME: ${context.sport} - ${awayTeam} @ ${homeTeam} (${context.awayScore}-${context.homeScore})
SITUATION: ${situationDetails}

Question: Is this a HIGH-VALUE betting opportunity that our standard alerts might miss?

Consider:
- Multiple factors combining (elite player + game situation + external factors)
- Unique matchup advantages
- Momentum shifts with betting implications

Respond with JSON:
{
  "isOpportunity": true/false,
  "alertType": "AI_DISCOVERED_${context.sport}_[TYPE]",
  "primary": "Brief alert message (max 150 chars)",
  "secondary": "Additional context if significant (max 150 chars)",
  "confidence": 0-100,
  "reasoning": "Why this matters for bettors (max 200 chars)"
}

Only return isOpportunity:true for UNIQUE situations our cylinders wouldn't catch.`;
  }

  protected async callAISync(context: CrossSportContext): Promise<AIDiscoveryResult | null> {
    try {
      const { unifiedAIProcessor } = await import('../../unified-ai-processor');
      
      const aiResponse = await unifiedAIProcessor.applyUnifiedEnhancement(
        {
          alertKey: `temp_${context.gameId}_${context.situationHash}`,
          type: `AI_SCANNER_${context.sport}`,
          message: 'AI Discovery Request',
          context: context,
          priority: 70
        },
        context
      );

      if (!aiResponse || !aiResponse.sportSpecificData?.aiDiscovery) {
        return null;
      }

      return {
        isOpportunity: true,
        primary: aiResponse.enhancedMessage,
        secondary: aiResponse.contextualInsights?.[1] || '',
        confidence: aiResponse.confidence || 70,
        alertType: aiResponse.sportSpecificData.aiAlertType || `AI_DISCOVERED_${context.sport}`,
        reasoning: aiResponse.contextualInsights?.[2] || ''
      };
    } catch (error) {
      console.error('❌ AI discovery call failed:', error);
      return null;
    }
  }

  protected generateCacheKey(context: CrossSportContext): string {
    const parts = [
      context.gameId,
      context.sport,
      context.homeScore,
      context.awayScore,
      context.period || context.inning || context.quarter || 0
    ];
    
    return crypto.createHash('md5').update(parts.join('|')).digest('hex');
  }

  protected checkCache(key: string): AIDiscoveryResult | null {
    return null;
  }

  protected hashString(str: string): string {
    return crypto.createHash('md5').update(str).digest('hex').substring(0, 8);
  }
}
