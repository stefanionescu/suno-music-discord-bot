const path = require('path');
const dotenv = require('dotenv');
const { getTextFromImages, getSongPromptFromGPT } = require('../../llm/gpt.js');
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
    validateDetails, 
    postSongToFeed,
    formatSongDetails,
    handleAutocomplete, 
    createDir,
    loadImagePathsFromDirectory,
    wipeTemporaryData,
    postToPrivateCreateSongs,
    convertImagesFromBuffersToBase64
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

        const imageObjects = await convertImagesFromBuffersToBase64(imagePaths);
        let imageText = await getTextFromImages(imageObjects);
        if ([ERRORS.GPT_NO_CHOICES_IN_RESPONSE, ERRORS.GPT_MISSING_MESSAGE, ERRORS.GPT_CONTENT_MISSING].includes(imageText) || 
            (imageText.toLowerCase() == ERRORS.GPT_CANNOT_ANALYZE_CONTENT.toLowerCase() || imageText.toLowerCase().startsWith(ERRORS.GPT_ERROR_CALLING.toLowerCase()))) {
            imageText = "";
        }

        const inputContentDetails = interaction.options.getString('details');
        const gptResponse = await getSongPromptFromGPT(
            imageObjects, 
            songDetails.songVibe, 
            songDetails.songGenre, 
            songDetails.secondSongGenre, 
            inputContentDetails, 
            imageText
        );

        if ([ERRORS.GPT_NO_CHOICES_IN_RESPONSE, ERRORS.GPT_MISSING_MESSAGE, ERRORS.GPT_CONTENT_MISSING].includes(gptResponse)) {
            await handleError(interaction, initialReply, LOG_ERRORS.COULD_NOT_CALL_GPT_VIDEO, subdirPath, filePath, lockedPhoneNumber, privateSong);
            throw Error(LOG_ERRORS.COULD_NOT_CALL_GPT_VIDEO);
        }

        if (gptResponse.toLowerCase() == ERRORS.GPT_CANNOT_ANALYZE_CONTENT.toLowerCase() || gptResponse.toLowerCase().startsWith(ERRORS.GPT_ERROR_CALLING.toLowerCase())) {
            await handleError(interaction, initialReply, LOG_ERRORS.CANNOT_ANALYZE_VIDEO, lockedPhoneNumber, privateSong);
            throw Error(LOG_ERRORS.CANNOT_ANALYZE_VIDEO);
        }

        const videoKey = await saveInputVideo(supabaseToken, video.valid, interaction.guildId, userId, initialReply.id);
        if (!videoKey) {
            await handleError(interaction, initialReply, LOG_ERRORS.CONVERSION_FAILURE_VIDEO, subdirPath, filePath, lockedPhoneNumber, privateSong);
            throw Error(LOG_ERRORS.CONVERSION_FAILURE_VIDEO);
        }

        const frameKeys = await saveInputVideoFrames(supabaseToken, imagePaths, interaction.guildId, userId, initialReply.id);
        if (!frameKeys || frameKeys.length !== imagePaths.length) {
            await handleError(interaction, initialReply, LOG_ERRORS.CONVERSION_FAILURE_VIDEO, subdirPath, filePath, lockedPhoneNumber, privateSong);
            throw Error(LOG_ERRORS.CONVERSION_FAILURE_VIDEO);
        }

        const validatedDetails = await validateDetails(interaction.options.getString('details'));
        const instrumentalMode = interaction.options.getString('instrumental_mode').toString().toLowerCase() === "true";
        const generationId = await createSongGeneration(
            supabaseToken, createdUser, videoKey, frameKeys, initialReply.id, 
            interaction.guildId, interaction.channelId, gptResponse, 
            songDetails.songGenre, songDetails.secondSongGenre, songDetails.songVibe, 
            validatedDetails.valid, lockedPhoneNumber, instrumentalMode
        );

        if (!generationId) {
            await handleError(interaction, initialReply, LOG_ERRORS.CANNOT_PROCEED_SONG_CREATION, subdirPath, filePath, lockedPhoneNumber, privateSong);
            throw Error(LOG_ERRORS.CANNOT_PROCEED_SONG_CREATION);
        }

        try {
            const firstReply = `${songDetails.firstReplyMessage}\n${GENERAL_MESSAGES.SONG_PROMPT_NOTICE}${inlineCode(gptResponse)}\n`;
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
                    "video-to-song"
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
            validatedDetails.valid,
            null,
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

            await postToPrivateCreateSongs(interaction, outputMessage, songFileAttachment, false, "song", "video-to-song");
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
        await handleError(interaction, outputReply, LOG_ERRORS.CONVERSION_FAILURE_VIDEO, subdirPath, filePath, lockedPhoneNumber, privateSong);
        throw Error(LOG_ERRORS.CONVERSION_FAILURE_VIDEO);
    }
}

module.exports = {
    category: 'utility',
    cooldown: PARAMS.DEFAULT_COOLDOWN,
    data: new SlashCommandBuilder()
        .setName(COMMAND_NAMES.VIDEO_TO_SONG)
        .setDescription(GENERAL_MESSAGES.SONG_FROM_VIDEO_DESCRIPTION)
        .setDMPermission(false)
        .addAttachmentOption(option => option.setName('video').setDescription(PARAM_DESCRIPTIONS.VIDEO_TO_SONG_VIDEO).setRequired(true))
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
                .setAutocomplete(true))
        .addStringOption(option =>
            option.setName('song_vibe')
                .setDescription(PARAM_DESCRIPTIONS.SONG_VIBE)
                .setRequired(false)
                .setAutocomplete(true))
        .addStringOption(option => 
            option.setName('details')
                .setDescription(PARAM_DESCRIPTIONS.SONG_DETAILS)
                .setRequired(false)
                .setMaxLength(PARAMS.DETAILS_LENGTH)),

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
            "video",
            interaction.options.getString('song_genre') || '',
            interaction.options.getString('second_song_genre') || '',
            interaction.options.getString('song_vibe') || '',
            userDevice
        );

        if ((PARAMS.VIDEO_TO_SONG_IN_MAINTENANCE || process.env.PAUSE_ALL_COMMANDS.toLowerCase() == "true") && 
            !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            await interaction.reply({ content: `${commandCaller} ${LOG_ERRORS.VIDEO_TO_SONG_MAINTENANCE}`, ephemeral: true });
            throw Error(LOG_ERRORS.VIDEO_TO_SONG_MAINTENANCE);
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
            content: `${commandCaller} ${GENERAL_MESSAGES.INITIAL_VIDEO_TO_SONG_REPLY}`,
            ephemeral: ephemerality
        });

        // Prevent invalid genres or vibes
        const selectedGenre = interaction.options.getString('song_genre');
        const selectedSecondGenre = interaction.options.getString('second_song_genre');
        const selectedVibe  = interaction.options.getString('song_vibe');

        const isValidGenre = AUTOCOMPLETE_FIELDS.SONG_GENRES.some(genre => 
            genre.value.toLowerCase() === selectedGenre.toLowerCase()
        );
        const isValidSecondGenre = AUTOCOMPLETE_FIELDS.SECOND_SONG_GENRES.some(genre => 
            genre.value.toLowerCase() === selectedSecondGenre.toLowerCase()
        );
        const isValidVibe = !selectedVibe || AUTOCOMPLETE_FIELDS.SONG_VIBES.some(vibe => 
            vibe.value.toLowerCase() === selectedVibe.toLowerCase()
        );

        if (!isValidGenre || !isValidSecondGenre) {
            await handleError(interaction, initialReply, LOG_ERRORS.INVALID_SONG_GENRE, null, null, ephemerality);
            throw Error(LOG_ERRORS.INVALID_SONG_GENRE);
        }

        if (!isValidVibe) {
            await handleError(interaction, initialReply, LOG_ERRORS.INVALID_SONG_VIBE, null, null, ephemerality);
            throw Error(LOG_ERRORS.INVALID_SONG_VIBE);
        }

        const validatedDetails = await validateDetails(interaction.options.getString('details'));
        if (validatedDetails.error) {
            await handleError(interaction, initialReply, validatedDetails.error, null, null, ephemerality);
            throw Error(validatedDetails.error);
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
            await handleError(interaction, initialReply, LOG_ERRORS.CONVERSION_FAILURE_VIDEO, subdirPath, null, ephemerality);
            throw Error(LOG_ERRORS.CONVERSION_FAILURE_VIDEO);
        }

        await processSongGeneration(interaction, initialReply, video, songDetails, imagePaths, supabaseToken, userId, createdUser, subdirPath, filePath, startTimestamp, ephemerality);
    },

    autocomplete: async function(interaction) {
        await handleAutocomplete(interaction);
    }
};