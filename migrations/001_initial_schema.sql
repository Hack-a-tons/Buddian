-- Initial schema migration for Buddian bot
-- Migrating from Convex to Supabase PostgreSQL

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    telegram_id BIGINT UNIQUE NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT,
    username TEXT,
    language_code TEXT,
    preferences JSONB NOT NULL DEFAULT '{
        "language": "en",
        "timezone": "UTC",
        "notifications": true,
        "reminderFrequency": "never",
        "summaryFrequency": "never",
        "pluginsEnabled": []
    }'::jsonb,
    created_at BIGINT NOT NULL,
    last_active_at BIGINT NOT NULL,
    created_at_ts TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for users
CREATE INDEX idx_users_telegram_id ON users(telegram_id);
CREATE INDEX idx_users_last_active ON users(last_active_at);
CREATE INDEX idx_users_created_at ON users(created_at);

-- Conversation threads table
CREATE TABLE conversation_threads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    chat_id TEXT NOT NULL,
    topic TEXT NOT NULL,
    participants TEXT[] NOT NULL DEFAULT '{}',
    message_count INTEGER NOT NULL DEFAULT 0,
    last_activity BIGINT NOT NULL,
    created_at BIGINT NOT NULL,
    summary TEXT,
    tags TEXT[] NOT NULL DEFAULT '{}',
    created_at_ts TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for threads
CREATE INDEX idx_threads_chat_id ON conversation_threads(chat_id);
CREATE INDEX idx_threads_last_activity ON conversation_threads(last_activity);
CREATE INDEX idx_threads_created_at ON conversation_threads(created_at);

-- Messages table
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    chat_id TEXT NOT NULL,
    user_id UUID REFERENCES users(id),
    content TEXT NOT NULL,
    timestamp BIGINT NOT NULL,
    language TEXT NOT NULL DEFAULT 'en',
    message_type TEXT NOT NULL CHECK (message_type IN ('text', 'photo', 'document', 'voice', 'video', 'sticker', 'location')),
    metadata JSONB,
    decisions JSONB DEFAULT '[]'::jsonb,
    action_items JSONB DEFAULT '[]'::jsonb,
    thread_id UUID REFERENCES conversation_threads(id),
    created_at_ts TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for messages
CREATE INDEX idx_messages_chat_id ON messages(chat_id);
CREATE INDEX idx_messages_user_id ON messages(user_id);
CREATE INDEX idx_messages_timestamp ON messages(timestamp);
CREATE INDEX idx_messages_thread_id ON messages(thread_id);
CREATE INDEX idx_messages_message_type ON messages(message_type);
CREATE INDEX idx_messages_language ON messages(language);

-- Full-text search index for messages
CREATE INDEX idx_messages_content_fts ON messages USING gin(to_tsvector('english', content));

-- Resources table
CREATE TABLE resources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type TEXT NOT NULL CHECK (type IN ('pdf', 'image', 'url', 'video', 'audio')),
    url TEXT,
    filename TEXT,
    content TEXT NOT NULL,
    summary TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    extracted_at BIGINT NOT NULL,
    chat_id TEXT NOT NULL,
    user_id UUID REFERENCES users(id),
    created_at_ts TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for resources
CREATE INDEX idx_resources_chat_id ON resources(chat_id);
CREATE INDEX idx_resources_user_id ON resources(user_id);
CREATE INDEX idx_resources_type ON resources(type);
CREATE INDEX idx_resources_extracted_at ON resources(extracted_at);

-- Full-text search indexes for resources
CREATE INDEX idx_resources_content_fts ON resources USING gin(to_tsvector('english', content));
CREATE INDEX idx_resources_summary_fts ON resources USING gin(to_tsvector('english', summary));

-- Plugins table
CREATE TABLE plugins (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT UNIQUE NOT NULL,
    version TEXT NOT NULL,
    description TEXT NOT NULL,
    author TEXT NOT NULL,
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    active BOOLEAN NOT NULL DEFAULT false,
    installed_at BIGINT NOT NULL,
    last_used BIGINT,
    created_at_ts TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for plugins
CREATE INDEX idx_plugins_name ON plugins(name);
CREATE INDEX idx_plugins_active ON plugins(active);
CREATE INDEX idx_plugins_installed_at ON plugins(installed_at);

-- Plugin executions table
CREATE TABLE plugin_executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plugin_id UUID REFERENCES plugins(id),
    user_id UUID REFERENCES users(id),
    chat_id TEXT NOT NULL,
    command TEXT NOT NULL,
    parameters JSONB DEFAULT '{}'::jsonb,
    result JSONB,
    status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    started_at BIGINT NOT NULL,
    completed_at BIGINT,
    error_message TEXT,
    created_at_ts TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for plugin executions
CREATE INDEX idx_plugin_executions_plugin_id ON plugin_executions(plugin_id);
CREATE INDEX idx_plugin_executions_user_id ON plugin_executions(user_id);
CREATE INDEX idx_plugin_executions_chat_id ON plugin_executions(chat_id);
CREATE INDEX idx_plugin_executions_status ON plugin_executions(status);
CREATE INDEX idx_plugin_executions_started_at ON plugin_executions(started_at);

-- Search index table for semantic search
CREATE TABLE search_index (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    content_id UUID NOT NULL,
    content_type TEXT NOT NULL CHECK (content_type IN ('message', 'resource', 'decision', 'action_item')),
    content TEXT NOT NULL,
    embedding VECTOR(1536), -- OpenAI embedding dimension
    metadata JSONB DEFAULT '{}'::jsonb,
    chat_id TEXT NOT NULL,
    user_id UUID REFERENCES users(id),
    created_at BIGINT NOT NULL,
    created_at_ts TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for search
CREATE INDEX idx_search_content_id ON search_index(content_id);
CREATE INDEX idx_search_content_type ON search_index(content_type);
CREATE INDEX idx_search_chat_id ON search_index(chat_id);
CREATE INDEX idx_search_user_id ON search_index(user_id);
CREATE INDEX idx_search_created_at ON search_index(created_at);

-- Vector similarity search index
CREATE INDEX idx_search_embedding ON search_index USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Full-text search index for search content
CREATE INDEX idx_search_content_fts ON search_index USING gin(to_tsvector('english', content));

-- Analytics table for usage metrics
CREATE TABLE analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type TEXT NOT NULL,
    user_id UUID REFERENCES users(id),
    chat_id TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    timestamp BIGINT NOT NULL,
    created_at_ts TIMESTAMP DEFAULT NOW()
);

-- Create indexes for analytics
CREATE INDEX idx_analytics_event_type ON analytics(event_type);
CREATE INDEX idx_analytics_user_id ON analytics(user_id);
CREATE INDEX idx_analytics_chat_id ON analytics(chat_id);
CREATE INDEX idx_analytics_timestamp ON analytics(timestamp);

-- System health table for monitoring
CREATE TABLE system_health (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    service_name TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('healthy', 'degraded', 'unhealthy')),
    metrics JSONB DEFAULT '{}'::jsonb,
    last_check BIGINT NOT NULL,
    created_at_ts TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for system health
CREATE INDEX idx_system_health_service ON system_health(service_name);
CREATE INDEX idx_system_health_status ON system_health(status);
CREATE INDEX idx_system_health_last_check ON system_health(last_check);

-- Scheduled tasks table for cron jobs
CREATE TABLE scheduled_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT UNIQUE NOT NULL,
    schedule TEXT NOT NULL, -- Cron expression
    handler TEXT NOT NULL,
    parameters JSONB DEFAULT '{}'::jsonb,
    active BOOLEAN NOT NULL DEFAULT true,
    last_run BIGINT,
    next_run BIGINT,
    run_count INTEGER NOT NULL DEFAULT 0,
    failure_count INTEGER NOT NULL DEFAULT 0,
    created_at BIGINT NOT NULL,
    created_at_ts TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for scheduled tasks
CREATE INDEX idx_scheduled_tasks_name ON scheduled_tasks(name);
CREATE INDEX idx_scheduled_tasks_active ON scheduled_tasks(active);
CREATE INDEX idx_scheduled_tasks_next_run ON scheduled_tasks(next_run);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add updated_at triggers to all tables
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_messages_updated_at BEFORE UPDATE ON messages FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_resources_updated_at BEFORE UPDATE ON resources FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_threads_updated_at BEFORE UPDATE ON conversation_threads FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_plugins_updated_at BEFORE UPDATE ON plugins FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_plugin_executions_updated_at BEFORE UPDATE ON plugin_executions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_search_index_updated_at BEFORE UPDATE ON search_index FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_system_health_updated_at BEFORE UPDATE ON system_health FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_scheduled_tasks_updated_at BEFORE UPDATE ON scheduled_tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS) for multi-tenancy
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_index ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (basic chat-based isolation)
CREATE POLICY "Users can view their own data" ON users FOR ALL USING (auth.uid()::text = id::text);
CREATE POLICY "Messages are viewable by chat participants" ON messages FOR ALL USING (true); -- Simplified for now
CREATE POLICY "Resources are viewable by chat participants" ON resources FOR ALL USING (true); -- Simplified for now
CREATE POLICY "Threads are viewable by chat participants" ON conversation_threads FOR ALL USING (true); -- Simplified for now
CREATE POLICY "Search index is viewable by chat participants" ON search_index FOR ALL USING (true); -- Simplified for now
CREATE POLICY "Analytics are viewable by system" ON analytics FOR ALL USING (true); -- Simplified for now

-- Insert initial system health record
INSERT INTO system_health (service_name, status, metrics, last_check) 
VALUES ('database', 'healthy', '{"connections": 0, "queries_per_second": 0}'::jsonb, extract(epoch from now()) * 1000);

-- Insert initial scheduled tasks
INSERT INTO scheduled_tasks (name, schedule, handler, parameters, active, created_at, next_run)
VALUES 
    ('cleanup_old_analytics', '0 2 * * *', 'cleanup_analytics', '{"days_to_keep": 30}'::jsonb, true, extract(epoch from now()) * 1000, extract(epoch from now()) * 1000 + 86400000),
    ('update_search_index', '*/15 * * * *', 'update_search_embeddings', '{}'::jsonb, true, extract(epoch from now()) * 1000, extract(epoch from now()) * 1000 + 900000);
