// src/commands/lolstats.js
const { SlashCommandBuilder } = require('discord.js');
const RiotAPIService = require('../services/RiotAPIService');
const YearEndRewindCalculator = require('../utils/YearEndRewindCalculator');

module.exports = {
  
  data: new SlashCommandBuilder()
    .setName('lolstats')
    .setDescription('Get your League of Legends Year-end rewind statistics')
    .addStringOption(option => 
      option.setName('summoner_name')
        .setDescription('Your League of Legends summoner name')
        .setRequired(true)),
  
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    
    const summonerName = interaction.options.getString('summoner_name');
    
    try {
      // Get summoner data
      const summoner = await RiotAPIService.getSummonerByName(summonerName);
      
      // Get match history (last 50 ranked games of the year)
      const matchIds = await RiotAPIService.getMatchHistory(summoner.puuid, 0, 50);
      
      // Get match details for each match
      const matches = [];
      for (const matchId of matchIds) {
        const matchDetails = await RiotAPIService.getMatchDetails(matchId);
        // Extract relevant data for the player
        const participant = matchDetails.info.participants.find(p => p.puuid === summoner.puuid);
        if (participant) {
          matches.push({
            matchId,
            championId: participant.championId,
            win: participant.win,
            kills: participant.kills,
            deaths: participant.deaths,
            assists: participant.assists,
            gameCreation: matchDetails.info.gameCreation
          });
        }
      }
      
      // Calculate year-end statistics
      const winRate = YearEndRewindCalculator.calculateWinRate(matches);
      const mostPlayedChampions = YearEndRewindCalculator.getMostPlayedChampions(matches);
      const kdaStats = YearEndRewindCalculator.calculateKDA(matches);
      const totalGames = YearEndRewindCalculator.calculateTotalGames(matches);
      
      // Prepare the response
      const embed = {
        title: `🎮 ${summonerName}'s ${YearEndRewindCalculator.currentYear} Year-end Rewind`,
        description: `Here are your epic League of Legends statistics for ${YearEndRewindCalculator.currentYear}!`,
        color: 0x5865F2,
        fields: [
          {
            name: '🏆 Total Games Played',
            value: `${totalGames} ranked games`,
            inline: true
          },
          {
            name: '🎯 Win Rate',
            value: `${winRate}%`,
            inline: true
          },
          {
            name: '⚔️ Average KDA',
            value: `${kdaStats.kills}/${kdaStats.deaths}/${kdaStats.assists} (KDA: ${kdaStats.kda})`,
            inline: true
          },
          {
            name: '👑 Most Played Champions',
            value: mostPlayedChampions.map(champ => 
              `Champion ID ${champ.championId}: ${champ.gamesPlayed} games (${champ.winRate}% WR)`
            ).join('\n') || 'No champion data available',
            inline: false
          }
        ],
        footer: {
          text: 'Data collected from Riot Games API | Updated in real-time'
        },
        timestamp: new Date().toISOString()
      };
      
      await interaction.editReply({ 
        embeds: [embed],
        ephemeral: false 
      });
      
    } catch (error) {
      console.error('Error fetching LoL stats:', error);
      await interaction.editReply({
        content: '❌ Failed to fetch League of Legends statistics. Please check your summoner name and try again.',
        ephemeral: true
      });
    }
  },
};