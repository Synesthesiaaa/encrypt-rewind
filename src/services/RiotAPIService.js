// src/services/RiotAPIService.js
const axios = require('axios');
require('dotenv').config();

class RiotAPIService {
  constructor() {
    this.apiKey = process.env.RIOT_API_KEY;
    this.region = process.env.RIOT_API_REGION || 'sea';
    this.baseURL = `https://${this.region}.api.riotgames.com/lol`;
    this.headers = {
      'X-Riot-Token': this.apiKey,
      'Accept': 'application/json'
    };
    
    // Rate limiting configuration (Riot API allows 20 requests every 1 second)
    this.requestQueue = [];
    this.isProcessing = false;
    this.rateLimitWindow = 1000; // 1 second
    this.maxRequestsPerWindow = 20;
  }

  // Queue system to handle rate limiting
  async makeRequest(endpoint, params = {}) {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({ endpoint, params, resolve, reject });
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.isProcessing || this.requestQueue.length === 0) return;
    
    this.isProcessing = true;
    
    while (this.requestQueue.length > 0) {
      const { endpoint, params, resolve, reject } = this.requestQueue.shift();
      
      try {
        const response = await axios.get(`${this.baseURL}${endpoint}`, {
          headers: this.headers,
          params: {
            ...params,
            api_key: this.apiKey // Fallback for some endpoints
          }
        });
        
        resolve(response.data);
        
        // Small delay between requests to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 50));
      } catch (error) {
        if (error.response?.status === 429) {
          // Rate limited - wait and retry
          await new Promise(resolve => setTimeout(resolve, 1000));
          this.requestQueue.unshift({ endpoint, params, resolve, reject });
        } else {
          reject(error);
        }
      }
    }
    
    this.isProcessing = false;
  }

  // Get summoner by name
  async getSummonerByName(summonerName) {
    const endpoint = `/summoner/v4/summoners/by-name/${encodeURIComponent(summonerName)}`;
    return this.makeRequest(endpoint);
  }

  // Get match history
  async getMatchHistory(puuid, start = 0, count = 20) {
    const endpoint = `/match/v5/matches/by-puuid/${puuid}/ids`;
    return this.makeRequest(endpoint, {
      start,
      count,
      queue: 420, // Ranked Solo Queue
      type: 'ranked'
    });
  }

  // Get match details
  async getMatchDetails(matchId) {
    const endpoint = `/match/v5/matches/${matchId}`;
    return this.makeRequest(endpoint);
  }

  // Get league entries for summoner
  async getLeagueEntries(summonerId) {
    const endpoint = `/league/v4/entries/by-summoner/${summonerId}`;
    return this.makeRequest(endpoint);
  }

  // Get champion mastery
  async getChampionMastery(puuid) {
    const endpoint = `/champion-mastery/v4/champion-masteries/by-puuid/${puuid}`;
    return this.makeRequest(endpoint, { count: 10 }); // Top 10 champions
  }
}

module.exports = new RiotAPIService();