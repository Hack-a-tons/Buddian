import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import { pluginsConfig } from '@/config/env';
import { pluginLogger, logError } from '@/utils/logger';
import { BotContext } from '@/types';

// Simple plugin interfaces to avoid import issues
interface PluginCommand {
  name: string;
  description: string;
  usage: string;
  execute: (ctx: BotContext, args: string[]) => Promise<void>;
}

interface PluginContext {
  userId: string;
  chatId: string;
  messageId: string;
  language: string;
  timestamp: number;
  metadata: Record<string, any>;
}

interface PluginEvent {
  type: string;
  data: any;
  context: PluginContext;
  timestamp: number;
}

interface PluginInterface {
  getName(): string;
  getVersion(): string;
  getCommands(): PluginCommand[];
  initialize(): Promise<void>;
  onEvent(event: PluginEvent): Promise<void>;
  cleanup?(): Promise<void>;
}

interface LoadedPlugin {
  name: string;
  version: string;
  plugin: PluginInterface;
  commands: Map<string, PluginCommand>;
  active: boolean;
  lastUsed?: number;
  stats: {
    executions: number;
    errors: number;
    totalExecutionTime: number;
  };
}

class PluginManager {
  private plugins: Map<string, LoadedPlugin> = new Map();
  private pluginDirectory: string;
  private initialized = false;

  constructor() {
    this.pluginDirectory = pluginsConfig.directory;
  }

  /**
   * Initialize the plugin manager and discover plugins
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (!pluginsConfig.enabled) {
      pluginLogger.info('Plugin system disabled', { enabled: false });
      return;
    }

    try {
      await this.discoverPlugins();
      this.initialized = true;
      pluginLogger.info('Plugin manager initialized', { 
        pluginCount: this.plugins.size 
      });
    } catch (error) {
      logError(pluginLogger, error as Error, { 
        operation: 'plugin_manager_init' 
      });
    }
  }

  /**
   * Discover and load plugins from the plugin directory
   */
  private async discoverPlugins(): Promise<void> {
    try {
      // Check if plugin directory exists
      const pluginPath = join(process.cwd(), this.pluginDirectory);
      
      let pluginDirs: string[];
      try {
        pluginDirs = readdirSync(pluginPath).filter(dir => {
          const dirPath = join(pluginPath, dir);
          return statSync(dirPath).isDirectory();
        });
      } catch (error) {
        pluginLogger.info('Plugin directory not found, using basic plugin system', {
          directory: pluginPath
        });
        // Create a basic demo plugin if directory doesn't exist
        await this.createBasicDemoPlugin();
        return;
      }

      // Load each plugin
      for (const pluginDir of pluginDirs) {
        try {
          await this.loadPlugin(pluginDir);
        } catch (error) {
          logError(pluginLogger, error as Error, {
            operation: 'load_plugin',
            pluginDir
          });
        }
      }
    } catch (error) {
      logError(pluginLogger, error as Error, {
        operation: 'discover_plugins'
      });
    }
  }

  /**
   * Load a specific plugin
   */
  private async loadPlugin(pluginDir: string): Promise<void> {
    const pluginPath = join(process.cwd(), this.pluginDirectory, pluginDir);
    
    try {
      // Try to import the plugin
      const pluginModule = await import(pluginPath);
      const plugin: PluginInterface = pluginModule.default || pluginModule;

      if (!plugin || typeof plugin.getName !== 'function') {
        throw new Error(`Invalid plugin structure in ${pluginDir}`);
      }

      // Initialize plugin
      await plugin.initialize();

      // Create command map
      const commands = new Map<string, PluginCommand>();
      const pluginCommands = plugin.getCommands();
      
      pluginCommands.forEach(command => {
        commands.set(command.name, command);
      });

      // Register plugin
      const loadedPlugin: LoadedPlugin = {
        name: plugin.getName(),
        version: plugin.getVersion(),
        plugin,
        commands,
        active: true,
        stats: {
          executions: 0,
          errors: 0,
          totalExecutionTime: 0
        }
      };

      this.plugins.set(plugin.getName(), loadedPlugin);

      pluginLogger.info('Plugin loaded successfully', {
        name: plugin.getName(),
        version: plugin.getVersion(),
        commandCount: commands.size
      });

    } catch (error) {
      logError(pluginLogger, error as Error, {
        operation: 'load_plugin',
        pluginDir
      });
    }
  }

  /**
   * Create a basic demo plugin if no plugins directory exists
   */
  private async createBasicDemoPlugin(): Promise<void> {
    try {
      // Create a simple demo plugin
      const plugin: PluginInterface = {
        getName: () => 'Demo Plugin',
        getVersion: () => '1.0.0',
        getCommands: () => [
          {
            name: 'demo',
            description: 'Demo plugin command',
            usage: '/demo [message]',
            execute: async (ctx: BotContext, args: string[]) => {
              const message = args.length > 0 ? args.join(' ') : 'Hello from demo plugin!';
              await ctx.reply(`🔌 Demo Plugin: ${message}`);
            }
          }
        ],
        initialize: async () => {
          pluginLogger.info('Demo plugin initialized');
        },
        onEvent: async (event: PluginEvent) => {
          pluginLogger.debug('Demo plugin received event', { eventType: event.type });
        }
      };

      await plugin.initialize();

      const commands = new Map<string, PluginCommand>();
      const pluginCommands = plugin.getCommands();
      
      pluginCommands.forEach(command => {
        commands.set(command.name, command);
      });

      const loadedPlugin: LoadedPlugin = {
        name: plugin.getName(),
        version: plugin.getVersion(),
        plugin,
        commands,
        active: true,
        stats: {
          executions: 0,
          errors: 0,
          totalExecutionTime: 0
        }
      };

      this.plugins.set(plugin.getName(), loadedPlugin);

      pluginLogger.info('Demo plugin registered', {
        name: plugin.getName(),
        version: plugin.getVersion(),
        commandCount: commands.size
      });

    } catch (error) {
      logError(pluginLogger, error as Error, {
        operation: 'create_demo_plugin'
      });
    }
  }

  /**
   * Execute a plugin command
   */
  async executeCommand(
    commandName: string,
    ctx: BotContext,
    args: string[] = []
  ): Promise<boolean> {
    if (!this.initialized || !pluginsConfig.enabled) {
      return false;
    }

    // Find plugin that has this command
    for (const [pluginName, loadedPlugin] of this.plugins) {
      if (!loadedPlugin.active) {
        continue;
      }

      const command = loadedPlugin.commands.get(commandName);
      if (!command) {
        continue;
      }

      const startTime = Date.now();

      try {
        // Execute command with timeout
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Plugin command timeout')), pluginsConfig.timeout);
        });

        const executionPromise = command.execute(ctx, args);
        
        await Promise.race([executionPromise, timeoutPromise]);

        // Update stats
        const executionTime = Date.now() - startTime;
        loadedPlugin.stats.executions++;
        loadedPlugin.stats.totalExecutionTime += executionTime;
        loadedPlugin.lastUsed = Date.now();

        pluginLogger.info('Plugin command executed successfully', {
          plugin: pluginName,
          command: commandName,
          executionTime,
          args: args.length
        });

        return true;

      } catch (error) {
        const executionTime = Date.now() - startTime;
        loadedPlugin.stats.errors++;
        loadedPlugin.stats.totalExecutionTime += executionTime;

        logError(pluginLogger, error as Error, {
          operation: 'execute_plugin_command',
          plugin: pluginName,
          command: commandName,
          executionTime
        });

        // Send error message to user
        try {
          await ctx.reply(`❌ Plugin command failed: ${(error as Error).message}`);
        } catch (replyError) {
          logError(pluginLogger, replyError as Error, {
            operation: 'plugin_error_reply'
          });
        }

        return false;
      }
    }

    return false;
  }

  /**
   * Broadcast an event to all active plugins
   */
  async broadcastEvent(event: PluginEvent): Promise<void> {
    if (!this.initialized || !pluginsConfig.enabled) {
      return;
    }

    const promises: Promise<void>[] = [];

    for (const [pluginName, loadedPlugin] of this.plugins) {
      if (!loadedPlugin.active) {
        continue;
      }

      const promise = this.executePluginEvent(pluginName, loadedPlugin, event);
      promises.push(promise);
    }

    // Execute all plugin events in parallel
    await Promise.allSettled(promises);
  }

  /**
   * Execute an event on a specific plugin
   */
  private async executePluginEvent(
    pluginName: string,
    loadedPlugin: LoadedPlugin,
    event: PluginEvent
  ): Promise<void> {
    try {
      const timeoutPromise = new Promise<void>((_, reject) => {
        setTimeout(() => reject(new Error('Plugin event timeout')), pluginsConfig.timeout);
      });

      const eventPromise = loadedPlugin.plugin.onEvent(event);
      
      await Promise.race([eventPromise, timeoutPromise]);

    } catch (error) {
      logError(pluginLogger, error as Error, {
        operation: 'execute_plugin_event',
        plugin: pluginName,
        eventType: event.type
      });
    }
  }

  /**
   * Get list of available commands from all active plugins
   */
  getAvailableCommands(): Array<{ plugin: string; command: PluginCommand }> {
    const commands: Array<{ plugin: string; command: PluginCommand }> = [];

    for (const [pluginName, loadedPlugin] of this.plugins) {
      if (!loadedPlugin.active) {
        continue;
      }

      for (const command of loadedPlugin.commands.values()) {
        commands.push({ plugin: pluginName, command });
      }
    }

    return commands;
  }

  /**
   * Get plugin statistics
   */
  getPluginStats(): Array<{
    name: string;
    version: string;
    active: boolean;
    commandCount: number;
    stats: LoadedPlugin['stats'];
    lastUsed?: number;
  }> {
    return Array.from(this.plugins.values()).map(plugin => ({
      name: plugin.name,
      version: plugin.version,
      active: plugin.active,
      commandCount: plugin.commands.size,
      stats: plugin.stats,
      ...(plugin.lastUsed && { lastUsed: plugin.lastUsed })
    }));
  }

  /**
   * Enable or disable a plugin
   */
  setPluginActive(pluginName: string, active: boolean): boolean {
    const plugin = this.plugins.get(pluginName);
    if (!plugin) {
      return false;
    }

    plugin.active = active;
    
    pluginLogger.info(`Plugin ${active ? 'enabled' : 'disabled'}`, {
      plugin: pluginName
    });

    return true;
  }

  /**
   * Check if a command exists in any active plugin
   */
  hasCommand(commandName: string): boolean {
    for (const loadedPlugin of this.plugins.values()) {
      if (loadedPlugin.active && loadedPlugin.commands.has(commandName)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get plugin by name
   */
  getPlugin(pluginName: string): LoadedPlugin | undefined {
    return this.plugins.get(pluginName);
  }

  /**
   * Cleanup and shutdown all plugins
   */
  async shutdown(): Promise<void> {
    pluginLogger.info('Shutting down plugin manager', {
      pluginCount: this.plugins.size
    });

    const shutdownPromises: Promise<void>[] = [];

    for (const [pluginName, loadedPlugin] of this.plugins) {
      const promise = this.shutdownPlugin(pluginName, loadedPlugin);
      shutdownPromises.push(promise);
    }

    await Promise.allSettled(shutdownPromises);
    
    this.plugins.clear();
    this.initialized = false;
  }

  /**
   * Shutdown a specific plugin
   */
  private async shutdownPlugin(pluginName: string, loadedPlugin: LoadedPlugin): Promise<void> {
    try {
      if (typeof loadedPlugin.plugin.cleanup === 'function') {
        await loadedPlugin.plugin.cleanup();
      }
      
      pluginLogger.info('Plugin shutdown completed', {
        plugin: pluginName
      });
    } catch (error) {
      logError(pluginLogger, error as Error, {
        operation: 'shutdown_plugin',
        plugin: pluginName
      });
    }
  }
}

// Create singleton instance
export const pluginManager = new PluginManager();

// Export for testing
export { PluginManager, LoadedPlugin };
