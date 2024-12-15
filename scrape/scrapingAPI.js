const axios = require('axios');
const dotenv = require('dotenv');
const { PARAMS } = require("../constants.js");

dotenv.config();

async function startScrapeJob(generationId, phoneNumber, maxRuntime) {
    if (!generationId || !phoneNumber || !maxRuntime) {
        console.log("SCRAPING_API: Invalid params passed to the start job task.");
        return;
    }

    try {
        // Call scrape-suno-song
        const requestBody = {
            generation_id: generationId,
            max_runtime: maxRuntime,
            phone_number: phoneNumber
        };

        const scrapeJobResponse = await axios.post(`${process.env.SCRAPE_API_ENDPOINT}/scrape-suno-song`, requestBody, {
            headers: { 'x-api-key': process.env.SCRAPE_API_KEY, 'Content-Type': 'application/json' }
        });

        if (scrapeJobResponse.status !== 200) {
            throw new Error(scrapeJobResponse);
        }

        console.log("SCRAPING_API: Successfuly started a scrape job using " + phoneNumber);

        return scrapeJobResponse.data.ecs_task_arn;
    } catch(error) {
        console.log("SCRAPING_API: Error starting a scraping job:", error.response.data.error)
        return;
    }
}

async function checkSongStatus(generationId, ecsTaskARN) {
    if (!generationId || !ecsTaskARN) {
        console.log("SCRAPING_API: Invalid params passed to the check song status request.");
        return 500;
    }

    try {
        // Call check-song-status
        const queryParams = {
            generation_id: generationId,
            ecs_task_arn: ecsTaskARN
        };

        const statusResponse = await axios.get(`${process.env.SCRAPE_API_ENDPOINT}/check-song-status`, {
            params: queryParams,
            headers: {
                'x-api-key': process.env.SCRAPE_API_KEY,
                'Content-Type': 'application/json'
            }
        });

        if (statusResponse.status !== 200 && statusResponse.status !== 202) {
            console.log("SCRAPING_API: Failed to scrape a song.")
        }

        if (statusResponse.status == 200) {
            console.log("SCRAPING_API: Successfuly scraped a song!");
        }

        return statusResponse.status;
    } catch(error) {
        console.log("SCRAPING_API: Error checking song status:", error.response.data.error)
        return 500;
    }
}

async function monitorSongStatus(maxDuration, generationId, ecsTaskARN) {
    const intervalTime = PARAMS.CHECK_SONG_STATUS_INTERVAL_TIME * 1000;
    if (maxDuration <= intervalTime * 2) {
        console.log("MONITOR_SONG_STATUS: Tiny max duration.");
        return false;
    }

    const maxCalls = maxDuration / intervalTime;
    let callCount = 0;

    console.log("MONITOR_SONG_STATUS: Monitoring song scraping for maximum " + (maxDuration / 1000).toString() + " seconds...");

    return new Promise((resolve) => {
        const interval = setInterval(async () => {
            callCount++;

            const status = await checkSongStatus(generationId, ecsTaskARN);

            if (status === 200) {
                clearInterval(interval);
                resolve(true);
            } else if (status === 500) {
                clearInterval(interval);
                resolve(false);
            } else if (status !== 202) {
                clearInterval(interval);
                resolve(false);
            } else if (callCount >= maxCalls) {
                clearInterval(interval);
                resolve(false);
            }
            // If status is 202, it will just continue
        }, intervalTime);
    });
}

module.exports = {
    startScrapeJob,
    checkSongStatus,
    monitorSongStatus
}