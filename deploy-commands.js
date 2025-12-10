// deploy-commands.js
// Quick guild-only command deployer for testing
require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID || '887566946642579498';
const GUILD_ID = process.env.DISCORD_GUILD_ID;

if (!TOKEN) {
  console.error('❌ DISCORD_TOKEN is not set in environment variables!');
  console.error('   Please create a .env file with: DISCORD_TOKEN=your_bot_token_here');
  process.exit(1);
}

if (!GUILD_ID) {
  console.error('❌ DISCORD_GUILD_ID is not set in environment variables!');
  console.error('   Please create a .env file with: DISCORD_GUILD_ID=your_guild_id_here');
  process.exit(1);
}

const commands = [];
const commandsPath = path.join(__dirname, 'src', 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

console.log(`📦 Loading ${commandFiles.length} commands...`);
for (const file of commandFiles) {
  const command = require(`./src/commands/${file}`);
  commands.push(command.data.toJSON());
  console.log(`✅ ${command.data.name}`);
}

const rest = new REST({ version: '10' }).setToken(TOKEN);

rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands })
  .then(() => console.log('🚀 Commands deployed successfully! Try /ping in ~30s.'))
  .catch(console.error);