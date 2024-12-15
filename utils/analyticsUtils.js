async function getUserDevice(interaction) {
    const { user } = interaction;
    const member = interaction.guild.members.cache.get(user.id);

    // Get the member's presence
    await member.fetch();
    const presence = member.presence;

    if (!presence) {
        return "invisible";
    }

    // Check for mobile status
    const isMobile = presence.clientStatus && presence.clientStatus.mobile;

    if (isMobile) {
        return "mobile";
    } else {
        return "desktop";
    }
}

module.exports = { getUserDevice }