const fs = require('fs');
const path = require('path');
const axios = require('axios');
const fsp = require('fs').promises;
const { ChannelType, inlineCode } = require('discord.js');
const { AUTOCOMPLETE_FIELDS, PARAMS, ERRORS, GPT, SONG_FEEDS, PRIVATE_CREATE_SONGS } = require("../constants.js");

/**
 * Posts a song to its associated feed in the same Discord server.
 * @param {Object} interaction - The interaction object used to handle bot responses
 * @param {string} initialReplyLink - The link to the initial message that contains the song prompt
 * @param {string} outputMessage - The message that will get sent to the song feed
 * @param {AttachmentBuilder} songFileAttachment - The song file attachment that will get sent to the feed
 * @param {string} songGenre - The song genre
 * @returns {boolean} True if the message was sent to the feed, false otherwise.
 */
async function postSongToFeed(interaction, initialReplyLink, outputMessage, songFileAttachment, songGenre) {
    if (!interaction || !initialReplyLink || !outputMessage || !songFileAttachment || !songGenre) {
        console.log("COMMAND: Invalid params used to post a song to its associated feed.")
        return false;
    }

    const guildId = interaction.guild.id;
    if (!SONG_FEEDS[guildId] || !SONG_FEEDS[guildId][songGenre.toLowerCase()]) {
        console.log("COMMAND: The guild ID or the specific song feed is not present in the SONG_FEEDS object.")
        return false;
    }

    try {   
        const targetChannel = interaction.guild.channels.cache.get(SONG_FEEDS[guildId][songGenre.toLowerCase()]);
        const feedMessage = outputMessage += `\n**Prompt:** ${initialReplyLink}`;

        if (targetChannel && targetChannel.type === ChannelType.GuildText) {
            await targetChannel.send({
                content: feedMessage,
                files: [songFileAttachment]
            });

            console.log(`COMMAND: Posted a song in the ${songGenre.toLowerCase()} feed.`);

            return true;
        }

        console.log(`COMMAND: Could not find the guild ID or the ${songGenre} feed in that guild.`);
        return false;
    } catch(error) {
        console.log("COMMAND: Could not post a song to its associated feed:", error);
        return false;
    }
}

/**
 * Posts a private song in the create-songs-private channel.
 * @param {Object} interaction - The interaction object used to handle bot responses.
 * @param {string} outputMessage - The message to send to the create-songs-private channel.
 * @param {string} username - The name of the user who made the song.
 * @param {AttachmentBuilder} attachments - The attachments for this message.
 * @param {Boolean} mapAttachments - Whether to map the attachments or not.
 * @param {string} commandName - The name of the command.
 * @returns {boolean} True if the message was sent to the channel, false otherwise.
 */
async function postToPrivateCreateSongs(interaction, outputMessage, attachments, mapAttachments, attachmentType, commandName) {
    if (!interaction || !outputMessage || !attachmentType || !commandName) {
        console.log("COMMAND: Invalid params used to post a song in create-songs-private.")
        return false;
    }

    const guildId = interaction.guild.id;
    if (!PRIVATE_CREATE_SONGS[guildId] || PRIVATE_CREATE_SONGS[guildId] == "") {
        console.log("COMMAND: The guild ID or the specific private create songs channel are not present in the PRIVATE_CREATE_SONGS object.")
        return false;
    }

    try {
        const targetChannel = interaction.guild.channels.cache.get(PRIVATE_CREATE_SONGS[guildId]);
        const feedMessage = outputMessage += `\nCommand Type: ${commandName}`;

        if (targetChannel && targetChannel.type === ChannelType.GuildText) {
            if ((!attachments || attachments.length == 0) && commandName.toLowerCase() == "text-to-song") {
                await targetChannel.send({
                    content: feedMessage
                });
            } else{
                if (mapAttachments) {
                    await targetChannel.send({
                        content: feedMessage,
                        files: attachments.map(data => data.buffer)
                    });
                } else {
                    if (attachmentType == "song") {
                        await targetChannel.send({
                            content: feedMessage,
                            files: [attachments]
                        });
                    } else {
                        await targetChannel.send({
                            content: feedMessage,
                            files: attachments
                        });
                    }
                }
            }

            console.log(`COMMAND: Posted a private song in the create-songs-private channel.`);
            return true;
        }

        console.log(`COMMAND: Could not find the guild ID or the create-songs-private channel in that guild.`);
        return false;
    } catch(error) {
        console.log("COMMAND: Could not post a private song to create-songs-private:", error);
        return false;
    }
}

/**
 * Converts image URLs to base64 encoded strings.
 * @param {Array} images - Array of image objects with url and contentType.
 * @returns {Promise<Array>} Array of objects with base64 encoded image data.
 */
async function convertImagesToBase64(images) {
    return Promise.all(images.map(async image => {
        const response = await axios.get(image.url, { responseType: 'arraybuffer' });
        return {
            type: "image_url",
            image_url: {
                url: `data:${image.contentType};base64,${Buffer.from(response.data).toString('base64')}`
            }
        };
    }));
}

/**
 * Converts image buffers to base64 encoded strings.
 * @param {Array} imageData - Array of objects containing image buffer and filename.
 * @returns {Promise<Array>} Array of objects with base64 encoded image data.
 */
async function convertImagesFromBuffersToBase64(imageData) {
    return Promise.all(imageData.map(image => {
        const extension = path.extname(image.filename).slice(1);
        const base64String = image.buffer.toString('base64');
        return {
            type: "image_url",
            image_url: {
                url: `data:image/${extension};base64,${base64String}`
            }
        };
    }));
}

/**
 * Deletes temporary files and directories.
 * @param {string} subdirPath - Path to the subdirectory to be deleted.
 */
async function wipeTemporaryData(subdirPath) {
    if (subdirPath) await fsp.rm(subdirPath, { recursive: true, force: true });
}

/**
 * Loads image files from a directory.
 * @param {string} dirPath - Path to the directory containing images.
 * @returns {Promise<Array>} Array of objects containing image buffer and filename.
 */
async function loadImagePathsFromDirectory(dirPath) {
    try {
        const files = await fsp.readdir(dirPath);
        return await Promise.all(
            files.filter(file => /\.(jpg|jpeg|png)$/i.test(file))
                 .map(async file => ({
                     buffer: await fsp.readFile(path.join(dirPath, file)),
                     filename: file
                 }))
        );
    } catch (error) {
        return [];
    }
}

/**
 * Creates a directory if it doesn't exist.
 * @param {string} dirPath - Path to the directory to be created.
 * @param {boolean} returnEarlyIfExists - Whether to return early if the directory exists.
 * @returns {Promise<[Error, boolean]>} Tuple containing error (if any) and boolean indicating if directory existed.
 */
async function createDir(dirPath, returnEarlyIfExists) {
    try {
        if (returnEarlyIfExists && fs.existsSync(dirPath)) {
            return [null, true];
        }
        if (!fs.existsSync(dirPath)) {
            await fsp.mkdir(dirPath, { recursive: true });
            return [null, false];
        }
        return [null, true];
    } catch(error) {
        console.error("Error creating directory:", error);
        return [error, false];
    }
}

/**
 * Determines the appropriate article ('a' or 'an') for a given word.
 * @param {string} word - The word to determine the article for.
 * @returns {string} 'an' if the word starts with a vowel, 'a' otherwise.
 */
function getArticle(word) {
    if (!word) return 'a';
    const vowels = ['a', 'e', 'i', 'o', 'u'];
    return vowels.includes(word[0].toLowerCase()) ? 'an' : 'a';
}

/**
 * Extracts song details from the interaction and formats a message.
 * @param {Object} interaction - The Discord interaction object.
 * @param {number} imageNumber - The number of images.
 * @param {boolean} isImage - Whether the input is an image or video.
 * @param {boolean} noMedia - Whether images/videos should be omitted from the reply text or not.
 * @returns {Object} Object containing song details and formatted message.
 */
function getSongDetails(interaction, imageNumber, isImage, noMedia = false) {
    const songGenre = interaction.options.getString('song_genre') || '';
    let secondSongGenre = interaction.options.getString('second_song_genre') || '';
    const songVibe = interaction.options.getString('song_vibe') || '';

    if (secondSongGenre.toLowerCase() == "none") {
        secondSongGenre = '';
    }

    let article = getArticle(songVibe);
    if ((songVibe == '' || !songVibe) && ('aeiouAEIOU'.indexOf(songGenre[0]) !== -1 || songGenre.toLowerCase() == "r&b")) {
        article = "an";
    }

    let description = [songVibe, songGenre].filter(Boolean).join(' ');
    if (secondSongGenre != '' && secondSongGenre.toLowerCase() != songGenre.toLowerCase()) {
        description += ` ${secondSongGenre}`;
    }
    
    let firstReplyMessage = `Creating ${article} ${description}${description ? ' ' : ''}song using ${interaction.user.toString()}'s `;
    if (noMedia) {
        firstReplyMessage += `text...`
    } else {
        firstReplyMessage += isImage ? `image${imageNumber > 1 ? 's' : ''}...` : 'video...';
    }

    return { songGenre, songVibe, secondSongGenre, firstReplyMessage };
}

/**
 * Creates a song prompt from a combo of visual description & song genre/s.
 * @param {Object} visualDescription - The description of an image or video.
 * @param {number} songGenre - The first song genre.
 * @param {boolean} secondSongGenre - The second song genre.
 * @returns {Object} The song prompt.
 */
function createSongPrompt(visualDescription, songGenre, secondSongGenre) {
    if (!visualDescription || visualDescription == "" || !songGenre || songGenre == "") {
        return null;
    }

    const article = ('aeiouAEIOU'.indexOf(songGenre[0]) !== -1 || songGenre.toLowerCase() == "r&b") ? 'An ' : 'A ';
    const adjustedSecondGenre = (secondSongGenre == "" || secondSongGenre.toLowerCase() == songGenre.toLowerCase()) ? "" : `, ${secondSongGenre}`;

    return article + songGenre + adjustedSecondGenre + " song. " + capitalizeFirstLetter(visualDescription);
}

/**
 * Validates an image/video description
 * @param {string} visualDetails - Description string from the user.
 * @returns {string} The description string or an error message.
 */
async function validateVisualDetails(visualDetails) {
    if (!visualDetails || visualDetails == "") return { valid: '' };

    const includesURL = extractUrls(visualDetails);
    if (includesURL) {
        return { error: ERRORS.DESCRIPTION_INCLUDES_URL, valid: null };
    }

    const lowerVisualDetails = visualDetails.toLowerCase();
    for (const word of [...GPT.MILD_FORBIDDEN_WORDS, ...GPT.STRONG_FORBIDDEN_WORDS]) {
        if (lowerVisualDetails.includes(word.toLowerCase())) {
            return {error: ERRORS.INVALID_WORD_IN_DESCRIPTION.replace("{invalid_word}", word), valid: null}
        }
    }

    return { valid: visualDetails };
}

/**
 * Validates song details.
 * @param {string} songDetails - Details string from the user.
 * @returns {string} The songDetails string or an error message.
 */
async function validateDetails(songDetails) {
    if (!songDetails || songDetails == "") return { valid: '' };

    const includesURL = extractUrls(songDetails);
    if (includesURL) {
        return { error: ERRORS.DETAILS_INCLUDE_URL, valid: null };
    }

    const lowerSongDetails = songDetails.toLowerCase();
    for (const word of [...GPT.MILD_FORBIDDEN_WORDS, ...GPT.STRONG_FORBIDDEN_WORDS]) {
        if (lowerSongDetails.includes(word.toLowerCase())) {
            return {error: ERRORS.INVALID_WORD_IN_DETAILS.replace("{invalid_word}", word), valid: null}
        }
    }

    return { valid: songDetails };
}

/**
 * Validates a song description.
 * @param {string} songDescription - Description string from the user.
 * @returns {string} The songDescription string or an error message.
 */
async function validateDescription(songDescription) {
    if (!songDescription || songDescription == "") return { valid: '' };

    const includesURL = extractUrls(songDescription);
    if (includesURL) {
        return { error: ERRORS.DESCRIPTION_INCLUDES_URL, valid: null };
    }

    const lowerSongDetails = songDescription.toLowerCase();
    for (const word of [...GPT.MILD_FORBIDDEN_WORDS, ...GPT.STRONG_FORBIDDEN_WORDS]) {
        if (lowerSongDetails.includes(word.toLowerCase())) {
            return {error: ERRORS.INVALID_WORD_IN_DESCRIPTION.replace("{invalid_word}", word), valid: null}
        }
    }

    return { valid: songDescription };
}

/**
 * Formats song details for display in a Discord message.
 * @param {string} user - The Discord user object.
 * @param {string} songTitle - The song title.
 * @param {string} songGenre - The input song genre.
 * @param {string} secondSongGenre - The second input song genre.
 * @param {string} songVibe - The input song vibe.
 * @param {string} songLyrics - The song lyrics.
 * @param {Array} songDetails - Song details.
 * @param {Array} visualDescription - Image/video description.
 * @param {boolean} instrumentalMode - Whether instrumental mode is on or off.
 * @returns {string|undefined} Formatted string with song details if successful or null if otherwise.
 */
function formatSongDetails(user, songTitle, songGenre, secondSongGenre, songVibe, songLyrics, songDetails, visualDescription, instrumentalMode) {
    const convertedInstrumentalMode = instrumentalMode != null ? instrumentalMode.toString() : "";
    if (!user || user == "" || !songTitle || songTitle == "" || convertedInstrumentalMode == "") {
        return null;
    }

    let songInformation = `**Creator:** ${user.toString()}\n**Title:** ${inlineCode(songTitle)}\n`;

    if (songGenre && songGenre != "") {
        songInformation += `**Genre:** ${inlineCode(songGenre)}\n`;
    }

    if (secondSongGenre && secondSongGenre != "") {
        songInformation += `**Second Genre:** ${inlineCode(secondSongGenre)}\n`;
    }

    if (songDetails && songDetails.length > 0) {
        songInformation += `**Details:** ${inlineCode(songDetails)}\n`;
    }

    if (visualDescription && visualDescription.length > 0) {
        songInformation += `**Description:** ${inlineCode(visualDescription)}\n`;
    }

    if (songVibe && songVibe != "") {
        songInformation += `**Vibe:** ${inlineCode(songVibe)}\n`;
    }

    if (convertedInstrumentalMode && convertedInstrumentalMode != "") {
        songInformation += `**Instrumental Mode:** ${inlineCode(convertedInstrumentalMode.toString())}\n`;
    }

    if (songLyrics && songLyrics != "" && songLyrics.toLowerCase() != PARAMS.INSTRUMENTAL_LYRICS) {
        songInformation += `**Lyrics:**\n${inlineCode(songLyrics)}`;
    }

    return songInformation;
}

/**
 * Handles autocomplete for song genre and vibe options.
 * @param {Object} interaction - The Discord interaction object.
 */
async function handleAutocomplete(interaction) {
    const focusedOption = interaction.options.getFocused(true);
    const focusedValue = focusedOption.value.toLowerCase();
    const choices = focusedOption.name === 'song_genre' ? AUTOCOMPLETE_FIELDS.SONG_GENRES : 
                    focusedOption.name === 'second_song_genre' ? AUTOCOMPLETE_FIELDS.SECOND_SONG_GENRES :
                    focusedOption.name === 'song_vibe' ? AUTOCOMPLETE_FIELDS.SONG_VIBES :
                    focusedOption.name === 'instrumental_mode' ? AUTOCOMPLETE_FIELDS.INSTRUMENTAL_MODE :
                    focusedOption.name === 'visibility' ? AUTOCOMPLETE_FIELDS.VISIBILITY : null;

    if (choices) {
        await interaction.respond(
            choices.filter(choice => choice.name.toLowerCase().includes(focusedValue))
        );
    }
}

/**
 * 
 * @param {string} text - The string that will be analyzed
 * @returns {Boolean} Whether the text has or doesn't have a URL in it.
 */
function extractUrls(text) {
    const urlPattern = /(?:https?:\/\/)?(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&\/=]*)/gi;
    return urlPattern.test(text);
}

/**
 * Capitalized the first letter in a string and returns that string.
 * @param {string} string 
 * @returns The updated string.
 */
function capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

module.exports = { 
    createDir, 
    convertImagesToBase64,
    convertImagesFromBuffersToBase64,
    getArticle,
    wipeTemporaryData,
    getSongDetails, 
    validateDetails, 
    validateDescription,
    formatSongDetails, 
    handleAutocomplete,
    loadImagePathsFromDirectory,
    postSongToFeed,
    postToPrivateCreateSongs,
    validateVisualDetails,
    createSongPrompt
};