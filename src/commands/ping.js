// src/commands/ping.js
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check if the bot is online'),
  async execute(interaction) {
    await interaction.reply('Pong! The bot is online and ready for your LoL Year-end rewind! 🎮✨');
  },
};