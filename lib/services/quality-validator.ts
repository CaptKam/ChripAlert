import { jaccardSimilarity } from './text-utils';

export interface QualityConfig {
  maxPrimaryWords: number;
  maxSecondaryWords: number;
  duplicateThreshold: number;
  nearDuplicateThreshold: number;
}

export interface ValidationResult {
  isValid: boolean;
  reason?: string;
  fallbackToOriginal: boolean;
}

export interface PresentationObject {
  source: 'ai' | 'original';
  title: string;
  body?: string;
  confidence: number;
  tags: string[];
  market?: string;
  bullets: string[];
  duplicateSuppressed: boolean;
}

const QUALITY_CONFIG: QualityConfig = {
  maxPrimaryWords: 14,
  maxSecondaryWords: 18,
  duplicateThreshold: 0.72,
  nearDuplicateThreshold: 0.60
};

function countWords(text: string): number {
  return text.trim().split(/\s+/).length;
}

function isDuplicate(text1: string, text2: string, threshold: number): boolean {
  return jaccardSimilarity(text1, text2) >= threshold;
}

export function validateAIOutput(
  aiTitle: string,
  aiMessage: string,
  originalMessage: string,
  contextualInsights: string[] = []
): ValidationResult {
  const trimmedTitle = aiTitle.trim();
  const trimmedMessage = aiMessage.trim();

  if (!trimmedTitle || trimmedTitle.length === 0) {
    return {
      isValid: false,
      reason: 'empty_primary',
      fallbackToOriginal: true
    };
  }

  if (!trimmedMessage || trimmedMessage.length === 0) {
    return {
      isValid: false,
      reason: 'empty_primary',
      fallbackToOriginal: true
    };
  }

  const titleWords = countWords(trimmedTitle);
  const messageWords = countWords(trimmedMessage);

  if (titleWords < 2) {
    return {
      isValid: false,
      reason: 'too_short',
      fallbackToOriginal: true
    };
  }

  if (messageWords < 2) {
    return {
      isValid: false,
      reason: 'too_short',
      fallbackToOriginal: true
    };
  }

  if (titleWords > QUALITY_CONFIG.maxPrimaryWords) {
    return {
      isValid: false,
      reason: `Title too long: ${titleWords} words (max ${QUALITY_CONFIG.maxPrimaryWords})`,
      fallbackToOriginal: true
    };
  }

  if (messageWords > QUALITY_CONFIG.maxSecondaryWords) {
    return {
      isValid: false,
      reason: `Message too long: ${messageWords} words (max ${QUALITY_CONFIG.maxSecondaryWords})`,
      fallbackToOriginal: true
    };
  }

  const aiContent = `${trimmedTitle} ${trimmedMessage}`.trim();
  if (isDuplicate(aiContent, originalMessage, QUALITY_CONFIG.duplicateThreshold)) {
    return {
      isValid: false,
      reason: `AI output duplicates original (${Math.round(jaccardSimilarity(aiContent, originalMessage) * 100)}% similar)`,
      fallbackToOriginal: true
    };
  }

  return {
    isValid: true,
    fallbackToOriginal: false
  };
}

export function pruneRepetitiveInsights(
  insights: string[],
  referenceText: string
): string[] {
  const pruned: string[] = [];
  const seen = new Set<string>();

  for (const insight of insights) {
    const normalized = insight.toLowerCase().trim();
    
    if (seen.has(normalized)) {
      continue;
    }

    if (isDuplicate(insight, referenceText, QUALITY_CONFIG.nearDuplicateThreshold)) {
      continue;
    }

    let isDuplicateOfExisting = false;
    for (const existing of pruned) {
      if (isDuplicate(insight, existing, QUALITY_CONFIG.nearDuplicateThreshold)) {
        isDuplicateOfExisting = true;
        break;
      }
    }

    if (!isDuplicateOfExisting) {
      pruned.push(insight);
      seen.add(normalized);
    }
  }

  return pruned;
}

export function resolveDisplay(
  aiEnhancedTitle: string,
  aiEnhancedMessage: string,
  originalMessage: string,
  contextualInsights: string[] = [],
  gamblingBullets: string[] = [],
  confidence: number = 0,
  tags: string[] = [],
  validationResult?: ValidationResult
): PresentationObject {
  let useAI = true;
  let duplicateSuppressed = false;

  if (validationResult && !validationResult.isValid) {
    useAI = false;
  }

  let title = useAI ? aiEnhancedTitle : originalMessage;
  let body = useAI ? aiEnhancedMessage : undefined;

  const titleAndBody = `${title} ${body || ''}`.trim();

  const prunedInsights = pruneRepetitiveInsights(contextualInsights, titleAndBody);

  const deduplicatedBullets: string[] = [];
  const bulletCandidates = [...prunedInsights, ...gamblingBullets];

  for (const bullet of bulletCandidates) {
    if (isDuplicate(bullet, titleAndBody, QUALITY_CONFIG.nearDuplicateThreshold)) {
      duplicateSuppressed = true;
      continue;
    }

    let isDuplicateOfExisting = false;
    for (const existing of deduplicatedBullets) {
      if (isDuplicate(bullet, existing, QUALITY_CONFIG.nearDuplicateThreshold)) {
        isDuplicateOfExisting = true;
        duplicateSuppressed = true;
        break;
      }
    }

    if (!isDuplicateOfExisting && deduplicatedBullets.length < 2) {
      deduplicatedBullets.push(bullet);
    } else if (!isDuplicateOfExisting) {
      duplicateSuppressed = true;
    }
  }

  return {
    source: useAI ? 'ai' : 'original',
    title,
    body,
    confidence,
    tags: tags.slice(0, 3),
    bullets: deduplicatedBullets,
    duplicateSuppressed
  };
}
