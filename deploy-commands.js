// deploy-commands.js
// Quick guild-only command deployer for testing
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

const TOKEN = 'ODg3NTY2OTQ2NjQyNTc5NDk4.G8QRox.KobUl6k874Bk89pcOuaYLW5CvnMGAAgMSkrehs';          // ← paste your bot token here
const CLIENT_ID = '887566946642579498';  // ← your Client ID
const GUILD_ID = '914905357879504896';   // ← your Zzz server ID

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