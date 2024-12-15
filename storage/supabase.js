const axios = require('axios');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const { PARAMS } = require("../constants.js");
const { createClient } = require('@supabase/supabase-js');

dotenv.config();

/**
 * Generates a JWT that Supabase can recognize.
 * @returns {string} The generated JWT.
 */
function generateDiscordBotJWT() {
    const payload = {
        aud: "authenticated",
        role: "authenticated",
        app_role: PARAMS.SUPABASE_DISCORD_BOT_ROLE,
        exp: Math.floor(Date.now() / 1000) + PARAMS.SUPABASE_JWT_LIFETIME
    };
    return jwt.sign(payload, process.env.SUPABASE_JWT_SECRET, { algorithm: 'HS256' });
}

/**
 * Checks if a token is valid.
 * @param {string} token - The JWT to validate.
 * @returns {boolean} Whether the token is valid.
 */
function isTokenValid(token) {
    try {
        const decoded = jwt.verify(token, process.env.SUPABASE_JWT_SECRET);
        
        if (decoded.exp <= Math.floor(Date.now() / 1000)) {
            console.log("SUPABASE: Token has expired");
            return false;
        }
        
        if (decoded.aud !== "authenticated" || 
            decoded.role !== "authenticated" || 
            decoded.app_role !== PARAMS.SUPABASE_DISCORD_BOT_ROLE) {
            console.log("SUPABASE: Token has invalid claims");
            return false;
        }
        
        return true;
    } catch (error) {
        console.error("SUPABASE: Error verifying token:", error.message);
        return false;
    }
}

/**
 * Creates a Supabase client.
 * @param {string} token - The JWT for authentication.
 * @returns {Object} The Supabase client.
 */
function getSupabaseClient(token) {
    const supabaseUrl = process.env.SUPABASE_URL;
    return createClient(supabaseUrl, process.env.SUPABASE_ANON_KEY, {
        db: { schema: PARAMS.SUPABASE_SCHEMA },
        global: {
            headers: { 'Authorization': `Bearer ${token}` },
        },
    });
}

/**
 * Creates a user if they don't already exist.
 * @param {string} token - The JWT for authentication.
 * @param {string} userId - The user's ID.
 * @param {string} username - The user's username.
 * @returns {string|undefined} The user's ID if created or found, undefined otherwise.
 */
async function createUserIfNotExists(token, userId, username) {
    if (!token || !userId || !username) {
        console.log("SUPABASE: Invalid input for user creation.");
        return;
    }

    if (!isTokenValid(token)) return;

    const supabase = getSupabaseClient(token);

    try {
        const { data: user, error: userError } = await supabase
            .from(PARAMS.SUPABASE_USERS_TABLE)
            .select('user_id, platform_username')
            .eq('platform_user_id', userId)
            .maybeSingle();

        if (userError && userError.message !== 'No rows found') {
            throw userError;
        }

        if (user) {
            console.log('SUPABASE: User already exists:', user.platform_username);
            return user.user_id;
        }

        const { data, error } = await supabase
            .from(PARAMS.SUPABASE_USERS_TABLE)
            .insert([{ platform_user_id: userId, platform_username: username, platform: "discord" }])
            .select();

        if (error) throw error;

        if (data && data.length === 1) {
            console.log('SUPABASE: New user created:', data[0].platform_username);
            return data[0].user_id;
        }

        console.log('SUPABASE: No user was created.');
    } catch (error) {
        console.error('SUPABASE: Error in user creation process:', error);
    }
}

/**
 * Returns all phone numbers that don't have an unresolved issue and whose Suno accounts have enough credits.
 * @param {string} token - The JWT for authentication.
 * @returns {Array} Array of phone numbers that can be used to log into Suno.
 */
async function getAvailablePhoneNumbers(token) {
    if (!isTokenValid(token)) return null;

    const supabase = getSupabaseClient(token);

    try {
        const { data, error } = await supabase
            .from(PARAMS.SUPABASE_SCRAPER_STATUS_TABLE)
            .select('phone_number')
            .is('latest_error', null)
            .gt('remaining_credits', PARAMS.MIN_SCRAPER_SUPABASE_CREDITS)
            .order('phone_number', { ascending: true });

        if (error) throw error;

        if (data && data.length > 0) {
            const phoneNumbers = data.map(scraper => scraper.phone_number).filter(Boolean);
            console.log(`SUPABASE: Retrieved ${phoneNumbers.length} eligible phone numbers.`);
            return phoneNumbers;
        }

        console.log('SUPABASE: No eligible phone numbers found.');
        return [];
    } catch(error) {
        console.log("SUPABASE: Error getting available phone numbers:", error);
        return null;
    }
}

/**
 * Saves input video frames to Supabase storage.
 * @param {string} token - The JWT for authentication.
 * @param {Array} framePaths - Array of frame paths.
 * @param {string} guildId - The guild ID.
 * @param {string} userId - The user ID.
 * @param {string} initialReplyId - The initial reply ID.
 * @returns {Array|undefined} Array of frame keys if successful, undefined otherwise.
 */
async function saveInputVideoFrames(token, framePaths, guildId, userId, initialReplyId) {
    if (!token || !framePaths.length || !guildId || !userId || !initialReplyId) {
        console.log("SUPABASE: Invalid input for saving video frames.");
        return;
    }

    if (!isTokenValid(token)) return;

    const supabase = getSupabaseClient(token);
    const frameKeys = [];

    try {
        for (const [index, frame] of framePaths.entries()) {
            const path = `user-id:${userId}/guild-id:${guildId}/initial-reply-id:${initialReplyId}/${index}.png`;

            const { error } = await supabase
                .storage
                .from(PARAMS.SUPABASE_SONG_INPUT_VIDEO_FRAMES)
                .upload(path, frame.buffer, {
                    contentType: "image/png",
                    upsert: false
                });

            if (error) throw error;

            console.log('SUPABASE: Uploaded frame successfully:', path);
            frameKeys.push(path);
        }
        return frameKeys;
    } catch(error) {
        console.error('SUPABASE: Error uploading frame:', error);
    }
}

/**
 * Saves an input video to Supabase storage.
 * @param {string} token - The JWT for authentication.
 * @param {Object} video - The video object.
 * @param {string} guildId - The guild ID.
 * @param {string} userId - The user ID.
 * @param {string} initialReplyId - The initial reply ID.
 * @returns {string|undefined} The path of the saved video if successful, undefined otherwise.
 */
async function saveInputVideo(token, video, guildId, userId, initialReplyId) {
    if (!token || !video || !guildId || !userId || !initialReplyId) {
        console.log("SUPABASE: Invalid input for saving video.");
        return;
    }

    if (!isTokenValid(token)) return;

    const supabase = getSupabaseClient(token);

    try {
        const fetch = (await import('node-fetch')).default;
        const response = await fetch(video.url);
        const videoBuffer = await response.arrayBuffer();

        const path = `user-id:${userId}/guild-id:${guildId}/initial-reply-id:${initialReplyId}/0.${video.contentType.split("/")[1]}`;

        const { error } = await supabase
            .storage
            .from(PARAMS.SUPABASE_SONG_INPUT_VIDEOS)
            .upload(path, videoBuffer, {
                contentType: video.contentType,
                upsert: false
            });

        if (error) throw error;

        console.log('SUPABASE: Uploaded video successfully:', path);
        return path;
    } catch (error) {
        console.error('SUPABASE: Error uploading video:', error);
    }
}

/**
 * Saves input images to Supabase storage.
 * @param {string} token - The JWT for authentication.
 * @param {Array} images - Array of image objects.
 * @param {string} guildId - The guild ID.
 * @param {string} userId - The user ID.
 * @param {string} initialReplyId - The initial reply ID.
 * @returns {Array|undefined} Array of image keys if successful, undefined otherwise.
 */
async function saveInputImages(token, images, guildId, userId, initialReplyId) {
    if (!images || images.length == 0) {
        return [];
    }

    if (!token || !guildId || !userId || !initialReplyId) {
        console.log("SUPABASE: Invalid input for saving images.");
        return;
    }

    if (!isTokenValid(token)) return;

    const supabase = getSupabaseClient(token);
    const imageKeys = [];

    try {
        const fetch = (await import('node-fetch')).default;

        for (const [index, image] of images.entries()) {
            const response = await fetch(image.url);
            const imageBuffer = await response.arrayBuffer();

            const path = `user-id:${userId}/guild-id:${guildId}/initial-reply-id:${initialReplyId}/${index}.${image.contentType.split("/")[1]}`;

            const { error } = await supabase
                .storage
                .from(PARAMS.SUPABASE_SONG_INPUT_IMAGES)
                .upload(path, imageBuffer, {
                    contentType: image.contentType,
                    upsert: false
                });

            if (error) throw error;

            console.log('SUPABASE: Uploaded image successfully:', path);
            imageKeys.push(path);
        }
        return imageKeys;
    } catch(error) {
        console.error('SUPABASE: Error uploading image:', error);
    }
}

/**
 * Creates a song generation entry in the database.
 * @param {string} token - The JWT for authentication.
 * @param {string} userId - The user ID.
 * @param {string} videoKey - The video key.
 * @param {Array} imageKeys - Array of image keys.
 * @param {string} initialReplyId - The initial reply ID.
 * @param {string} guildId - The guild ID.
 * @param {string} channelId - The channel ID.
 * @param {string} songPrompt - The song prompt.
 * @param {string} songGenre - The song genre.
 * @param {string} secondSongGenre - The second song genre.
 * @param {string} songVibe - The song vibe.
 * @param {string} songDetails - Additional details to incorporate in the song.
 * @param {string} lockedPhoneNumber - The phone number associated with the account we'll use to create the song.
 * @param {boolean} instrumental_mode - Whether the song will use instrumental mode or not.
 * @param {boolean} custom_mode - Whether the song will have a custom title/lyrics.
 * @param {string} custom_title - The custom title for the song.
 * @param {string} custom_lyrics - The custom lyrics for the song.
 * @returns {string|undefined} The generation ID if successful, undefined otherwise.
 */
async function createSongGeneration(
    token, userId, videoKey, imageKeys, initialReplyId, guildId, 
    channelId, songPrompt, songGenre, secondSongGenre, songVibe, 
    songDetails, lockedPhoneNumber, instrumental_mode = false, 
    custom_mode = false, custom_title = null, custom_lyrics = null
) {
    if (!token || !userId || !initialReplyId || !guildId || !channelId || !songPrompt || !lockedPhoneNumber) {
        console.log("SUPABASE: Invalid input for song generation.");
        return;
    }

    if (!isTokenValid(token)) return;

    const formattedContentKeys = {
        ...(imageKeys && imageKeys.length > 0 && { image_keys: [...imageKeys] }),
        ...(videoKey && { video_key: videoKey })
    };
    
    const songGeneration = {
        user_id: userId,
        song_prompt: songPrompt,
        input_content: formattedContentKeys,
        initial_reply_id: initialReplyId,
        replies_guild: guildId,
        replies_channel_id: channelId,
        use_instrumental_only: instrumental_mode,
        use_custom_mode: custom_mode,
        ...(songGenre && { song_input_genre: songGenre }),
        ...(secondSongGenre && { second_song_input_genre: secondSongGenre }),
        ...(songVibe && { song_input_vibe: songVibe }),
        ...(songDetails && songDetails.length > 0 && { song_input_details: songDetails }),
        ...(lockedPhoneNumber && lockedPhoneNumber != "" && lockedPhoneNumber.length > 0 && { scraper_account: lockedPhoneNumber.toString() }),
        ...(custom_title && custom_title != "" && { song_input_custom_title: custom_title.toString() }),
        ...(custom_lyrics && custom_lyrics != "" && { song_input_custom_lyrics: custom_lyrics.toString() })
    };

    const supabase = getSupabaseClient(token);

    try {
        const { data, error } = await supabase
            .from(PARAMS.SUPABASE_GENERATIONS_TABLE)
            .insert([songGeneration])
            .select();

        if (error) throw error;

        if (data && data.length === 1) {
            console.log('SUPABASE: New song generation:', data[0].generation_id);
            return data[0].generation_id;
        }

        console.log('SUPABASE: No song generation entry was created.');
    } catch (error) {
        console.error('SUPABASE: Error creating a new song generation:', error);
    }
}

/**
 * Save the Discord output reply ID in the generations table.
 * @param {string} token - The JWT for authentication.
 * @param {string} generationId - The generation ID for which we save the output reply ID.
 * @param {string} outputReplyId - The Discord output reply ID that we save.
 * @returns {string|undefined} The generation ID if successful, undefined otherwise.
 */
async function saveOutputReplyId(token, generationId, outputReplyId) {
    if (!token || !generationId || !outputReplyId) {
        console.log("SUPABASE: Invalid input for saving the output reply ID.");
        return;
    }

    if (!isTokenValid(token)) return;

    const supabase = getSupabaseClient(token);

    try {
        const { data, error } = await supabase
            .from(PARAMS.SUPABASE_GENERATIONS_TABLE)
            .update({ output_reply_id: outputReplyId })
            .eq('generation_id', generationId)
            .select();

        if (error) throw error;

        if (data && data.length === 1) {
            console.log('SUPABASE: Updated output reply ID for generation:', generationId);
            return data[0].generation_id;
        }

        console.log('SUPABASE: No generation entry was updated with the output reply ID.');
    } catch (error) {
        console.error('SUPABASE: Error updating output reply ID:', error);
    }
}

/**
 * Get the song title and lyrics from Supabase.
 * @param {string} token - The JWT for authentication.
 * @param {string} generationId - The generation ID from which we get the song title and lyrics.
 * @returns {JSON} The song title, lyrics and path to the song file if successful, null for all variables otherwise.
 */
async function getOutputSongData(token, generationId) {
    if (!token || !generationId) {
        console.log("SUPABASE: Invalid input for fetching the song title and lyrics.");
        return { songTitle: null, songLyrics: null, songFilePath: null };
    }

    if (!isTokenValid(token)) return { songTitle: null, songLyrics: null, songFilePath: null };

    const supabase = getSupabaseClient(token);

    try {
        const { data: generationData, error: generationError } = await supabase
            .from(PARAMS.SUPABASE_GENERATIONS_TABLE)
            .select('error_message, output_song, song_output_title, song_output_lyrics')
            .eq('generation_id', generationId)
            .maybeSingle();

        if (!generationData) {
            throw Error("Could not fetch the song data.");
        }

        if (generationError && generationError.message !== 'No rows found') {
            throw generationError;
        }

        if (generationData.error_message != null) {
            throw Error("The song scraper encountered an error while creating this song.");
        }

        if (generationData.song_output_title == null || generationData.song_output_lyrics == null) {
            throw Error("The song doesn't have an output title or lyrics.");
        }

        if (generationData.output_song == null || generationData.output_song.song == null) {
            throw Error("The generation doesn't link to an output song file.");
        }

        return {
            songTitle: generationData.song_output_title, 
            songLyrics: generationData.song_output_lyrics, 
            songFilePath: generationData.output_song.song 
        }
    } catch(error) {
        console.error('SUPABASE: Error fetching the song title and lyrics:', error);
        return { songTitle: null, songLyrics: null, songFilePath: null };
    }
}

/**
 * @param {string} token - The JWT for authentication.
 * @param {string} songFilePath - The song file path inside the Supabase audio bucket.
 * @returns {Buffer} The song file in buffer format.
 */
async function getSongFile(token, songFilePath) {
    if (!token || !songFilePath) {
        console.log("SUPABASE: Invalid input for downloading the song file.");
        return null;
    }

    if (!isTokenValid(token)) return null;

    const supabase = getSupabaseClient(token);

    try {
        // Get song file from Supabase bucket
        const { data, error } = await supabase
          .storage
          .from(PARAMS.SUPABASE_SONG_OUTPUT_AUDIO)
          .createSignedUrl(songFilePath, PARAMS.MAX_SONG_DOWNLOAD_WAIT_TIME);
    
        if (error) throw error;
    
        // Download the file
        const response = await axios.get(data.signedUrl, { responseType: 'arraybuffer' });

        if (!response.data || response instanceof ArrayBuffer && response.byteLength === 0) {
            throw Error(`There's no audio file at ${songFilePath}.`);
        }

        return Buffer.from(response.data, 'binary');
    } catch(error) {
        console.error('SUPABASE: Error downloading the song file:', error);
        return null;
    }
}

module.exports = {
    saveInputVideo,
    saveInputImages,
    saveInputVideoFrames,
    generateDiscordBotJWT,
    createUserIfNotExists,
    createSongGeneration,
    saveOutputReplyId,
    getOutputSongData,
    getSongFile,
    getAvailablePhoneNumbers
};