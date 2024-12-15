const { inlineCode } = require('discord.js');

const COMMAND_NAMES = Object.freeze({
    IMAGE_TO_SONG: 'image-to-song',
    IMAGE_DESCRIPTION_TO_SONG: 'image-description-to-song',
    VIDEO_TO_SONG: 'video-to-song',
    VIDEO_DESCRIPTION_TO_SONG: 'video-description-to-song',
    TEXT_TO_SONG: 'text-to-song',
    RELOAD: 'reload'
});

const PARAMS = Object.freeze({
    DEFAULT_COOLDOWN: 120,
    DETAILS_LENGTH: 200,
    VISUAL_DESCRIPTION_LENGTH: 170,
    TEXT_TO_SONG_LENGTH: 170,
    MESSAGE_MANAGER: 1000,
    SWEEPER_INTERVAL: 3600,
    SWEEPER_LIFETIME: 604800,
    MIN_VIDEO_LENGTH: 2,
    MAX_VIDEO_LENGTH: 40,
    VIDEO_FRAME_STEPS: 9,
    VIDEO_FRAME_COUNT: 10,
    VIDEO_CROP: 1,
    MAX_COMMAND_EXECUTION_LENGTH: 780,
    COMMAND_EXECUTION_LENGTH_ERROR_MARGIN: 30,
    MIN_RUNTIME: 420,
    MAX_RUNTIME: 840,
    SUPABASE_JWT_LIFETIME: 960,
    CHECK_SONG_STATUS_INTERVAL_TIME: 10,
    MAX_SONG_DOWNLOAD_WAIT_TIME: 60,
    MIN_SCRAPER_SUPABASE_CREDITS: 50,
    MAX_GIF_FRAMES: 3,
    SUPABASE_STORAGE_S3_REGION: "",
    SUPABASE_S3_PROJECT_REF: "",
    SUPABASE_STORAGE_S3_ENDPOINT: "",
    SUPABASE_DISCORD_BOT_ROLE: "discord_bot_role",
    SUPABASE_USERS_TABLE: "users",
    SUPABASE_SCRAPER_STATUS_TABLE: "scraper_status",
    SUPABASE_GENERATIONS_TABLE: "discord_song_generations",
    SUPABASE_SCHEMA: "suno_music_bots",
    SUPABASE_SONG_INPUT_VIDEOS: "song-input-videos",
    SUPABASE_SONG_INPUT_VIDEO_FRAMES: "song-input-video-frames",
    SUPABASE_SONG_INPUT_IMAGES: "song-input-images",
    SUPABASE_SONG_OUTPUT_AUDIO: "song-output-audio",
    REDIS_LOCK_TIME: 780,
    IMAGE_TO_SONG_IN_MAINTENANCE: false,
    IMAGE_DESCRIPTION_TO_SONG_IN_MAINTENANCE: false,
    VIDEO_TO_SONG_IN_MAINTENANCE: false,
    VIDEO_DESCRIPTION_TO_SONG_IN_MAINTENANCE: false,
    TEXT_TO_SONG_IN_MAINTENANCE: false,
    USE_REDIS: true,
    INSTRUMENTAL_LYRICS: "[instrumental]"
});

const PARAM_DESCRIPTIONS = Object.freeze({
    IMAGE_TO_SONG_FIRST_IMAGE: 'Upload your first image.',
    IMAGE_TO_SONG_SECOND_IMAGE: 'Upload your second image.',
    IMAGE_TO_SONG_THIRD_IMAGE: 'Upload your third image.',
    SONG_GENRE: 'Choose the song genre.',
    SONG_SECOND_GENRE: 'Choose the second song genre.',
    SONG_VIBE: 'Choose the song vibe.',
    SONG_DETAILS: 'Enter any details that describe the content you want to upload (max 200 characters).',
    SONG_PROMPT: 'Enter a description/prompt about the song you want (max 170 characters).',
    VIDEO_TO_SONG_VIDEO: 'Upload your video.',
    SONG_VISIBILITY: 'Whether the image/video you upload and the song are public or private.',
    INSTRUMENTAL_MODE: 'Whether the song should only include sound or not.'
});

const GENERAL_MESSAGES = Object.freeze({
    CREATE_SONG_HELPER: `Hey {message_author_id}, I noticed you couldn't create a song. Follow these steps:\n\n- Type the forward slash sign: /\n- You'll see a list of commands (like in the screenshot below) called ${inlineCode("text-to-song")}, ${inlineCode("image-to-song")}, ${inlineCode("image-description-to-song")}, ${inlineCode("video-to-song")} and ${inlineCode("video-description-to-song")}. Click or tap on one of them.\n- You can now create a song! For more details, check this channel: {tutorials_channel}.`,
    SONG_FROM_IMAGE_DESCRIPTION: 'Creates a song from 1-3 images and provides lyrics.',
    SONG_FROM_IMAGE_TEXT_DESCRIPTION: 'Creates a song from a description of 1-3 images.',
    SONG_FROM_TEXT: 'Creates a song using a custom text description.',
    SONG_FROM_VIDEO_DESCRIPTION: 'Creates a song from a video and provides lyrics. Videos must be between 2-40 seconds in length.',
    INITIAL_VIDEO_TO_SONG_REPLY: 'Checking video validity...',
    INITIAL_IMAGE_TO_SONG_REPLY: 'Checking image validity...',
    INITIAL_VIDEO_DESCRIPTION_TO_SONG_REPLY: 'Starting to create a song...',
    INITIAL_IMAGE_DESCRIPTION_TO_SONG_REPLY: 'Starting to create a song...',
    INITIAL_TEXT_TO_SONG_REPLY: 'Starting to create a song...',
    SONG_PROMPT_NOTICE: "Song Prompt: ",
    SONG_INSTRUMENTAL_NOTICE: "Instrumental Mode: ",
    ERROR_NOTICE: "Got an error trying to create your song: ",
    PENDING_SONG_CREATION_NOTICE: "Your song should take between 4-7 minutes to generate and it will be visible here once it's ready."
});

const LOG_ERRORS = Object.freeze({
    IMAGE_TO_SONG_MAINTENANCE: 'The image to song command is under maintenance. Please try again later.',
    IMAGE_DESCRIPTION_TO_SONG_MAINTENANCE: 'The image description to song command is under maintenance. Please try again later.',
    VIDEO_TO_SONG_MAINTENANCE: 'The video to song command is under maintenance. Please try again later.',
    VIDEO_DESCRIPTION_TO_SONG_MAINTENANCE: 'The video description to song command is under maintenance. Please try again later.',
    TEXT_TO_SONG_IN_MAINTENANCE: 'The text to song command is under maintenance. Please try again later.',
    INVALID_VIDEO_FORMAT: `The video must be in MP4, MOV, or WEBM format`,
    IMAGE_TO_SONG_UNEXPECTED_ERROR: `An unexpected error occured.`,
    VIDEO_TO_SONG_UNEXPECTED_ERROR: `An unexpected error occured`,
    CANNOT_EXTRACT_FRAMES: 'Could not extract frames from the video',
    CANNOT_EXTRACT_IMAGE_FRAMES: 'Could not extract frames from the image',
    CANNOT_READ_VIDEO_LENGTH: 'Could not determine the video length',
    INVALID_VIDEO_LENGTH: `Video duration is out of the allowed range (3-30 seconds)`,
    INVALID_DETAILS_INPUT: 'Invalid song details. Make sure you do not include too many special characters (e.g !, ?, $) or code',
    COULD_NOT_CALL_GPT_IMAGES: 'Could not get a description of the images you sent',
    COULD_NOT_CALL_GPT_VIDEO: 'Could not get a description of the video you sent',
    CONVERSION_FAILURE_IMAGES: 'Could not convert the images to a song',
    CONVERSION_FAILURE_VIDEO: 'Could not convert the video to a song',
    CONVERSION_FAILURE_DESCRIPTION: 'Could not use your description to make a song',
    BOT_OVERWHELMED: 'The bot is overwhelmed with requests at this time. Try again in a few minutes',
    EXECUTION_TIME_LIMIT_EXCEEDED: 'The command took too long to execute. Please let an admin know about this',
    CANNOT_PROCEED_SONG_CREATION: 'The bot cannot proceed to song generation. Please let an admin know about this',
    CANNOT_START_CREATE_SONG: 'Cannot start song generation. Please let an admin know about this',
    FAILED_TO_CREATE_SONG_IMAGES: 'Could not create a song for your image/s',
    FAILED_TO_CREATE_SONG_VIDEO: 'Could not create a song for your video',
    TOOK_TOO_LONG_TO_START_GENERATION: 'The bot took too much time to start generating the song. Please let an admin know about this',
    COULD_NOT_GET_SONG_DATA: `Could not get the generated song data. Please let an admin know about this`,
    INVALID_SONG_GENRE: "Invalid song genre. Please select a genre from the provided list",
    INVALID_SONG_VIBE: "Invalid song vibe. Please select a vibe from the provided list",
    INVALID_VISIBILITY: "Invalid visibility. Please select private or public from the provided visibility list.",
    SONG_VIDEO_FILE_CREATION_ERROR: "Could not create your song file",
    CANNOT_ANALYZE_IMAGE: "I cannot analyze the image/s you sent. Please try different image/s",
    CANNOT_ANALYZE_VIDEO: "Cannot analyze the video you sent. Please send a different video",
    COULD_NOT_CREATE_SONG_PROMPT: "Could not create a song prompt. Please let an admin know about this",
    INVALID_INSTRUMENTAL_OPTION: "Invalid instrumental option. Please select an instrumental option from the provided list"
});

const ERRORS = Object.freeze({
    INVALID_IMAGE_FORMAT: 'All images must be in JPG, JPEG, PNG, or WEBP format',
    UNEXPECTED_IMAGE_PROCESSING: 'Error processing the image/s you uploaded',
    DETAILS_LIMIT_EXCEEDED: 'The details must include maximum 200 characters',
    CANNOT_DELETE_VIDEO: 'Error deleting temporary video file.',
    GPT_FAILED_CALL: "Error making the GPT request",
    GPT_NO_CHOICES_IN_RESPONSE: 'No choices available in the response.',
    GPT_MISSING_MESSAGE: 'Message object is missing in the first choice.',
    GPT_CONTENT_MISSING: 'Text content is missing in the message.',
    GPT_INVALID_IMAGES_TO_PROCESS: 'The imageObjects are invalid.',
    GPT_NULL_VIBE_OR_GENRE: 'Null song vibe or genre.',
    COULD_NOT_READ_IMAGES_FROM_DIR: 'Failed to read directory or load images:',
    TRY_CALLING_AGAIN: `You can try to call the same command again straight away.`,
    DETAILS_INCLUDE_URL: "You cannot add a URL in the song details field",
    DESCRIPTION_INCLUDES_URL: "You cannot add a URL in the description field",
    GPT_CANNOT_ANALYZE_CONTENT: "Sorry, but I can't comply with that request.",
    GPT_ERROR_CALLING: "Error making",
    INVALID_WORD_IN_DETAILS: "Invalid word used in the song details field: {invalid_word}",
    INVALID_WORD_IN_DESCRIPTION: "Invalid word used in the description field: {invalid_word}",
});

const GPT = Object.freeze({
    API_URL: "https://api.openai.com/v1/chat/completions",
    GPT_MODEL: "gpt-4o",
    GPT_MAX_TOKENS_SONG_PROMPT: 170,
    GPT_MAX_TEXT_FROM_IMAGES: 300,
    GPT_MAX_CALL_RETRIES: 3,
    GPT_CALL_WAIT: 30000,
    EXTRACT_TEXT: "Extract all the text from these image/s and return it in one string. The texts from different images should be separated by a semicolon like this: Some text 1;Some text 2. If there is no text in any of the images, simply return an empty string like this: ''",
    OBJECT: "GENERAL OBJECT: Analyze the object in this image. \
            Describe its appearance, including color, shape, size, and any visible textures or materials. \
            Explain its potential function or purpose based on its design and context in the image. \
            Note any specific features or details that might suggest how it is used or its cultural or historical significance. \
            Provide insights on how the object interacts with its surroundings and if there are any identifiable signs of wear or age.\n",
    PEOPLE: "PERSON/PEOPLE: Analyze the people in this image. \
            Describe each person’s appearance including their clothing, posture, facial expressions, and any visible accessories. \
            Discuss the possible relationships and interactions between the people. \
            Evaluate the setting and context of the image, including any cultural or social cues. \
            Identify any emotions that seem to be expressed and speculate on the possible reasons behind these emotions. \
            Offer insights into what the setting and actions might tell us about the social or cultural context. \
            Note any unique features such as tattoos, hairstyles, or distinctive clothing that might provide deeper insight into individual identity or cultural significance.\n",
    SCENE: "SCENE: Analyze the scene in this image. \
            Describe the setting, including any buildings, natural features, and objects. \
            Note the arrangement of these elements and how they interact with each other. \
            Assess the atmosphere or mood conveyed by the lighting, weather conditions, and time of day. \
            Identify any people or animals present, discussing their activities and how they relate to the overall setting. \
            Explore any visible signs that might suggest a cultural or historical context. \
            Consider any symbols or text in the image and what they could signify. \
            Discuss the possible narrative or story being told through the scene. \
            Highlight any unique or unusual aspects of the scene that might not be immediately apparent.\n",
    ANIMALS: "ANIMALS: Analyze the animals in this image. \
            Describe each animal's physical characteristics including size, color, and any distinctive markings. \
            Discuss their apparent behaviors and interactions with other animals or the environment. \
            Evaluate their habitat as shown in the image, noting elements that indicate whether this habitat is natural or artificial. \
            Provide insights on any ecological roles these animals might play in their environment. \
            If there are visible signs of human interaction or impact, discuss these aspects. \
            Explore possible conservation status or threats if evident. \
            Conclude with any unique or less obvious details that contribute to understanding these animals’ lives and roles in their ecosystem.\n",
    PLANTS_AND_VEG: "PLANTS & VEGETATION: Provide a detailed analysis of the plants or vegetation in this image. \
                    Describe the types of plants visible, including their shapes, sizes, colors, and any distinctive features such as flowers or fruit. \
                    Assess the health and growth stage of the plants. \
                    Discuss the ecological context of the vegetation, including the type of ecosystem and its likely climate. \
                    Identify any interactions between the plants and other elements in the ecosystem, such as animals, insects, or humans. \
                    Note any signs of environmental stress or disease. \
                    Explore the potential uses of these plants, whether medicinal, culinary, or ecological. \
                    Conclude with any unique or culturally significant aspects of the vegetation that might not be immediately apparent.\n",
    SOMETHING_ELSE: "SOMETHING ELSE: Provide a comprehensive analysis of the primary object or entity in this image. \
                    Describe its physical attributes such as size, shape, color, and texture. \
                    Discuss any identifiable features and their possible functions. \
                    Analyze the context in which the object/entity is placed, including interactions with surrounding elements. \
                    Assess the material composition if visible, and speculate on the manufacturing or natural formation processes involved. \
                    Reflect on the cultural, historical, or environmental significance it may hold. \
                    Explain how the object/entity might be used based on its design and setting. \
                    If there are any text or symbols associated with it, interpret their meanings. \
                    Conclude with any unique or subtle details that might not be immediately apparent but contribute to a deeper understanding of the object/entity.\n",
    INTRO: "Analyze each image in depth, depending on the primary subject or subjects in it. \
            Use one or a combination of the following prompts to analyze each image, depending on who the primary subject/subjects are.\n",
    COMBINE_IMAGES: "Determine if the images are related to each other.\
                    If they are related, combine the information about each image into one description that's coherent.\
                    If one or more images are not related to the rest, combine the information from that/these image/s with the other descriptions so that the final description is coherent.\n",
    OUTPUT_STRUCTURE: "Pack as many details as possible in your output. Here are some examples: \
                       1. An image shows 'a couple in black outfits sharing a tender moment outdoors. Man is kissing the woman. It seems to be the middle of the day, there are trees in the background.'. The ideal output is: '${article} ${songVibe} ${songGenre} song about a couple dressed in black; he is kissing her; daylight; nature in the background'. \
                       2. Several images show 'a quick makeup transition on camera by @anastasile. Before: bare-faced, natural look. After: bold blue makeup, wet effects. Transformation captured in detailed sequences.'. The ideal description is: '${article} ${songVibe} ${songGenre} song about a quick makeup transition; @anastasile; before: bare-faced, natural look; after: bold blue makeup, wet effects'. \
                       3. An image shows 'a starry night over a serene town, with swirling skies and luminous stars reflecting on the water.'. The ideal description is: '${article} ${songVibe} ${songGenre} song about a starry night; scene of a town; swirling skies; luminous stars reflecting on the water'. \
                       4. An image shows 'an anime girl with cat ears and purple hair, making a peace sign. She's in casual clothes, smiling with a playful expression in a well-lit, leafy room.'. The ideal description is: '${article} ${songVibe} ${songGenre} song about an anime girl with cat ears and purple hair; makes a peace sign; wears casual clothes; smiles with playful expression; leafy room' \
                       5. An image shows 'a vibrant anime character with colorful accessories, big, orange eyes, wearing bracelets and a choker, with a pet on her right shoulder, surrounded by vivid decorations in a lively setting.'. The ideal description that fits within our constraints is: '${article} ${songVibe} ${songGenre} song about an anime character; big, orange eyes; wearing bracelets and a neck choker; her pet on her right shoulder; surrounded by vivid decorations'. \
                       6. An image shows 'a cheetah dashing across an arid savannah, showcasing its agility and grace. The setting sun casts a warm glow, highlighting its sleek, spotted coat.'. The ideal description is: '${article} ${songVibe} ${songGenre} song about a cheetah; running through the savannah; agile; powerful; spotted coat; sun casts a warm glow.'\n",
    FORBIDDEN_WORDS: "You must avoid using the following words in your output: suno, fight, crime, bloody, blood, massacre, death, blossoms, katana, taylor, JZ, beyonce, swift, drake.\n",
    MILD_FORBIDDEN_WORDS: [
        "suno", 
        "fight", 
        "crime", 
        "bloody", 
        "blood", 
        "massacre", 
        "blossoms", 
        "katana", 
        "taylor", 
        "JZ", 
        "beyonce", 
        "swift", 
        "drake", 
        "michael jackson", 
        "adele"
    ],
    STRONG_FORBIDDEN_WORDS: [
        "suno",
        "idiot"
        // TODO: Add more
    ]
});

const AUTOCOMPLETE_FIELDS = Object.freeze({
    SONG_GENRES: [
        { name: 'Pop', value: 'pop' },
        { name: 'J-Pop', value: 'j-pop' },
        { name: 'Reggae', value: 'reggae' },
        { name: 'Dancehall', value: 'dancehall' },
        { name: 'Rock', value: 'rock' },
        { name: 'Alternative', value: 'alternative' },
        { name: 'Folklore', value: 'folklore' },
        { name: 'Highlife', value: 'highlife' },
        { name: 'Opera', value: 'opera' },
        { name: 'Calypso', value: 'calypso' },
        { name: 'Hip-Hop', value: 'hip-hop' },
        { name: 'Rap', value: 'rap' },
        { name: 'Jazz', value: 'jazz' },
        { name: 'Country', value: 'country' },
        { name: 'Trap', value: 'trap' },
        { name: 'K-pop', value: 'k-pop' },
        { name: 'R&B', value: 'r&b' },
        { name: 'EDM', value: 'edm' },
        { name: 'Funk', value: 'funk' },
        { name: 'Classical', value: 'classical' },
        { name: 'Metal', value: 'metal' },
        { name: "Afrobeat", value: "afrobeat" }
    ],
    SECOND_SONG_GENRES: [
        { name: "None", value: "none" },
        { name: 'Pop', value: 'pop' },
        { name: 'J-Pop', value: 'j-pop' },
        { name: 'Reggae', value: 'reggae' },
        { name: 'Dancehall', value: 'dancehall' },
        { name: 'Alternative', value: 'alternative' },
        { name: 'Folklore', value: 'folklore' },
        { name: 'Highlife', value: 'highlife' },
        { name: 'Opera', value: 'opera' },
        { name: 'Calypso', value: 'calypso' },
        { name: 'Rock', value: 'rock' },
        { name: 'Hip-Hop', value: 'hip-hop' },
        { name: 'Rap', value: 'rap' },
        { name: 'Jazz', value: 'jazz' },
        { name: 'Country', value: 'country' },
        { name: 'Trap', value: 'trap' },
        { name: 'K-pop', value: 'k-pop' },
        { name: 'R&B', value: 'r&b' },
        { name: 'EDM', value: 'edm' },
        { name: 'Funk', value: 'funk' },
        { name: 'Classical', value: 'classical' },
        { name: 'Metal', value: 'metal' },
        { name: "Afrobeat", value: "afrobeat" }
    ],
    SONG_VIBES: [
        { name: 'Happy', value: 'happy' },
        { name: 'Funny', value: 'funny' },
        { name: 'Romantic', value: 'romantic' },
        { name: 'Ambiental', value: 'ambiental' },
        { name: 'Ethereal', value: 'ethereal' },
        { name: 'Cinematic', value: 'cinematic' },
        { name: 'Fearful', value: 'fearful' },
        { name: 'Sad', value: 'sad' },
        { name: 'Calm', value: 'calm' },
        { name: 'Emotional', value: 'emotional' },
        { name: 'Melancholic', value: 'melancholic' },
        { name: 'Energetic', value: 'energetic' },
        { name: 'Villain', value: 'villain' },
        { name: 'Hero', value: 'hero' },
    ],
    VISIBILITY: [
        { name: 'Public', value: 'public' },
        { name: 'Private', value: 'private' }
    ],
    INSTRUMENTAL_MODE: [
        { name: 'True', value: 'true' },
        { name: 'False', value: 'false' }
    ]
});

const MIMES = Object.freeze({
    IMAGES: ['image/jpeg', 'image/png', 'image/webp', 'image/jpg', 'image/gif'],
    VIDEOS: ['mp4', 'mov', 'webm', 'quicktime']
});

const MESSAGE_MONITORING_CHANNELS = Object.freeze({
    "guildid": "channelid",
    "guildid": "channelid"
});

const TUTORIALS_CHANNEL = Object.freeze({
    "guildid": "<#channelid>",
    "guildid": "<#channelid>"
});

const PRIVATE_CREATE_SONGS = Object.freeze({
    "guildid": "channelid",
    "guildid": "channelid"
});

const SONG_FEEDS = Object.freeze({
    "guildid": {
        "pop": "channelid",
        "j-pop": "channelid",
        "reggae": "channelid",
        "dancehall": "channelid",
        "alternative": "channelid",
        "folklore": "channelid",
        "highlife": "channelid",
        "opera": "channelid",
        "calypso": "channelid",
        "rock": "channelid",
        "hip-hop": "channelid",
        "rap": "channelid",
        "jazz": "channelid",
        "country": "channelid",
        "trap": "channelid",
        "k-pop": "channelid",
        "r&b": "channelid",
        "edm": "channelid",
        "funk": "channelid",
        "classical": "channelid",
        "metal": "channelid",
        "afrobeat": "channelid"
    },
    "guildid": {
        "pop": "channelid",
        "j-pop": "channelid",
        "reggae": "channelid",
        "dancehall": "channelid",
        "alternative": "channelid",
        "folklore": "channelid",
        "highlife": "channelid",
        "opera": "channelid",
        "calypso": "guildid",
        "rock": "channelid",
        "hip-hop": "channelid",
        "rap": "channelid",
        "jazz": "channelid",
        "country": "channelid",
        "trap": "channelid",
        "k-pop": "channelid",
        "r&b": "channelid",
        "edm": "channelid",
        "funk": "channelid",
        "classical": "channelid",
        "metal": "channelid",
        "afrobeat": "channelid"
    }
});

const USERS_NO_LOG = Object.freeze([
    "@your_discord_id" // We use this so your own song creation requests don't get logged
]);

module.exports = { 
    COMMAND_NAMES, 
    PARAMS, 
    GPT,
    MIMES,
    PARAM_DESCRIPTIONS, 
    GENERAL_MESSAGES, 
    LOG_ERRORS,
    ERRORS, 
    AUTOCOMPLETE_FIELDS,
    SONG_FEEDS,
    USERS_NO_LOG,
    PRIVATE_CREATE_SONGS,
    TUTORIALS_CHANNEL,
    MESSAGE_MONITORING_CHANNELS
}