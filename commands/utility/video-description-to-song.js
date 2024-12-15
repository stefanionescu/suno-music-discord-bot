const path = require('path');
const dotenv = require('dotenv');
const { logSongCreation } = require("../../analytics/posthog.js");
const { lockPhoneNumber, unlockPhoneNumber } = require("../../storage/redis.js");
const { startScrapeJob, monitorSongStatus } = require("../../scrape/scrapingAPI.js");
const { saveVideo, getVideoDuration, extractFrames } = require("../../utils/videoUtils.js");
const { SlashCommandBuilder, PermissionsBitField, AttachmentBuilder, inlineCode } = require('discord.js');
const { 
    generateDiscordBotJWT, 
    createUserIfNotExists, 
    saveInputVideo,
    saveInputVideoFrames,
    createSongGeneration,
    saveOutputReplyId,
    getOutputSongData,
    getSongFile
} = require("../../storage/supabase.js");
const { 
    COMMAND_NAMES, 
    LOG_ERRORS, 
    PARAMS,
    MIMES,
    PARAM_DESCRIPTIONS, 
    GENERAL_MESSAGES, 
    ERRORS,
    AUTOCOMPLETE_FIELDS
} = require('../../constants.js');
const { 
    getSongDetails, 
    validateVisualDetails,
    postSongToFeed,
    formatSongDetails,
    handleAutocomplete, 
    createDir,
    createSongPrompt,
    loadImagePathsFromDirectory,
    wipeTemporaryData,
    postToPrivateCreateSongs
} = require("../../utils/commandUtils.js");

dotenv.config();

/**
 * Collects and processes the video from the interaction.
 * @param {Object} interaction - The Discord interaction object.
 * @param {string} filePath - The path where the video file will be saved.
 * @returns {Object} An object containing video information or an error.
 */
async function collectVideo(interaction, filePath) {
    let video = {
        valid: interaction.options.getAttachment('video'),
        error: null,
        duration: 0
    };

    const fileType = video.valid.contentType.split('/')[1];
    if (!MIMES.VIDEOS.includes(fileType)) {
        video.error = LOG_ERRORS.INVALID_VIDEO_FORMAT;
        return video;
    }

    try {
        await saveVideo(video.valid.url, filePath);
        video.duration = await getVideoDuration(filePath);
    } catch (error) {
        if (error.message === LOG_ERRORS.INVALID_VIDEO_LENGTH) {
            video.error = LOG_ERRORS.INVALID_VIDEO_LENGTH;
        } else {
            video.error = LOG_ERRORS.VIDEO_TO_SONG_UNEXPECTED_ERROR;
        }
    }

    return video;
}

/**
 * Handles error responses and cleans up.
 * @param {Object} interaction - The Discord interaction object.
 * @param {Object} replyToDelete - The reply to delete.
 * @param {string} errorMessage - The error message to display.
 * @param {string} subdirPath - The path to the temporary subdirectory.
 * @param {string} lockedPhoneNumber - The locked phone number to unlock.
 * @param {Boolean} privateSong - Whether the song generation is private or not.
 * @param {boolean} encourageCallAgain - Whether the error message should mention to the user that they should try to call the command again.
 */
async function handleError(interaction, replyToDelete, errorMessage, subdirPath, lockedPhoneNumber = null, privateSong = false, encourageCallAgain = true) {
    if (lockedPhoneNumber) await unlockPhoneNumber(lockedPhoneNumber);
    await wipeTemporaryData(subdirPath);

    if (replyToDelete && !privateSong) {
        await replyToDelete.delete();
    }
    
    let errorContent = `${interaction.user.toString()} ${GENERAL_MESSAGES.ERROR_NOTICE}${inlineCode(errorMessage)}`;
    if (encourageCallAgain) {
        errorContent += `. ${ERRORS.TRY_CALLING_AGAIN}`;
    }

    if (replyToDelete) {
        await interaction.followUp({ 
            content: errorContent, 
            ephemeral: true 
        });
    } else {
        await interaction.reply({
            content: errorContent, 
            ephemeral: true 
        });
    }
}

/**
 * Processes the video-to-song generation.
 * @param {Object} interaction - The Discord interaction object.
 * @param {Object} initialReply - The initial reply object.
 * @param {Object} video - The video object.
 * @param {Object} songDetails - The song details.
 * @param {Array} imagePaths - The paths of extracted frames.
 * @param {string} userId - The Discord user ID.
 * @param {string} supabaseToken - The Supabase token.
 * @param {string} createdUser - The Supabase user ID.
 * @param {string} subdirPath - The path to the temporary subdirectory.
 * @param {string} filePath - The path to the video file.
 * @param {number} startTimestamp - The start timestamp.
 * @param {Boolean} privateSong - Whether the song generation is private or not.
 */
async function processSongGeneration(interaction, initialReply, video, songDetails, imagePaths, supabaseToken, userId, createdUser, subdirPath, filePath, startTimestamp, privateSong = false) {
    let lockedPhoneNumber = null;
    let outputReply = null;

    try {
        lockedPhoneNumber = await lockPhoneNumber(supabaseToken);
        if (!lockedPhoneNumber) {
            await handleError(interaction, initialReply, LOG_ERRORS.BOT_OVERWHELMED, subdirPath, filePath, false, privateSong);
            throw Error(LOG_ERRORS.BOT_OVERWHELMED);
        }

        const songPrompt = createSongPrompt(interaction.options.getString('video_description'), songDetails.songGenre, songDetails.secondSongGenre);
        if (!songPrompt) {
            await handleError(interaction, initialReply, LOG_ERRORS.COULD_NOT_CREATE_SONG_PROMPT, lockedPhoneNumber, privateSong);
            throw Error(LOG_ERRORS.COULD_NOT_CREATE_SONG_PROMPT);
        }

        const videoKey = await saveInputVideo(supabaseToken, video.valid, interaction.guildId, userId, initialReply.id);
        if (!videoKey) {
            await handleError(interaction, initialReply, LOG_ERRORS.CONVERSION_FAILURE_DESCRIPTION, subdirPath, filePath, lockedPhoneNumber, privateSong);
            throw Error(LOG_ERRORS.CONVERSION_FAILURE_DESCRIPTION);
        }

        const frameKeys = await saveInputVideoFrames(supabaseToken, imagePaths, interaction.guildId, userId, initialReply.id);
        if (!frameKeys || frameKeys.length !== imagePaths.length) {
            await handleError(interaction, initialReply, LOG_ERRORS.CONVERSION_FAILURE_DESCRIPTION, subdirPath, filePath, lockedPhoneNumber, privateSong);
            throw Error(LOG_ERRORS.CONVERSION_FAILURE_DESCRIPTION);
        }

        const instrumentalMode = interaction.options.getString('instrumental_mode').toString().toLowerCase() === "true";
        const generationId = await createSongGeneration(
            supabaseToken, createdUser, videoKey, frameKeys, initialReply.id, 
            interaction.guildId, interaction.channelId, songPrompt, 
            songDetails.songGenre, songDetails.secondSongGenre, null, 
            null, lockedPhoneNumber, instrumentalMode
        );

        if (!generationId) {
            await handleError(interaction, initialReply, LOG_ERRORS.CANNOT_PROCEED_SONG_CREATION, subdirPath, filePath, lockedPhoneNumber, privateSong);
            throw Error(LOG_ERRORS.CANNOT_PROCEED_SONG_CREATION);
        }

        try {
            const firstReply = `${songDetails.firstReplyMessage}\n${GENERAL_MESSAGES.SONG_PROMPT_NOTICE}${inlineCode(songPrompt)}\n`;
            const instrumentalMessage = `${GENERAL_MESSAGES.SONG_INSTRUMENTAL_NOTICE}${inlineCode(instrumentalMode.toString())}`;

            await interaction.editReply({
                content: firstReply + instrumentalMessage
            });

            if (privateSong) {
                await postToPrivateCreateSongs(
                    interaction,
                    firstReply + instrumentalMessage,
                    imagePaths,
                    true,
                    "video",
                    "video-description-to-song"
                );
            }
        } catch(error) {
            console.log("COMMAND: Could not update the initial reply with the song prompt.");
        }

        if (Math.floor(Date.now() / 1000) - startTimestamp >= PARAMS.MAX_COMMAND_EXECUTION_LENGTH) {
            await handleError(interaction, initialReply, LOG_ERRORS.EXECUTION_TIME_LIMIT_EXCEEDED, subdirPath, filePath, lockedPhoneNumber, privateSong);
            throw Error(LOG_ERRORS.EXECUTION_TIME_LIMIT_EXCEEDED);
        }

        outputReply = await interaction.followUp({ 
            content: `${interaction.user.toString()} ${GENERAL_MESSAGES.PENDING_SONG_CREATION_NOTICE}`, 
            ephemeral: privateSong 
        });

        const saveOutputReplyIDResponse = await saveOutputReplyId(supabaseToken, generationId, outputReply.id)
        if (!saveOutputReplyIDResponse) {
            if (!privateSong) await initialReply.delete()
            await handleError(interaction, outputReply, LOG_ERRORS.VIDEO_TO_SONG_UNEXPECTED_ERROR, lockedPhoneNumber, privateSong);
            throw Error(LOG_ERRORS.VIDEO_TO_SONG_UNEXPECTED_ERROR);
        }

        const maxRuntime = PARAMS.MAX_COMMAND_EXECUTION_LENGTH - PARAMS.COMMAND_EXECUTION_LENGTH_ERROR_MARGIN - (Math.floor(Date.now() / 1000) - startTimestamp);
        if (maxRuntime < PARAMS.MIN_RUNTIME || maxRuntime > PARAMS.MAX_RUNTIME) {
            if (!privateSong) await initialReply.delete();
            await handleError(interaction, outputReply, LOG_ERRORS.TOOK_TOO_LONG_TO_START_GENERATION, lockedPhoneNumber, privateSong);
            throw Error(LOG_ERRORS.TOOK_TOO_LONG_TO_START_GENERATION);
        }

        const startScrapingEcsARN = await startScrapeJob(
           generationId, 
           lockedPhoneNumber, 
           maxRuntime
        );
        if (!startScrapingEcsARN || startScrapingEcsARN == "") {
            console.log("COMMAND: Seconds passed until failure:", Math.floor(Date.now() / 1000) - startTimestamp);
            if (!privateSong) await initialReply.delete();
            return handleError(interaction, outputReply, LOG_ERRORS.CANNOT_START_CREATE_SONG, lockedPhoneNumber, privateSong);
        }

        console.log(`COMMAND: Started a new song creation job with ${lockedPhoneNumber}!`);

        const monitorDurationWithoutExpiredTime = PARAMS.MAX_COMMAND_EXECUTION_LENGTH - PARAMS.COMMAND_EXECUTION_LENGTH_ERROR_MARGIN;
        const maxMonitorDuration = (monitorDurationWithoutExpiredTime * 1000) - Math.floor((Date.now() - (startTimestamp * 1000)) / 1000) * 1000;
        const songStatusResult = await monitorSongStatus(maxMonitorDuration, generationId, startScrapingEcsARN);
        if (!songStatusResult) {
            console.log("COMMAND: Seconds passed until failure:", Math.floor(Date.now() / 1000) - startTimestamp);
            if (!privateSong) await initialReply.delete();
            return handleError(interaction, outputReply, LOG_ERRORS.FAILED_TO_CREATE_SONG_VIDEO, lockedPhoneNumber, privateSong);
        }

        console.log(`COMMAND: Managed to finish the song creation job using ${lockedPhoneNumber}!`);

        const outputSongData = await getOutputSongData(supabaseToken, generationId);
        if (!outputSongData || !outputSongData.songTitle || !outputSongData.songLyrics || !outputSongData.songFilePath) {
            console.log("COMMAND: Seconds passed until failure:", Math.floor(Date.now() / 1000) - startTimestamp);
            if (!privateSong) await initialReply.delete();
            await handleError(interaction, outputReply, LOG_ERRORS.COULD_NOT_GET_SONG_DATA, lockedPhoneNumber, privateSong);
            throw Error(LOG_ERRORS.COULD_NOT_GET_SONG_DATA);
        }

        const songFile = await getSongFile(supabaseToken, outputSongData.songFilePath);
        if (!songFile || songFile == "" || Buffer.isBuffer(songFile) && songFile.length === 0) {
            console.log("COMMAND: Seconds passed until failure:", Math.floor(Date.now() / 1000) - startTimestamp);
            if (!privateSong) await initialReply.delete();
            await handleError(interaction, outputReply, LOG_ERRORS.COULD_NOT_GET_SONG_DATA, lockedPhoneNumber, privateSong);
            throw Error(LOG_ERRORS.COULD_NOT_GET_SONG_DATA);
        }

        const filePathComponents = outputSongData.songFilePath.split("/");
        const songFileAttachment = new AttachmentBuilder(songFile, { name: filePathComponents[filePathComponents.length - 1] });

        const outputMessage = formatSongDetails(
            interaction.user.toString(), 
            outputSongData.songTitle, 
            songDetails.songGenre, 
            songDetails.secondSongGenre,
            songDetails.songVibe, 
            outputSongData.songLyrics, 
            null,
            interaction.options.getString('video_description'),
            instrumentalMode
        );

        if (!privateSong) {
            await outputReply.edit({
                content: outputMessage,
                files: [songFileAttachment]
            });
        } else {
            await interaction.followUp({ 
                content: outputMessage,
                files: [songFileAttachment],
                ephemeral: privateSong 
            });

            await postToPrivateCreateSongs(interaction, outputMessage, songFileAttachment, false, "song", "video-description-to-song");
        }

        // Send a message to the corresponding song feed if the song is public
        if (!privateSong) {
            await postSongToFeed(
                interaction, 
                `https://discord.com/channels/${interaction.guild.id}/${interaction.channel.id}/${initialReply.id}`, 
                outputMessage, 
                songFileAttachment, 
                songDetails.songGenre
            );
        }
        
        await wipeTemporaryData(subdirPath);
        await unlockPhoneNumber(lockedPhoneNumber);
        
        console.log("COMMAND: Seconds passed until success:", Math.floor(Date.now() / 1000) - startTimestamp);
    } catch (error) {
        console.error(error);
        if (!privateSong) await initialReply.delete();
        await handleError(interaction, outputReply, LOG_ERRORS.CONVERSION_FAILURE_DESCRIPTION, subdirPath, filePath, lockedPhoneNumber, privateSong);
        throw Error(LOG_ERRORS.CONVERSION_FAILURE_DESCRIPTION);
    }
}

module.exports = {
    category: 'utility',
    cooldown: PARAMS.DEFAULT_COOLDOWN,
    data: new SlashCommandBuilder()
        .setName(COMMAND_NAMES.VIDEO_DESCRIPTION_TO_SONG)
        .setDescription(GENERAL_MESSAGES.SONG_FROM_VIDEO_DESCRIPTION)
        .setDMPermission(false)
        .addAttachmentOption(option => option.setName('video').setDescription(PARAM_DESCRIPTIONS.VIDEO_TO_SONG_VIDEO).setRequired(true))
        .addStringOption(option => 
            option.setName('video_description')
                .setDescription(PARAM_DESCRIPTIONS.SONG_PROMPT)
                .setRequired(true)
                .setMaxLength(PARAMS.VISUAL_DESCRIPTION_LENGTH))
        .addStringOption(option =>
            option.setName('song_genre')
                .setDescription(PARAM_DESCRIPTIONS.SONG_GENRE)
                .setRequired(true)
                .setAutocomplete(true))
        .addStringOption(option =>
            option.setName('second_song_genre')
                .setDescription(PARAM_DESCRIPTIONS.SONG_SECOND_GENRE)
                .setRequired(true)
                .setAutocomplete(true))
        .addStringOption(option =>
            option.setName('instrumental_mode')
                .setDescription(PARAM_DESCRIPTIONS.INSTRUMENTAL_MODE)
                .setRequired(true)
                .setAutocomplete(true))
        .addStringOption(option =>
            option.setName('visibility')
                .setDescription(PARAM_DESCRIPTIONS.SONG_VISIBILITY)
                .setRequired(true)
                .setAutocomplete(true)),

    async execute(interaction) {
        const startTimestamp = Math.floor(Date.now() / 1000);
        const commandCaller = interaction.user.toString();

        let userDevice = "invisible";
        try {
            userDevice = await getUserDevice(interaction);
        } catch(error) {
            userDevice = "invisible";
        }

        console.log(`COMMAND: The user device type is ${userDevice}`);

        await logSongCreation(
            commandCaller,
            "video-description",
            interaction.options.getString('song_genre') || '',
            interaction.options.getString('second_song_genre') || '',
            '',
            userDevice
        );

        if ((PARAMS.VIDEO_DESCRIPTION_TO_SONG_IN_MAINTENANCE || process.env.PAUSE_ALL_COMMANDS.toLowerCase() == "true") && 
            !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            await interaction.reply({ content: `${commandCaller} ${LOG_ERRORS.VIDEO_DESCRIPTION_TO_SONG_MAINTENANCE}`, ephemeral: true });
            throw Error(LOG_ERRORS.VIDEO_DESCRIPTION_TO_SONG_MAINTENANCE);
        }

        // Prevent invalid visibility
        const selectedVisibility = interaction.options.getString('visibility').toLowerCase();
        const isValidVisibility = AUTOCOMPLETE_FIELDS.VISIBILITY.some(visibility => 
            visibility.value.toLowerCase() === selectedVisibility.toLowerCase());

        if (!isValidVisibility) {
            await handleError(interaction, null, LOG_ERRORS.INVALID_VISIBILITY, null);
            throw Error(LOG_ERRORS.INVALID_VISIBILITY);
        }

        // Prevent invalid instrumental option
        const selectedInstrumentalOption = interaction.options.getString('instrumental_mode').toLowerCase();
        const isValidInstrumentalOption = AUTOCOMPLETE_FIELDS.INSTRUMENTAL_MODE.some(mode => 
            mode.value.toLowerCase() === selectedInstrumentalOption.toLowerCase());
        if (!isValidInstrumentalOption) {
            await handleError(interaction, null, LOG_ERRORS.INVALID_INSTRUMENTAL_OPTION, null);
            throw Error(LOG_ERRORS.INVALID_INSTRUMENTAL_OPTION);
        }

        const ephemerality = selectedVisibility === "private" ? true : false;

        const tempDir = path.join(__dirname, "temp");
        const [dirError] = await createDir(tempDir, true);
        if (dirError) {
            await interaction.reply({
                content: `${commandCaller} ${GENERAL_MESSAGES.ERROR_NOTICE}${inlineCode(LOG_ERRORS.VIDEO_TO_SONG_UNEXPECTED_ERROR)}`,
                ephemeral: true
            });
            throw Error(LOG_ERRORS.VIDEO_TO_SONG_UNEXPECTED_ERROR);
        }

        const initialReply = await interaction.reply({
            content: `${commandCaller} ${GENERAL_MESSAGES.INITIAL_VIDEO_DESCRIPTION_TO_SONG_REPLY}`,
            ephemeral: ephemerality
        });

        // Prevent invalid genres or vibes
        const selectedGenre = interaction.options.getString('song_genre');
        const selectedSecondGenre = interaction.options.getString('second_song_genre');
       
        const isValidGenre = AUTOCOMPLETE_FIELDS.SONG_GENRES.some(genre => 
            genre.value.toLowerCase() === selectedGenre.toLowerCase()
        );
        const isValidSecondGenre = AUTOCOMPLETE_FIELDS.SECOND_SONG_GENRES.some(genre => 
            genre.value.toLowerCase() === selectedSecondGenre.toLowerCase()
        );

        if (!isValidGenre || !isValidSecondGenre) {
            await handleError(interaction, initialReply, LOG_ERRORS.INVALID_SONG_GENRE, null, null, ephemerality);
            throw Error(LOG_ERRORS.INVALID_SONG_GENRE);
        }

        const validatedDescription = await validateVisualDetails(interaction.options.getString('video_description'));
        if (validatedDescription.error) {
            await handleError(interaction, initialReply, validatedDescription.error, null, null, ephemerality);
            throw Error(validatedDescription.error);
        }

        const timestamp = Date.now();
        const subdir = `${interaction.user.id}-${timestamp}`;
        const subdirPath = path.join(__dirname, "temp", subdir);
        const [subdirError, subdirExists] = await createDir(subdirPath, true);
        if (subdirError || subdirExists) {
            await handleError(interaction, initialReply, LOG_ERRORS.CANNOT_EXTRACT_FRAMES, null, null, ephemerality);
            throw Error(LOG_ERRORS.CANNOT_EXTRACT_FRAMES);
        }

        const attachment = interaction.options.getAttachment('video');
        const filename = `${interaction.user.id}-${timestamp}.${attachment.contentType.split('/')[1]}`;
        const filePath = path.join(__dirname, "temp", subdir, filename);
        const video = await collectVideo(interaction, filePath);

        if (video.error) {
            await handleError(interaction, initialReply, video.error, subdirPath, null, ephemerality);
            throw Error(video.error);
        }
        if (!video.duration) {
            await handleError(interaction, initialReply, LOG_ERRORS.CANNOT_READ_VIDEO_LENGTH, subdirPath, null, ephemerality);
            throw Error(LOG_ERRORS.CANNOT_READ_VIDEO_LENGTH);
        }

        const framesDir = path.join(subdirPath, "frames");
        const [framesDirError, framesDirExists] = await createDir(framesDir, true);
        if (framesDirError || framesDirExists) {
            await handleError(interaction, initialReply, LOG_ERRORS.CANNOT_EXTRACT_FRAMES, subdirPath, null, ephemerality);
            throw Error(LOG_ERRORS.CANNOT_EXTRACT_FRAMES); 
        }

        const extractFramesResult = await extractFrames(filePath, framesDir, video.duration);
        if (extractFramesResult) {
            await handleError(interaction, initialReply, extractFramesResult, subdirPath, null, ephemerality);
            throw Error(extractFramesResult);
        }

        const imagePaths = await loadImagePathsFromDirectory(framesDir);
        if (!imagePaths || imagePaths.length === 0) {
            await handleError(interaction, initialReply, LOG_ERRORS.CANNOT_EXTRACT_FRAMES, subdirPath, null, ephemerality);
            throw Error(LOG_ERRORS.CANNOT_EXTRACT_FRAMES);
        }

        const songDetails = getSongDetails(interaction, PARAMS.VIDEO_FRAME_COUNT, false);
        try {
            await interaction.editReply({
                content: songDetails.firstReplyMessage,
                files: imagePaths.map(data => data.buffer)
            });
        } catch(error) {
            console.log("COMMAND: Could not attach the video frames to the initial reply.");
        }

        if (Math.floor(Date.now() / 1000) - startTimestamp >= PARAMS.MAX_COMMAND_EXECUTION_LENGTH) {
            await handleError(interaction, initialReply, LOG_ERRORS.EXECUTION_TIME_LIMIT_EXCEEDED, subdirPath, null, ephemerality);
            throw Error(LOG_ERRORS.EXECUTION_TIME_LIMIT_EXCEEDED);
        }

        const userId = interaction.user.toString().replace("<", "").replace(">", "");
        const username = interaction.user.username;
        const supabaseToken = generateDiscordBotJWT();
        const createdUser = await createUserIfNotExists(supabaseToken, userId, username);
        if (!createdUser) {
            await handleError(interaction, initialReply, LOG_ERRORS.CONVERSION_FAILURE_DESCRIPTION, subdirPath, null, ephemerality);
            throw Error(LOG_ERRORS.CONVERSION_FAILURE_DESCRIPTION);
        }

        await processSongGeneration(interaction, initialReply, video, songDetails, imagePaths, supabaseToken, userId, createdUser, subdirPath, filePath, startTimestamp, ephemerality);
    },

    autocomplete: async function(interaction) {
        await handleAutocomplete(interaction);
    }
};