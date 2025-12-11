// src/commands/lolstats.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const RiotAPIService = require('../services/RiotAPIService');
const YearEndRewindCalculator = require('../utils/YearEndRewindCalculator');

module.exports = {
  
  data: new SlashCommandBuilder()
    .setName('lolstats')
    .setDescription('Get your League of Legends Year-end rewind statistics')
    .addStringOption(option => 
      option.setName('riot_id')
        .setDescription('Your Riot ID (format: GameName#TagLine, e.g., "SummonerName#TAG1")')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('region')
        .setDescription('Your account region (optional - helps find your account faster)')
        .setRequired(false)
        .addChoices(
          { name: '🇺🇸 Americas (NA, BR, LAN, LAS)', value: 'americas' },
          { name: '🇪🇺 Europe (EUW, EUNE, TR, RU)', value: 'europe' },
          { name: '🇰🇷 Asia (KR, JP)', value: 'asia' },
          { name: '🌏 SEA (OCE, SG, TW, VN, PH)', value: 'sea' },
          { name: '🇺🇸 North America (NA1)', value: 'na1' },
          { name: '🇧🇷 Brazil (BR1)', value: 'br1' },
          { name: '🇪🇺 Europe West (EUW1)', value: 'euw1' },
          { name: '🇪🇺 Europe Nordic & East (EUN1)', value: 'eun1' },
          { name: '🇰🇷 Korea (KR)', value: 'kr' },
          { name: '🇯🇵 Japan (JP1)', value: 'jp1' },
          { name: '🇦🇺 Oceania (OC1)', value: 'oc1' },
          { name: '🇸🇬 Singapore (SG2)', value: 'sg2' }
        )),
  
  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    
    // Get user-provided region (optional)
    const userRegion = interaction.options.getString('region');
    
    // Try to get riot_id, fallback to summoner_name for backward compatibility
    let riotId = interaction.options.getString('riot_id');
    if (!riotId) {
      riotId = interaction.options.getString('summoner_name');
    }
    
    // Validate Riot ID format
    if (!riotId) {
      await interaction.editReply({
        content: '❌ Please provide a valid Riot ID.\n\n**Format:** `GameName#TagLine`\n**Example:** `SummonerName#TAG1`',
        flags: MessageFlags.Ephemeral
      });
      return;
    }
    
    const trimmedRiotId = riotId.trim();
    
    if (trimmedRiotId.length === 0) {
      await interaction.editReply({
        content: '❌ Please provide a valid Riot ID.\n\n**Format:** `GameName#TagLine`\n**Example:** `SummonerName#TAG1`',
        flags: MessageFlags.Ephemeral
      });
      return;
    }
    
    // Check if Riot ID has the correct format (must contain exactly one #)
    const hashCount = (trimmedRiotId.match(/#/g) || []).length;
    if (hashCount === 0) {
      await interaction.editReply({
        content: '❌ Invalid Riot ID format.\n\n**Required format:** `GameName#TagLine`\n**Example:** `SummonerName#TAG1`\n\nMake sure to include the `#` symbol and your tag line.\n\n**Note:** Riot IDs require both a game name and tag line separated by `#`.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }
    
    if (hashCount > 1) {
      await interaction.editReply({
        content: '❌ Invalid Riot ID format.\n\n**Required format:** `GameName#TagLine`\n**Example:** `SummonerName#TAG1`\n\nRiot ID should contain exactly one `#` symbol.',
        flags: MessageFlags.Ephemeral
      });
      return;
    }
    
    // Validate that there's content before and after the #
    const parts = trimmedRiotId.split('#');
    const gameName = parts[0].trim();
    const tagLine = parts[1] ? parts[1].trim() : '';
    
    if (parts.length !== 2 || gameName.length === 0 || tagLine.length === 0) {
      await interaction.editReply({
        content: `❌ Invalid Riot ID format.\n\n**Provided:** \`${trimmedRiotId}\`\n**Required format:** \`GameName#TagLine\`\n**Example:** \`SummonerName#TAG1\`\n\nBoth game name and tag line are required.`,
        flags: MessageFlags.Ephemeral
      });
      return;
    }
    
    // Additional validation: game name and tag line should be reasonable length
    if (gameName.length > 16 || tagLine.length > 5) {
      console.warn(`⚠️  Riot ID has unusual length: GameName=${gameName.length}, TagLine=${tagLine.length}`);
    }
    
    try {
      // Log the received Riot ID for debugging
      console.log(`📥 Received Riot ID: "${trimmedRiotId}" (length: ${trimmedRiotId.length})`);
      
      // Get summoner data using Riot ID (new recommended method)
      let summoner;
      try {
        summoner = await RiotAPIService.getSummonerByRiotId(trimmedRiotId, userRegion);
      } catch (apiError) {
        // Handle validation errors from the service
        if (apiError.message && apiError.message.includes('Invalid Riot ID format')) {
          await interaction.editReply({
            content: `❌ ${apiError.message}\n\n**Provided:** \`${trimmedRiotId}\`\n**Required format:** \`GameName#TagLine\`\n**Example:** \`SummonerName#TAG1\``,
            flags: MessageFlags.Ephemeral
          });
          return;
        }
        
        // Handle API errors specifically
        if (apiError.response?.status === 404 || apiError.status === 404) {
          const regionInfo = userRegion ? ` in region **${userRegion}**` : '';
          const regionHint = userRegion ? '' : '\n💡 **Tip:** Try specifying your region using the `/lolstats` command\'s `region` option!';
          await interaction.editReply({
            content: `❌ Riot ID **${trimmedRiotId}** not found${regionInfo}.\n\nPlease check:\n• The Riot ID is spelled correctly (format: GameName#TagLine)\n• The tag line is correct (case-sensitive)\n• The account exists in the specified region${regionHint}\n• Try a different region if your account is in a different server`,
            flags: MessageFlags.Ephemeral
          });
          return;
        }
        
        if (apiError.response?.status === 403 || apiError.status === 403) {
          const errorUrl = apiError.url || apiError.config?.url || 'Unknown URL';
          const errorDetails = apiError.response?.data ? JSON.stringify(apiError.response.data, null, 2) : 'No additional details';
          console.error('🔑 403 Authentication Error Details:', {
            url: errorUrl,
            responseData: apiError.response?.data,
            riotId: trimmedRiotId,
            apiKeyPreview: process.env.RIOT_API_KEY ? `${process.env.RIOT_API_KEY.substring(0, 8)}...${process.env.RIOT_API_KEY.substring(process.env.RIOT_API_KEY.length - 4)}` : 'MISSING'
          });
          
          await interaction.editReply({
            content: '❌ **API Authentication Failed (403 Forbidden)**\n\nThe Riot API key is invalid, expired, or missing permissions.\n\n**⚠️ Most Common Cause:**\n• **API key expired** - Riot Personal API Keys expire after **24 hours**\n\n**Other possible causes:**\n• API key missing Account API v1 permissions\n• Wrong API key type (needs Personal API Key, not Production)\n• Region mismatch\n• API key format issue\n\n**To fix:**\n1. Go to https://developer.riotgames.com/\n2. Log in and check your API keys\n3. **Generate a NEW Personal API Key** (old ones expire!)\n4. Ensure it has Account API v1 access\n5. Copy the key EXACTLY (no spaces/quotes)\n6. Update the bot\'s `.env` file: `RIOT_API_KEY=your_new_key_here`\n7. Restart the bot\n\nPlease contact the bot administrator to update the API key.',
            flags: MessageFlags.Ephemeral
          });
          return;
        }
        
        // Handle network errors
        if (apiError.message?.includes('socket hang up') || 
            apiError.message?.includes('Network error') || 
            apiError.message?.includes('ECONNRESET') ||
            apiError.message?.includes('ETIMEDOUT')) {
          await interaction.editReply({
            content: '❌ **Network Error**\n\nUnable to connect to Riot API servers. This may be a temporary issue.\n\nPlease try again in a few moments.',
            flags: MessageFlags.Ephemeral
          });
          return;
        }
        
        // Log unexpected errors for debugging
        console.error('Unexpected API error:', {
          message: apiError.message,
          status: apiError.response?.status || apiError.status,
          riotId: trimmedRiotId
        });
        
        // Re-throw other API errors to be handled by the outer catch
        throw apiError;
      }
      
      // Validate summoner response (should not reach here if API returned error)
      if (!summoner) {
        console.error('Invalid summoner response:', summoner);
        throw new Error('Invalid API response: No summoner data received');
      }
      
      if (!summoner.puuid) {
        console.error('Summoner response missing PUUID:', JSON.stringify(summoner, null, 2));
        throw new Error('Invalid API response: Summoner data missing PUUID');
      }
      
      // Get display name for user-friendly messages
      const displayName = summoner.riotId || (summoner.gameName && summoner.tagLine ? `${summoner.gameName}#${summoner.tagLine}` : null) || riotId;
      console.log(`✅ Found summoner: ${displayName} (PUUID: ${summoner.puuid.substring(0, 8)}...)`);
      
      // Get match history (last 50 ranked games of the year)
      const matchIds = await RiotAPIService.getMatchHistory(summoner.puuid, 0, 50, userRegion);
      
      if (!matchIds || matchIds.length === 0) {
        await interaction.editReply({
          content: `✅ Found Riot ID **${displayName}**, but no ranked matches found for this year. Try playing some ranked games first!`,
          flags: MessageFlags.Ephemeral
        });
        return;
      }
      
      // Get match details for each match
      const matches = [];
      for (const matchId of matchIds) {
        try {
          const matchDetails = await RiotAPIService.getMatchDetails(matchId, userRegion);
          
          // Validate match details structure
          if (!matchDetails || !matchDetails.info || !Array.isArray(matchDetails.info.participants)) {
            console.error(`Invalid match details structure for match ${matchId}`);
            continue;
          }
          
          // Extract relevant data for the player
          const participant = matchDetails.info.participants.find(p => p && p.puuid === summoner.puuid);
          if (participant) {
            matches.push({
              matchId,
              championId: participant.championId || 0,
              win: participant.win || false,
              kills: participant.kills || 0,
              deaths: participant.deaths || 0,
              assists: participant.assists || 0,
              gameCreation: matchDetails.info.gameCreation || 0
            });
          }
        } catch (matchError) {
          console.error(`Error fetching match ${matchId}:`, matchError.message);
          // Continue with other matches
        }
      }
      
      if (matches.length === 0) {
        await interaction.editReply({
          content: `✅ Found Riot ID **${displayName}**, but couldn't retrieve match details. Please try again later.`,
          flags: MessageFlags.Ephemeral
        });
        return;
      }
      
      // Calculate year-end statistics
      const winRate = YearEndRewindCalculator.calculateWinRate(matches);
      const mostPlayedChampions = YearEndRewindCalculator.getMostPlayedChampions(matches);
      const kdaStats = YearEndRewindCalculator.calculateKDA(matches);
      const totalGames = YearEndRewindCalculator.calculateTotalGames(matches);
      
      // Prepare the response
      const embed = {
        title: `🎮 ${displayName}'s ${YearEndRewindCalculator.currentYear} Year-end Rewind`,
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
        embeds: [embed]
      });
      
    } catch (error) {
      console.error('Error fetching LoL stats:', {
        error: error.message,
        stack: error.stack,
        response: error.response?.data,
        status: error.response?.status
      });
      
      let errorMessage = '❌ Failed to fetch League of Legends statistics.';
      
      if (error.response) {
        if (error.response.status === 404) {
          errorMessage = `❌ Summoner **${summonerName}** not found. Please check the summoner name and region.`;
        } else if (error.response.status === 403) {
          errorMessage = '❌ **API Authentication Failed**\n\n';
          errorMessage += 'The Riot API key is invalid, expired, or missing permissions.\n\n';
          errorMessage += '**Possible causes:**\n';
          errorMessage += '• API key is invalid or expired\n';
          errorMessage += '• API key does not have required permissions\n';
          errorMessage += '• API key is for a different region\n\n';
          errorMessage += 'Please contact the bot administrator to update the API key.';
        } else if (error.response.status === 429) {
          errorMessage = '❌ Rate limit exceeded. Please try again in a few moments.';
        } else {
          errorMessage = `❌ API error (${error.response.status}): ${error.response.statusText || 'Unknown error'}`;
        }
      } else if (error.message) {
        // Handle timeout and network errors
        if (error.message.includes('timeout') || error.code === 'ECONNABORTED') {
          errorMessage = '❌ **Request Timeout**\n\n';
          errorMessage += 'The Riot API server did not respond in time.\n\n';
          errorMessage += '**Possible causes:**\n';
          errorMessage += '• Slow internet connection\n';
          errorMessage += '• Riot API server is experiencing high load\n';
          errorMessage += '• Network connectivity issues\n\n';
          errorMessage += 'Please try again in a few moments.';
        } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
          errorMessage = '❌ **Network Error**\n\n';
          errorMessage += 'Unable to connect to Riot API servers.\n\n';
          errorMessage += '**Possible causes:**\n';
          errorMessage += '• No internet connection\n';
          errorMessage += '• Firewall blocking the connection\n';
          errorMessage += '• Riot API servers are down\n\n';
          errorMessage += 'Please check your internet connection and try again.';
        } else {
          errorMessage = `❌ ${error.message}`;
        }
      }
      
      await interaction.editReply({
        content: errorMessage,
        flags: MessageFlags.Ephemeral
      });
    }
  },
};