import { BotContext } from '@/types';
import { messageService, userService, resourceService } from '@/services/convex';
import openaiService from '@/services/openai';
import languageUtils from '@/utils/language';
import { telegramLogger, logError, logUserAction } from '@/utils/logger';
import { pluginManager } from '@/plugins/manager';
import { formatSafeMarkdown, formatList, splitMessage } from '@/utils/formatting';

// Start command handler
export async function handleStart(ctx: BotContext): Promise<void> {
  const userId = ctx.from?.id.toString();
  const chatId = ctx.chat?.id.toString();
  
  if (!userId || !chatId) {
    return;
  }

  try {
    const user = await userService.getUser(parseInt(userId));
    const isNewUser = !user;
    
    const welcomeMessage = isNewUser 
      ? `🤖 Welcome to Buddian! I'm your AI-powered conversation assistant.

I can help you:
• 📝 Remember important decisions and action items
• 🔍 Search through your conversation history
• 📄 Analyze documents and images you share
• 🌐 Process web links and extract key information
• 💬 Answer questions based on our conversations
• 🌍 Translate messages between languages

Just start chatting naturally, and I'll learn from our conversations to provide better assistance over time!

Use /help to see all available commands.`
      : `👋 Welcome back! I'm ready to assist you with your conversations and documents.

Use /help to see what I can do for you.`;

    await ctx.reply(welcomeMessage);
    
    logUserAction(telegramLogger, userId, chatId, 'start_command', { isNewUser });
    
  } catch (error) {
    logError(telegramLogger, error as Error, {
      operation: 'start_command',
      userId,
      chatId
    });
    
    await ctx.reply('Welcome to Buddian! I encountered an issue, but I\'m ready to help you now.');
  }
}

// Help command handler
export async function handleHelp(ctx: BotContext): Promise<void> {
  let helpMessage = '🤖 **Buddian Commands & Features**\n\n';
  
  helpMessage += '**📋 Commands:**\n';
  const commands = [
    '/start \\- Get started with Buddian',
    '/help \\- Show this help message',
    '/search <query> \\- Search your conversation history',
    '/summary \\- Get a summary of recent conversations',
    '/translate <text> \\- Translate text to your preferred language',
    '/remind \\- Show pending action items',
    '/settings \\- Manage your preferences'
  ];
  helpMessage += formatList(commands, { numbered: false }) + '\n\n';
  
  helpMessage += '**🔧 Features:**\n';
  const features = [
    '**Smart Memory**: I automatically remember important decisions and action items from your conversations',
    '**Document Analysis**: Share PDFs, images, or documents and I\'ll extract and summarize the content',
    '**Web Content**: Send me URLs and I\'ll analyze the content for you',
    '**Question Answering**: Ask me questions about our previous conversations or shared content',
    '**Multilingual Support**: I can detect languages and translate content',
    '**Search**: Find specific information from your conversation history'
  ];
  helpMessage += formatList(features, { numbered: false }) + '\n\n';
  
  helpMessage += '**💡 Tips:**\n';
  const tips = [
    'Just chat naturally \\- I\'ll learn from our conversations',
    'Share documents or links for analysis',
    'Ask questions about previous conversations',
    'Use specific keywords when searching'
  ];
  helpMessage += formatList(tips, { numbered: false }) + '\n\n';
  
  helpMessage += '**🌍 Supported Languages:**\n';
  helpMessage += formatSafeMarkdown('I support 60+ languages including English, Spanish, French, German, Chinese, Japanese, Arabic, and many more!') + '\n\n';
  
  helpMessage += formatSafeMarkdown('Need help with something specific? Just ask me!');

  try {
    // Use splitMessage to handle long responses
    const messageChunks = splitMessage(helpMessage);
    
    for (const chunk of messageChunks) {
      await ctx.reply(chunk, { parse_mode: 'MarkdownV2' });
    }
    
    logUserAction(telegramLogger, ctx.from?.id.toString() || 'unknown', ctx.chat?.id.toString() || 'unknown', 'help_command');
    
  } catch (error) {
    logError(telegramLogger, error as Error, {
      operation: 'help_command',
      userId: ctx.from?.id.toString(),
      chatId: ctx.chat?.id.toString()
    });
    
    // Fallback without markdown - use formatSafeMarkdown to clean up
    const fallbackMessage = formatSafeMarkdown(helpMessage.replace(/\*\*/g, '').replace(/\\/g, ''));
    await ctx.reply(fallbackMessage);
  }
}

// Search command handler
export async function handleSearch(ctx: BotContext): Promise<void> {
  const userId = ctx.from?.id.toString();
  const chatId = ctx.chat?.id.toString();
  
  if (!userId || !chatId) {
    return;
  }

  // Extract search query from command
  const messageText = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
  const query = messageText.replace('/search', '').trim();
  
  if (!query) {
    await ctx.reply('Please provide a search query. Example: /search project deadline');
    return;
  }

  try {
    // Search messages
    const messageResults = await messageService.searchMessages(chatId, query, 10);
    
    // Search resources
    const resourceResults = await resourceService.searchResources(chatId, query, 5);
    
    if (messageResults.length === 0 && resourceResults.length === 0) {
      const noResultsMessage = formatSafeMarkdown(`🔍 No results found for "${query}". Try different keywords or check your spelling.`);
      await ctx.reply(noResultsMessage, { parse_mode: 'MarkdownV2' });
      return;
    }

    let responseMessage = formatSafeMarkdown(`🔍 **Search Results for "${query}":**`, { escapeMarkdown: false }) + '\n\n';
    
    // Add message results
    if (messageResults.length > 0) {
      responseMessage += '**💬 From Conversations:**\n';
      const messageItems = messageResults.slice(0, 5).map((result, index) => {
        const date = new Date(result.timestamp).toLocaleDateString();
        return `${formatSafeMarkdown(result.content, { maxLength: 100 })} _(${date})_`;
      });
      responseMessage += formatList(messageItems, { numbered: true, maxItems: 5 }) + '\n\n';
    }
    
    // Add resource results
    if (resourceResults.length > 0) {
      responseMessage += '**📄 From Documents:**\n';
      const resourceItems = resourceResults.map((result) => {
        return formatSafeMarkdown(result.content, { maxLength: 100 });
      });
      responseMessage += formatList(resourceItems, { numbered: true, maxItems: 5 }) + '\n\n';
    }
    
    // Use splitMessage to handle long responses
    const messageChunks = splitMessage(responseMessage);
    
    for (const chunk of messageChunks) {
      await ctx.reply(chunk, { parse_mode: 'MarkdownV2' });
    }
    
    logUserAction(telegramLogger, userId, chatId, 'search_command', {
      query,
      messageResults: messageResults.length,
      resourceResults: resourceResults.length
    });
    
  } catch (error) {
    logError(telegramLogger, error as Error, {
      operation: 'search_command',
      userId,
      chatId,
      query
    });
    
    await ctx.reply('Sorry, I encountered an error while searching. Please try again.');
  }
}

// Summary command handler
export async function handleSummary(ctx: BotContext): Promise<void> {
  const userId = ctx.from?.id.toString();
  const chatId = ctx.chat?.id.toString();
  
  if (!userId || !chatId) {
    return;
  }

  try {
    // Get recent messages
    const recentMessages = await messageService.getMessages(chatId, 50);
    
    if (recentMessages.length === 0) {
      await ctx.reply('No recent conversations to summarize. Start chatting and I\'ll be able to create summaries for you!');
      return;
    }

    const conversationText = recentMessages
      .map(msg => msg.content)
      .filter(content => content.length > 0)
      .join('\n\n');

    if (conversationText.length < 100) {
      await ctx.reply('Not enough conversation content to create a meaningful summary. Keep chatting!');
      return;
    }

    // Get user's language preference
    const userLanguage = await languageUtils.getUserLanguage(userId);
    
    // Generate summary
    const summary = await openaiService.summary.summarizeContent(
      conversationText,
      'conversation',
      userLanguage,
      1000
    );

    // Generate key points
    const keyPoints = await openaiService.summary.generateKeyPoints(conversationText, 5);

    let responseMessage = '📋 **Conversation Summary:**\n\n';
    responseMessage += formatSafeMarkdown(summary, { maxLength: 1000 });
    
    if (keyPoints.length > 0) {
      responseMessage += '\n\n**🔑 Key Points:**\n';
      responseMessage += formatList(keyPoints, { numbered: true, maxItems: 5 });
    }

    // Use splitMessage to handle long responses
    const messageChunks = splitMessage(responseMessage);
    
    for (const chunk of messageChunks) {
      await ctx.reply(chunk, { parse_mode: 'MarkdownV2' });
    }
    
    logUserAction(telegramLogger, userId, chatId, 'summary_command', {
      messageCount: recentMessages.length,
      summaryLength: summary.length,
      keyPointsCount: keyPoints.length
    });
    
  } catch (error) {
    logError(telegramLogger, error as Error, {
      operation: 'summary_command',
      userId,
      chatId
    });
    
    await ctx.reply('Sorry, I couldn\'t generate a summary right now. Please try again later.');
  }
}

// Translate command handler
export async function handleTranslate(ctx: BotContext): Promise<void> {
  const userId = ctx.from?.id.toString();
  const chatId = ctx.chat?.id.toString();
  
  if (!userId || !chatId) {
    return;
  }

  // Extract text to translate from command
  const messageText = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
  const textToTranslate = messageText.replace('/translate', '').trim();
  
  if (!textToTranslate) {
    await ctx.reply('Please provide text to translate. Example: /translate Hello, how are you?');
    return;
  }

  try {
    // Get user's language preference
    const userLanguage = await languageUtils.getUserLanguage(userId);
    
    // Detect source language
    const languageResult = await languageUtils.detectLanguage(textToTranslate);
    const sourceLanguage = languageResult.language;
    
    if (sourceLanguage === userLanguage) {
      const noTranslationMessage = formatSafeMarkdown(`The text appears to already be in ${languageUtils.getLanguageName(userLanguage)}. No translation needed!`);
      await ctx.reply(noTranslationMessage, { parse_mode: 'MarkdownV2' });
      return;
    }

    // Translate text
    const translatedText = await languageUtils.translateText(
      textToTranslate,
      userLanguage,
      sourceLanguage
    );

    let responseMessage = '🌐 **Translation:**\n\n';
    responseMessage += `**From ${formatSafeMarkdown(languageUtils.getLanguageName(sourceLanguage))}:**\n`;
    responseMessage += formatSafeMarkdown(textToTranslate, { maxLength: 1000 }) + '\n\n';
    responseMessage += `**To ${formatSafeMarkdown(languageUtils.getLanguageName(userLanguage))}:**\n`;
    responseMessage += formatSafeMarkdown(translatedText, { maxLength: 1000 });

    // Use splitMessage to handle long responses
    const messageChunks = splitMessage(responseMessage);
    
    for (const chunk of messageChunks) {
      await ctx.reply(chunk, { parse_mode: 'MarkdownV2' });
    }
    
    logUserAction(telegramLogger, userId, chatId, 'translate_command', {
      sourceLanguage,
      targetLanguage: userLanguage,
      textLength: textToTranslate.length
    });
    
  } catch (error) {
    logError(telegramLogger, error as Error, {
      operation: 'translate_command',
      userId,
      chatId,
      text: textToTranslate.substring(0, 100)
    });
    
    await ctx.reply('Sorry, I couldn\'t translate the text right now. Please try again.');
  }
}

// Remind command handler (show action items)
export async function handleRemind(ctx: BotContext): Promise<void> {
  const userId = ctx.from?.id.toString();
  const chatId = ctx.chat?.id.toString();
  
  if (!userId || !chatId) {
    return;
  }

  try {
    // Get recent messages with action items
    const recentMessages = await messageService.getMessages(chatId, 100);
    const actionItems = recentMessages
      .flatMap(msg => msg.actionItems || [])
      .filter(item => item.status === 'pending' || item.status === 'in_progress')
      .sort((a, b) => {
        // Sort by priority (high, medium, low) then by creation date
        const priorityOrder = { high: 3, medium: 2, low: 1 };
        const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
        return priorityDiff !== 0 ? priorityDiff : b.createdAt - a.createdAt;
      });

    if (actionItems.length === 0) {
      await ctx.reply('🎉 No pending action items! You\'re all caught up.');
      return;
    }

    let responseMessage = '📋 **Pending Action Items:**\n\n';
    
    const actionItemsList = actionItems.slice(0, 10).map((item, index) => {
      const priorityEmoji = item.priority === 'high' ? '🔴' : item.priority === 'medium' ? '🟡' : '🟢';
      const statusEmoji = item.status === 'in_progress' ? '⏳' : '⏸️';
      const assigneeText = item.assignee ? ` (${formatSafeMarkdown(item.assignee)})` : '';
      
      const title = formatSafeMarkdown(item.title, { maxLength: 100 });
      const description = formatSafeMarkdown(item.description, { maxLength: 200 });
      
      return `${priorityEmoji} ${statusEmoji} **${title}**${assigneeText}\n   ${description}`;
    });

    responseMessage += formatList(actionItemsList, { numbered: true, maxItems: 10 });

    if (actionItems.length > 10) {
      responseMessage += `\n\n_\\.\\.\\. and ${actionItems.length - 10} more items_`;
    }

    responseMessage += '\n\n💡 **Tip:** I automatically extract action items from your conversations\\. Keep discussing your tasks and I\'ll help you track them\\!';

    // Use splitMessage to handle long responses
    const messageChunks = splitMessage(responseMessage);
    
    for (const chunk of messageChunks) {
      await ctx.reply(chunk, { parse_mode: 'MarkdownV2' });
    }
    
    logUserAction(telegramLogger, userId, chatId, 'remind_command', {
      actionItemsCount: actionItems.length
    });
    
  } catch (error) {
    logError(telegramLogger, error as Error, {
      operation: 'remind_command',
      userId,
      chatId
    });
    
    await ctx.reply('Sorry, I couldn\'t retrieve your action items right now. Please try again.');
  }
}

// Settings command handler
export async function handleSettings(ctx: BotContext): Promise<void> {
  const userId = ctx.from?.id.toString();
  const chatId = ctx.chat?.id.toString();
  
  if (!userId || !chatId) {
    return;
  }

  try {
    const user = await userService.getUser(parseInt(userId));
    
    if (!user) {
      await ctx.reply('Please use /start first to set up your account.');
      return;
    }

    const { preferences } = user;
    const languageName = languageUtils.getLanguageName(preferences.language);

    const settingsMessage = `⚙️ **Your Settings:**

**🌍 Language:** ${languageName} (${preferences.language})
**🕐 Timezone:** ${preferences.timezone}
**🔔 Notifications:** ${preferences.notifications ? 'Enabled' : 'Disabled'}
**⏰ Reminder Frequency:** ${preferences.reminderFrequency}
**📊 Summary Frequency:** ${preferences.summaryFrequency}

**🔧 Available Languages:**
${languageUtils.getSupportedLanguages().slice(0, 10).map(lang => `• ${lang.name} (${lang.code})`).join('\n')}
_... and 50+ more languages_

**💡 To change settings:**
• Language: Send me a message in your preferred language and I'll detect it
• Notifications: Contact support for advanced settings
• For other preferences, just let me know what you'd like to change!`;

    await ctx.reply(settingsMessage, { parse_mode: 'Markdown' });
    
    logUserAction(telegramLogger, userId, chatId, 'settings_command');
    
  } catch (error) {
    logError(telegramLogger, error as Error, {
      operation: 'settings_command',
      userId,
      chatId
    });
    
    await ctx.reply('Sorry, I couldn\'t load your settings right now. Please try again.');
  }
}

// Ping command handler (for health checks)
export async function handlePing(ctx: BotContext): Promise<void> {
  try {
    const startTime = Date.now();
    
    // Test database connection
    const dbHealthy = await messageService.getMessages(ctx.chat?.id.toString() || '0', 1)
      .then(() => true)
      .catch(() => false);
    
    // Test AI service
    const aiHealthy = await openaiService.health.checkConnection();
    
    const responseTime = Date.now() - startTime;
    
    const statusMessage = `🏓 **Pong!**

**Response Time:** ${responseTime}ms
**Database:** ${dbHealthy ? '✅ Healthy' : '❌ Unhealthy'}
**AI Service:** ${aiHealthy ? '✅ Healthy' : '❌ Unhealthy'}
**Status:** ${dbHealthy && aiHealthy ? '🟢 All systems operational' : '🟡 Some issues detected'}`;

    await ctx.reply(statusMessage, { parse_mode: 'Markdown' });
    
    logUserAction(telegramLogger, ctx.from?.id.toString() || 'unknown', ctx.chat?.id.toString() || 'unknown', 'ping_command', {
      responseTime,
      dbHealthy,
      aiHealthy
    });
    
  } catch (error) {
    logError(telegramLogger, error as Error, {
      operation: 'ping_command',
      userId: ctx.from?.id.toString(),
      chatId: ctx.chat?.id.toString()
    });
    
    await ctx.reply('🏓 Pong! (But I encountered some issues checking system health)');
  }
}

// Plugins command handler (list available plugin commands)
export async function handlePlugins(ctx: BotContext): Promise<void> {
  const userId = ctx.from?.id.toString();
  const chatId = ctx.chat?.id.toString();
  
  if (!userId || !chatId) {
    return;
  }

  try {
    const availableCommands = pluginManager.getAvailableCommands();
    const pluginStats = pluginManager.getPluginStats();
    
    if (availableCommands.length === 0) {
      await ctx.reply('🔌 No plugins are currently loaded. Plugin system may be disabled or no plugins are available.');
      return;
    }

    let responseMessage = `🔌 **Available Plugin Commands:**\n\n`;
    
    // Group commands by plugin
    const commandsByPlugin = new Map<string, typeof availableCommands>();
    availableCommands.forEach(({ plugin, command }, _index) => {
      if (!commandsByPlugin.has(plugin)) {
        commandsByPlugin.set(plugin, []);
      }
      commandsByPlugin.get(plugin)!.push({ plugin, command });
    });

    // Display commands grouped by plugin
    for (const [pluginName, commands] of commandsByPlugin) {
      const pluginStat = pluginStats.find(stat => stat.name === pluginName);
      const statusEmoji = pluginStat?.active ? '✅' : '❌';
      
      responseMessage += `**${statusEmoji} ${pluginName}** (v${pluginStat?.version || 'unknown'})\n`;
      
      commands.forEach(({ command }) => {
        responseMessage += `• \`/${command.name}\` - ${command.description}\n`;
        if (command.usage && command.usage !== `/${command.name}`) {
          responseMessage += `  Usage: \`${command.usage}\`\n`;
        }
      });
      
      responseMessage += '\n';
    }

    // Add plugin statistics
    if (pluginStats.length > 0) {
      responseMessage += `**📊 Plugin Statistics:**\n`;
      pluginStats.forEach((stat, _index) => {
        const statusEmoji = stat.active ? '✅' : '❌';
        responseMessage += `${statusEmoji} **${stat.name}**: ${stat.stats.executions} executions, ${stat.commandCount} commands\n`;
      });
    }

    responseMessage += `\n💡 **Tip:** Use any plugin command by typing \`/commandname\`. Plugin commands are processed automatically!`;

    await ctx.reply(responseMessage, { parse_mode: 'Markdown' });
    
    logUserAction(telegramLogger, userId, chatId, 'plugins_command', {
      availableCommands: availableCommands.length,
      activePlugins: pluginStats.filter(stat => stat.active).length,
      totalPlugins: pluginStats.length
    });
    
  } catch (error) {
    logError(telegramLogger, error as Error, {
      operation: 'plugins_command',
      userId,
      chatId
    });
    
    await ctx.reply('Sorry, I couldn\'t load plugin information right now. Please try again.');
  }
}

// Export all command handlers
export default {
  start: handleStart,
  help: handleHelp,
  search: handleSearch,
  summary: handleSummary,
  translate: handleTranslate,
  remind: handleRemind,
  settings: handleSettings,
  ping: handlePing,
  plugins: handlePlugins
};
