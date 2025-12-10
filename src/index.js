// src/index.js (updated version)
require('dotenv').config();
const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel, Partials.Message]
});

// Use Collection for better performance
client.commands = new Collection();
client.cooldowns = new Collection();

// Load commands
try {
  const commandsPath = path.join(__dirname, 'commands');
  
  if (!fs.existsSync(commandsPath)) {
    console.error('❌ Commands directory does not exist!');
    process.exit(1);
  }
  
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
  
  if (commandFiles.length === 0) {
    console.warn('⚠️  No command files found in commands directory!');
  }
  
  for (const file of commandFiles) {
    try {
      const filePath = path.join(commandsPath, file);
      const command = require(filePath);
      
      if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
        console.log(`✅ Loaded command: ${command.data.name}`);
      } else {
        console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
      }
    } catch (error) {
      console.error(`❌ Error loading command ${file}:`, error.message);
    }
  }
} catch (error) {
  console.error('❌ Error loading commands:', error.message);
  process.exit(1);
}

// Load events
try {
  const eventsPath = path.join(__dirname, 'events');
  
  if (!fs.existsSync(eventsPath)) {
    console.error('❌ Events directory does not exist!');
    process.exit(1);
  }
  
  const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));
  
  if (eventFiles.length === 0) {
    console.warn('⚠️  No event files found in events directory!');
  }
  
  for (const file of eventFiles) {
    try {
      const filePath = path.join(eventsPath, file);
      const event = require(filePath);
      
      if (!event.name || !event.execute) {
        console.log(`[WARNING] The event at ${filePath} is missing a required "name" or "execute" property.`);
        continue;
      }
      
      if (event.once) {
        client.once(event.name, (...args) => event.execute(...args, client));
      } else {
        client.on(event.name, (...args) => event.execute(...args, client));
      }
      
      console.log(`✅ Loaded event: ${event.name}`);
    } catch (error) {
      console.error(`❌ Error loading event ${file}:`, error.message);
    }
  }
} catch (error) {
  console.error('❌ Error loading events:', error.message);
  process.exit(1);
}

// Handle uncaught promise rejections
process.on('unhandledRejection', error => {
  console.error('Unhandled promise rejection:', error);
});

// Validate Discord token
if (!process.env.DISCORD_TOKEN) {
  console.error('❌ DISCORD_TOKEN is not set in environment variables!');
  console.error('   Please create a .env file with: DISCORD_TOKEN=your_bot_token_here');
  process.exit(1);
}

// Login to Discord
client.login(process.env.DISCORD_TOKEN)
  .then(() => console.log('🤖 Bot successfully logged in to Discord!'))
  .catch(error => {
    console.error('❌ Failed to log in to Discord:', error.message);
    process.exit(1);
  });

module.exports = client;