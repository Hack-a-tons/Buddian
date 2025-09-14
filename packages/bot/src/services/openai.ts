import OpenAI from 'openai';
import { openaiConfig, visionConfig } from '@/config/env';
import { openaiLogger, logError, logApiCall } from '@/utils/logger';
import { 
  LanguageDetectionResult, 
  Decision, 
  ActionItem, 
  OpenAIError 
} from '@/types';

// Initialize Azure OpenAI client
const openai = new OpenAI({
  apiKey: openaiConfig.apiKey,
  baseURL: `${openaiConfig.endpoint}/openai/deployments/${openaiConfig.deploymentName}`,
  defaultQuery: { 'api-version': openaiConfig.apiVersion },
  defaultHeaders: {
    'api-key': openaiConfig.apiKey,
  },
});

// Initialize Azure OpenAI Vision client if configured
let openaiVision: OpenAI | null = null;
if (openaiConfig.visionDeploymentName) {
  openaiVision = new OpenAI({
    apiKey: openaiConfig.apiKey,
    baseURL: `${openaiConfig.endpoint}/openai/deployments/${openaiConfig.visionDeploymentName}`,
    defaultQuery: { 'api-version': openaiConfig.apiVersion },
    defaultHeaders: {
      'api-key': openaiConfig.apiKey,
    },
  });
}

// Initialize Azure Vision client if configured (fallback)
let visionClient: OpenAI | null = null;
if (visionConfig) {
  visionClient = new OpenAI({
    apiKey: visionConfig.apiKey,
    baseURL: visionConfig.endpoint,
    defaultHeaders: {
      'Ocp-Apim-Subscription-Key': visionConfig.apiKey,
    },
  });
}

// Helper function to execute OpenAI operations with error handling
async function executeOpenAIOperation<T>(
  operation: () => Promise<T>,
  operationName: string,
  context?: Record<string, any>
): Promise<T> {
  const startTime = Date.now();
  
  try {
    const result = await operation();
    const duration = Date.now() - startTime;
    
    logApiCall(
      openaiLogger,
      'Azure OpenAI',
      'POST',
      openaiConfig.endpoint,
      200,
      duration,
      { operation: operationName, ...context }
    );
    
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    logError(openaiLogger, error as Error, { 
      operation: operationName, 
      duration,
      ...context 
    });
    
    if (error instanceof Error) {
      throw new OpenAIError(`OpenAI operation failed: ${error.message}`, { 
        operation: operationName,
        originalError: error.message,
        ...context 
      });
    }
    
    throw error;
  }
}

// Language detection service
export const languageService = {
  async detectLanguage(text: string): Promise<LanguageDetectionResult> {
    return executeOpenAIOperation(
      async () => {
        const response = await openai.chat.completions.create({
          model: openaiConfig.deploymentName,
          messages: [
            {
              role: 'system',
              content: `You are a language detection expert. Analyze the given text and return a JSON response with the detected language and confidence score.
              
              Response format:
              {
                "language": "language_code",
                "confidence": 0.95,
                "alternatives": [
                  {"language": "alt_code", "confidence": 0.05}
                ]
              }
              
              Use ISO 639-1 language codes (en, es, fr, de, etc.).`
            },
            {
              role: 'user',
              content: text.substring(0, 1000) // Limit text length
            }
          ],
          temperature: 0.1,
          max_tokens: 200
        });

        const content = response.choices[0]?.message?.content;
        if (!content) {
          throw new Error('No response from language detection');
        }

        try {
          return JSON.parse(content) as LanguageDetectionResult;
        } catch {
          // Fallback if JSON parsing fails
          return {
            language: 'en',
            confidence: 0.5,
            alternatives: []
          };
        }
      },
      'detectLanguage',
      { textLength: text.length }
    );
  },

  async translateText(text: string, targetLanguage: string, sourceLanguage?: string): Promise<string> {
    return executeOpenAIOperation(
      async () => {
        const response = await openai.chat.completions.create({
          model: openaiConfig.deploymentName,
          messages: [
            {
              role: 'system',
              content: `You are a professional translator. Translate the given text to ${targetLanguage}. 
              ${sourceLanguage ? `The source language is ${sourceLanguage}.` : ''}
              Maintain the original tone and context. Return only the translated text.`
            },
            {
              role: 'user',
              content: text
            }
          ],
          temperature: 0.3,
          max_tokens: Math.min(text.length * 2, 4000)
        });

        return response.choices[0]?.message?.content || text;
      },
      'translateText',
      { targetLanguage, sourceLanguage, textLength: text.length }
    );
  }
};

// Decision extraction service
export const decisionService = {
  async extractDecisions(messages: string[], context?: string): Promise<Decision[]> {
    return executeOpenAIOperation(
      async () => {
        const conversationText = messages.join('\n\n');
        
        const response = await openai.chat.completions.create({
          model: openaiConfig.deploymentName,
          messages: [
            {
              role: 'system',
              content: `You are an expert at analyzing conversations and extracting decisions. 
              Analyze the conversation and identify any decisions that were made.
              
              Return a JSON array of decisions with this format:
              [
                {
                  "content": "The actual decision made",
                  "confidence": 0.85,
                  "context": "Brief context about the decision",
                  "status": "pending"
                }
              ]
              
              Only include clear, actionable decisions. Confidence should be 0.0-1.0.
              Status should always be "pending" for new extractions.`
            },
            {
              role: 'user',
              content: `${context ? `Context: ${context}\n\n` : ''}Conversation:\n${conversationText}`
            }
          ],
          temperature: 0.2,
          max_tokens: 1500
        });

        const content = response.choices[0]?.message?.content;
        if (!content) {
          return [];
        }

        try {
          const decisions = JSON.parse(content) as Array<Omit<Decision, 'id' | 'extractedAt' | 'relatedMessages'>>;
          return decisions.map(decision => ({
            ...decision,
            id: `decision_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            extractedAt: Date.now(),
            relatedMessages: []
          }));
        } catch {
          return [];
        }
      },
      'extractDecisions',
      { messageCount: messages.length, hasContext: !!context }
    );
  }
};

// Action item extraction service
export const actionItemService = {
  async extractActionItems(messages: string[], context?: string): Promise<ActionItem[]> {
    return executeOpenAIOperation(
      async () => {
        const conversationText = messages.join('\n\n');
        
        const response = await openai.chat.completions.create({
          model: openaiConfig.deploymentName,
          messages: [
            {
              role: 'system',
              content: `You are an expert at analyzing conversations and extracting action items.
              Analyze the conversation and identify any tasks, assignments, or action items.
              
              Return a JSON array of action items with this format:
              [
                {
                  "title": "Brief title of the action item",
                  "description": "Detailed description of what needs to be done",
                  "assignee": "person assigned (if mentioned)",
                  "priority": "low|medium|high",
                  "status": "pending"
                }
              ]
              
              Only include clear, actionable items. Priority should be based on urgency/importance.
              Status should always be "pending" for new extractions.`
            },
            {
              role: 'user',
              content: `${context ? `Context: ${context}\n\n` : ''}Conversation:\n${conversationText}`
            }
          ],
          temperature: 0.2,
          max_tokens: 2000
        });

        const content = response.choices[0]?.message?.content;
        if (!content) {
          return [];
        }

        try {
          const actionItems = JSON.parse(content) as Array<Omit<ActionItem, 'id' | 'createdAt' | 'updatedAt' | 'relatedMessages' | 'dueDate'>>;
          const now = Date.now();
          
          return actionItems.map(item => ({
            ...item,
            id: `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            createdAt: now,
            updatedAt: now,
            relatedMessages: []
          }));
        } catch {
          return [];
        }
      },
      'extractActionItems',
      { messageCount: messages.length, hasContext: !!context }
    );
  }
};

// Question answering service
export const qaService = {
  async answerQuestion(
    question: string,
    context: string[],
    conversationHistory?: string[],
    language: string = 'en'
  ): Promise<string> {
    return executeOpenAIOperation(
      async () => {
        const contextText = context.join('\n\n');
        const historyText = conversationHistory?.join('\n\n') || '';
        
        const response = await openai.chat.completions.create({
          model: openaiConfig.deploymentName,
          messages: [
            {
              role: 'system',
              content: `You are Buddian, a helpful AI assistant with access to conversation history and context.
              Answer questions based on the provided context and conversation history.
              
              Guidelines:
              - Be helpful, accurate, and concise
              - Use the context to provide specific, relevant answers
              - If you don't have enough information, say so
              - Respond in ${language} language
              - Include relevant sources or references when possible
              - Maintain a friendly, professional tone`
            },
            {
              role: 'user',
              content: `Context:\n${contextText}\n\n${historyText ? `Recent conversation:\n${historyText}\n\n` : ''}Question: ${question}`
            }
          ],
          temperature: 0.7,
          max_tokens: 2000
        });

        return response.choices[0]?.message?.content || 'I apologize, but I could not generate a response to your question.';
      },
      'answerQuestion',
      { 
        language, 
        contextLength: context.length, 
        hasHistory: !!conversationHistory,
        questionLength: question.length 
      }
    );
  }
};

// Content summarization service
export const summaryService = {
  async summarizeContent(
    content: string,
    type: 'conversation' | 'document' | 'resource' = 'conversation',
    language: string = 'en',
    maxLength: number = 500
  ): Promise<string> {
    return executeOpenAIOperation(
      async () => {
        const response = await openai.chat.completions.create({
          model: openaiConfig.deploymentName,
          messages: [
            {
              role: 'system',
              content: `You are an expert at creating concise, informative summaries.
              Create a summary of the provided ${type} content.
              
              Guidelines:
              - Maximum ${maxLength} characters
              - Capture key points and main themes
              - Use ${language} language
              - Be objective and factual
              - Include important decisions, action items, or conclusions
              - Structure the summary clearly`
            },
            {
              role: 'user',
              content: content.substring(0, 8000) // Limit input length
            }
          ],
          temperature: 0.3,
          max_tokens: Math.min(maxLength / 2, 1000)
        });

        return response.choices[0]?.message?.content || 'Summary could not be generated.';
      },
      'summarizeContent',
      { type, language, contentLength: content.length, maxLength }
    );
  },

  async generateKeyPoints(content: string, maxPoints: number = 5): Promise<string[]> {
    return executeOpenAIOperation(
      async () => {
        const response = await openai.chat.completions.create({
          model: openaiConfig.deploymentName,
          messages: [
            {
              role: 'system',
              content: `Extract the ${maxPoints} most important key points from the content.
              Return a JSON array of strings, each representing a key point.
              
              Format: ["Key point 1", "Key point 2", ...]
              
              Focus on:
              - Main topics and themes
              - Important decisions or conclusions
              - Action items or next steps
              - Critical information or insights`
            },
            {
              role: 'user',
              content: content.substring(0, 6000)
            }
          ],
          temperature: 0.2,
          max_tokens: 800
        });

        const responseContent = response.choices[0]?.message?.content;
        if (!responseContent) {
          return [];
        }

        try {
          return JSON.parse(responseContent) as string[];
        } catch {
          // Fallback: split by lines and clean up
          return responseContent
            .split('\n')
            .filter(line => line.trim().length > 0)
            .map(line => line.replace(/^[-*•]\s*/, '').trim())
            .slice(0, maxPoints);
        }
      },
      'generateKeyPoints',
      { contentLength: content.length, maxPoints }
    );
  }
};

// Image analysis service
export const visionService = {
  async analyzeImage(imageUrl: string, language: string = 'en'): Promise<string> {
    // Use Azure OpenAI Vision if configured
    if (openaiVision) {
      return executeOpenAIOperation(
        async () => {
          const response = await openaiVision.chat.completions.create({
            model: openaiConfig.visionDeploymentName!,
            messages: [
              {
                role: 'system',
                content: `You are an expert at analyzing images and providing detailed descriptions.
                Analyze the image and provide a comprehensive description in ${language}.
                
                Include:
                - What you see in the image
                - Key objects, people, or elements
                - Context or setting
                - Any text visible in the image
                - Overall mood or atmosphere`
              },
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: 'Please analyze this image:'
                  },
                  {
                    type: 'image_url',
                    image_url: {
                      url: imageUrl
                    }
                  }
                ]
              }
            ],
            temperature: 0.3,
            max_tokens: 1000
          });

          return response.choices[0]?.message?.content || 'Could not analyze the image.';
        },
        'analyzeImage',
        { imageUrl: imageUrl.substring(0, 100), language, client: 'azure-openai-vision' }
      );
    }

    // Fallback to Azure Computer Vision if configured
    if (visionClient) {
      return executeOpenAIOperation(
        async () => {
          // This would use Azure Computer Vision API
          // For now, return a placeholder message
          throw new OpenAIError('Azure Computer Vision API integration not yet implemented');
        },
        'analyzeImage',
        { imageUrl: imageUrl.substring(0, 100), language, client: 'azure-computer-vision' }
      );
    }

    throw new OpenAIError('No vision service configured. Please set AZURE_OPENAI_VISION_DEPLOYMENT_NAME or AZURE_VISION_* environment variables.');
  }
};

// Health check
export const healthService = {
  async checkConnection(): Promise<boolean> {
    try {
      await openai.chat.completions.create({
        model: openaiConfig.deploymentName,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
        temperature: 0
      });
      return true;
    } catch (error) {
      logError(openaiLogger, error as Error, { operation: 'healthCheck' });
      return false;
    }
  }
};

// Export all services
export default {
  language: languageService,
  decision: decisionService,
  actionItem: actionItemService,
  qa: qaService,
  summary: summaryService,
  vision: visionService,
  health: healthService
};
