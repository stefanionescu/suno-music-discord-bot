const axios = require('axios');
const dotenv = require('dotenv');
const { ERRORS, GPT } = require('../constants.js');

dotenv.config();

/**
 * Extracts the message content from the GPT API response.
 * @param {Object} response - The response object from the GPT API.
 * @returns {string} The extracted message content or an error message.
 */
function extractMessageFromResponse(response) {
    if (!response?.choices?.length) {
        console.error(ERRORS.GPT_NO_CHOICES_IN_RESPONSE);
        return ERRORS.GPT_NO_CHOICES_IN_RESPONSE;
    }

    const firstChoice = response.choices[0];
    if (!firstChoice.message) {
        console.error(ERRORS.GPT_MISSING_MESSAGE);
        return ERRORS.GPT_MISSING_MESSAGE;
    }

    const messageText = firstChoice.message.content;

    if (!messageText) {
        console.error(ERRORS.GPT_CONTENT_MISSING);
        return ERRORS.GPT_CONTENT_MISSING;
    }

    return messageText.replace(/\s+/g, ' ').trim();
}

/**
 * Creates a promise that resolves after a specified time.
 * @param {number} ms - The number of milliseconds to sleep.
 * @returns {Promise} A promise that resolves after the specified time.
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Determines the appropriate indefinite article ('A' or 'An') for a combo of words.
 *
 * @param {string} word - The word to determine the article for.
 * @returns {string} 'An' if the word starts with a vowel (a, e, i, o, u, case insensitive), 'A' otherwise.
 *
 * @example
 * getArticle('apple');  // Returns 'An'
 * getArticle('banana'); // Returns 'A'
 * @example
 * getArticle('Energetic'); // Returns 'An'
 * getArticle('Upbeat');    // Returns 'An'
 * getArticle('Mellow');    // Returns 'A'
 */
function getArticle(firstWord, secondWord) {
    let article = 'A';
    if (firstWord && firstWord != "") {
        article = 'aeiouAEIOU'.indexOf(firstWord[0]) !== -1 ? 'An' : 'A';
        return article;
    }

    if (secondWord && secondWord != "") {
        article = 'aeiouAEIOU'.indexOf(secondWord[0]) !== -1 ? 'An' : 'A';
        if (secondWord == "r&b") {
            article = "An";
        }
    }

    return article;
}

/**
 * Calls the GPT API using the specified payload. It prints the specified error message if the call fails.
 * @param {JSON} payload - The GPT API payload that includes image objects.
 * @param {string} errorMessage - The error message to print in case the call fails
 */
async function callGPT(payload, errorMessage) {
    const headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
    };

    for (let attempt = 1; attempt <= GPT.GPT_MAX_CALL_RETRIES; attempt++) {
        try {
            const response = await axios.post(GPT.API_URL, payload, { headers });
            const songPrompt = extractMessageFromResponse(response.data);
            if ([ERRORS.GPT_NO_CHOICES_IN_RESPONSE, ERRORS.GPT_MISSING_MESSAGE, ERRORS.GPT_CONTENT_MISSING].includes(songPrompt)) {
                throw new Error(songPrompt);
            }
            
            return songPrompt;
        } catch (error) {
            console.error(errorMessage + `${attempt}:`, error);
            if (attempt < GPT.GPT_MAX_CALL_RETRIES) {
                await sleep(GPT.GPT_CALL_WAIT);
            } else {
                return ERRORS.GPT_FAILED_CALL;
            }
        }
    }
}

/**
 * Calls the GPT API to extract text from an array of images.
 * @param {Array} imageObjects - Array of image objects to process.
 * @returns {Promise<string>} The text extracted from the image.
 */
async function getTextFromImages(imageObjects) {
    if (!imageObjects?.length) {
        console.error(ERRORS.GPT_INVALID_IMAGES_TO_PROCESS);
        return ERRORS.GPT_INVALID_IMAGES_TO_PROCESS;
    }

    const payload = {
        model: GPT.GPT_MODEL,
        messages: [
            {
                role: "user",
                content: [
                    {
                        type: "text",
                        text: GPT.EXTRACT_TEXT
                    },
                    ...imageObjects
                ]
            }
        ],
        max_tokens: GPT.GPT_MAX_TEXT_FROM_IMAGES
    };

    const gptResponse = await callGPT(payload, "Failed to extract the text from the images I got on attempt ");
    return gptResponse;
}

/**
 * Calls the GPT API to generate a song prompt based on image objects and song attributes.
 * @param {Array} imageObjects - Array of image objects to process.
 * @param {string} songVibe - The vibe of the song.
 * @param {string} songGenre - The main genre of the song.
 * @param {string} secondSongGenre - The second song genre.
 * @param {string} songDetails - Additional details for the song.
 * @param {string} imageText - Text that was previously extracted from the images.
 * @returns {Promise<string>} The generated song prompt or an error message.
 */
async function getSongPromptFromGPT(imageObjects, songVibe, songGenre, secondSongGenre, songDetails, imageText) {
    if (!imageObjects?.length) {
        console.error(ERRORS.GPT_INVALID_IMAGES_TO_PROCESS);
        return ERRORS.GPT_INVALID_IMAGES_TO_PROCESS;
    }

    let DETAILS = "";
    if (songDetails && songDetails != "") {
        DETAILS = `Here's some extra information about the image/s that you might find useful when formulating your answer: ${songDetails}. \
                   Here's some text that's included in the image/s: ${imageText}. Focus on including as much information from this image text as possible in your final output. \
                   You can ignore the information and text that's gibberish, inappropriate, or is in any other language besides English. Also ignore website URLs and emails.
                   Your own words/analysis must account for 20% of the final answer and the extra information as well as the text from the images must account for the remaining 80%. \
                   Pay attention in particular to names (of people, places, things etc) included in the extra information, you must include them in your output. \
                   Blend the extra information seamlessly in your final output (e.g pay attention to tenses and integrate properly in the final output).\n`;
    }

    const article = getArticle(songVibe, songGenre);
    let adjustedSecondSongGenre = "";
    if (secondSongGenre != "" && secondSongGenre != songGenre && secondSongGenre) {
        adjustedSecondSongGenre += ` ${secondSongGenre}`;
    }
    let OUTPUT_STRUCTURE = GPT.OUTPUT_STRUCTURE.replace("${article}", article).replace("${songVibe}", songVibe).replace("${songGenre}", songGenre);
    const END = `Make sure that your answer has maximum 180 characters (that includes spaces). \
                 The answer MUST start with: \`${article} ${songVibe} ${songGenre}${adjustedSecondSongGenre} song about \` at any costs. The answer must not rhyme.`
    const finalPrompt = GPT.INTRO + GPT.PEOPLE + GPT.ANIMALS + GPT.OBJECT + GPT.SOMETHING_ELSE + GPT.COMBINE_IMAGES + DETAILS + OUTPUT_STRUCTURE + GPT.FORBIDDEN_WORDS + END;

    const payload = {
        model: GPT.GPT_MODEL,
        messages: [
            {
                role: "user",
                content: [
                    {
                        type: "text",
                        text: finalPrompt
                    },
                    ...imageObjects
                ]
            }
        ],
        max_tokens: GPT.GPT_MAX_TOKENS_SONG_PROMPT
    };

    const gptResponse = await callGPT(payload, "Failed to get a song prompt from GPT on attempt ");
    return gptResponse;
}

module.exports = { getTextFromImages, getSongPromptFromGPT };