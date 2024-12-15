-- Ensure the extension for UUID generation is enabled if it is used in your tables
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create a new schema if it does not exist
CREATE SCHEMA IF NOT EXISTS suno_music_bots;

-- Create tables within the schema if they do not exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'suno_music_bots' AND table_name = 'users') THEN
        CREATE TABLE suno_music_bots.users (
            user_id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
            platform_username text NOT NULL,
            platform_user_id text NOT NULL UNIQUE,
            platform text NOT NULL
        );
    END IF;
    IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'suno_music_bots' AND table_name = 'scraper_status') THEN
        CREATE TABLE suno_music_bots.scraper_status (
            phone_number text PRIMARY KEY,
            latest_error text,
            remaining_credits integer DEFAULT 0
        );
    END IF;
    IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'suno_music_bots' AND table_name = 'discord_song_generations') THEN
        CREATE TABLE suno_music_bots.discord_song_generations (
            generation_id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
            user_id uuid REFERENCES suno_music_bots.users(user_id) ON DELETE CASCADE,
            mixed_with uuid REFERENCES suno_music_bots.discord_song_generations(generation_id),
            scraper_account text,
            song_prompt text NOT NULL,
            song_input_genre text,
            song_second_input_genre text,
            song_input_vibe text,
            song_input_details text,
            song_input_custom_lyrics text,
            song_input_custom_title text,
            song_output_title text,
            song_output_genre text,
            song_output_lyrics text,
            song_output_cover jsonb,
            replies_guild text NOT NULL,
            replies_channel_id text NOT NULL,
            initial_reply_id text NOT NULL,
            output_reply_id text,
            input_content jsonb,
            output_song jsonb,
            created_at timestamptz DEFAULT current_timestamp,
            error_message text,
            use_custom_mode boolean DEFAULT FALSE,
            use_instrumental_only boolean DEFAULT FALSE
        );

        -- Create indexes for efficient querying
        CREATE INDEX idx_discord_song_generations_mixed_with ON suno_music_bots.discord_song_generations(mixed_with);
        CREATE INDEX idx_discord_song_generations_initial_reply_id ON suno_music_bots.discord_song_generations(initial_reply_id);
        CREATE INDEX idx_discord_song_generations_output_reply_id ON suno_music_bots.discord_song_generations(output_reply_id);
        CREATE INDEX idx_discord_song_generations_replies_channel_id ON suno_music_bots.discord_song_generations(replies_channel_id);
        CREATE INDEX idx_discord_song_generations_replies_guild ON suno_music_bots.discord_song_generations(replies_guild);
        CREATE INDEX idx_discord_song_generations_created_at ON suno_music_bots.discord_song_generations(created_at);
        CREATE INDEX idx_discord_song_generations_song_input_genre ON suno_music_bots.discord_song_generations(song_input_genre);
        CREATE INDEX idx_discord_song_generations_song_output_genre ON suno_music_bots.discord_song_generations(song_output_genre);
    END IF;
END $$;

-- Grant usage on the schema to authenticated role only
GRANT USAGE ON SCHEMA suno_music_bots TO authenticated;

-- Grant permissions on tables to authenticated role only
GRANT ALL ON suno_music_bots.users TO authenticated;
GRANT ALL ON suno_music_bots.scraper_status TO authenticated;
GRANT ALL ON suno_music_bots.discord_song_generations TO authenticated;

-- Grant usage on all sequences in the schema
GRANT USAGE ON ALL SEQUENCES IN SCHEMA suno_music_bots TO authenticated;

-- Enable Row Level Security (RLS) for both tables
ALTER TABLE suno_music_bots.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE suno_music_bots.scraper_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE suno_music_bots.discord_song_generations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for users table
CREATE POLICY "Allow select for discord_bot_role" ON suno_music_bots.users
    FOR SELECT USING (auth.jwt() ->> 'app_role' = 'discord_bot_role');

CREATE POLICY "Allow insert for discord_bot_role" ON suno_music_bots.users
    FOR INSERT WITH CHECK (auth.jwt() ->> 'app_role' = 'discord_bot_role');

CREATE POLICY "Allow select for suno_scraper_role" ON suno_music_bots.users
    FOR SELECT USING (auth.jwt() ->> 'app_role' = 'suno_scraper_role');

CREATE POLICY "Allow select for aws_role" ON suno_music_bots.users
    FOR SELECT USING (auth.jwt() ->> 'app_role' = 'aws_role');

-- RLS Policies for scraper_status table
CREATE POLICY "Allow select for discord_bot_role" ON suno_music_bots.scraper_status
    FOR SELECT USING (auth.jwt() ->> 'app_role' = 'discord_bot_role');

CREATE POLICY "Allow update for discord_bot_role" ON suno_music_bots.scraper_status
    FOR UPDATE WITH CHECK (auth.jwt() ->> 'app_role' = 'discord_bot_role');

CREATE POLICY "Allow select for suno_scraper_role" ON suno_music_bots.scraper_status
    FOR SELECT USING (auth.jwt() ->> 'app_role' = 'suno_scraper_role');

CREATE POLICY "Allow update for suno_scraper_role" ON suno_music_bots.scraper_status
    FOR UPDATE USING (auth.jwt() ->> 'app_role' = 'suno_scraper_role');

CREATE POLICY "Allow select for aws_role" ON suno_music_bots.scraper_status
    FOR SELECT USING (auth.jwt() ->> 'app_role' = 'aws_role');

-- RLS Policies for discord_song_generations table
CREATE POLICY "Allow select for discord_bot_role" ON suno_music_bots.discord_song_generations
    FOR SELECT USING (auth.jwt() ->> 'app_role' = 'discord_bot_role');

CREATE POLICY "Allow insert for discord_bot_role" ON suno_music_bots.discord_song_generations
    FOR INSERT WITH CHECK (auth.jwt() ->> 'app_role' = 'discord_bot_role');

CREATE POLICY "Allow update for discord_bot_role" ON suno_music_bots.discord_song_generations
    FOR UPDATE USING (auth.jwt() ->> 'app_role' = 'discord_bot_role');

CREATE POLICY "Allow select for suno_scraper_role" ON suno_music_bots.discord_song_generations
    FOR SELECT USING (auth.jwt() ->> 'app_role' = 'suno_scraper_role');

CREATE POLICY "Allow update for suno_scraper_role" ON suno_music_bots.discord_song_generations
    FOR UPDATE USING (auth.jwt() ->> 'app_role' = 'suno_scraper_role');

CREATE POLICY "Allow select for aws_role" ON suno_music_bots.discord_song_generations
    FOR SELECT USING (auth.jwt() ->> 'app_role' = 'aws_role');