-- Enable RLS on the storage.objects table
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;

-- Create song-input-videos bucket
INSERT INTO storage.buckets (id, name, file_size_limit, allowed_mime_types)
VALUES (
  'song-input-videos', 
  'song-input-videos', 
  5368709120, -- 5 GB in bytes
  ARRAY['video/mp4', 'video/webm', 'video/quicktime']
)
ON CONFLICT (id) DO UPDATE
SET 
  file_size_limit = 5368709120,
  allowed_mime_types = ARRAY['video/mp4', 'video/webm', 'video/quicktime'];

-- Create song-input-images bucket
INSERT INTO storage.buckets (id, name, file_size_limit, allowed_mime_types)
VALUES (
  'song-input-images', 
  'song-input-images', 
  104857600, -- 100 MB in bytes
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/jpg']
)
ON CONFLICT (id) DO UPDATE
SET 
  file_size_limit = 104857600,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];

-- Create song-input-video-frames bucket
INSERT INTO storage.buckets (id, name, file_size_limit, allowed_mime_types)
VALUES (
  'song-input-video-frames', 
  'song-input-video-frames', 
  104857600, -- 100 MB in bytes
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/jpg']
)
ON CONFLICT (id) DO UPDATE
SET 
  file_size_limit = 104857600,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];

-- Create song-output-audio bucket
INSERT INTO storage.buckets (id, name, file_size_limit, allowed_mime_types)
VALUES (
  'song-output-audio', 
  'song-output-audio', 
  524288000, -- 500 MB in bytes
  ARRAY['audio/vnd.wav', 'audio/mp3', 'audio/mpeg']
)
ON CONFLICT (id) DO UPDATE
SET 
  file_size_limit = 524288000,
  allowed_mime_types = ARRAY['audio/vnd.wav', 'audio/mp3', 'audio/mpeg'];

-- Create song-output-covers bucket
INSERT INTO storage.buckets (id, name, file_size_limit, allowed_mime_types)
VALUES (
  'song-output-covers', 
  'song-output-covers', 
  104857600, -- 100 MB in bytes
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/jpg']
)
ON CONFLICT (id) DO UPDATE
SET 
  file_size_limit = 104857600,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];

-- Create song-output-videos bucket
INSERT INTO storage.buckets (id, name, file_size_limit, allowed_mime_types)
VALUES (
  'song-output-videos', 
  'song-output-videos', 
  1073741824, -- 1 GB in bytes
  ARRAY['video/mp4']
)
ON CONFLICT (id) DO UPDATE
SET 
  file_size_limit = 1073741824,
  allowed_mime_types = ARRAY['video/mp4'];

-- Policies for song-input-videos bucket
CREATE POLICY "Discord bot INSERTs on input-videos #1"
ON storage.buckets
FOR INSERT
WITH CHECK (
    name = 'song-input-videos'
    AND auth.jwt() ->> 'app_role' = 'discord_bot_role'
);

CREATE POLICY "Discord bot and suno scraper SELECT on input-videos #1"
ON storage.buckets
FOR SELECT
USING (
    name = 'song-input-videos'
    AND (
        auth.jwt() ->> 'app_role' = 'discord_bot_role'
        OR auth.jwt() ->> 'app_role' = 'suno_scraper_role'
    )
);

CREATE POLICY "Discord bot INSERTs on input-videos #2"
ON storage.objects
FOR INSERT
WITH CHECK (
    bucket_id = 'song-input-videos'
    AND auth.jwt() ->> 'app_role' = 'discord_bot_role'
);

CREATE POLICY "Discord bot and suno scraper SELECT on input-videos #2"
ON storage.objects
FOR SELECT
USING (
    bucket_id = 'song-input-videos'
    AND (
        auth.jwt() ->> 'app_role' = 'discord_bot_role'
        OR auth.jwt() ->> 'app_role' = 'suno_scraper_role'
    )
);

-- Policies for song-input-images bucket
CREATE POLICY "Discord bot INSERTs on input-images #1"
ON storage.buckets
FOR INSERT
WITH CHECK (
    name = 'song-input-images'
    AND auth.jwt() ->> 'app_role' = 'discord_bot_role'
);

CREATE POLICY "Discord bot and suno scraper SELECT on input-images #1"
ON storage.buckets
FOR SELECT
USING (
    name = 'song-input-images'
    AND (
        auth.jwt() ->> 'app_role' = 'discord_bot_role'
        OR auth.jwt() ->> 'app_role' = 'suno_scraper_role'
    )
);

CREATE POLICY "Discord bot INSERTs on input-images #2"
ON storage.objects
FOR INSERT
WITH CHECK (
    bucket_id = 'song-input-images'
    AND auth.jwt() ->> 'app_role' = 'discord_bot_role'
);

CREATE POLICY "Discord bot and suno scraper SELECT on input-images #2"
ON storage.objects
FOR SELECT
USING (
    bucket_id = 'song-input-images'
    AND (
        auth.jwt() ->> 'app_role' = 'discord_bot_role'
        OR auth.jwt() ->> 'app_role' = 'suno_scraper_role'
    )
);

-- Policies for song-input-video-frames bucket
CREATE POLICY "Discord bot INSERTs on input-video-frames #1"
ON storage.buckets
FOR INSERT
WITH CHECK (
    name = 'song-input-video-frames'
    AND auth.jwt() ->> 'app_role' = 'discord_bot_role'
);

CREATE POLICY "Discord bot and suno scraper SELECT on input-video-frames #1"
ON storage.buckets
FOR SELECT
USING (
    name = 'song-input-video-frames'
    AND (
        auth.jwt() ->> 'app_role' = 'discord_bot_role'
        OR auth.jwt() ->> 'app_role' = 'suno_scraper_role'
    )
);

CREATE POLICY "Discord bot INSERTs on input-video-frames #2"
ON storage.objects
FOR INSERT
WITH CHECK (
    bucket_id = 'song-input-video-frames'
    AND auth.jwt() ->> 'app_role' = 'discord_bot_role'
);

CREATE POLICY "Discord bot and suno scraper SELECT on input-video-frames #2"
ON storage.objects
FOR SELECT
USING (
    bucket_id = 'song-input-video-frames'
    AND (
        auth.jwt() ->> 'app_role' = 'discord_bot_role'
        OR auth.jwt() ->> 'app_role' = 'suno_scraper_role'
    )
);

-- Policies for song-output-audio bucket
CREATE POLICY "Suno scraper INSERTs on output-audio #1"
ON storage.buckets
FOR INSERT
WITH CHECK (
    name = 'song-output-audio'
    AND auth.jwt() ->> 'app_role' = 'suno_scraper_role'
);

CREATE POLICY "Discord bot and suno scraper SELECT on output-audio #1"
ON storage.buckets
FOR SELECT
USING (
    name = 'song-output-audio'
    AND (
        auth.jwt() ->> 'app_role' = 'discord_bot_role'
        OR auth.jwt() ->> 'app_role' = 'suno_scraper_role'
    )
);

CREATE POLICY "Suno scraper INSERTs on output-audio #2"
ON storage.objects
FOR INSERT
WITH CHECK (
    bucket_id = 'song-output-audio'
    AND auth.jwt() ->> 'app_role' = 'suno_scraper_role'
);

CREATE POLICY "Discord bot and suno scraper SELECT on output-audio #2"
ON storage.objects
FOR SELECT
USING (
    bucket_id = 'song-output-audio'
    AND (
        auth.jwt() ->> 'app_role' = 'discord_bot_role'
        OR auth.jwt() ->> 'app_role' = 'suno_scraper_role'
    )
);

-- Policies for song-output-covers bucket
CREATE POLICY "Discord bot INSERTs on output-covers #1"
ON storage.buckets
FOR INSERT
WITH CHECK (
    name = 'song-output-covers'
    AND auth.jwt() ->> 'app_role' = 'discord_bot_role'
);

CREATE POLICY "Discord bot SELECTs on output-covers #1"
ON storage.buckets
FOR SELECT
USING (
    name = 'song-output-covers'
    AND auth.jwt() ->> 'app_role' = 'discord_bot_role'
);

CREATE POLICY "Discord bot INSERTs on output-covers #2"
ON storage.objects
FOR INSERT
WITH CHECK (
    bucket_id = 'song-output-covers'
    AND auth.jwt() ->> 'app_role' = 'discord_bot_role'
);

CREATE POLICY "Discord bot SELECTs on output-covers #2"
ON storage.objects
FOR SELECT
USING (
    bucket_id = 'song-output-covers'
    AND auth.jwt() ->> 'app_role' = 'discord_bot_role'
);

-- Policies for song-output-videos bucket
CREATE POLICY "AWS INSERTs on output-videos #1"
ON storage.buckets
FOR INSERT
WITH CHECK (
    name = 'song-output-videos'
    AND auth.jwt() ->> 'app_role' = 'aws_role'
);

CREATE POLICY "Discord bot and AWS SELECT on output-videos #1"
ON storage.buckets
FOR SELECT
USING (
    name = 'song-output-videos'
    AND (
        auth.jwt() ->> 'app_role' = 'discord_bot_role'
        OR auth.jwt() ->> 'app_role' = 'aws_role'
    )
);

CREATE POLICY "AWS INSERTs on output-videos #2"
ON storage.objects
FOR INSERT
WITH CHECK (
    bucket_id = 'song-output-videos'
    AND auth.jwt() ->> 'app_role' = 'aws_role'
);

CREATE POLICY "Discord bot and AWS SELECT on output-videos #2"
ON storage.objects
FOR SELECT
USING (
    bucket_id = 'song-output-videos'
    AND (
        auth.jwt() ->> 'app_role' = 'discord_bot_role'
        OR auth.jwt() ->> 'app_role' = 'aws_role'
    )
);