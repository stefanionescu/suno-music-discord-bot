const path = require('path');
const dotenv = require('dotenv');
const isAnimated = require('is-animated');
const { getTextFromImages, getSongPromptFromGPT } = require('../../llm/gpt.js');
const { logSongCreation } = require("../../analytics/posthog.js");
const { getUserDevice } = require("../../utils/analyticsUtils.js");
const { lockPhoneNumber, unlockPhoneNumber } = require("../../storage/redis.js");
const { startScrapeJob, monitorSongStatus } = require("../../scrape/scrapingAPI.js");
const { SlashCommandBuilder, PermissionsBitField, AttachmentBuilder, inlineCode } = require('discord.js');
const { 
    generateDiscordBotJWT, 
    createUserIfNotExists, 
    saveInputImages, 
    createSongGeneration,
    saveOutputReplyId,
    getOutputSongData,
    getSongFile
} = require("../../storage/supabase.js");
const {
    saveAnimatedImage,
    extractFrames
} = require("../../utils/imageUtils.js");
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
    convertImagesToBase64,
    createDir,
    postSongToFeed,
    getSongDetails, 
    validateDetails, 
    formatSongDetails, 
    handleAutocomplete,
    wipeTemporaryData,
    postToPrivateCreateSongs,
    loadImagePathsFromDirectory,
    convertImagesFromBuffersToBase64
} = require("../../utils/commandUtils.js");

dotenv.config();

/**
 * Collects and validates images from the interaction.
 * @param {Object} interaction - The Discord interaction object.
 * @param {string} subdir - The path where GIF or animated webp images will be saved temporarily.
 * @returns {Object} An object containing valid images or an error message.
 */
async function collectImages(interaction, subdir) {
    let images = { valid: [], saved_locally: [], error: null };

    for (let i = 1; i <= 3; i++) {
        const image = interaction.options.getAttachment(`image${i}`);
        if (image) {
            if (!MIMES.IMAGES.includes(image.contentType)) {
                images.error = ERRORS.INVALID_IMAGE_FORMAT;
                break;
            }

            // For WEBP, check if it's animated
            const fileExtension = image.name.split('.').pop().toLowerCase();
            let isAnimatedImage = false;
            if (fileExtension === 'webp' || image.contentType === 'image/webp') {
                try {
                    const { fileTypeFromBuffer } = await import('file-type');

                    const response = await fetch(image.url);
                    const buffer = await response.arrayBuffer();
                    const fileType = await fileTypeFromBuffer(Buffer.from(buffer));
                    
                    if (fileType) {
                        // Check for animated images
                        isAnimatedImage = await isAnimated(Buffer.from(buffer));
                    }
                } catch (error) {
                    console.error('Error WEBP file:', error);
                    images.error = ERRORS.UNEXPECTED_IMAGE_PROCESSING;
                    break;
                }
            }

            if (isAnimatedImage || fileExtension === 'gif') {
                const filename = `${interaction.user.id}-${i}.${image.contentType.split('/')[1]}`;
                const filePath = path.join(__dirname, "temp", subdir, filename);
                try {
                    await saveAnimatedImage(image.url, filePath);
                    images.saved_locally.push(i);
                } catch(error) {
                    images.error = error;
                    return images;
                }
            }

            images.valid.push(image);
        }
    }

    return images;
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
 * Processes the image-to-song generation.
 * @param {Object} interaction - The Discord interaction object.
 * @param {Object} initialReply - The initial reply object.
 * @param {Object} images - The collected images.
 * @param {Object} songDetails - The song details.
 * @param {string} userId - The Discord user ID.
 * @param {string} supabaseToken - The Supabase token.
 * @param {string} createdUser - The Supabase user ID.
 * @param {string} subdirPath - The path to the temporary subdirectory.
 * @param {number} startTimestamp - The start timestamp.
 * @param {Boolean} privateSong - Whether the song generation is private or not.
 */
async function processSongGeneration(interaction, initialReply, images, songDetails, supabaseToken, userId, createdUser, subdirPath, startTimestamp, privateSong = false) {
    let lockedPhoneNumber = null;
    let outputReply = null;

    try {
        lockedPhoneNumber = await lockPhoneNumber(supabaseToken);
        if (!lockedPhoneNumber) {
            await handleError(interaction, initialReply, LOG_ERRORS.BOT_OVERWHELMED, subdirPath, false, privateSong);
            throw Error(LOG_ERRORS.BOT_OVERWHELMED);
        }

        let framePaths = [];
        let animatedImageObjects = [];

        try {
            framePaths           = await loadImagePathsFromDirectory(path.join(subdirPath, "frames"));
            animatedImageObjects = await convertImagesFromBuffersToBase64(framePaths);
        } catch(error) {
            framePaths = [];
            animatedImageObjects = [];
        }
        
        let staticImages           = [];
        let staticImageObjects     = [];

        for (let i = 1; i <= 3; i++) {
            if (!images.saved_locally.includes(i) && interaction.options.getAttachment(`image${i}`) != null) {
                staticImages.push(interaction.options.getAttachment(`image${i}`));
            }
        }

        if (staticImages.length > 0) {
            staticImageObjects = await convertImagesToBase64(staticImages);
        }

        let imageText = await getTextFromImages([...staticImageObjects, ...animatedImageObjects]);
        if ([ERRORS.GPT_NO_CHOICES_IN_RESPONSE, ERRORS.GPT_MISSING_MESSAGE, ERRORS.GPT_CONTENT_MISSING].includes(imageText) || 
            (imageText.toLowerCase() == ERRORS.GPT_CANNOT_ANALYZE_CONTENT.toLowerCase() || imageText.toLowerCase().startsWith(ERRORS.GPT_ERROR_CALLING.toLowerCase()))) {
            imageText = "";
        }

        const inputContentDetails = interaction.options.getString('details');
        const gptResponse = await getSongPromptFromGPT(
            [...staticImageObjects, ...animatedImageObjects], 
            songDetails.songVibe, 
            songDetails.songGenre, 
            songDetails.secondSongGenre, 
            inputContentDetails, 
            imageText
        );

        if ([ERRORS.GPT_NO_CHOICES_IN_RESPONSE, ERRORS.GPT_MISSING_MESSAGE, ERRORS.GPT_CONTENT_MISSING].includes(gptResponse)) {
            await handleError(interaction, initialReply, LOG_ERRORS.COULD_NOT_CALL_GPT_IMAGES, subdirPath, lockedPhoneNumber, privateSong);
            throw Error(LOG_ERRORS.COULD_NOT_CALL_GPT_IMAGES);
        }

        if (gptResponse.toLowerCase() == ERRORS.GPT_CANNOT_ANALYZE_CONTENT.toLowerCase() || gptResponse.toLowerCase().startsWith(ERRORS.GPT_ERROR_CALLING.toLowerCase())) {
            await handleError(interaction, initialReply, LOG_ERRORS.CANNOT_ANALYZE_IMAGE, subdirPath, lockedPhoneNumber, privateSong);
            throw Error(LOG_ERRORS.CANNOT_ANALYZE_IMAGE);
        }

        const imageBucketKeys = await saveInputImages(supabaseToken, images.valid, interaction.guildId, userId, initialReply.id);
        if (!imageBucketKeys || imageBucketKeys.length === 0) {
            await handleError(interaction, initialReply, LOG_ERRORS.CONVERSION_FAILURE_IMAGES, subdirPath, lockedPhoneNumber, privateSong);
            throw Error(LOG_ERRORS.CONVERSION_FAILURE_IMAGES);
        }

        const validatedDetails = await validateDetails(inputContentDetails);
        const instrumentalMode = interaction.options.getString('instrumental_mode').toString().toLowerCase() === "true";
        const generationId = await createSongGeneration(
            supabaseToken, createdUser, null, imageBucketKeys, initialReply.id, 
            interaction.guildId, interaction.channelId, gptResponse, 
            songDetails.songGenre, songDetails.secondSongGenre, songDetails.songVibe, 
            validatedDetails.valid, lockedPhoneNumber, instrumentalMode
        );

        if (!generationId) {
            await handleError(interaction, initialReply, LOG_ERRORS.CANNOT_PROCEED_SONG_CREATION, subdirPath, lockedPhoneNumber, privateSong);
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
                    images.valid,
                    false,
                    "image",
                    "image-to-song"
                );
            }
        } catch(error) {
            console.log("COMMAND: Could not update the initial reply with the song prompt.");
        }

        if (Math.floor(Date.now() / 1000) - startTimestamp >= PARAMS.MAX_COMMAND_EXECUTION_LENGTH) {
            await handleError(interaction, initialReply, LOG_ERRORS.EXECUTION_TIME_LIMIT_EXCEEDED, subdirPath, lockedPhoneNumber, privateSong);
            throw Error(LOG_ERRORS.EXECUTION_TIME_LIMIT_EXCEEDED);
        }

        outputReply = await interaction.followUp({ 
            content: `${interaction.user.toString()} ${GENERAL_MESSAGES.PENDING_SONG_CREATION_NOTICE}`, 
            ephemeral: privateSong 
        });

        const saveOutputReplyIDResponse = await saveOutputReplyId(supabaseToken, generationId, outputReply.id)
        if (!saveOutputReplyIDResponse) {
            if (!privateSong) await initialReply.delete();
            await handleError(interaction, outputReply, LOG_ERRORS.IMAGE_TO_SONG_UNEXPECTED_ERROR, subdirPath, lockedPhoneNumber, privateSong);
            throw Error(LOG_ERRORS.IMAGE_TO_SONG_UNEXPECTED_ERROR);
        }

        const maxRuntime = PARAMS.MAX_COMMAND_EXECUTION_LENGTH - PARAMS.COMMAND_EXECUTION_LENGTH_ERROR_MARGIN - (Math.floor(Date.now() / 1000) - startTimestamp);
        if (maxRuntime < PARAMS.MIN_RUNTIME || maxRuntime > PARAMS.MAX_RUNTIME) {
            if (!privateSong) await initialReply.delete();
            await handleError(interaction, outputReply, LOG_ERRORS.TOOK_TOO_LONG_TO_START_GENERATION, subdirPath, lockedPhoneNumber, privateSong);
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
            await handleError(interaction, outputReply, LOG_ERRORS.CANNOT_START_CREATE_SONG, subdirPath, lockedPhoneNumber, privateSong);
            throw Error(LOG_ERRORS.CANNOT_START_CREATE_SONG);
        }

        console.log(`COMMAND: Started a new song creation job with ${lockedPhoneNumber}!`);

        const monitorDurationWithoutExpiredTime = PARAMS.MAX_COMMAND_EXECUTION_LENGTH - PARAMS.COMMAND_EXECUTION_LENGTH_ERROR_MARGIN;
        const maxMonitorDuration = (monitorDurationWithoutExpiredTime * 1000) - Math.floor((Date.now() - (startTimestamp * 1000)) / 1000) * 1000;
        const songStatusResult = await monitorSongStatus(maxMonitorDuration, generationId, startScrapingEcsARN);
        if (!songStatusResult) {
            console.log("COMMAND: Seconds passed until failure:", Math.floor(Date.now() / 1000) - startTimestamp);
            if (!privateSong) await initialReply.delete();
            await handleError(interaction, outputReply, LOG_ERRORS.FAILED_TO_CREATE_SONG_IMAGES, subdirPath, lockedPhoneNumber, privateSong);
            throw Error(LOG_ERRORS.FAILED_TO_CREATE_SONG_IMAGES);
        }

        console.log(`COMMAND: Managed to finish the song creation job using ${lockedPhoneNumber}!`);

        const outputSongData = await getOutputSongData(supabaseToken, generationId);
        if (!outputSongData || !outputSongData.songTitle || !outputSongData.songLyrics || !outputSongData.songFilePath) {
            console.log("COMMAND: Seconds passed until failure:", Math.floor(Date.now() / 1000) - startTimestamp);
            if (!privateSong) await initialReply.delete();
            await handleError(interaction, outputReply, LOG_ERRORS.COULD_NOT_GET_SONG_DATA, subdirPath, lockedPhoneNumber, privateSong);
            throw Error(LOG_ERRORS.COULD_NOT_GET_SONG_DATA);
        }

        const songFile = await getSongFile(supabaseToken, outputSongData.songFilePath);
        if (!songFile || songFile == "" || Buffer.isBuffer(songFile) && songFile.length === 0) {
            console.log("COMMAND: Seconds passed until failure:", Math.floor(Date.now() / 1000) - startTimestamp);
            if (!privateSong) await initialReply.delete();
            await handleError(interaction, outputReply, LOG_ERRORS.COULD_NOT_GET_SONG_DATA, subdirPath, lockedPhoneNumber, privateSong);
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

            await postToPrivateCreateSongs(interaction, outputMessage, songFileAttachment, false, "song", "image-to-song");
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
        await handleError(interaction, outputReply, LOG_ERRORS.CONVERSION_FAILURE_IMAGES, subdirPath, lockedPhoneNumber, privateSong);
        throw Error(LOG_ERRORS.CONVERSION_FAILURE_IMAGES);
    }
}

module.exports = {
    category: 'utility',
    cooldown: PARAMS.DEFAULT_COOLDOWN,
    data: new SlashCommandBuilder()
        .setName(COMMAND_NAMES.IMAGE_TO_SONG)
        .setDescription(GENERAL_MESSAGES.SONG_FROM_IMAGE_DESCRIPTION)
        .setDMPermission(false)
        .addAttachmentOption(option => 
            option.setName('image1').setDescription(PARAM_DESCRIPTIONS.IMAGE_TO_SONG_FIRST_IMAGE).setRequired(true))
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
        .addAttachmentOption(option => 
            option.setName('image2').setDescription(PARAM_DESCRIPTIONS.IMAGE_TO_SONG_SECOND_IMAGE).setRequired(false))
        .addAttachmentOption(option => 
            option.setName('image3').setDescription(PARAM_DESCRIPTIONS.IMAGE_TO_SONG_THIRD_IMAGE).setRequired(false))
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
            "image",
            interaction.options.getString('song_genre') || '',
            interaction.options.getString('second_song_genre') || '',
            interaction.options.getString('song_vibe') || '',
            userDevice
        );

        if ((PARAMS.IMAGE_TO_SONG_IN_MAINTENANCE || process.env.PAUSE_ALL_COMMANDS.toLowerCase() == "true") && 
             !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            await interaction.reply({ content: `${commandCaller} ${LOG_ERRORS.IMAGE_TO_SONG_MAINTENANCE}`, ephemeral: true });
            throw Error(LOG_ERRORS.IMAGE_TO_SONG_MAINTENANCE);
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

        const initialReply = await interaction.reply({
            content: `${commandCaller} ${GENERAL_MESSAGES.INITIAL_IMAGE_TO_SONG_REPLY}`,
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
            await handleError(interaction, initialReply, LOG_ERRORS.CANNOT_EXTRACT_GIF_FRAMES, null, null, ephemerality);
            throw Error(LOG_ERRORS.CANNOT_EXTRACT_GIF_FRAMES);
        }

        const images = await collectImages(interaction, subdir);
        if (images.error) {
            await handleError(interaction, initialReply, images.error, subdirPath, null, ephemerality);
            throw Error(images.error);
        }

        if (images.saved_locally && images.saved_locally.length > 0) {
            const framesDir = path.join(subdirPath, "frames");
            const [framesDirError, framesDirExists] = await createDir(framesDir, true);
            if (framesDirError || framesDirExists) {
                await handleError(interaction, initialReply, LOG_ERRORS.CANNOT_EXTRACT_GIF_FRAMES, subdirPath, null, ephemerality);
                throw Error(LOG_ERRORS.CANNOT_EXTRACT_GIF_FRAMES); 
            }

            const extractFramesResult = await extractFrames(interaction.options, interaction.user.id, images.saved_locally, framesDir, subdirPath);
            if (extractFramesResult) {
                await handleError(interaction, initialReply, LOG_ERRORS.CANNOT_EXTRACT_GIF_FRAMES, subdirPath, null, ephemerality);
                throw Error(LOG_ERRORS.CANNOT_EXTRACT_GIF_FRAMES);
            }
        }
        
        const songDetails = getSongDetails(interaction, images.valid.length, true);
        try {
            await interaction.editReply({
                content: songDetails.firstReplyMessage,
                files: images.valid
            });
        } catch(error) {
            console.log("COMMAND: Could not update the initial reply with the images the user sent.")
        }

        if (Math.floor(Date.now() / 1000) - startTimestamp >= PARAMS.MAX_COMMAND_EXECUTION_LENGTH) {
            await handleError(interaction, initialReply, LOG_ERRORS.EXECUTION_TIME_LIMIT_EXCEEDED, subdir, null, ephemerality);
            throw Error(LOG_ERRORS.EXECUTION_TIME_LIMIT_EXCEEDED);
        }

        const userId = interaction.user.toString().replace("<", "").replace(">", "");
        const username = interaction.user.username;
        const supabaseToken = generateDiscordBotJWT();
        const createdUser = await createUserIfNotExists(supabaseToken, userId, username);
        if (!createdUser) {
            await handleError(interaction, initialReply, LOG_ERRORS.CONVERSION_FAILURE_IMAGES, subdir, null, ephemerality);
            throw Error(LOG_ERRORS.CONVERSION_FAILURE_IMAGES);
        }

        await processSongGeneration(interaction, initialReply, images, songDetails, supabaseToken, userId, createdUser, subdirPath, startTimestamp, ephemerality);
    },

    autocomplete: async function(interaction) {
        await handleAutocomplete(interaction);
    }
};