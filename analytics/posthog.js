const dotenv = require('dotenv');
const { USERS_NO_LOG } = require('../constants.js');

dotenv.config();

async function logSongCreation(userId, contentType, songGenre, secondSongGenre, songVibe, deviceType) {
    if (!contentType || contentType == "" || !songGenre || songGenre == "" || !secondSongGenre || secondSongGenre == "" || !deviceType || deviceType == "") {
        console.log("POSTHOG: Invalid params to log.");
        return false;
    }

    const adjustedUserId = userId.replace("<", "").replace(">", "")
    if (USERS_NO_LOG.includes(adjustedUserId)) {
        console.log("POSTHOG: This user is on the no log list.")
        return true;
    }

    try {
        const { PostHog } = await import('posthog-node');

        const client = new PostHog(
            process.env.POSTHOG_API_KEY,
            { host: process.env.POSTHOG_REGION }
        );

        // Clean up the userId
        console.log(`POSTHOG: Logging a song creation event for ${adjustedUserId}.`);

        let eventProperties = {
            $set: {
                userId: adjustedUserId
            },
            contentType: contentType,
            songGenre: songGenre,
            secondSongGenre: secondSongGenre,
            deviceType: deviceType
        };

        if (songVibe && songVibe != "") {
            eventProperties.songVibe = songVibe;
        } else {
            eventProperties.songVibe = "None";
        }

        // Log the event with the unique ID
        client.capture({
            distinctId: adjustedUserId,
            event: 'song_creation',
            properties: eventProperties
        });
        
        await client.shutdown();

        return true;
    } catch(error) {
        console.log(`POSTHOG: Error trying to log a song creation event:`, error);
        return false;
    }
}

module.exports = {
    logSongCreation
}