const { Collection } = require('discord.js');
const { PARAMS } = require("../constants.js");

// Add this new constant at the top of the file
const SHARED_COOLDOWN_COMMANDS = ['image-to-song', 'video-to-song'];

/**
 * Formats a cooldown duration from milliseconds into a human-readable string.
 *
 * @param {number} duration - The cooldown duration in milliseconds.
 * @returns {string} A formatted string representing the duration in hours, minutes, and seconds.
 *
 * @example
 * formatCooldown(3661000);  // Returns "1 hour, 1 minute, 1 second"
 * formatCooldown(3600000);  // Returns "1 hour"
 * formatCooldown(61000);    // Returns "1 minute, 1 second"
 * formatCooldown(1000);     // Returns "1 second"
 * formatCooldown(0);        // Returns "0 seconds"
 */
function formatCooldown(duration) {
    // Convert milliseconds to seconds
    const seconds = Math.floor(duration / 1000);
    
    // Calculate hours, minutes, and remaining seconds
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;

    // Prepare the result array
    let result = [];

    // Add hours to the result if applicable
    if (hours > 0) result.push(`${hours} hour${hours > 1 ? 's' : ''}`);
    
    // Add minutes to the result if applicable
    if (minutes > 0) result.push(`${minutes} minute${minutes > 1 ? 's' : ''}`);
    
    // Add seconds to the result if applicable or if no higher units are present
    if (remainingSeconds > 0 || result.length === 0) result.push(`${remainingSeconds} second${remainingSeconds !== 1 ? 's' : ''}`);

    // Join the result array into a string
    return result.join(', ');
}

/**
 * Handles the shared cooldown logic for specific commands.
 *
 * @param {Interaction} interaction - The Discord interaction object.
 * @param {Object} command - The command object.
 * @returns {Object|null} An object with a content property for the cooldown message if the user is on cooldown, or null if the command can proceed.
 *
 * @example
 * const cooldownResult = handleSharedCooldown(interaction, command);
 * if (cooldownResult) {
 *     return interaction.reply(cooldownResult);
 * }
 */
function handleSharedCooldown(interaction, command) {
    const { cooldowns } = interaction.client;
    
    // Initialize a cooldown collection for shared cooldowns if it doesn't exist
    if (!cooldowns.has('shared')) {
        cooldowns.set('shared', new Collection());
    }

    const now = Date.now();
    const timestamps = cooldowns.get('shared');
    const defaultCooldownDuration = PARAMS.DEFAULT_COOLDOWN;
    // Use command-specific cooldown if available, otherwise use default
    const cooldownAmount = (command.cooldown ?? defaultCooldownDuration) * 1000;

    // Check if the user has an active cooldown for any of the shared commands
    if (timestamps.has(interaction.user.id)) {
        const expirationTime = timestamps.get(interaction.user.id) + cooldownAmount;
        const timeLeft = expirationTime - now;

        // If the cooldown hasn't expired, return a cooldown message
        if (now < expirationTime) {
            return { 
                content: `Please wait, you are on a cooldown for image and video commands. You need to wait another ${formatCooldown(timeLeft)} until you can call them again.`, 
                ephemeral: true 
            };
        }
    }

    // Set a new cooldown for the user
    timestamps.set(interaction.user.id, now);
    // Automatically remove the cooldown after it expires
    setTimeout(() => timestamps.delete(interaction.user.id), cooldownAmount);
    
    // Return null to indicate that the command can proceed
    return null;
}

/**
 * Handles the cooldown logic for a command, including shared cooldowns.
 *
 * @param {Interaction} interaction - The Discord interaction object.
 * @param {Object} command - The command object.
 * @returns {Object|null} An object with a content property for the cooldown message if the user is on cooldown, or null if the command can proceed.
 *
 * @example
 * const cooldownResult = handleCooldown(interaction, command);
 * if (cooldownResult) {
 *     return interaction.reply(cooldownResult);
 * }
 */
function handleCooldown(interaction, command) {
    // If the command is part of the shared cooldown group, use handleSharedCooldown
    if (SHARED_COOLDOWN_COMMANDS.includes(command.data.name)) {
        return handleSharedCooldown(interaction, command);
    }

    const { cooldowns } = interaction.client;
    
    // Initialize a cooldown collection for this command if it doesn't exist
    if (!cooldowns.has(command.data.name)) {
        cooldowns.set(command.data.name, new Collection());
    }

    const now = Date.now();
    const timestamps = cooldowns.get(command.data.name);
    const defaultCooldownDuration = PARAMS.DEFAULT_COOLDOWN;
    // Use command-specific cooldown if available, otherwise use default
    const cooldownAmount = (command.cooldown ?? defaultCooldownDuration) * 1000;

    // Check if the user has an active cooldown for this command
    if (timestamps.has(interaction.user.id)) {
        const expirationTime = timestamps.get(interaction.user.id) + cooldownAmount;
        const timeLeft = expirationTime - now;

        // If the cooldown hasn't expired, return a cooldown message
        if (now < expirationTime) {
            return { 
                content: `Please wait, you are on a cooldown for \`${command.data.name}\`. You need to wait another ${formatCooldown(timeLeft)} until you can call it again.`, 
                ephemeral: true 
            };
        }
    }

    // Set a new cooldown for the user
    timestamps.set(interaction.user.id, now);
    // Automatically remove the cooldown after it expires
    setTimeout(() => timestamps.delete(interaction.user.id), cooldownAmount);
    
    // Return null to indicate that the command can proceed
    return null;
}

/**
 * Resets the cooldown for a specific user and command, including shared cooldowns.
 *
 * @param {Interaction} interaction - The Discord interaction object.
 * @param {Object} command - The command object.
 *
 * @example
 * resetCooldown(interaction, command);
 */
function resetCooldown(interaction, command) {
    const { cooldowns } = interaction.client;

    // Reset shared cooldown if the command is part of the shared cooldown group
    if (SHARED_COOLDOWN_COMMANDS.includes(command.data.name)) {
        const sharedTimestamps = cooldowns.get('shared');
        if (sharedTimestamps) {
            sharedTimestamps.delete(interaction.user.id);
        }
    }

    // Reset individual command cooldown
    const timestamps = cooldowns.get(command.data.name);
    if (timestamps) {
        timestamps.delete(interaction.user.id);
    }
}

module.exports = {
    handleCooldown,
    resetCooldown
}