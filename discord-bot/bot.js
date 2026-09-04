import { Client, GatewayIntentBits, Partials, Events, REST, Routes, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import dotenv from 'dotenv';
import { readJsonFile, writeJsonFile, generateKey, findAnyStreamerUser, findOrCreateKeyStore, markOldKeysInactive, createKeyEntry, normalizeUsername } from './dataManager.js';

dotenv.config({ path: './.env' });

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;
const keyPanelChannelId = process.env.KEY_PANEL_CHANNEL_ID || '';
const dashboardPath = process.env.DASHBOARD_DATA_PATH || '../data/dashboard.json';
const streamersPath = process.env.STREAMERS_DATA_PATH || '../data/streamers.json';
const keysStorePath = './key-store.json';

if (!token || !clientId || !guildId) {
  throw new Error('DISCORD_TOKEN, DISCORD_CLIENT_ID und DISCORD_GUILD_ID müssen in der .env gesetzt sein.');
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages],
  partials: [Partials.Channel],
});

const buttonCustomId = 'generate_access_key';+
async function ensureBotDataFiles() {
  const existing = await readJsonFile(keysStorePath);
  if (!existing) {
    await writeJsonFile(keysStorePath, { keys: [] });
  }
}

async function handleInteractionCreate(interaction) {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName !== 'keypanel') return;

    const button = new ButtonBuilder()
      .setCustomId(buttonCustomId)
      .setLabel('Generate New Key')
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder().addComponents(button);
    await interaction.reply({ content: 'Klicke auf den Button, um einen neuen Dashboard-Key anzufordern.', components: [row], ephemeral: true });
    return;
  }

  if (interaction.isButton()) {
    if (interaction.customId !== buttonCustomId) return;

    const author = interaction.user;

    const modal = new ModalBuilder()
      .setCustomId(modalCustomId)
      .setTitle('Generate New Dashboard Key')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId(usernameInputId)
            .setLabel('Dashboard Username')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Amar')
            .setRequired(true)
            .setMinLength(1)
            .setMaxLength(32)
        )
      );

    await interaction.showModal(modal);
    return;
  }

  if (interaction.isModalSubmit()) {
    if (interaction.customId !== modalCustomId) return;

    const username = interaction.fields.getTextInputValue(usernameInputId).trim();
    if (!username) {
      await interaction.reply({ content: 'Bitte gib einen Dashboard-Benutzernamen ein.', ephemeral: true });
      return;
    }

    const dashboardData = await readJsonFile(dashboardPath);
    const streamersData = await readJsonFile(streamersPath);
    const userFound = findAnyStreamerUser(dashboardData, username) || findAnyStreamerUser(streamersData, username);

    if (!userFound) {
      await interaction.reply({ content: '❌ Username nicht gefunden. Es wird kein Key erstellt.', ephemeral: true });
      return;
    }

    const keyStore = findOrCreateKeyStore(await readJsonFile(keysStorePath));
    markOldKeysInactive(keyStore, username);
    const newKey = generateKey();
    keyStore.keys.push(createKeyEntry(username, newKey));
    await writeJsonFile(keysStorePath, keyStore);

    try {
      await author.send(`🔑 Dein neuer Streamer Dashboard Access Key für **${username}** ist:\n\n\`${newKey}\`\n\nDieser Key ist nur für dich bestimmt. Teile ihn nicht öffentlich.`);
      await interaction.reply({ content: '✅ Der neue Access Key wurde erstellt und per DM geschickt.', ephemeral: true });
    } catch (error) {
      await interaction.reply({ content: '⚠️ Der Key wurde erstellt, aber ich konnte dir keine DM senden. Bitte überprüfe deine Privatsphäre-Einstellungen.', ephemeral: true });
    }
  }
}

client.once(Events.ClientReady, async () => {
  console.log(`Bot ist online als ${client.user.tag}`);

  const commands = [
    new SlashCommandBuilder()
      .setName('keypanel')
      .setDescription('Zeigt den Button zur Generierung eines neuen Dashboard Access Keys.'),
  ].map((command) => command.toJSON());

  const rest = new REST({ version: '10' }).setToken(token);
  try {
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
    console.log('Slash Command registriert.');
  } catch (error) {
    console.error('Fehler beim Registrieren der Slash Commands:', error);
    console.error('Überprüfe, ob der Bot im Server ist und die richtigen Berechtigungen hat.');
  }

  if (keyPanelChannelId) {
    try {
      const channel = await client.channels.fetch(keyPanelChannelId);
      if (channel?.isTextBased()) {
        const button = new ButtonBuilder()
          .setCustomId(buttonCustomId)
          .setLabel('Generate New Key')
          .setStyle(ButtonStyle.Primary);

        const row = new ActionRowBuilder().addComponents(button);
        const content = 'Klicke auf den Button, um einen neuen Dashboard-Key anzufordern.';

        const messages = await channel.messages.fetch({ limit: 50 });
        const existing = messages.find((message) => message.author?.id === client.user.id && message.content === content);

        if (existing) {
          await existing.edit({ content, components: [row] });
          console.log('Bestehende Key-Panel-Nachricht aktualisiert.');
        } else {
          await channel.send({ content, components: [row] });
          console.log('Key-Panel-Nachricht in Kanal gesendet.');
        }
      } else {
        console.warn('KEY_PANEL_CHANNEL_ID muss auf einen Textkanal verweisen.');
      }
    } catch (error) {
      console.error('Fehler beim Senden des Key-Panel-Buttons:', error);
    }
  } else {
    console.log('KEY_PANEL_CHANNEL_ID ist nicht konfiguriert. Der permanente Button wird nicht gepostet.');
  }

  await ensureBotDataFiles();
});

client.on(Events.InteractionCreate, handleInteractionCreate);

client.login(token);
