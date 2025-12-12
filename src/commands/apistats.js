// src/commands/apistats.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const APIMonitor = require('../utils/APIMonitor');
const APIKeyManager = require('../utils/APIKeyManager');
const Logger = require('../utils/Logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('apistats')
    .setDescription('View API usage statistics and monitoring information'),
  
  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    
    try {
      const usageStats = APIMonitor.getUsageStats();
      const keyStats = APIKeyManager.getStats();
      
      // Clean up old stats
      APIMonitor.cleanupOldStats();
      
      // Format statistics
      const embed = {
        title: '📊 API Usage Statistics',
        description: 'Real-time monitoring of Riot API consumption',
        color: 0x5865F2,
        fields: [
          {
            name: '⏱️ Current Usage',
            value: `**This Minute:** ${usageStats.current.minute.requests}/${usageStats.current.minute.limit} (${usageStats.current.minute.percentage}%)\n` +
                   `**This Hour:** ${usageStats.current.hour.requests} requests\n` +
                   `**Today:** ${usageStats.current.day.requests}/${usageStats.current.day.limit} (${usageStats.current.day.percentage}%)`,
            inline: true
          },
          {
            name: '📈 Total Statistics',
            value: `**Total Requests:** ${usageStats.total.requests.toLocaleString()}\n` +
                   `**Cache Hits:** ${usageStats.total.cacheHits.toLocaleString()}\n` +
                   `**Cache Hit Rate:** ${usageStats.total.cacheHitRate}%\n` +
                   `**Errors:** ${usageStats.total.errors.toLocaleString()}`,
            inline: true
          },
          {
            name: '🔑 API Keys Status',
            value: keyStats.map(key => {
              const status = key.enabled ? '✅' : '❌';
              const health = key.health === 'healthy' ? '🟢' : key.health === 'degraded' ? '🟡' : '🔴';
              return `${status} ${health} **${key.id}**: ${key.requestCount.toLocaleString()} req, ${key.errorCount} errors`;
            }).join('\n') || 'No API keys configured',
            inline: false
          }
        ],
        footer: {
          text: 'Use multiple API keys to distribute load and avoid rate limits'
        },
        timestamp: new Date().toISOString()
      };
      
      await interaction.editReply({ embeds: [embed] });
      
      Logger.info('API stats command executed', {
        userId: interaction.user.id,
        usage: usageStats.current
      });
    } catch (error) {
      Logger.error('Error fetching API stats:', error.message);
      await interaction.editReply({
        content: '❌ Error fetching API statistics. Please try again later.',
        flags: MessageFlags.Ephemeral
      });
    }
  }
};

