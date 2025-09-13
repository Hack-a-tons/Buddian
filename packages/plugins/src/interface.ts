import { z } from 'zod';

// Plugin parameter schema
export const PluginParameterSchema = z.object({
  name: z.string(),
  type: z.enum(['string', 'number', 'boolean', 'array', 'object']),
  required: z.boolean(),
  description: z.string(),
  default: z.any().optional(),
  validation: z.object({
    min: z.number().optional(),
    max: z.number().optional(),
    pattern: z.string().optional(),
    enum: z.array(z.string()).optional()
  }).optional()
});

// Plugin command schema
export const PluginCommandSchema = z.object({
  name: z.string(),
  description: z.string(),
  usage: z.string(),
  parameters: z.array(PluginParameterSchema),
  examples: z.array(z.string()).optional(),
  category: z.string().optional()
});

// Plugin configuration schema
export const PluginConfigSchema = z.object({
  commands: z.array(PluginCommandSchema),
  permissions: z.array(z.string()),
  settings: z.record(z.any()),
  apiKeys: z.record(z.string()).optional(),
  rateLimit: z.object({
    requests: z.number(),
    window: z.number() // in milliseconds
  }).optional(),
  timeout: z.number().optional() // in milliseconds
});

// Plugin metadata schema
export const PluginMetadataSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  description: z.string(),
  author: z.string(),
  homepage: z.string().url().optional(),
  repository: z.string().url().optional(),
  license: z.string().optional(),
  tags: z.array(z.string()).optional(),
  dependencies: z.record(z.string()).optional(),
  minBuddianVersion: z.string().optional()
});

// Plugin context for execution
export interface PluginContext {
  userId: string;
  chatId: string;
  messageId: string;
  language: string;
  timestamp: number;
  metadata: Record<string, any>;
}

// Plugin execution result
export interface PluginResult {
  success: boolean;
  data?: any;
  message?: string;
  error?: string;
  metadata?: Record<string, any>;
}

// Plugin event types
export type PluginEventType = 
  | 'message_received'
  | 'file_uploaded'
  | 'command_executed'
  | 'user_joined'
  | 'user_left'
  | 'plugin_activated'
  | 'plugin_deactivated'
  | 'scheduled_task';

// Plugin event data
export interface PluginEvent {
  type: PluginEventType;
  data: any;
  context: PluginContext;
  timestamp: number;
}

// Data ingestion interface
export interface DataIngestionConfig {
  source: string;
  type: 'api' | 'webhook' | 'file' | 'database' | 'stream';
  schedule?: string; // cron expression for scheduled ingestion
  authentication?: {
    type: 'bearer' | 'basic' | 'api_key' | 'oauth';
    credentials: Record<string, string>;
  };
  transformation?: {
    format: 'json' | 'xml' | 'csv' | 'text';
    mapping: Record<string, string>;
    filters: Array<{
      field: string;
      operator: 'equals' | 'contains' | 'greater_than' | 'less_than';
      value: any;
    }>;
  };
}

// Main plugin interface (MCP/A2A compatible)
export interface BuddianPlugin {
  // Plugin metadata
  readonly metadata: z.infer<typeof PluginMetadataSchema>;
  readonly config: z.infer<typeof PluginConfigSchema>;
  
  // Lifecycle methods
  activate(context: PluginContext): Promise<void>;
  deactivate(context: PluginContext): Promise<void>;
  
  // Command execution
  executeCommand(
    command: string,
    parameters: Record<string, any>,
    context: PluginContext
  ): Promise<PluginResult>;
  
  // Event handling
  handleEvent?(event: PluginEvent): Promise<void>;
  
  // Data ingestion
  ingestData?(config: DataIngestionConfig): Promise<PluginResult>;
  
  // Health check
  healthCheck?(): Promise<boolean>;
  
  // Configuration validation
  validateConfig?(config: any): Promise<boolean>;
  
  // Resource cleanup
  cleanup?(): Promise<void>;
}

// Plugin registry interface
export interface PluginRegistry {
  register(plugin: BuddianPlugin): Promise<void>;
  unregister(pluginId: string): Promise<void>;
  get(pluginId: string): BuddianPlugin | undefined;
  list(): BuddianPlugin[];
  isActive(pluginId: string): boolean;
  activate(pluginId: string, context: PluginContext): Promise<void>;
  deactivate(pluginId: string, context: PluginContext): Promise<void>;
}

// Plugin manager interface
export interface PluginManager {
  registry: PluginRegistry;
  
  // Plugin lifecycle
  loadPlugin(pluginPath: string): Promise<BuddianPlugin>;
  installPlugin(pluginPackage: string): Promise<void>;
  uninstallPlugin(pluginId: string): Promise<void>;
  
  // Command execution
  executeCommand(
    pluginId: string,
    command: string,
    parameters: Record<string, any>,
    context: PluginContext
  ): Promise<PluginResult>;
  
  // Event broadcasting
  broadcastEvent(event: PluginEvent): Promise<void>;
  
  // Data ingestion management
  scheduleDataIngestion(
    pluginId: string,
    config: DataIngestionConfig
  ): Promise<void>;
  
  // Plugin discovery
  discoverPlugins(directory: string): Promise<string[]>;
  
  // Configuration management
  updatePluginConfig(pluginId: string, config: any): Promise<void>;
  getPluginConfig(pluginId: string): any;
  
  // Monitoring and logging
  getPluginStats(pluginId: string): Promise<{
    executions: number;
    errors: number;
    lastExecution: number;
    averageExecutionTime: number;
  }>;
  
  // Security and permissions
  checkPermission(pluginId: string, permission: string): boolean;
  grantPermission(pluginId: string, permission: string): Promise<void>;
  revokePermission(pluginId: string, permission: string): Promise<void>;
}

// MCP (Model Context Protocol) compatibility
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface MCPServer {
  name: string;
  version: string;
  tools: MCPTool[];
  resources: MCPResource[];
  
  // Tool execution
  callTool(name: string, arguments: Record<string, any>): Promise<any>;
  
  // Resource access
  readResource(uri: string): Promise<string>;
  listResources(): Promise<MCPResource[]>;
}

// A2A (Agent-to-Agent) compatibility
export interface A2AMessage {
  id: string;
  from: string;
  to: string;
  type: 'request' | 'response' | 'notification';
  payload: any;
  timestamp: number;
  metadata?: Record<string, any>;
}

export interface A2AAgent {
  id: string;
  name: string;
  capabilities: string[];
  
  // Message handling
  sendMessage(message: A2AMessage): Promise<void>;
  receiveMessage(message: A2AMessage): Promise<A2AMessage | void>;
  
  // Capability negotiation
  negotiateCapabilities(otherAgent: A2AAgent): Promise<string[]>;
  
  // Service discovery
  discoverServices(): Promise<string[]>;
  advertiseService(service: string): Promise<void>;
}

// Plugin factory for creating plugins
export interface PluginFactory {
  createPlugin(metadata: z.infer<typeof PluginMetadataSchema>): BuddianPlugin;
  createMCPServer(config: any): MCPServer;
  createA2AAgent(config: any): A2AAgent;
}

// Error types for plugin system
export class PluginError extends Error {
  constructor(
    message: string,
    public pluginId: string,
    public code: string,
    public context?: Record<string, any>
  ) {
    super(message);
    this.name = 'PluginError';
  }
}

export class PluginValidationError extends PluginError {
  constructor(message: string, pluginId: string, context?: Record<string, any>) {
    super(message, pluginId, 'VALIDATION_ERROR', context);
    this.name = 'PluginValidationError';
  }
}

export class PluginExecutionError extends PluginError {
  constructor(message: string, pluginId: string, context?: Record<string, any>) {
    super(message, pluginId, 'EXECUTION_ERROR', context);
    this.name = 'PluginExecutionError';
  }
}

export class PluginTimeoutError extends PluginError {
  constructor(message: string, pluginId: string, context?: Record<string, any>) {
    super(message, pluginId, 'TIMEOUT_ERROR', context);
    this.name = 'PluginTimeoutError';
  }
}

// Utility types
export type PluginParameter = z.infer<typeof PluginParameterSchema>;
export type PluginCommand = z.infer<typeof PluginCommandSchema>;
export type PluginConfig = z.infer<typeof PluginConfigSchema>;
export type PluginMetadata = z.infer<typeof PluginMetadataSchema>;

// Export all schemas for validation
export const schemas = {
  PluginParameterSchema,
  PluginCommandSchema,
  PluginConfigSchema,
  PluginMetadataSchema
};
