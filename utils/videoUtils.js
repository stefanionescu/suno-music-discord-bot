const fs = require('fs');
const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const { LOG_ERRORS, PARAMS } = require('../constants.js');

/**
 * Downloads a video from a given URL and saves it to the specified file path.
 * @param {string} url - The URL of the video to download.
 * @param {string} filePath - The file path where the video will be saved.
 * @returns {Promise<void>} A promise that resolves when the video is saved.
 */
async function saveVideo(url, filePath) {
    const response = await axios({
        url,
        responseType: 'stream'
    });
    const writer = fs.createWriteStream(filePath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
        writer.on('finish', () => {
            writer.close();
            resolve();
        });
        writer.on('error', (err) => {
            writer.close();
            reject(err);
        });
    });
}

/**
 * Gets the duration of a video file.
 * @param {string} filePath - The path to the video file.
 * @returns {Promise<number>} A promise that resolves with the video duration in seconds.
 */
async function getVideoDuration(filePath) {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err) {
                reject(err);
            } else {
                const duration = metadata.format.duration;
                if (duration < PARAMS.MIN_VIDEO_LENGTH || duration > PARAMS.MAX_VIDEO_LENGTH) {
                    reject(new Error(LOG_ERRORS.INVALID_VIDEO_LENGTH));
                } else {
                    resolve(duration);
                }
            }
        });
    });
}

/**
 * Extracts frames from a video file.
 * @param {string} filePath - The path to the video file.
 * @param {string} framesDir - The directory where frames will be saved.
 * @param {number} videoDuration - The duration of the video in seconds.
 * @returns {Promise<void>} A promise that resolves when frames are extracted.
 */
function extractFrames(filePath, framesDir, videoDuration) {
    return new Promise((resolve, reject) => {
        if (!filePath || !framesDir || !videoDuration || 
            videoDuration < PARAMS.MIN_VIDEO_LENGTH || 
            videoDuration > PARAMS.MAX_VIDEO_LENGTH) {
            return reject(new Error(LOG_ERRORS.VIDEO_TO_SONG_UNKNOWN_ERROR));
        }

        const step = (videoDuration - PARAMS.VIDEO_CROP) / PARAMS.VIDEO_FRAME_STEPS;
        const timestamps = Array.from(
            { length: PARAMS.VIDEO_FRAME_COUNT }, 
            (_, i) => 1 + step * i
        );

        ffmpeg(filePath)
            .on('end', resolve)
            .on('error', (err) => {
                console.error('Error during frame extraction:', err);
                reject(new Error(LOG_ERRORS.CANNOT_EXTRACT_FRAMES));
            })
            .screenshots({
                timestamps,
                filename: 'frame-%d.png',
                folder: framesDir,
                size: '?x768'
            });
    });
}

module.exports = { saveVideo, getVideoDuration, extractFrames };