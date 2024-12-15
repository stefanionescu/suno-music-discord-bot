// Load environment variables from .env file
const dotenv = require('dotenv');
const { getAvailablePhoneNumbers } = require("./supabase.js");

dotenv.config();

// Import necessary modules
const { createClient } = require('redis');
const { PARAMS } = require("../constants.js");

/**
 * Establishes a connection to the Redis server using environment configurations.
 * @returns {Promise<RedisClientType>} A connected Redis client instance.
 */
async function getRedisClient() {
    const client = createClient({
        socket: {
            host: process.env.REDIS_HOST,
            port: process.env.REDIS_PORT
        },
        password: process.env.REDIS_PASSWORD
    });

    client.on('error', (err) => console.error('REDIS: Redis error:', err));
    
    await client.connect();
    return client;
}

/**
 * Shuffles an array using the Fisher-Yates algorithm.
 * @param {Array} array The array to shuffle.
 * @returns {Array} The shuffled array.
 */
const shuffle = (array) => {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]]; // Swap elements
    }
    return array;
}

/**
 * Attempts to lock a phone number using Redis to prevent concurrent processes.
 * @param {string} token - The JWT for Supabase authentication.
 * @returns {Promise<string|null>} The locked phone number, or null if no number could be locked.
 */
async function lockPhoneNumber(token) {
    const availablePhoneNumbers = await getAvailablePhoneNumbers(token);
    if (!availablePhoneNumbers || availablePhoneNumbers.length == 0) {
        return null;
    }

    const client = await getRedisClient();

    try {
        const randomizedPhoneNumbers = shuffle([...availablePhoneNumbers]);
        for (const phoneNumber of randomizedPhoneNumbers) {
            const locked = await client.set(`lock:${phoneNumber}`, 'locked', { NX: true, EX: PARAMS.REDIS_LOCK_TIME });
            if (locked === 'OK') {
                console.log(`REDIS: Locked ${phoneNumber}`)
                return phoneNumber;
            }
        }
    } finally {
        await client.quit();
    }
    return null;
}

/**
 * Unlocks a previously locked phone number.
 * @param {string} phoneNumber The phone number to unlock.
 * @returns {Promise<boolean>} True if the number was successfully unlocked, false otherwise.
 */
async function unlockPhoneNumber(phoneNumber) {
    if (!phoneNumber) {
        return false;
    }

    const client = await getRedisClient();
    try {
        await client.del(`lock:${phoneNumber}`);
        console.log(`REDIS: Unlocked ${phoneNumber}`)
        return true;
    } finally {
        await client.quit();
    }
}

module.exports = {
    lockPhoneNumber,
    unlockPhoneNumber
}
