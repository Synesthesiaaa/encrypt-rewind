// src/utils/YearEndRewindCalculator.js
const moment = require('moment');

class YearEndRewindCalculator {
  constructor() {
    this.currentYear = moment().year();
  }

  // Get current season information
  // League of Legends seasons typically run from January to November/December
  getCurrentSeason() {
    const now = moment();
    const currentYear = now.year();
    const currentMonth = now.month() + 1; // moment months are 0-indexed
    
    // Season year is the current year
    const seasonYear = currentYear;
    
    // Season typically starts in January and ends in November
    // Use January 1st 00:00:00 UTC as start and November 30th 23:59:59 UTC as end
    const seasonStart = moment.utc(`${seasonYear}-01-01 00:00:00`);
    const seasonEnd = moment.utc(`${seasonYear}-12-31 23:59:59`);
    
    // Convert to milliseconds (gameCreation is in milliseconds)
    const seasonStartMs = seasonStart.valueOf();
    const seasonEndMs = seasonEnd.valueOf();
    
    console.log(`📅 Season ${seasonYear}: ${seasonStart.format('YYYY-MM-DD')} to ${seasonEnd.format('YYYY-MM-DD')}`);
    console.log(`   Timestamps: ${seasonStartMs} to ${seasonEndMs}`);
    
    return {
      season: seasonYear,
      seasonStart: seasonStartMs,
      seasonEnd: seasonEndMs,
      seasonStartDate: seasonStart.format('YYYY-MM-DD'),
      seasonEndDate: seasonEnd.format('YYYY-MM-DD')
    };
  }

  // Calculate win rate from matches
  calculateWinRate(matches) {
    if (matches.length === 0) return 0;
    const wins = matches.filter(match => match.win).length;
    return Math.round((wins / matches.length) * 100);
  }

  // Calculate most played champions
  getMostPlayedChampions(matches, topCount = 5) {
    const championStats = {};
    
    matches.forEach(match => {
      const championId = match.championId;
      if (!championStats[championId]) {
        championStats[championId] = { count: 0, wins: 0 };
      }
      championStats[championId].count++;
      if (match.win) championStats[championId].wins++;
    });
    
    return Object.entries(championStats)
      .sort(([,a], [,b]) => b.count - a.count)
      .slice(0, topCount)
      .map(([championId, stats]) => ({
        championId: parseInt(championId),
        gamesPlayed: stats.count,
        winRate: Math.round((stats.wins / stats.count) * 100)
      }));
  }

  // Calculate peak rank
  getPeakRank(leagueEntries) {
    if (!Array.isArray(leagueEntries) || leagueEntries.length === 0) {
      return { tier: 'UNRANKED', division: '', lp: 0 };
    }
    
    let peakTier = 'UNRANKED';
    let peakDivision = '';
    let peakLP = 0;
    
    leagueEntries.forEach(entry => {
      if (!entry || typeof entry !== 'object') return;
      
      const tierValue = this.getTierValue(entry.tier);
      const divisionValue = this.getDivisionValue(entry.division);
      const leaguePoints = parseInt(entry.leaguePoints, 10) || 0;
      
      if (tierValue > this.getTierValue(peakTier) || 
         (tierValue === this.getTierValue(peakTier) && divisionValue > this.getDivisionValue(peakDivision)) ||
         (tierValue === this.getTierValue(peakTier) && divisionValue === this.getDivisionValue(peakDivision) && leaguePoints > peakLP)) {
        peakTier = entry.tier || 'UNRANKED';
        peakDivision = entry.division || '';
        peakLP = leaguePoints;
      }
    });
    
    return { tier: peakTier, division: peakDivision, lp: peakLP };
  }

  // Helper function to get tier numerical value
  getTierValue(tier) {
    if (!tier || typeof tier !== 'string') return 0;
    
    const tiers = {
      'IRON': 1, 'BRONZE': 2, 'SILVER': 3, 'GOLD': 4,
      'PLATINUM': 5, 'EMERALD': 6, 'DIAMOND': 7,
      'MASTER': 8, 'GRANDMASTER': 9, 'CHALLENGER': 10,
      'UNRANKED': 0
    };
    return tiers[tier.toUpperCase()] || 0;
  }

  // Helper function to get division numerical value
  getDivisionValue(division) {
    if (!division || typeof division !== 'string') return 0;
    
    const divisions = {
      'IV': 1, 'III': 2, 'II': 3, 'I': 4
    };
    return divisions[division.toUpperCase()] || 0;
  }

  // Calculate total games played
  calculateTotalGames(matches) {
    return matches.length;
  }

  // Calculate KDA ratio
  calculateKDA(matches) {
    if (matches.length === 0) return { kills: 0, deaths: 0, assists: 0, kda: 0 };
    
    const totalKills = matches.reduce((sum, match) => sum + match.kills, 0);
    const totalDeaths = matches.reduce((sum, match) => sum + match.deaths, 0);
    const totalAssists = matches.reduce((sum, match) => sum + match.assists, 0);
    
    const kda = totalDeaths === 0 ? (totalKills + totalAssists) : (totalKills + totalAssists) / totalDeaths;
    return {
      kills: Math.round(totalKills / matches.length),
      deaths: Math.round(totalDeaths / matches.length),
      assists: Math.round(totalAssists / matches.length),
      kda: parseFloat(kda.toFixed(2))
    };
  }
}

module.exports = new YearEndRewindCalculator();