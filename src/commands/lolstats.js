// src/commands/lolstats.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const RiotAPIService = require('../services/RiotAPIService');
const YearEndRewindCalculator = require('../utils/YearEndRewindCalculator');
const ChampionNames = require('../utils/ChampionNames');
const Logger = require('../utils/Logger');
const moment = require('moment');

// Check if interaction is still valid (not expired)
function isInteractionValid(interaction) {
  // Discord interaction tokens expire after 15 minutes
  // We can't directly check expiration, but we can check if it's been replied to
  // and if it's still deferred
  try {
    if (!interaction) return false;
    // If it's deferred and not replied, it's likely still valid
    // If it's replied, it might still be valid (but token could be expired)
    return interaction.deferred || !interaction.replied;
  } catch (error) {
    return false;
  }
}

// Helper function to safely edit reply (prevents message flooding by always editing the same message)
async function safeEditReply(interaction, content, options = {}) {
  // Check if interaction is still valid before attempting
  if (!isInteractionValid(interaction)) {
    Logger.warn('Interaction is no longer valid, skipping reply');
    return null;
  }
  
  // Normalize content - can be string or object with embeds
  const isString = typeof content === 'string';
  const replyData = {
    content: isString ? content : (content.content || undefined),
    embeds: content.embeds || options.embeds || undefined,
    flags: options.flags
  };
  
  // Remove undefined values
  if (!replyData.content) delete replyData.content;
  if (!replyData.embeds) delete replyData.embeds;
  if (!replyData.flags) delete replyData.flags;
  
  try {
    // IMPORTANT: Always try to edit the same message to prevent flooding
    // Only use followUp as a last resort if editing is impossible
    if (interaction.deferred && !interaction.replied) {
      // Best case: We have a deferred reply, edit it
      return await interaction.editReply(replyData);
    } else if (interaction.replied) {
      // Already replied - try to edit the original reply if possible
      // If we can't edit, only then use followUp (but this should be rare)
      try {
        // Try to edit the original reply
        return await interaction.editReply(replyData);
      } catch (editError) {
        // If editing fails, only then use followUp (but log it as it creates a new message)
        Logger.warn('Could not edit reply, using followUp (this creates a new message):', editError.message);
        return await interaction.followUp({
          ...replyData,
          flags: replyData.flags || MessageFlags.Ephemeral
        });
      }
    } else {
      // Not deferred and not replied - this shouldn't happen, but handle it
      Logger.warn('Interaction not deferred, using reply (this should not happen)');
      return await interaction.reply({
        ...replyData,
        flags: replyData.flags || MessageFlags.Ephemeral
      });
    }
  } catch (error) {
    // If token expired (50027) or interaction already replied, try followUp
    if (error.code === 50027 || error.code === 50025 || interaction.replied) {
      Logger.warn('Interaction token expired or already replied, attempting followUp', {
        code: error.code,
        message: error.message
      });
      
      // Check if we can still use followUp (token might be completely expired)
      if (error.code === 50027) {
        // Token is completely expired, can't use followUp either
        Logger.error('Interaction token completely expired, cannot send response');
        
        // Try multiple fallback methods
        // 1. Try DM first
        if (interaction.user && !interaction.user.bot) {
          try {
            await interaction.user.send({
              content: isString ? content : (content.content || '❌ Your command took longer than 15 minutes and the interaction expired. The results may still be processing. Please try the command again in a moment.'),
              embeds: content.embeds || options.embeds
            });
            Logger.info('Sent message via DM to user (interaction expired)');
            return null; // Return null instead of throwing
          } catch (dmError) {
            // User has DMs disabled or other error - try channel instead
            Logger.warn('Cannot send DM to user (DMs may be disabled):', dmError.message);
            
            // 2. Try sending to the channel where the command was used
            if (interaction.channel && interaction.channel.send) {
              try {
                const channelMessage = await interaction.channel.send({
                  content: `${interaction.user}, your command results (interaction expired):`,
                  embeds: content.embeds || options.embeds || (isString ? undefined : [])
                });
                Logger.info('Sent message to channel as fallback (interaction expired)');
                return channelMessage;
              } catch (channelError) {
                Logger.error('Cannot send message to channel:', channelError.message);
                // Last resort: log the content so it's not completely lost
                Logger.info('Results that could not be delivered:', {
                  content: isString ? content : content.content,
                  hasEmbeds: !!(content.embeds || options.embeds)
                });
              }
            }
            return null; // Return null instead of throwing
          }
        }
        
        // If no user, try channel directly
        if (interaction.channel && interaction.channel.send) {
          try {
            const channelMessage = await interaction.channel.send({
              content: 'Command results (interaction expired):',
              embeds: content.embeds || options.embeds || (isString ? undefined : [])
            });
            Logger.info('Sent message to channel as fallback (interaction expired, no user)');
            return channelMessage;
          } catch (channelError) {
            Logger.error('Cannot send message to channel:', channelError.message);
          }
        }
        
        return null; // Return null instead of throwing
      }
      
      // Try followUp for other errors (50025, etc.)
      try {
        return await interaction.followUp({
          ...replyData,
          flags: replyData.flags || MessageFlags.Ephemeral
        });
      } catch (followUpError) {
        Logger.error('Failed to send followUp message:', followUpError.message);
        // Don't throw - just return null to indicate failure
        return null;
      }
    }
    // For other errors, log and return null instead of throwing
    Logger.error('Error in safeEditReply:', error.message);
    return null;
  }
}

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
    // Defer reply immediately to prevent message flooding
    // All subsequent updates will edit this same message
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
      await safeEditReply(interaction, '❌ Please provide a valid Riot ID.\n\n**Format:** `GameName#TagLine`\n**Example:** `SummonerName#TAG1`', {
        flags: MessageFlags.Ephemeral
      });
      return;
    }
    
    const trimmedRiotId = riotId.trim();
    
    if (trimmedRiotId.length === 0) {
      await safeEditReply(interaction, '❌ Please provide a valid Riot ID.\n\n**Format:** `GameName#TagLine`\n**Example:** `SummonerName#TAG1`', {
        flags: MessageFlags.Ephemeral
      });
      return;
    }
    
    // Check if Riot ID has the correct format (must contain exactly one #)
    const hashCount = (trimmedRiotId.match(/#/g) || []).length;
    if (hashCount === 0) {
      await safeEditReply(interaction, '❌ Invalid Riot ID format.\n\n**Required format:** `GameName#TagLine`\n**Example:** `SummonerName#TAG1`\n\nMake sure to include the `#` symbol and your tag line.\n\n**Note:** Riot IDs require both a game name and tag line separated by `#`.', {
        flags: MessageFlags.Ephemeral
      });
      return;
    }
    
    if (hashCount > 1) {
      await safeEditReply(interaction, '❌ Invalid Riot ID format.\n\n**Required format:** `GameName#TagLine`\n**Example:** `SummonerName#TAG1`\n\nRiot ID should contain exactly one `#` symbol.', {
        flags: MessageFlags.Ephemeral
      });
      return;
    }
    
    // Validate that there's content before and after the #
    const parts = trimmedRiotId.split('#');
    const gameName = parts[0].trim();
    const tagLine = parts[1] ? parts[1].trim() : '';
    
    if (parts.length !== 2 || gameName.length === 0 || tagLine.length === 0) {
      await safeEditReply(interaction, `❌ Invalid Riot ID format.\n\n**Provided:** \`${trimmedRiotId}\`\n**Required format:** \`GameName#TagLine\`\n**Example:** \`SummonerName#TAG1\`\n\nBoth game name and tag line are required.`, {
        flags: MessageFlags.Ephemeral
      });
      return;
    }
    
    // Additional validation: game name and tag line should be reasonable length
    if (gameName.length > 16 || tagLine.length > 5) {
      Logger.warn(`Riot ID has unusual length: GameName=${gameName.length}, TagLine=${tagLine.length}`);
    }
    
    try {
      // Log the received Riot ID for debugging
      Logger.info(`Received Riot ID: "${trimmedRiotId}" (length: ${trimmedRiotId.length})`);
      
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
          await safeEditReply(interaction, `❌ Riot ID **${trimmedRiotId}** not found${regionInfo}.\n\nPlease check:\n• The Riot ID is spelled correctly (format: GameName#TagLine)\n• The tag line is correct (case-sensitive)\n• The account exists in the specified region${regionHint}\n• Try a different region if your account is in a different server`, {
            flags: MessageFlags.Ephemeral
          });
          return;
        }
        
        if (apiError.response?.status === 403 || apiError.status === 403) {
          const errorUrl = apiError.url || apiError.config?.url || 'Unknown URL';
          const errorDetails = apiError.response?.data ? JSON.stringify(apiError.response.data, null, 2) : 'No additional details';
          const errorRegion = apiError.region || userRegion || 'unknown';
          
          Logger.error('403 Authentication Error Details:', {
            url: errorUrl,
            responseData: apiError.response?.data,
            riotId: trimmedRiotId,
            region: errorRegion,
            apiKeyPreview: process.env.RIOT_API_KEY ? `${process.env.RIOT_API_KEY.substring(0, 8)}...${process.env.RIOT_API_KEY.substring(process.env.RIOT_API_KEY.length - 4)}` : 'MISSING'
          });
          
          // Special message for SEA region 403 errors
          let errorMessage = '❌ **API Authentication Failed (403 Forbidden)**\n\n';
          
          if (errorRegion === 'sea' || userRegion === 'sea') {
            errorMessage += '**ℹ️ Note about SEA Region:**\n';
            errorMessage += 'Account API v1 only supports `americas`, `asia`, and `europe`.\n';
            errorMessage += 'When you select "sea", it\'s automatically mapped to "asia" for Account API.\n';
            errorMessage += 'This 403 error suggests an API key issue, not a region mapping issue.\n\n';
            errorMessage += '**⚠️ Most Common Cause:**\n';
            errorMessage += '• **API key expired** - Riot Personal API Keys expire after **24 hours**\n\n';
            errorMessage += '**Other possible causes:**\n';
            errorMessage += '• API key missing Account API v1 permissions\n';
            errorMessage += '• Wrong API key type (needs Personal API Key, not Production)\n';
            errorMessage += '• API key format issue\n\n';
          } else {
            errorMessage += '**⚠️ Most Common Cause:**\n';
            errorMessage += '• **API key expired** - Riot Personal API Keys expire after **24 hours**\n\n';
            errorMessage += '**Other possible causes:**\n';
            errorMessage += '• API key missing Account API v1 permissions\n';
            errorMessage += '• Wrong API key type (needs Personal API Key, not Production)\n';
            errorMessage += '• Region mismatch\n';
            errorMessage += '• API key format issue\n\n';
          }
          
          errorMessage += '**To fix:**\n';
          errorMessage += '1. Go to https://developer.riotgames.com/\n';
          errorMessage += '2. Log in and check your API keys\n';
          errorMessage += '3. **Generate a NEW Personal API Key** (old ones expire!)\n';
          errorMessage += '4. Ensure it has Account API v1 access\n';
          errorMessage += '5. Copy the key EXACTLY (no spaces/quotes)\n';
          errorMessage += '6. Update the bot\'s `.env` file: `RIOT_API_KEY=your_new_key_here`\n';
          errorMessage += '7. Restart the bot\n\n';
          errorMessage += 'Please contact the bot administrator to update the API key.';
          
      // Try to send error, but don't throw if interaction expired
      const result = await safeEditReply(interaction, errorMessage, {
        flags: MessageFlags.Ephemeral
      });
      
      // If we couldn't send the error message, at least log it
      if (result === null) {
        Logger.error('Could not send error message to user (interaction expired):', errorMessage);
      }
          return;
        }
        
        // Handle network errors
        if (apiError.message?.includes('socket hang up') || 
            apiError.message?.includes('Network error') || 
            apiError.message?.includes('ECONNRESET') ||
            apiError.message?.includes('ETIMEDOUT')) {
          await safeEditReply(interaction, '❌ **Network Error**\n\nUnable to connect to Riot API servers. This may be a temporary issue.\n\nPlease try again in a few moments.', {
            flags: MessageFlags.Ephemeral
          });
          return;
        }
        
        // Log unexpected errors for debugging
        Logger.error('Unexpected API error:', {
          message: apiError.message,
          status: apiError.response?.status || apiError.status,
          riotId: trimmedRiotId
        });
        
        // Re-throw other API errors to be handled by the outer catch
        throw apiError;
      }
      
      // Validate summoner response (should not reach here if API returned error)
      if (!summoner) {
        Logger.error('Invalid summoner response:', summoner);
        throw new Error('Invalid API response: No summoner data received');
      }
      
      if (!summoner.puuid) {
        Logger.error('Summoner response missing PUUID:', JSON.stringify(summoner, null, 2));
        throw new Error('Invalid API response: Summoner data missing PUUID');
      }
      
      // Get display name for user-friendly messages
      const displayName = summoner.riotId || (summoner.gameName && summoner.tagLine ? `${summoner.gameName}#${summoner.tagLine}` : null) || riotId;
      Logger.success(`Found summoner: ${displayName} (PUUID: ${summoner.puuid.substring(0, 8)}...)`);
      
      // Initialize champion names
      await ChampionNames.initialize();
      
      // Get current season information
      const seasonInfo = YearEndRewindCalculator.getCurrentSeason();
      const currentSeason = seasonInfo.season;
      const seasonStartTimestamp = seasonInfo.seasonStart;
      const seasonEndTimestamp = seasonInfo.seasonEnd;
      
      Logger.info(`Current Season: ${currentSeason} (${seasonInfo.seasonStartDate} to ${seasonInfo.seasonEndDate})`);
      
      // Get ALL match history for the season (paginated) - Ranked games only
      // Edit the same message (prevents channel flooding)
      await safeEditReply(interaction, `📊 Fetching all ranked matches for Season ${currentSeason}... This may take a moment.`, {
        flags: MessageFlags.Ephemeral
      });
      
      const allMatchIds = await RiotAPIService.getAllMatchHistoryForYear(summoner.puuid, currentSeason, userRegion);
      
      if (!allMatchIds || allMatchIds.length === 0) {
        // Edit the same message with final result (prevents channel flooding)
        await safeEditReply(interaction, `✅ Found Riot ID **${displayName}**, but no matches found for Season ${currentSeason}. Try playing some games first!`, {
          flags: MessageFlags.Ephemeral
        });
        return;
      }
      
      Logger.info(`Processing ${allMatchIds.length} match IDs, filtering for Season ${currentSeason}...`);
      
      // Update progress message (edits the same message - prevents channel flooding)
      await safeEditReply(interaction, `📊 Processing ${allMatchIds.length} matches and filtering for Season ${currentSeason}...`, {
        flags: MessageFlags.Ephemeral
      });
      
      // Get match details for each match and filter by season
      // Optimize: Stop early if we've passed the season boundary (matches are in reverse chronological order)
      const matches = [];
      let processedCount = 0;
      let matchesOutsideSeason = 0;
      const maxMatchesOutsideSeason = 50; // Stop if we see 50 consecutive matches outside the season
      const updateInterval = Math.max(1, Math.floor(allMatchIds.length / 20)); // Update 20 times total (more frequent)
      const lastUpdateTime = Date.now();
      const updateFrequency = 30000; // Update every 30 seconds to keep interaction alive
      let lastProgressUpdate = Date.now();
      
      Logger.debug(`Processing ${allMatchIds.length} match IDs...`);
      
      for (const matchId of allMatchIds) {
        try {
          const matchDetails = await RiotAPIService.getMatchDetails(matchId, userRegion);
          
          // Validate match details structure
          if (!matchDetails || !matchDetails.info || !Array.isArray(matchDetails.info.participants)) {
            Logger.error(`Invalid match details structure for match ${matchId}`);
            continue;
          }
          
          // Check if match is within the current season
          // gameCreation is in milliseconds (Unix timestamp)
          const gameCreation = matchDetails.info.gameCreation || 0;
          
          if (!gameCreation || gameCreation === 0) {
            Logger.warn(`Match ${matchId} has invalid gameCreation timestamp - skipping`);
            continue;
          }
          
          const gameDate = moment(gameCreation);
          
          // Log first few matches for debugging
          if (processedCount < 5) {
            const isInSeason = gameCreation >= seasonStartTimestamp && gameCreation <= seasonEndTimestamp;
            Logger.debug(`Match ${processedCount + 1}: date=${gameDate.format('YYYY-MM-DD HH:mm:ss')}, inSeason=${isInSeason}, timestamp=${gameCreation}`);
          }
          
          // Check if match is within season bounds
          const isInSeason = gameCreation >= seasonStartTimestamp && gameCreation <= seasonEndTimestamp;
          
          if (!isInSeason) {
            // Match is outside the season
            matchesOutsideSeason++;
            
            // Only stop early if we're clearly past the season START (matches are in reverse chronological order)
            // This means we've gone back in time past the season start
            // Be conservative: require many consecutive old matches before stopping
            if (gameCreation < seasonStartTimestamp) {
              if (matchesOutsideSeason >= maxMatchesOutsideSeason) {
                Logger.info(`Stopping early: Found ${maxMatchesOutsideSeason} consecutive matches before Season ${currentSeason} start`);
                Logger.debug(`Last match date: ${gameDate.format('YYYY-MM-DD')}, Season start: ${moment(seasonStartTimestamp).format('YYYY-MM-DD')}`);
                break;
              }
            } else {
              // Match is after season end (future match or edge case)
              // Reset counter - we might still find season matches later
              // This shouldn't happen often since matches are reverse chronological
              matchesOutsideSeason = 0;
            }
            // Don't count matches outside season in statistics
            continue;
          }
          
          // Reset counter if we found a match in the season
          matchesOutsideSeason = 0;
          
          // Extract relevant data for the player
          const participant = matchDetails.info.participants.find(p => p && p.puuid === summoner.puuid);
          
          if (!participant) {
            Logger.warn(`Player not found in match ${matchId} - skipping`);
            continue;
          }
          
          // Validate participant data
          if (participant.championId === undefined || participant.championId === null) {
            Logger.warn(`Match ${matchId} missing championId - skipping`);
            continue;
          }
          
          matches.push({
            matchId,
            championId: participant.championId || 0,
            win: participant.win || false,
            kills: participant.kills || 0,
            deaths: participant.deaths || 0,
            assists: participant.assists || 0,
            gameCreation: gameCreation
          });
          
          processedCount++;
          
          // Progress update every N matches OR every 30 seconds (to keep interaction alive)
          const timeSinceLastUpdate = Date.now() - lastProgressUpdate;
          const shouldUpdate = processedCount % updateInterval === 0 || 
                               processedCount === allMatchIds.length || 
                               timeSinceLastUpdate >= updateFrequency;
          
          if (shouldUpdate) {
            const progressPercent = Math.round((processedCount / allMatchIds.length) * 100);
            const result = await safeEditReply(interaction, `📊 Processing matches: ${processedCount}/${allMatchIds.length} (${progressPercent}%)... Found ${matches.length} season matches so far.`, {
              flags: MessageFlags.Ephemeral
            });
            
            // If we can't update (token expired), log but continue processing
            if (result === null) {
              Logger.warn('Cannot send progress update (interaction may have expired), continuing processing...');
            } else {
              lastProgressUpdate = Date.now();
            }
            
            Logger.debug(`Progress: ${processedCount}/${allMatchIds.length} (${progressPercent}%) - ${matches.length} matches in Season ${currentSeason}`);
          }
        } catch (matchError) {
          Logger.error(`Error fetching match ${matchId}:`, matchError.message);
          // Continue with other matches
          processedCount++;
        }
      }
      
      Logger.success(`Filtered to ${matches.length} matches from Season ${currentSeason} (processed ${processedCount} total matches)`);
      
      // Log some statistics for validation
      if (matches.length > 0) {
        const sortedMatches = [...matches].sort((a, b) => a.gameCreation - b.gameCreation);
        const firstMatchDate = moment(sortedMatches[0].gameCreation).format('YYYY-MM-DD');
        const lastMatchDate = moment(sortedMatches[sortedMatches.length - 1].gameCreation).format('YYYY-MM-DD');
        Logger.debug(`Match date range: ${firstMatchDate} to ${lastMatchDate}`);
        Logger.debug(`Season range: ${seasonInfo.seasonStartDate} to ${seasonInfo.seasonEndDate}`);
        
        // Validate match dates are within season
        const matchesOutsideRange = matches.filter(m => {
          const matchDate = m.gameCreation;
          return matchDate < seasonStartTimestamp || matchDate > seasonEndTimestamp;
        });
        if (matchesOutsideRange.length > 0) {
          Logger.warn(`Warning: ${matchesOutsideRange.length} matches found outside season range!`);
        }
      }
      
      if (matches.length === 0) {
        await safeEditReply(interaction, `✅ Found Riot ID **${displayName}**, but no matches found for Season ${currentSeason} (${seasonInfo.seasonStartDate} to ${seasonInfo.seasonEndDate}). Try playing some games!`, {
          flags: MessageFlags.Ephemeral
        });
        return;
      }
      
      // Calculate season statistics
      const winRate = YearEndRewindCalculator.calculateWinRate(matches);
      const mostPlayedChampions = YearEndRewindCalculator.getMostPlayedChampions(matches, 5);
      const kdaStats = YearEndRewindCalculator.calculateKDA(matches);
      const totalGames = YearEndRewindCalculator.calculateTotalGames(matches);
      
      // Validate statistics
      Logger.info(`Statistics calculated:`, {
        totalGames,
        winRate: `${winRate}%`,
        kda: `${kdaStats.kills}/${kdaStats.deaths}/${kdaStats.assists} (${kdaStats.kda})`,
        topChampions: mostPlayedChampions.length
      });
      
      // Prepare the response
      const embed = {
        title: `🎮 ${displayName}'s Season ${currentSeason} Rewind`,
        description: `Here are your epic League of Legends statistics for Season ${currentSeason}!`,
        color: 0x5865F2,
        fields: [
          {
            name: '🏆 Total Games Played',
            value: `${totalGames} games`,
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
            value: mostPlayedChampions.map(champ => {
              const championName = ChampionNames.getName(champ.championId);
              return `${championName}: ${champ.gamesPlayed} games (${champ.winRate}% WR)`;
            }).join('\n') || 'No champion data available',
            inline: false
          }
        ],
        footer: {
          text: 'Data collected from Riot Games API | Updated in real-time'
        },
        timestamp: new Date().toISOString()
      };
      
      // Try to send final result, but don't throw if interaction expired
      // safeEditReply will handle all fallbacks (DM -> Channel -> Log)
      const result = await safeEditReply(interaction, { embeds: [embed] }, {});
      
      if (result === null) {
        // All fallback methods failed, log the results for debugging
        Logger.warn('All delivery methods failed (interaction expired, DM disabled, channel unavailable)');
        Logger.info('Stats calculated successfully but could not be delivered:', {
          user: interaction.user?.tag || 'unknown',
          channel: interaction.channel?.id || 'unknown',
          totalGames,
          winRate: `${winRate}%`,
          kda: `${kdaStats.kills}/${kdaStats.deaths}/${kdaStats.assists}`
        });
      } else {
        Logger.success('Stats delivered successfully to user');
      }
      
    } catch (error) {
      Logger.error('Error fetching LoL stats:', {
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
      
      await safeEditReply(interaction, errorMessage, {
        flags: MessageFlags.Ephemeral
      });
    }
  },
};