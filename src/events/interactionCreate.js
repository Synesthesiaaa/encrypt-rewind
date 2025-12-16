// src/events/interactionCreate.js
const { MessageFlags } = require('discord.js');
const Logger = require('../utils/Logger');

module.exports = {
    name: 'interactionCreate',
    async execute(interaction, client) {
      if (!interaction.isChatInputCommand()) return;
  
      const command = client.commands.get(interaction.commandName);
  
      if (!command) {
        Logger.error(`No command matching ${interaction.commandName} was found.`);
        return;
      }
  
      try {
        await command.execute(interaction);
      } catch (error) {
        Logger.error(`Error executing ${interaction.commandName}:`, {
          error: error.message,
          stack: error.stack,
          code: error.code,
          status: error.status
        });
        
        // Handle Discord API errors (like expired tokens)
        if (error.code === 50027 || error.code === 50025) {
          Logger.warn('Interaction token expired, cannot send error message');
          // Try to send DM as fallback
          if (interaction.user && !interaction.user.bot) {
            try {
              await interaction.user.send({
                content: '❌ Your command took too long and the interaction expired. Please try the command again.'
              });
            } catch (dmError) {
              Logger.error('Failed to send DM to user:', dmError.message);
            }
          }
          return;
        }
        
        // Try to send error message
        try {
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ 
              content: '❌ There was an error while executing this command!', 
              flags: MessageFlags.Ephemeral
            }).catch(() => {
              // If followUp also fails, try DM
              if (interaction.user && !interaction.user.bot) {
                interaction.user.send({
                  content: '❌ There was an error while executing your command. Please try again.'
                }).catch(() => {
                  Logger.error('Failed to send error message via any method');
                });
              }
            });
          } else {
            await interaction.reply({ 
              content: '❌ There was an error while executing this command!', 
              flags: MessageFlags.Ephemeral
            }).catch(() => {
              Logger.error('Failed to reply to interaction');
            });
          }
        } catch (replyError) {
          Logger.error('Failed to send error message:', replyError.message);
          // Last resort: try DM
          if (interaction.user && !interaction.user.bot) {
            try {
              await interaction.user.send({
                content: '❌ There was an error while executing your command. Please try again.'
              });
            } catch (dmError) {
              Logger.error('Failed to send DM:', dmError.message);
            }
          }
        }
      }
    },
  };