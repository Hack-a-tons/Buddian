import { Context } from 'telegraf';
import { Message } from 'telegraf/typings/core/types/typegram';
import { messageService, userService, resourceService } from '@/services/convex';
import openaiService from '@/services/openai';
import contentAnalyzer from '@/services/content-analyzer';
import languageUtils from '@/utils/language';
import { telegramLogger, logError, logMessageProcessing, logUserAction } from '@/utils/logger';
import { pluginManager } from '@/plugins/manager';
import { 
  BotContext, 
  Message as BuddianMessage, 
  User as BuddianUser,
  Resource,
  Decision,
  ActionItem,
  BuddianError 
} from '@/types';

// Message type mapping
const getMessageType = (message: Message): BuddianMessage['messageType'] => {
  if ('photo' in message) return 'photo';
  if ('document' in message) return 'document';
  if ('voice' in message) return 'voice';
  if ('video' in message) return 'video';
  if ('sticker' in message) return 'sticker';
  if ('location' in message) return 'location';
  return 'text';
};

// Extract text content from different message types
const extractMessageContent = (message: Message): string => {
  if ('text' in message) return message.text;
  if ('caption' in message && message.caption) return message.caption;
  if ('sticker' in message) return `[Sticker: ${message.sticker.emoji || 'sticker'}]`;
  if ('location' in message) return `[Location: ${message.location.latitude}, ${message.location.longitude}]`;
  if ('voice' in message) return '[Voice message]';
  if ('video' in message) return '[Video message]';
  if ('photo' in message) return '[Photo]';
  if ('document' in message) return `[Document: ${message.document.file_name || 'file'}]`;
  return '[Unknown message type]';
};

// Get file info from message
const getFileInfo = (message: Message): { fileId?: string; fileName?: string; mimeType?: string; fileSize?: number } => {
  if ('document' in message) {
    return {
      fileId: message.document.file_id,
      fileName: message.document.file_name,
      mimeType: message.document.mime_type,
      fileSize: message.document.file_size
    };
  }
  
  if ('photo' in message) {
    const photo = message.photo[message.photo.length - 1]; // Get largest photo
    return {
      fileId: photo.file_id,
      fileName: `photo_${Date.now()}.jpg`,
      mimeType: 'image/jpeg',
      fileSize: photo.file_size
    };
  }
  
  if ('voice' in message) {
    return {
      fileId: message.voice.file_id,
      fileName: `voice_${Date.now()}.ogg`,
      mimeType: message.voice.mime_type,
      fileSize: message.voice.file_size
    };
  }
  
  if ('video' in message) {
    return {
      fileId: message.video.file_id,
      fileName: message.video.file_name || `video_${Date.now()}.mp4`,
      mimeType: message.video.mime_type,
      fileSize: message.video.file_size
    };
  }
  
  return {};
};

// Main message handler
export async function handleMessage(ctx: BotContext): Promise<void> {
  const message = ctx.message;
  if (!message || !('from' in message) || !message.from) {
    return;
  }

  const chatId = message.chat.id.toString();
  const userId = message.from.id.toString();
  const messageId = message.message_id.toString();
  
  logMessageProcessing(
    telegramLogger,
    messageId,
    chatId,
    userId,
    getMessageType(message),
    'received'
  );

  try {
    // Get or create user
    let user = await userService.getUser(message.from.id);
    if (!user) {
      user = await createUserFromTelegram(message.from);
    }
    
    // Update user's last activity
    await userService.updateLastActive(user.id);
    
    // Extract message content
    const content = extractMessageContent(message);
    const messageType = getMessageType(message);
    
    // Detect language
    let detectedLanguage = 'en';
    if (content && content.length > 10) {
      try {
        const languageResult = await languageUtils.detectLanguage(content);
        detectedLanguage = languageResult.language;
      } catch (error) {
        logError(telegramLogger, error as Error, { 
          operation: 'language_detection',
          messageId,
          chatId 
        });
      }
    }
    
    // Create message object
    const buddianMessage: Omit<BuddianMessage, 'id'> = {
      chatId,
      userId: user.id,
      content,
      timestamp: (message.date || Date.now() / 1000) * 1000,
      language: detectedLanguage,
      messageType,
      metadata: {
        telegramMessageId: message.message_id,
        telegramUserId: message.from.id,
        telegramChatId: message.chat.id,
        ...getFileInfo(message)
      }
    };
    
    // Store message in database
    const storedMessageId = await messageService.storeMessage(buddianMessage);
    
    logMessageProcessing(
      telegramLogger,
      messageId,
      chatId,
      userId,
      messageType,
      'stored',
      { storedMessageId }
    );
    
    // Set context for further processing
    ctx.user = user;
    ctx.language = detectedLanguage;
    
    // Broadcast message event to plugins
    try {
      await pluginManager.broadcastEvent({
        type: 'message_received',
        data: { ...buddianMessage, id: storedMessageId },
        context: { userId: user.id, chatId, language: detectedLanguage },
        timestamp: Date.now()
      });
    } catch (error) {
      logError(telegramLogger, error as Error, {
        operation: 'plugin_event_broadcast',
        messageId,
        eventType: 'message_received'
      });
    }
    
    // Process different message types
    await processMessageContent(ctx, storedMessageId, buddianMessage);
    
    // Extract decisions and action items from recent conversation
    await extractDecisionsAndActions(ctx, storedMessageId, chatId);
    
    // Handle questions or commands
    await handleQuestionOrCommand(ctx, content, chatId, user.id);
    
    logMessageProcessing(
      telegramLogger,
      messageId,
      chatId,
      userId,
      messageType,
      'completed'
    );
    
  } catch (error) {
    logError(telegramLogger, error as Error, {
      operation: 'message_handling',
      messageId,
      chatId,
      userId
    });
    
    // Send error message to user
    try {
      await ctx.reply('Sorry, I encountered an error processing your message. Please try again.');
    } catch (replyError) {
      logError(telegramLogger, replyError as Error, { 
        operation: 'error_reply',
        messageId 
      });
    }
  }
}

// Create user from Telegram user info
async function createUserFromTelegram(telegramUser: any): Promise<BuddianUser> {
  const userId = await userService.createUser({
    telegramId: telegramUser.id,
    firstName: telegramUser.first_name,
    lastName: telegramUser.last_name,
    username: telegramUser.username,
    languageCode: telegramUser.language_code,
    preferences: {
      language: telegramUser.language_code || 'en',
      timezone: 'UTC',
      notifications: true,
      reminderFrequency: 'daily',
      summaryFrequency: 'weekly',
      pluginsEnabled: []
    }
  });
  
  const user = await userService.getUserById(userId);
  if (!user) {
    throw new BuddianError('Failed to create user', 'USER_CREATION_ERROR');
  }
  
  logUserAction(telegramLogger, userId, telegramUser.id.toString(), 'user_created', {
    firstName: telegramUser.first_name,
    username: telegramUser.username
  });
  
  return user;
}

// Process message content based on type
async function processMessageContent(
  ctx: BotContext,
  messageId: string,
  message: Omit<BuddianMessage, 'id'>
): Promise<void> {
  const { messageType, metadata } = message;
  
  try {
    switch (messageType) {
      case 'photo':
      case 'document':
        await processFileMessage(ctx, messageId, message);
        break;
        
      case 'text':
        await processTextMessage(ctx, messageId, message);
        break;
        
      case 'voice':
      case 'video':
        // For now, just acknowledge these message types
        // In a full implementation, we'd transcribe audio/video
        logMessageProcessing(
          telegramLogger,
          messageId,
          message.chatId,
          message.userId,
          messageType,
          'acknowledged'
        );
        break;
        
      default:
        logMessageProcessing(
          telegramLogger,
          messageId,
          message.chatId,
          message.userId,
          messageType,
          'unsupported'
        );
    }
  } catch (error) {
    logError(telegramLogger, error as Error, {
      operation: 'message_content_processing',
      messageId,
      messageType
    });
  }
}

// Process file messages (photos, documents)
async function processFileMessage(
  ctx: BotContext,
  messageId: string,
  message: Omit<BuddianMessage, 'id'>
): Promise<void> {
  const { metadata } = message;
  const fileId = metadata?.fileId;
  const fileName = metadata?.fileName;
  const mimeType = metadata?.mimeType;
  
  if (!fileId || !fileName) {
    return;
  }
  
  try {
    // Get file URL from Telegram (secure method)
    const fileUrl = await ctx.telegram.getFileLink(fileId);
    
    // Download file
    const fileBuffer = await contentAnalyzer.download.downloadFile(fileUrl.href);
    
    // Determine content type
    const contentType = contentAnalyzer.detectContentType(fileName, mimeType);
    
    let analysisResult;
    let resourceType: Resource['type'] = 'pdf'; // Default
    
    // Analyze content based on type
    switch (contentType) {
      case 'pdf':
        analysisResult = await contentAnalyzer.analyzer.analyzeContent(fileBuffer, 'pdf', fileName);
        resourceType = 'pdf';
        break;
        
      case 'image':
        analysisResult = await contentAnalyzer.analyzer.analyzeContent(fileBuffer, 'image', fileName);
        resourceType = 'image';
        break;
        
      default:
        // For unsupported file types, create basic resource
        analysisResult = {
          content: `File: ${fileName}`,
          summary: `Uploaded file: ${fileName}`,
          language: 'unknown',
          metadata: {
            mimeType: mimeType || 'application/octet-stream',
            size: fileBuffer.length
          }
        };
        resourceType = 'pdf'; // Default for unknown types
    }
    
    // Store resource
    const resource: Omit<Resource, 'id'> = {
      type: resourceType,
      filename: fileName,
      content: analysisResult.content,
      summary: analysisResult.summary,
      metadata: analysisResult.metadata,
      extractedAt: Date.now(),
      chatId: message.chatId,
      userId: message.userId
    };
    
    const resourceId = await resourceService.storeResource(resource);
    
      logMessageProcessing(
        telegramLogger,
        messageId,
        message.chatId,
        message.userId,
        'file_processed',
        'completed',
        { resourceId, fileName, contentType }
      );
    
    // Send confirmation to user
    const confirmationMessage = `✅ File processed: ${fileName}\n📄 ${analysisResult.summary}`;
    await ctx.reply(confirmationMessage);
    
  } catch (error) {
    logError(telegramLogger, error as Error, {
      operation: 'file_processing',
      messageId,
      fileName
    });
    
    await ctx.reply(`❌ Sorry, I couldn't process the file "${fileName}". Please try again.`);
  }
}

// Process text messages
async function processTextMessage(
  ctx: BotContext,
  messageId: string,
  message: Omit<BuddianMessage, 'id'>
): Promise<void> {
  const { content } = message;
  
  // Check if message contains URLs
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const urls = content.match(urlRegex);
  
  if (urls && urls.length > 0) {
    await processUrlsInMessage(ctx, messageId, message, urls);
  }
  
  logMessageProcessing(
    telegramLogger,
    messageId,
    message.chatId,
    message.userId,
    'text',
    'processed'
  );
}

// Process URLs found in messages
async function processUrlsInMessage(
  ctx: BotContext,
  messageId: string,
  message: Omit<BuddianMessage, 'id'>,
  urls: string[]
): Promise<void> {
  for (const url of urls) {
    try {
      const analysisResult = await contentAnalyzer.analyzer.analyzeContent(url, 'url');
      
      const resource: Omit<Resource, 'id'> = {
        type: 'url',
        url,
        content: analysisResult.content,
        summary: analysisResult.summary,
        metadata: analysisResult.metadata,
        extractedAt: Date.now(),
        chatId: message.chatId,
        userId: message.userId
      };
      
      await resourceService.storeResource(resource);
      
      logMessageProcessing(
        telegramLogger,
        messageId,
        message.chatId,
        message.userId,
        'url_processed',
        'completed',
        { url: url.substring(0, 100) }
      );
      
    } catch (error) {
      logError(telegramLogger, error as Error, {
        operation: 'url_processing',
        messageId,
        url: url.substring(0, 100)
      });
    }
  }
}

// Extract decisions and action items from conversation
async function extractDecisionsAndActions(
  ctx: BotContext,
  messageId: string,
  chatId: string
): Promise<void> {
  try {
    // Get recent messages for context
    const recentMessages = await messageService.getMessages(chatId, 10);
    const messageTexts = recentMessages.map(msg => msg.content).filter(content => content.length > 0);
    
    if (messageTexts.length < 3) {
      return; // Not enough context for extraction
    }
    
    // Extract decisions
    const decisions = await openaiService.decision.extractDecisions(messageTexts);
    if (decisions.length > 0) {
      await messageService.updateMessageDecisions(messageId, decisions);
      
      logMessageProcessing(
        telegramLogger,
        messageId,
        chatId,
        ctx.user?.id || 'unknown',
        'decisions_extracted',
        'completed',
        { decisionsCount: decisions.length }
      );
    }
    
    // Extract action items
    const actionItems = await openaiService.actionItem.extractActionItems(messageTexts);
    if (actionItems.length > 0) {
      await messageService.updateMessageActionItems(messageId, actionItems);
      
      logMessageProcessing(
        telegramLogger,
        messageId,
        chatId,
        ctx.user?.id || 'unknown',
        'actions_extracted',
        'completed',
        { actionItemsCount: actionItems.length }
      );
    }
    
  } catch (error) {
    logError(telegramLogger, error as Error, {
      operation: 'decision_action_extraction',
      messageId,
      chatId
    });
  }
}

// Handle questions or commands in messages
async function handleQuestionOrCommand(
  ctx: BotContext,
  content: string,
  chatId: string,
  userId: string
): Promise<void> {
  // Check if message is a question
  const questionIndicators = ['?', 'what', 'how', 'why', 'when', 'where', 'who', 'which'];
  const isQuestion = questionIndicators.some(indicator => 
    content.toLowerCase().includes(indicator)
  );
  
  if (!isQuestion || content.length < 10) {
    return;
  }
  
  try {
    // Get conversation context
    const recentMessages = await messageService.getMessages(chatId, 20);
    const contextMessages = recentMessages.map(msg => msg.content);
    
    // Search for relevant resources
    const searchResults = await messageService.searchMessages(chatId, content, 10);
    const contextFromSearch = searchResults.map(result => result.content);
    
    // Generate answer
    const answer = await openaiService.qa.answerQuestion(
      content,
      contextFromSearch,
      contextMessages,
      ctx.language
    );
    
    if (answer && answer.length > 10) {
      // Import formatting utilities
      const { formatSafeMarkdown, splitMessage } = await import('@/utils/formatting');
      
      // Format the answer safely
      const formattedAnswer = formatSafeMarkdown(answer, { maxLength: 3000 });
      
      // Use splitMessage to handle long responses
      const messageChunks = splitMessage(formattedAnswer);
      
      for (const chunk of messageChunks) {
        await ctx.reply(chunk, { parse_mode: 'MarkdownV2' });
      }
      
      logUserAction(telegramLogger, userId, chatId, 'question_answered', {
        question: content.substring(0, 100),
        answerLength: answer.length
      });
    }
    
  } catch (error) {
    logError(telegramLogger, error as Error, {
      operation: 'question_handling',
      chatId,
      userId,
      question: content.substring(0, 100)
    });
  }
}

// Export the main handler
export default handleMessage;
