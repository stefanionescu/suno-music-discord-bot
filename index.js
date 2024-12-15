const fs = require('node:fs');
const dotenv = require('dotenv');
const path = require('node:path');
const { handleCooldown, resetCooldown } = require("./utils/botUtils.js");
const { PARAMS, GENERAL_MESSAGES, MESSAGE_MONITORING_CHANNELS, TUTORIALS_CHANNEL } = require('./constants.js');
const { Client, Collection, Events, Options, Partials, PermissionsBitField, GatewayIntentBits } = require('discord.js');

dotenv.config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages
    ],
    partials: [Partials.Channel, Partials.Message],
    makeCache: Options.cacheWithLimits({
        ...Options.DefaultMakeCacheSettings,
        MessageManager: PARAMS.MESSAGE_MANAGER, // Cache the last PARAMS.MESSAGE_MANAGER messages per channel
    }),
    sweepers: {
        ...Options.DefaultSweeperSettings,
        messages: {
            interval: PARAMS.SWEEPER_INTERVAL, // Sweep messages every PARAMS.SWEEPER_INTERVAL
            lifetime: PARAMS.SWEEPER_LIFETIME, // Messages older than PARAMS.SWEEPER_LIFETIME are eligible for sweeping
        },
    },
});

client.cooldowns = new Collection();
client.commands = new Collection();
const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
	const commandsPath = path.join(foldersPath, folder);
	const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
	for (const file of commandFiles) {
		const filePath = path.join(commandsPath, file);
		const command = require(filePath);
		if ('data' in command && 'execute' in command) {
			client.commands.set(command.data.name, command);
		} else {
			console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
		}
	}
}

client.once(Events.ClientReady, c => {
	console.log(`Ready! Logged in as ${c.user.tag}`);
});

client.on(Events.ShardError, error => {
	console.error('A websocket connection encountered an error:', error);
});

client.on(Events.MessageCreate, async (message) => {
    const guildId = message.guild?.id;

    // Ignore messages from bots (including itself)
    if (message.author.bot) return;

    if (guildId && message.channel.id === MESSAGE_MONITORING_CHANNELS[guildId]) {
        try {
            const formattedSongHelperMessage = 
                GENERAL_MESSAGES.CREATE_SONG_HELPER
                .replace("{tutorials_channel}", TUTORIALS_CHANNEL[guildId])
                .replace("{message_author_id}", `<@${message.author.id}>`);

            // Path to your local image file
            const commandsListImage = path.join(__dirname, "media", 'bot-commands-list.png'); // TODO: You need to add a screenshot of all the Discord bot commands your users can execute

            await message.reply({
                content: formattedSongHelperMessage,
                files: [commandsListImage],
                reply: { messageReference: message.id, failIfNotExists: false }
            });
        } catch (error) {
            console.error('Error trying to help a user create songs: ', error);
        }
    }
});

client.on(Events.InteractionCreate, async interaction => {
    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);

        if (!command) {
            console.error(`No command matching ${interaction.commandName} was found.`);
            return;
        }

        // Check if the user has admin permissions
        const isAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);

        if (!isAdmin) {
            const cooldownResult = handleCooldown(interaction, command);
            if (cooldownResult) {
                return interaction.reply(cooldownResult);
            }
        }

        try {
            await command.execute(interaction);
        } catch (error) {
            if (!isAdmin) {
                // Reset cooldown on error for both the specific command and shared cooldown
                resetCooldown(interaction, command);
            }
        }
	} else if (interaction.isAutocomplete()) {
		const command = interaction.client.commands.get(interaction.commandName);

		if (!command) {
			console.error(`No command matching ${interaction.commandName} was found.`);
			return;
		}

		try {
			await command.autocomplete(interaction);
		} catch (error) {
			console.error(error);
		}
	} else return;
});

const token = process.env.DISCORD_TOKEN

// Log in to Discord with your client's token
client.login(token);
