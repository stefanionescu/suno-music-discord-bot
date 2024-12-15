const fs = require('fs');
const path = require('path');
const axios = require('axios');
const sharp = require('sharp');
const getGifFrames = require('gif-frames');
const { PARAMS } = require('../constants.js');

/**
 * Saves an animated image from a URL to a local file.
 * 
 * @async
 * @function saveAnimatedImage
 * @param {string} url - The URL of the GIF to download.
 * @param {string} filePath - The local file path to save the GIF.
 * @returns {Promise<void>} A promise that resolves when the GIF is saved.
 * @throws {Error} If there's an error during the download or writing process.
 */
async function saveAnimatedImage(url, filePath) {
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
 * Extracts frames from animated images (GIF or animated WebP).
 * 
 * @async
 * @function extractFrames
 * @param {Object} interactionOptions - Discord.js interaction options.
 * @param {string} userId - The ID of the user who initiated the interaction.
 * @param {Array<number>} images - Array of image indices to process.
 * @param {string} framesDir - Directory to save extracted frames.
 * @param {string} subdir - Subdirectory for temporary file storage.
 * @returns {Promise<Error|null>} Null if successful, Error object if an error occurred.
 */
async function extractFrames(interactionOptions, userId, images, framesDir, subdir) {
    try {
        let selectedFrames = [];

        for (let i = 0; i < images.length; i++) {
            const attachment = interactionOptions.getAttachment(`image${images[i]}`);
            const fileExtension = attachment.contentType.split('/')[1];
            const filename = `${userId}-${images[i]}.${fileExtension}`;
            const imagePath = path.join(subdir, filename);

            if (!fs.existsSync(imagePath)) {
                return "IMAGE_UTILS: Could not find one of the animated images locally.";
            }

            const imageInfo = await sharp(imagePath).metadata();
            const isAnimatedWebp = imageInfo.format === 'webp' && imageInfo.pages > 1;
            
            let frameData;
            if (isAnimatedWebp) {
                frameData = await extractWebpFrames(imagePath);
            } else {
                frameData = await getGifFrames({ url: imagePath, frames: 'all', outputType: 'png', cumulative: false });
            }
    
            const totalFrames = frameData.length;
            
            // Calculate frame indices to extract
            let frameIndices;
            if (totalFrames <= PARAMS.MAX_GIF_FRAMES) {
                // If we have fewer frames than MAX_GIF_FRAMES, use all frames
                frameIndices = Array.from(Array(totalFrames).keys());
            } else {
                // Calculate the step size to get equally spaced frames
                const step = (totalFrames - 1) / (PARAMS.MAX_GIF_FRAMES - 1);
                frameIndices = Array.from({ length: PARAMS.MAX_GIF_FRAMES }, (_, i) => 
                    Math.round(i * step)
                );
            }

            // Select frames based on calculated indices
            for (let index of frameIndices) {
                selectedFrames.push({
                    frame: frameData[index],
                    isAnimatedWebp,
                    imagePath
                });
            }
        }

        await Promise.all(selectedFrames.map((frameData, index) => 
            saveFrame(frameData, index, framesDir)
        ));

        return null;
    } catch (error) {
        console.error('IMAGE_UTILS: Error processing animated image:', error);
        return error;
    }
}

/**
 * Saves a single frame from an animated image.
 * 
 * @async
 * @function saveFrame
 * @param {Object} frameData - Data for the frame to be saved.
 * @param {number} index - Index of the frame.
 * @param {string} framesDir - Directory to save the frame.
 */
async function saveFrame(frameData, index, framesDir) {
    const outputPath = path.join(framesDir, `frame-${index + 1}.png`);
    try {
        if (frameData.isAnimatedWebp) {
            // Handle animated WebP frames
            await sharp(frameData.frame)
                .resize({ height: 768, fit: 'inside' })
                .png()
                .toFile(outputPath);
        } else {
            // Handle GIF frames
            const frameBuffer = await frameData.frame.getImage().toBuffer();
            await sharp(frameBuffer)
                .resize({ height: 768, fit: 'inside' })
                .png()
                .toFile(outputPath);
        }
        console.log(`IMAGE_UTILS: Successfully saved frame ${index + 1}`);
    } catch (error) {
        try {
            // Fallback method: try to extract the frame directly from the original image
            await sharp(frameData.imagePath, { page: index })
                .resize({ height: 768, fit: 'inside' })
                .png()
                .toFile(outputPath);
            console.log(`IMAGE_UTILS: Successfully saved frame ${index + 1} using fallback method`);
        } catch (fallbackError) {
            console.error(`IMAGE_UTILS: Fallback method also failed for frame ${index + 1}:`, fallbackError);
        }
    }
}

/**
 * Extracts frames from an animated WebP image.
 * 
 * @async
 * @function extractWebpFrames
 * @param {string} webpPath - Path to the WebP file.
 * @returns {Promise<Buffer[]>} Array of frame buffers.
 */
async function extractWebpFrames(webpPath) {
    const image = sharp(webpPath);
    const metadata = await image.metadata();
    const frames = [];

    // Extract each frame from the WebP
    for (let i = 0; i < metadata.pages; i++) {
        const frame = await image
            .withMetadata({ page: i })
            .toBuffer();
        frames.push(frame);
    }

    return frames;
}

module.exports = { saveAnimatedImage, extractFrames };