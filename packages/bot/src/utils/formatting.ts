/**
 * Safe Markdown formatting utilities for Telegram messages
 * Handles escaping and truncation to prevent API errors
 */

// Telegram message limits
const TELEGRAM_MAX_MESSAGE_LENGTH = 4096;
const TELEGRAM_MAX_CAPTION_LENGTH = 1024;

// Characters that need escaping in Telegram MarkdownV2
const MARKDOWN_ESCAPE_CHARS = /[_*[\]()~`>#+=|{}.!-]/g;

/**
 * Escape special characters for Telegram MarkdownV2
 */
export function escapeMarkdown(text: string): string {
  return text.replace(MARKDOWN_ESCAPE_CHARS, '\\$&');
}

/**
 * Safely truncate text to fit Telegram limits
 */
export function truncateText(
  text: string, 
  maxLength: number = TELEGRAM_MAX_MESSAGE_LENGTH,
  suffix: string = '...'
): string {
  if (text.length <= maxLength) {
    return text;
  }
  
  const truncateLength = maxLength - suffix.length;
  return text.substring(0, truncateLength) + suffix;
}

/**
 * Format text with safe Markdown and truncation
 */
export function formatSafeMarkdown(
  text: string,
  options: {
    maxLength?: number;
    escapeMarkdown?: boolean;
    suffix?: string;
  } = {}
): string {
  const {
    maxLength = TELEGRAM_MAX_MESSAGE_LENGTH,
    escapeMarkdown: shouldEscape = true,
    suffix = '...'
  } = options;

  let formattedText = text;
  
  // Escape markdown if requested
  if (shouldEscape) {
    formattedText = escapeMarkdown(formattedText);
  }
  
  // Truncate if necessary
  formattedText = truncateText(formattedText, maxLength, suffix);
  
  return formattedText;
}

/**
 * Format a message with safe markdown, handling different content types
 */
export function formatMessage(
  content: string,
  type: 'message' | 'caption' = 'message'
): string {
  const maxLength = type === 'caption' 
    ? TELEGRAM_MAX_CAPTION_LENGTH 
    : TELEGRAM_MAX_MESSAGE_LENGTH;
    
  return formatSafeMarkdown(content, { maxLength });
}

/**
 * Format a search result with safe truncation
 */
export function formatSearchResult(
  title: string,
  content: string,
  maxContentLength: number = 200
): string {
  const safeTitle = escapeMarkdown(title);
  const safeContent = formatSafeMarkdown(content, { 
    maxLength: maxContentLength,
    escapeMarkdown: true 
  });
  
  return `*${safeTitle}*\n${safeContent}`;
}

/**
 * Format a summary with safe markdown
 */
export function formatSummary(
  summary: string,
  maxLength: number = 1000
): string {
  return formatSafeMarkdown(summary, { 
    maxLength,
    escapeMarkdown: true 
  });
}

/**
 * Format a list of items with safe markdown
 */
export function formatList(
  items: string[],
  options: {
    numbered?: boolean;
    maxItems?: number;
    maxItemLength?: number;
  } = {}
): string {
  const {
    numbered = false,
    maxItems = 10,
    maxItemLength = 100
  } = options;
  
  const limitedItems = items.slice(0, maxItems);
  
  const formattedItems = limitedItems.map((item, index) => {
    const safeItem = formatSafeMarkdown(item, { 
      maxLength: maxItemLength,
      escapeMarkdown: true 
    });
    
    const prefix = numbered ? `${index + 1}. ` : '• ';
    return `${prefix}${safeItem}`;
  });
  
  let result = formattedItems.join('\n');
  
  // Add "and X more" if items were truncated
  if (items.length > maxItems) {
    const remaining = items.length - maxItems;
    result += `\n_...and ${remaining} more_`;
  }
  
  return formatSafeMarkdown(result, { escapeMarkdown: false });
}

/**
 * Format code blocks with safe escaping
 */
export function formatCodeBlock(
  code: string,
  language: string = '',
  maxLength: number = 3000
): string {
  const truncatedCode = truncateText(code, maxLength);
  return `\`\`\`${language}\n${truncatedCode}\n\`\`\``;
}

/**
 * Format inline code with safe escaping
 */
export function formatInlineCode(code: string, maxLength: number = 100): string {
  const truncatedCode = truncateText(code, maxLength);
  return `\`${truncatedCode}\``;
}

/**
 * Format a URL with safe markdown
 */
export function formatUrl(url: string, title?: string): string {
  const safeUrl = escapeMarkdown(url);
  
  if (title) {
    const safeTitle = escapeMarkdown(title);
    return `[${safeTitle}](${safeUrl})`;
  }
  
  return safeUrl;
}

/**
 * Format bold text with safe escaping
 */
export function formatBold(text: string): string {
  const safeText = escapeMarkdown(text);
  return `*${safeText}*`;
}

/**
 * Format italic text with safe escaping
 */
export function formatItalic(text: string): string {
  const safeText = escapeMarkdown(text);
  return `_${safeText}_`;
}

/**
 * Format a quote with safe markdown
 */
export function formatQuote(text: string, maxLength: number = 500): string {
  const safeText = formatSafeMarkdown(text, { maxLength });
  return `> ${safeText}`;
}

/**
 * Split long messages into chunks that fit Telegram limits
 */
export function splitMessage(
  text: string,
  maxLength: number = TELEGRAM_MAX_MESSAGE_LENGTH
): string[] {
  if (text.length <= maxLength) {
    return [text];
  }
  
  const chunks: string[] = [];
  let currentChunk = '';
  
  // Split by paragraphs first
  const paragraphs = text.split('\n\n');
  
  for (const paragraph of paragraphs) {
    // If adding this paragraph would exceed the limit
    if (currentChunk.length + paragraph.length + 2 > maxLength) {
      // Save current chunk if it has content
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }
      
      // If the paragraph itself is too long, split it by sentences
      if (paragraph.length > maxLength) {
        const sentences = paragraph.split('. ');
        
        for (const sentence of sentences) {
          if (currentChunk.length + sentence.length + 2 > maxLength) {
            if (currentChunk.trim()) {
              chunks.push(currentChunk.trim());
              currentChunk = '';
            }
            
            // If even a single sentence is too long, truncate it
            if (sentence.length > maxLength) {
              chunks.push(truncateText(sentence, maxLength));
            } else {
              currentChunk = sentence + '. ';
            }
          } else {
            currentChunk += sentence + '. ';
          }
        }
      } else {
        currentChunk = paragraph + '\n\n';
      }
    } else {
      currentChunk += paragraph + '\n\n';
    }
  }
  
  // Add the last chunk if it has content
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks;
}

/**
 * Format error messages safely
 */
export function formatError(error: string): string {
  return `❌ ${formatSafeMarkdown(error, { maxLength: 500 })}`;
}

/**
 * Format success messages safely
 */
export function formatSuccess(message: string): string {
  return `✅ ${formatSafeMarkdown(message, { maxLength: 500 })}`;
}

/**
 * Format warning messages safely
 */
export function formatWarning(message: string): string {
  return `⚠️ ${formatSafeMarkdown(message, { maxLength: 500 })}`;
}

/**
 * Format info messages safely
 */
export function formatInfo(message: string): string {
  return `ℹ️ ${formatSafeMarkdown(message, { maxLength: 500 })}`;
}
