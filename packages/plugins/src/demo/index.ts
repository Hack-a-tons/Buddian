import axios from 'axios';
import {
  BuddianPlugin,
  PluginContext,
  PluginResult,
  PluginEvent,
  DataIngestionConfig,
  PluginMetadata,
  PluginConfig,
  PluginExecutionError
} from '../interface';

/**
 * Demo Weather Plugin
 * 
 * This plugin demonstrates how to create a Buddian plugin that:
 * - Integrates with external APIs (OpenWeatherMap)
 * - Provides commands for users
 * - Handles data ingestion
 * - Follows MCP/A2A protocol standards
 */
export class WeatherPlugin implements BuddianPlugin {
  readonly metadata: PluginMetadata = {
    id: 'weather-demo',
    name: 'Weather Demo Plugin',
    version: '1.0.0',
    description: 'A demo plugin that provides weather information using OpenWeatherMap API',
    author: 'Buddian Team',
    homepage: 'https://github.com/buddian/plugins/weather-demo',
    license: 'MIT',
    tags: ['weather', 'api', 'demo'],
    minBuddianVersion: '1.0.0'
  };

  readonly config: PluginConfig = {
    commands: [
      {
        name: 'weather',
        description: 'Get current weather for a city',
        usage: '/weather <city>',
        parameters: [
          {
            name: 'city',
            type: 'string',
            required: true,
            description: 'Name of the city to get weather for',
            validation: {
              min: 2,
              max: 100
            }
          },
          {
            name: 'units',
            type: 'string',
            required: false,
            description: 'Temperature units (metric, imperial, kelvin)',
            default: 'metric',
            validation: {
              enum: ['metric', 'imperial', 'kelvin']
            }
          }
        ],
        examples: [
          '/weather London',
          '/weather New York imperial',
          '/weather Tokyo metric'
        ],
        category: 'information'
      },
      {
        name: 'forecast',
        description: 'Get 5-day weather forecast for a city',
        usage: '/forecast <city>',
        parameters: [
          {
            name: 'city',
            type: 'string',
            required: true,
            description: 'Name of the city to get forecast for'
          },
          {
            name: 'days',
            type: 'number',
            required: false,
            description: 'Number of days (1-5)',
            default: 3,
            validation: {
              min: 1,
              max: 5
            }
          }
        ],
        examples: [
          '/forecast Paris',
          '/forecast Berlin 5'
        ],
        category: 'information'
      }
    ],
    permissions: [
      'network.http',
      'storage.read',
      'storage.write'
    ],
    settings: {
      apiKey: '',
      defaultUnits: 'metric',
      cacheTimeout: 300000, // 5 minutes
      maxRequestsPerHour: 1000
    },
    rateLimit: {
      requests: 60,
      window: 60000 // 1 minute
    },
    timeout: 10000 // 10 seconds
  };

  private apiKey: string = '';
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private requestCount: number = 0;
  private lastHourReset: number = Date.now();

  async activate(context: PluginContext): Promise<void> {
    console.log(`[WeatherPlugin] Activating plugin for user ${context.userId}`);
    
    // Get API key from settings
    this.apiKey = this.config.settings.apiKey as string;
    
    if (!this.apiKey) {
      throw new PluginExecutionError(
        'OpenWeatherMap API key not configured',
        this.metadata.id,
        { context }
      );
    }

    // Initialize cache cleanup interval
    setInterval(() => this.cleanupCache(), 60000); // Clean every minute
    
    console.log(`[WeatherPlugin] Plugin activated successfully`);
  }

  async deactivate(context: PluginContext): Promise<void> {
    console.log(`[WeatherPlugin] Deactivating plugin for user ${context.userId}`);
    
    // Clear cache
    this.cache.clear();
    
    console.log(`[WeatherPlugin] Plugin deactivated successfully`);
  }

  async executeCommand(
    command: string,
    parameters: Record<string, any>,
    context: PluginContext
  ): Promise<PluginResult> {
    try {
      // Check rate limiting
      if (!this.checkRateLimit()) {
        return {
          success: false,
          error: 'Rate limit exceeded. Please try again later.',
          metadata: { rateLimited: true }
        };
      }

      switch (command) {
        case 'weather':
          return await this.getCurrentWeather(parameters, context);
        
        case 'forecast':
          return await this.getWeatherForecast(parameters, context);
        
        default:
          return {
            success: false,
            error: `Unknown command: ${command}`,
            metadata: { availableCommands: this.config.commands.map(c => c.name) }
          };
      }
    } catch (error) {
      console.error(`[WeatherPlugin] Command execution error:`, error);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        metadata: { command, parameters, context: context.chatId }
      };
    }
  }

  async handleEvent(event: PluginEvent): Promise<void> {
    console.log(`[WeatherPlugin] Handling event: ${event.type}`);
    
    switch (event.type) {
      case 'message_received':
        // Check if message contains weather-related keywords
        const message = event.data.content?.toLowerCase() || '';
        const weatherKeywords = ['weather', 'temperature', 'forecast', 'rain', 'sunny', 'cloudy'];
        
        if (weatherKeywords.some(keyword => message.includes(keyword))) {
          console.log(`[WeatherPlugin] Weather-related message detected`);
          // Could trigger proactive weather suggestions here
        }
        break;
        
      case 'scheduled_task':
        // Handle scheduled weather updates
        await this.handleScheduledWeatherUpdate(event.data);
        break;
    }
  }

  async ingestData(config: DataIngestionConfig): Promise<PluginResult> {
    console.log(`[WeatherPlugin] Ingesting data from: ${config.source}`);
    
    try {
      switch (config.type) {
        case 'api':
          return await this.ingestFromAPI(config);
        
        case 'webhook':
          return await this.handleWebhook(config);
        
        default:
          return {
            success: false,
            error: `Unsupported ingestion type: ${config.type}`
          };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Data ingestion failed',
        metadata: { config }
      };
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      // Test API connectivity
      const response = await axios.get(
        `https://api.openweathermap.org/data/2.5/weather?q=London&appid=${this.apiKey}`,
        { timeout: 5000 }
      );
      
      return response.status === 200;
    } catch (error) {
      console.error(`[WeatherPlugin] Health check failed:`, error);
      return false;
    }
  }

  async validateConfig(config: any): Promise<boolean> {
    try {
      // Validate API key
      if (!config.settings?.apiKey) {
        return false;
      }

      // Test API key
      const response = await axios.get(
        `https://api.openweathermap.org/data/2.5/weather?q=London&appid=${config.settings.apiKey}`,
        { timeout: 5000 }
      );
      
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }

  async cleanup(): Promise<void> {
    console.log(`[WeatherPlugin] Cleaning up resources`);
    this.cache.clear();
  }

  // Private helper methods

  private async getCurrentWeather(
    parameters: Record<string, any>,
    context: PluginContext
  ): Promise<PluginResult> {
    const { city, units = 'metric' } = parameters;
    
    if (!city) {
      return {
        success: false,
        error: 'City parameter is required'
      };
    }

    // Check cache first
    const cacheKey = `weather:${city}:${units}`;
    const cached = this.getCachedData(cacheKey);
    
    if (cached) {
      return {
        success: true,
        data: cached,
        message: `Current weather in ${city} (cached)`,
        metadata: { cached: true, city, units }
      };
    }

    try {
      const response = await axios.get(
        `https://api.openweathermap.org/data/2.5/weather`,
        {
          params: {
            q: city,
            appid: this.apiKey,
            units
          },
          timeout: this.config.timeout
        }
      );

      const weatherData = {
        city: response.data.name,
        country: response.data.sys.country,
        temperature: response.data.main.temp,
        description: response.data.weather[0].description,
        humidity: response.data.main.humidity,
        windSpeed: response.data.wind.speed,
        units
      };

      // Cache the result
      this.setCachedData(cacheKey, weatherData);

      return {
        success: true,
        data: weatherData,
        message: `Current weather in ${weatherData.city}, ${weatherData.country}: ${weatherData.temperature}° ${this.getUnitsSymbol(units)}, ${weatherData.description}`,
        metadata: { city, units, cached: false }
      };

    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) {
          return {
            success: false,
            error: `City "${city}" not found`
          };
        }
        
        if (error.response?.status === 401) {
          return {
            success: false,
            error: 'Invalid API key'
          };
        }
      }

      throw new PluginExecutionError(
        `Failed to fetch weather data: ${error instanceof Error ? error.message : 'Unknown error'}`,
        this.metadata.id,
        { city, units }
      );
    }
  }

  private async getWeatherForecast(
    parameters: Record<string, any>,
    context: PluginContext
  ): Promise<PluginResult> {
    const { city, days = 3 } = parameters;
    
    if (!city) {
      return {
        success: false,
        error: 'City parameter is required'
      };
    }

    const cacheKey = `forecast:${city}:${days}`;
    const cached = this.getCachedData(cacheKey);
    
    if (cached) {
      return {
        success: true,
        data: cached,
        message: `${days}-day forecast for ${city} (cached)`,
        metadata: { cached: true, city, days }
      };
    }

    try {
      const response = await axios.get(
        `https://api.openweathermap.org/data/2.5/forecast`,
        {
          params: {
            q: city,
            appid: this.apiKey,
            units: 'metric'
          },
          timeout: this.config.timeout
        }
      );

      const forecastData = {
        city: response.data.city.name,
        country: response.data.city.country,
        forecast: response.data.list
          .slice(0, days * 8) // 8 forecasts per day (every 3 hours)
          .filter((_: any, index: number) => index % 8 === 0) // Take one per day
          .map((item: any) => ({
            date: new Date(item.dt * 1000).toLocaleDateString(),
            temperature: {
              min: item.main.temp_min,
              max: item.main.temp_max
            },
            description: item.weather[0].description,
            humidity: item.main.humidity
          }))
      };

      this.setCachedData(cacheKey, forecastData);

      return {
        success: true,
        data: forecastData,
        message: `${days}-day forecast for ${forecastData.city}, ${forecastData.country}`,
        metadata: { city, days, cached: false }
      };

    } catch (error) {
      throw new PluginExecutionError(
        `Failed to fetch forecast data: ${error instanceof Error ? error.message : 'Unknown error'}`,
        this.metadata.id,
        { city, days }
      );
    }
  }

  private async ingestFromAPI(config: DataIngestionConfig): Promise<PluginResult> {
    // Example: Ingest weather data for multiple cities
    const cities = ['London', 'New York', 'Tokyo', 'Paris', 'Sydney'];
    const results = [];

    for (const city of cities) {
      try {
        const result = await this.getCurrentWeather({ city }, {
          userId: 'system',
          chatId: 'system',
          messageId: 'ingestion',
          language: 'en',
          timestamp: Date.now(),
          metadata: { source: 'data_ingestion' }
        });

        if (result.success) {
          results.push(result.data);
        }
      } catch (error) {
        console.error(`[WeatherPlugin] Failed to ingest data for ${city}:`, error);
      }
    }

    return {
      success: true,
      data: results,
      message: `Ingested weather data for ${results.length} cities`,
      metadata: { cities: results.length, source: config.source }
    };
  }

  private async handleWebhook(config: DataIngestionConfig): Promise<PluginResult> {
    // Handle webhook data ingestion
    return {
      success: true,
      message: 'Webhook handler not implemented yet',
      metadata: { config }
    };
  }

  private async handleScheduledWeatherUpdate(data: any): Promise<void> {
    console.log(`[WeatherPlugin] Handling scheduled weather update:`, data);
    // Implement scheduled weather updates
  }

  private getCachedData(key: string): any | null {
    const cached = this.cache.get(key);
    if (!cached) return null;

    const cacheTimeout = this.config.settings.cacheTimeout as number;
    if (Date.now() - cached.timestamp > cacheTimeout) {
      this.cache.delete(key);
      return null;
    }

    return cached.data;
  }

  private setCachedData(key: string, data: any): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  private cleanupCache(): void {
    const cacheTimeout = this.config.settings.cacheTimeout as number;
    const now = Date.now();

    for (const [key, cached] of this.cache.entries()) {
      if (now - cached.timestamp > cacheTimeout) {
        this.cache.delete(key);
      }
    }
  }

  private checkRateLimit(): boolean {
    const now = Date.now();
    const maxRequests = this.config.settings.maxRequestsPerHour as number;

    // Reset counter every hour
    if (now - this.lastHourReset > 3600000) {
      this.requestCount = 0;
      this.lastHourReset = now;
    }

    if (this.requestCount >= maxRequests) {
      return false;
    }

    this.requestCount++;
    return true;
  }

  private getUnitsSymbol(units: string): string {
    switch (units) {
      case 'metric': return 'C';
      case 'imperial': return 'F';
      case 'kelvin': return 'K';
      default: return 'C';
    }
  }
}

// Export the plugin instance
export default new WeatherPlugin();

// Example usage and documentation
export const pluginDocumentation = {
  name: 'Weather Demo Plugin',
  description: 'Demonstrates Buddian plugin capabilities with weather data',
  installation: {
    steps: [
      '1. Get an API key from OpenWeatherMap (https://openweathermap.org/api)',
      '2. Configure the API key in plugin settings',
      '3. Activate the plugin in your Buddian instance'
    ]
  },
  usage: {
    commands: [
      {
        command: '/weather London',
        description: 'Get current weather for London'
      },
      {
        command: '/forecast Paris 5',
        description: 'Get 5-day forecast for Paris'
      }
    ]
  },
  features: [
    'Current weather information',
    '5-day weather forecast',
    'Multiple temperature units',
    'Response caching',
    'Rate limiting',
    'Data ingestion capabilities',
    'MCP/A2A protocol compatibility'
  ],
  configuration: {
    required: {
      apiKey: 'OpenWeatherMap API key'
    },
    optional: {
      defaultUnits: 'Default temperature units (metric, imperial, kelvin)',
      cacheTimeout: 'Cache timeout in milliseconds',
      maxRequestsPerHour: 'Maximum API requests per hour'
    }
  }
};
