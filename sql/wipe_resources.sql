-- Disable RLS on the storage.objects and storage.buckets tables
ALTER TABLE storage.objects DISABLE ROW LEVEL SECURITY;
ALTER TABLE storage.buckets DISABLE ROW LEVEL SECURITY;

-- Drop policies for song-input-videos bucket
DROP POLICY IF EXISTS "Discord bot INSERTs on input-videos #1" ON storage.buckets;
DROP POLICY IF EXISTS "Discord bot and suno scraper SELECT on input-videos #1" ON storage.buckets;
DROP POLICY IF EXISTS "Discord bot INSERTs on input-videos #2" ON storage.objects;
DROP POLICY IF EXISTS "Discord bot and suno scraper SELECT on input-videos #2" ON storage.objects;

-- Drop policies for song-input-images bucket
DROP POLICY IF EXISTS "Discord bot INSERTs on input-images #1" ON storage.buckets;
DROP POLICY IF EXISTS "Discord bot and suno scraper SELECT on input-images #1" ON storage.buckets;
DROP POLICY IF EXISTS "Discord bot INSERTs on input-images #2" ON storage.objects;
DROP POLICY IF EXISTS "Discord bot and suno scraper SELECT on input-images #2" ON storage.objects;

-- Drop policies for song-input-video-frames bucket
DROP POLICY IF EXISTS "Discord bot INSERTs on input-video-frames #1" ON storage.buckets;
DROP POLICY IF EXISTS "Discord bot and suno scraper SELECT on input-video-frames #1" ON storage.buckets;
DROP POLICY IF EXISTS "Discord bot INSERTs on input-video-frames #2" ON storage.objects;
DROP POLICY IF EXISTS "Discord bot and suno scraper SELECT on input-video-frames #2" ON storage.objects;

-- Drop policies for song-output-audio bucket
DROP POLICY IF EXISTS "Suno scraper INSERTs on output-audio #1" ON storage.buckets;
DROP POLICY IF EXISTS "Discord bot and suno scraper SELECT on output-audio #1" ON storage.buckets;
DROP POLICY IF EXISTS "Suno scraper INSERTs on output-audio #2" ON storage.objects;
DROP POLICY IF EXISTS "Discord bot and suno scraper SELECT on output-audio #2" ON storage.objects;

-- Drop policies for song-output-covers bucket
DROP POLICY IF EXISTS "Discord bot INSERTs on output-covers #1" ON storage.buckets;
DROP POLICY IF EXISTS "Discord bot SELECTs on output-covers #1" ON storage.buckets;
DROP POLICY IF EXISTS "Discord bot INSERTs on output-covers #2" ON storage.objects;
DROP POLICY IF EXISTS "Discord bot SELECTs on output-covers #2" ON storage.objects;

-- Delete objects in the buckets
DELETE FROM storage.objects 
WHERE bucket_id IN ('song-input-videos', 'song-input-images', 'song-input-video-frames', 'song-output-audio', 'song-output-covers');

-- Delete the buckets
DELETE FROM storage.buckets 
WHERE id IN ('song-input-videos', 'song-input-images', 'song-input-video-frames', 'song-output-audio', 'song-output-covers');

-- Disable Row Level Security (RLS) for all tables
ALTER TABLE IF EXISTS suno_music_bots.users DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS suno_music_bots.scraper_status DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS suno_music_bots.discord_song_generations DISABLE ROW LEVEL SECURITY;

-- Drop RLS Policies for discord_song_generations table
DROP POLICY IF EXISTS "Allow select for discord_bot_role" ON suno_music_bots.discord_song_generations;
DROP POLICY IF EXISTS "Allow insert for discord_bot_role" ON suno_music_bots.discord_song_generations;
DROP POLICY IF EXISTS "Allow update for discord_bot_role" ON suno_music_bots.discord_song_generations;
DROP POLICY IF EXISTS "Allow select for suno_scraper_role" ON suno_music_bots.discord_song_generations;
DROP POLICY IF EXISTS "Allow update for suno_scraper_role" ON suno_music_bots.discord_song_generations;
DROP POLICY IF EXISTS "Allow select for aws_role" ON suno_music_bots.discord_song_generations;

-- Drop RLS Policies for users table
DROP POLICY IF EXISTS "Allow select for discord_bot_role" ON suno_music_bots.users;
DROP POLICY IF EXISTS "Allow insert for discord_bot_role" ON suno_music_bots.users;
DROP POLICY IF EXISTS "Allow select for suno_scraper_role" ON suno_music_bots.users;
DROP POLICY IF EXISTS "Allow select for aws_role" ON suno_music_bots.users;

-- Drop RLS Policies for scraper_status table
DROP POLICY IF EXISTS "Allow select for discord_bot_role" ON suno_music_bots.scraper_status;
DROP POLICY IF EXISTS "Allow update for discord_bot_role" ON suno_music_bots.scraper_status;
DROP POLICY IF EXISTS "Allow select for suno_scraper_role" ON suno_music_bots.scraper_status;
DROP POLICY IF EXISTS "Allow update for suno_scraper_role" ON suno_music_bots.scraper_status;
DROP POLICY IF EXISTS "Allow select for aws_role" ON suno_music_bots.scraper_status;

-- Revoke permissions on tables from authenticated role
REVOKE ALL ON suno_music_bots.users FROM authenticated;
REVOKE ALL ON suno_music_bots.scraper_status FROM authenticated;
REVOKE ALL ON suno_music_bots.discord_song_generations FROM authenticated;

-- Revoke usage on all sequences in the schema
REVOKE USAGE ON ALL SEQUENCES IN SCHEMA suno_music_bots FROM authenticated;

-- Revoke usage on the schema from authenticated role
REVOKE USAGE ON SCHEMA suno_music_bots FROM authenticated;

-- Drop indexes
DROP INDEX IF EXISTS suno_music_bots.idx_discord_song_generations_mixed_with;
DROP INDEX IF EXISTS suno_music_bots.idx_discord_song_generations_initial_reply_id;
DROP INDEX IF EXISTS suno_music_bots.idx_discord_song_generations_output_reply_id;
DROP INDEX IF EXISTS suno_music_bots.idx_discord_song_generations_replies_channel_id;
DROP INDEX IF EXISTS suno_music_bots.idx_discord_song_generations_replies_guild;
DROP INDEX IF EXISTS suno_music_bots.idx_discord_song_generations_created_at;
DROP INDEX IF EXISTS suno_music_bots.idx_discord_song_generations_song_input_genre;
DROP INDEX IF EXISTS suno_music_bots.idx_discord_song_generations_song_output_genre;

-- Drop tables
DROP TABLE IF EXISTS suno_music_bots.discord_song_generations;
DROP TABLE IF EXISTS suno_music_bots.scraper_status;
DROP TABLE IF EXISTS suno_music_bots.users;

-- Drop schema
DROP SCHEMA IF EXISTS suno_music_bots CASCADE;

-- Drop the UUID extension if it's no longer needed
DROP EXTENSION IF EXISTS "uuid-ossp";