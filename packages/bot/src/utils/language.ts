import openaiService from '@/services/openai';
import { userService } from '@/services/convex';
import { contentLogger, logError } from '@/utils/logger';
import { LanguageDetectionResult } from '@/types';

// Language code mappings (ISO 639-1 to full names)
export const LANGUAGE_NAMES: Record<string, string> = {
  'en': 'English',
  'es': 'Spanish',
  'fr': 'French',
  'de': 'German',
  'it': 'Italian',
  'pt': 'Portuguese',
  'ru': 'Russian',
  'ja': 'Japanese',
  'ko': 'Korean',
  'zh': 'Chinese',
  'ar': 'Arabic',
  'hi': 'Hindi',
  'tr': 'Turkish',
  'pl': 'Polish',
  'nl': 'Dutch',
  'sv': 'Swedish',
  'da': 'Danish',
  'no': 'Norwegian',
  'fi': 'Finnish',
  'cs': 'Czech',
  'hu': 'Hungarian',
  'ro': 'Romanian',
  'bg': 'Bulgarian',
  'hr': 'Croatian',
  'sk': 'Slovak',
  'sl': 'Slovenian',
  'et': 'Estonian',
  'lv': 'Latvian',
  'lt': 'Lithuanian',
  'uk': 'Ukrainian',
  'be': 'Belarusian',
  'mk': 'Macedonian',
  'sr': 'Serbian',
  'bs': 'Bosnian',
  'mt': 'Maltese',
  'is': 'Icelandic',
  'ga': 'Irish',
  'cy': 'Welsh',
  'eu': 'Basque',
  'ca': 'Catalan',
  'gl': 'Galician',
  'he': 'Hebrew',
  'fa': 'Persian',
  'ur': 'Urdu',
  'bn': 'Bengali',
  'ta': 'Tamil',
  'te': 'Telugu',
  'ml': 'Malayalam',
  'kn': 'Kannada',
  'gu': 'Gujarati',
  'pa': 'Punjabi',
  'mr': 'Marathi',
  'ne': 'Nepali',
  'si': 'Sinhala',
  'my': 'Burmese',
  'th': 'Thai',
  'lo': 'Lao',
  'km': 'Khmer',
  'vi': 'Vietnamese',
  'id': 'Indonesian',
  'ms': 'Malay',
  'tl': 'Filipino',
  'sw': 'Swahili',
  'am': 'Amharic',
  'yo': 'Yoruba',
  'ig': 'Igbo',
  'ha': 'Hausa',
  'zu': 'Zulu',
  'af': 'Afrikaans'
};

// Common language detection patterns
const LANGUAGE_PATTERNS: Record<string, RegExp[]> = {
  'en': [
    /\b(the|and|or|but|in|on|at|to|for|of|with|by)\b/gi,
    /\b(this|that|these|those|what|where|when|why|how)\b/gi,
    /\b(hello|hi|thank|please|sorry|yes|no)\b/gi
  ],
  'es': [
    /\b(el|la|los|las|un|una|y|o|pero|en|con|de|por|para)\b/gi,
    /\b(este|esta|estos|estas|que|donde|cuando|por que|como)\b/gi,
    /\b(hola|gracias|por favor|lo siento|si|no)\b/gi
  ],
  'fr': [
    /\b(le|la|les|un|une|et|ou|mais|dans|sur|avec|de|par|pour)\b/gi,
    /\b(ce|cette|ces|que|où|quand|pourquoi|comment)\b/gi,
    /\b(bonjour|merci|s'il vous plaît|désolé|oui|non)\b/gi
  ],
  'de': [
    /\b(der|die|das|ein|eine|und|oder|aber|in|auf|mit|von|für)\b/gi,
    /\b(dieser|diese|dieses|was|wo|wann|warum|wie)\b/gi,
    /\b(hallo|danke|bitte|entschuldigung|ja|nein)\b/gi
  ],
  'ru': [
    /\b(и|или|но|в|на|с|от|для|к|по)\b/gi,
    /\b(это|что|где|когда|почему|как)\b/gi,
    /\b(привет|спасибо|пожалуйста|извините|да|нет)\b/gi
  ],
  'zh': [
    /[的是在有个一不了人我他你们]/g,
    /[这那什么哪里什么时候为什么怎么]/g,
    /[你好谢谢请对不起是不是]/g
  ],
  'ja': [
    /[のはにをがでと]/g,
    /[これそれあれどこいつなぜどう]/g,
    /[こんにちはありがとうすみませんはいいいえ]/g
  ],
  'ar': [
    /\b(في|على|من|إلى|عن|مع|بعد|قبل|تحت|فوق)\b/g,
    /\b(هذا|هذه|ذلك|تلك|ما|أين|متى|لماذا|كيف)\b/g,
    /\b(مرحبا|شكرا|من فضلك|آسف|نعم|لا)\b/g
  ]
};

// Language detection cache
const languageCache = new Map<string, { result: LanguageDetectionResult; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// User language preferences cache
const userLanguageCache = new Map<string, { language: string; timestamp: number }>();
const USER_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

/**
 * Detect the language of a text using pattern matching and AI
 */
export async function detectLanguage(text: string, useCache: boolean = true): Promise<LanguageDetectionResult> {
  if (!text || text.trim().length === 0) {
    return {
      language: 'en',
      confidence: 0.5,
      alternatives: []
    };
  }

  const cacheKey = text.substring(0, 200); // Use first 200 chars as cache key
  
  // Check cache first
  if (useCache && languageCache.has(cacheKey)) {
    const cached = languageCache.get(cacheKey)!;
    if (Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.result;
    }
    languageCache.delete(cacheKey);
  }

  try {
    // First try pattern-based detection for quick results
    const patternResult = detectLanguageByPatterns(text);
    
    // If pattern detection is confident enough, use it
    if (patternResult.confidence > 0.8) {
      if (useCache) {
        languageCache.set(cacheKey, {
          result: patternResult,
          timestamp: Date.now()
        });
      }
      return patternResult;
    }

    // Otherwise, use AI-based detection
    const aiResult = await openaiService.language.detectLanguage(text);
    
    // Combine pattern and AI results for better accuracy
    const combinedResult = combineLanguageResults(patternResult, aiResult);
    
    if (useCache) {
      languageCache.set(cacheKey, {
        result: combinedResult,
        timestamp: Date.now()
      });
    }
    
    return combinedResult;
  } catch (error) {
    logError(contentLogger, error as Error, { 
      operation: 'language_detection',
      textLength: text.length 
    });
    
    // Fallback to pattern detection
    const fallbackResult = detectLanguageByPatterns(text);
    return fallbackResult.confidence > 0.3 ? fallbackResult : {
      language: 'en',
      confidence: 0.5,
      alternatives: []
    };
  }
}

/**
 * Detect language using pattern matching
 */
function detectLanguageByPatterns(text: string): LanguageDetectionResult {
  const scores: Record<string, number> = {};
  const textLower = text.toLowerCase();
  
  // Score each language based on pattern matches
  for (const [lang, patterns] of Object.entries(LANGUAGE_PATTERNS)) {
    let score = 0;
    let totalMatches = 0;
    
    for (const pattern of patterns) {
      const matches = textLower.match(pattern);
      if (matches) {
        score += matches.length;
        totalMatches += matches.length;
      }
    }
    
    // Normalize score by text length
    if (totalMatches > 0) {
      scores[lang] = score / Math.max(text.split(/\s+/).length, 1);
    }
  }
  
  // Find the best match
  const sortedScores = Object.entries(scores)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3);
  
  if (sortedScores.length === 0) {
    return {
      language: 'en',
      confidence: 0.1,
      alternatives: []
    };
  }
  
  const [topLang, topScore] = sortedScores[0] || ['en', 0];
  const confidence = Math.min(topScore * 2, 0.9); // Cap at 0.9 for pattern detection
  
  const alternatives = sortedScores.slice(1).map((entry) => ({
    language: entry[0],
    confidence: Math.min(entry[1] * 2, 0.8)
  }));
  
  return {
    language: topLang,
    confidence,
    alternatives
  };
}

/**
 * Combine pattern-based and AI-based language detection results
 */
function combineLanguageResults(
  patternResult: LanguageDetectionResult,
  aiResult: LanguageDetectionResult
): LanguageDetectionResult {
  // If both agree, increase confidence
  if (patternResult.language === aiResult.language) {
    return {
      language: aiResult.language,
      confidence: Math.min((patternResult.confidence + aiResult.confidence) / 1.5, 0.95),
      alternatives: aiResult.alternatives
    };
  }
  
  // If AI is more confident, use AI result
  if (aiResult.confidence > patternResult.confidence + 0.2) {
    return aiResult;
  }
  
  // If pattern is more confident, use pattern result
  if (patternResult.confidence > aiResult.confidence + 0.2) {
    return patternResult;
  }
  
  // Otherwise, use AI result but with reduced confidence
  return {
    language: aiResult.language,
    confidence: aiResult.confidence * 0.8,
    alternatives: [
      { language: patternResult.language, confidence: patternResult.confidence * 0.8 },
      ...aiResult.alternatives
    ]
  };
}

/**
 * Get user's preferred language
 */
export async function getUserLanguage(userId: string, useCache: boolean = true): Promise<string> {
  // Check cache first
  if (useCache && userLanguageCache.has(userId)) {
    const cached = userLanguageCache.get(userId)!;
    if (Date.now() - cached.timestamp < USER_CACHE_TTL) {
      return cached.language;
    }
    userLanguageCache.delete(userId);
  }

  try {
    const language = await userService.getUserLanguage(userId);
    
    if (useCache) {
      userLanguageCache.set(userId, {
        language,
        timestamp: Date.now()
      });
    }
    
    return language;
  } catch (error) {
    logError(contentLogger, error as Error, { 
      operation: 'get_user_language',
      userId 
    });
    
    return 'en'; // Default fallback
  }
}

/**
 * Detect the dominant language in a conversation
 */
export async function detectConversationLanguage(messages: string[]): Promise<string> {
  if (messages.length === 0) {
    return 'en';
  }

  // Combine recent messages (last 10 or so)
  const recentMessages = messages.slice(-10);
  const combinedText = recentMessages.join(' ').substring(0, 2000);
  
  try {
    const result = await detectLanguage(combinedText);
    return result.confidence > 0.6 ? result.language : 'en';
  } catch (error) {
    logError(contentLogger, error as Error, { 
      operation: 'conversation_language_detection',
      messageCount: messages.length 
    });
    
    return 'en';
  }
}

/**
 * Translate text to target language
 */
export async function translateText(
  text: string,
  targetLanguage: string,
  sourceLanguage?: string
): Promise<string> {
  if (!text || text.trim().length === 0) {
    return text;
  }

  // Don't translate if source and target are the same
  if (sourceLanguage === targetLanguage) {
    return text;
  }

  try {
    return await openaiService.language.translateText(text, targetLanguage, sourceLanguage);
  } catch (error) {
    logError(contentLogger, error as Error, { 
      operation: 'translation',
      targetLanguage,
      sourceLanguage,
      textLength: text.length 
    });
    
    return text; // Return original text on error
  }
}

/**
 * Format a multilingual response
 */
export function formatMultilingualResponse(
  responses: Record<string, string>,
  primaryLanguage: string = 'en'
): string {
  const primary = responses[primaryLanguage] || responses['en'] || '';
  
  if (Object.keys(responses).length === 1) {
    return primary;
  }

  let formatted = primary;
  
  // Add translations for other languages
  for (const [lang, text] of Object.entries(responses)) {
    if (lang !== primaryLanguage && lang !== 'en' && text !== primary) {
      const langName = LANGUAGE_NAMES[lang] || lang.toUpperCase();
      formatted += `\n\n🌐 ${langName}: ${text}`;
    }
  }
  
  return formatted;
}

/**
 * Get language name from code
 */
export function getLanguageName(languageCode: string): string {
  return LANGUAGE_NAMES[languageCode.toLowerCase()] || languageCode.toUpperCase();
}

/**
 * Check if a language is supported
 */
export function isLanguageSupported(languageCode: string): boolean {
  return languageCode.toLowerCase() in LANGUAGE_NAMES;
}

/**
 * Get list of supported languages
 */
export function getSupportedLanguages(): Array<{ code: string; name: string }> {
  return Object.entries(LANGUAGE_NAMES).map(([code, name]) => ({ code, name }));
}

/**
 * Clear language caches
 */
export function clearLanguageCaches(): void {
  languageCache.clear();
  userLanguageCache.clear();
  contentLogger.info('Language caches cleared');
}

/**
 * Get cache statistics
 */
export function getLanguageCacheStats(): {
  languageCache: { size: number; hitRate: number };
  userCache: { size: number; hitRate: number };
} {
  return {
    languageCache: {
      size: languageCache.size,
      hitRate: 0 // Would need to track hits/misses for accurate rate
    },
    userCache: {
      size: userLanguageCache.size,
      hitRate: 0
    }
  };
}

// Export default object with all functions
export default {
  detectLanguage,
  getUserLanguage,
  detectConversationLanguage,
  translateText,
  formatMultilingualResponse,
  getLanguageName,
  isLanguageSupported,
  getSupportedLanguages,
  clearLanguageCaches,
  getLanguageCacheStats,
  LANGUAGE_NAMES
};
