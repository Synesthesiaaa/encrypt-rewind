// src/services/RiotAPIService.js
const axios = require('axios');
require('dotenv').config();

class RiotAPIService {
  constructor() {
    const rawApiKey = process.env.RIOT_API_KEY;
    
    if (!rawApiKey) {
      console.error('❌ RIOT_API_KEY is not set in environment variables!');
      console.error('   Please create a .env file with: RIOT_API_KEY=your_api_key_here');
      console.error('   Get your API key from: https://developer.riotgames.com/');
      this.apiKey = null;
    } else {
      // Trim whitespace from API key (common issue)
      this.apiKey = rawApiKey.trim();
      
      // Remove any non-printable characters that might cause issues
      this.apiKey = this.apiKey.replace(/[\x00-\x1F\x7F-\x9F]/g, '');
      
      if (this.apiKey.length === 0) {
        console.error('❌ RIOT_API_KEY is set but empty after trimming!');
        console.error('   Please check your .env file and ensure the API key is not empty.');
        this.apiKey = null;
      } else if (this.apiKey.length < 20) {
        console.warn('⚠️  RIOT_API_KEY appears to be invalid (too short). Riot API keys are typically longer.');
        console.warn('   Current length:', this.apiKey.length);
        console.warn('   Preview:', this.apiKey.substring(0, 8) + '...' + this.apiKey.substring(this.apiKey.length - 4));
      } else if (rawApiKey !== this.apiKey) {
        console.warn('⚠️  RIOT_API_KEY had leading/trailing whitespace or special characters. It has been cleaned.');
        console.warn('   Original length:', rawApiKey.length, '→ Cleaned length:', this.apiKey.length);
      } else {
        console.log('✅ RIOT_API_KEY loaded successfully (length:', this.apiKey.length, 'characters)');
      }
      
      // Validate API key format (Riot API keys are typically alphanumeric with hyphens)
      if (this.apiKey && !/^[A-Za-z0-9\-_]+$/.test(this.apiKey)) {
        console.warn('⚠️  RIOT_API_KEY contains unusual characters. This might cause authentication issues.');
        console.warn('   Riot API keys should only contain letters, numbers, hyphens, and underscores.');
      }
    }
    
    // ============================================================================
    // ROUTING VALUES CONFIGURATION
    // ============================================================================
    // Riot API uses TWO different types of routing values:
    // 1. PLATFORM routing values (v4 APIs): na1, euw1, sg2, oc1, etc.
    // 2. REGIONAL routing values (v5 APIs): americas, europe, asia, sea
    // See: https://developer.riotgames.com/docs/lol#routing-values
    // ============================================================================
    
    // Accept either platform OR regional routing values from environment
    const userInput = (process.env.RIOT_API_REGION || 'sea').toLowerCase();
    
    // Define valid routing values (tested and verified working platforms only)
    // Removed: ph2, th2 (non-responsive - ENOTFOUND)
    const validPlatforms = ['br1', 'eun1', 'euw1', 'jp1', 'kr', 'la1', 'la2', 'na1', 'oc1', 'tr1', 'ru', 'sg2', 'tw2', 'vn2'];
    const validRegions = ['americas', 'europe', 'asia', 'sea'];
    
    // Map regional routing values to default platform for that region (for v4 APIs)
    const regionalToDefaultPlatform = {
      'americas': 'na1',  // Default to NA for Americas
      'europe': 'euw1',   // Default to EUW for Europe
      'asia': 'kr',       // Default to KR for Asia
      'sea': 'sg2'        // Default to SG2 for SEA (ph2 removed - non-responsive)
    };
    
    // Map platform routing values to regional routing values (for v5 APIs)
    const platformToRegional = {
      // Americas region platforms → americas regional routing
      'na1': 'americas',
      'br1': 'americas',
      'la1': 'americas',
      'la2': 'americas',
      // Europe region platforms → europe regional routing
      'euw1': 'europe',
      'eun1': 'europe',
      'ru': 'europe',
      'tr1': 'europe',
      // Asia region platforms → asia regional routing
      'kr': 'asia',
      'jp1': 'asia',
      // SEA region platforms → sea regional routing
      // Removed: ph2, th2 (non-responsive)
      'oc1': 'sea',
      'sg2': 'sea',
      'tw2': 'sea',
      'vn2': 'sea'
    };
    
    // Determine if user provided a platform or regional routing value
    if (validRegions.includes(userInput)) {
      // User provided a REGIONAL routing value (v5 API style)
      this.region = userInput;
      this.platform = regionalToDefaultPlatform[userInput];
      console.log(`✅ Using REGIONAL routing value: ${this.region}`);
      console.log(`   Mapped to platform: ${this.platform} (for v4 APIs)`);
    } else if (validPlatforms.includes(userInput)) {
      // User provided a PLATFORM routing value (v4 API style)
      this.platform = userInput;
      this.region = platformToRegional[userInput] || 'sea';
      console.log(`✅ Using PLATFORM routing value: ${this.platform}`);
      console.log(`   Mapped to region: ${this.region} (for v5 APIs)`);
    } else {
      // Invalid value, use defaults
      console.warn(`⚠️  Invalid routing value "${userInput}". Using defaults (platform: sg2, region: sea).`);
      console.warn('   Valid platform values:', validPlatforms.join(', '));
      console.warn('   Valid regional values:', validRegions.join(', '));
      this.platform = 'sg2';
      this.region = 'sea';
    }
    
    // Base URL for v4 APIs using PLATFORM routing values
    // Example: https://na1.api.riotgames.com/lol/summoner/v4/...
    this.platformBaseURL = `https://${this.platform}.api.riotgames.com/lol`;
    
    // Base URL for v5 APIs using REGIONAL routing values
    // Example: https://americas.api.riotgames.com/lol/match/v5/...
    this.regionalBaseURL = `https://${this.region}.api.riotgames.com/lol`;
    
    // Base URL for Account API v1 using REGIONAL routing values (no /lol prefix)
    // Example: https://americas.api.riotgames.com/riot/account/v1/...
    this.accountBaseURL = `https://${this.region}.api.riotgames.com/riot`;
    
    // Log routing configuration
    console.log(`📍 Final routing configuration:`);
    console.log(`   v4 APIs (Summoner/League): ${this.platformBaseURL}`);
    console.log(`   v5 APIs (Match): ${this.regionalBaseURL}`);
    console.log(`   Account API v1: ${this.accountBaseURL}`);
    
    // Headers will be set dynamically in makeRequest to ensure API key is always valid
    this.headers = {
      'Accept': 'application/json'
    };
    
    // Rate limiting configuration (Riot API allows 20 requests every 1 second)
    this.requestQueue = [];
    this.isProcessing = false;
    this.rateLimitWindow = 1000; // 1 second
    this.maxRequestsPerWindow = 20;
  }

  // Helper method to resolve region and platform from user input
  resolveRegionAndPlatform(userRegion) {
    const validPlatforms = ['br1', 'eun1', 'euw1', 'jp1', 'kr', 'la1', 'la2', 'na1', 'oc1', 'tr1', 'ru', 'sg2', 'tw2', 'vn2'];
    const validRegions = ['americas', 'europe', 'asia', 'sea'];
    
    const regionalToDefaultPlatform = {
      'americas': 'na1',
      'europe': 'euw1',
      'asia': 'kr',
      'sea': 'sg2'
    };
    
    const platformToRegional = {
      // Americas region platforms → americas regional routing
      'na1': 'americas',
      'br1': 'americas',
      'la1': 'americas',
      'la2': 'americas',
      // Europe region platforms → europe regional routing
      'euw1': 'europe',
      'eun1': 'europe',
      'ru': 'europe',
      'tr1': 'europe',
      // Asia region platforms → asia regional routing
      'kr': 'asia',
      'jp1': 'asia',
      // SEA region platforms → sea regional routing
      // Note: ph2, th2 removed (non-responsive - ENOTFOUND)
      'oc1': 'sea',
      'sg2': 'sea',
      'tw2': 'sea',
      'vn2': 'sea'
    };
    
    const userInput = (userRegion || this.region || 'sea').toLowerCase();
    
    let region, platform;
    if (validRegions.includes(userInput)) {
      region = userInput;
      platform = regionalToDefaultPlatform[userInput];
    } else if (validPlatforms.includes(userInput)) {
      platform = userInput;
      region = platformToRegional[userInput] || 'sea';
    } else {
      // Invalid region, use defaults
      region = this.region;
      platform = this.platform;
    }
    
    return { region, platform };
  }

  // Queue system to handle rate limiting
  async makeRequest(endpoint, params = {}, useMatchAPI = false, useAccountAPI = false, userRegion = null) {
    if (!this.apiKey) {
      throw new Error('RIOT_API_KEY is not configured. Please set it in your .env file.');
    }
    
    // Validate API key is not empty
    if (typeof this.apiKey !== 'string' || this.apiKey.trim().length === 0) {
      throw new Error('RIOT_API_KEY is empty or invalid. Please check your .env file.');
    }
    
    if (!endpoint || typeof endpoint !== 'string') {
      throw new Error('Invalid endpoint provided');
    }
    
    return new Promise((resolve, reject) => {
      this.requestQueue.push({ endpoint, params, resolve, reject, useMatchAPI, useAccountAPI, userRegion });
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.isProcessing || this.requestQueue.length === 0) return;
    
    this.isProcessing = true;
    
    try {
      while (this.requestQueue.length > 0) {
        const { endpoint, params, resolve, reject, useMatchAPI, useAccountAPI, userRegion } = this.requestQueue.shift();
        
        try {
          // Resolve region and platform for this request (use user-provided region if available)
          const { region: requestRegion, platform: requestPlatform } = this.resolveRegionAndPlatform(userRegion || null);
          
          // Determine base URL based on API type and resolved region:
          // - Account API v1: uses REGIONAL routing (no /lol prefix)
          // - v4 APIs (Summoner, League, Champion Mastery): use PLATFORM routing values
          // - v5 APIs (Match): use REGIONAL routing values
          let baseURL;
          if (useAccountAPI) {
            baseURL = `https://${requestRegion}.api.riotgames.com/riot`;
          } else if (useMatchAPI) {
            baseURL = `https://${requestRegion}.api.riotgames.com/lol`;
          } else {
            baseURL = `https://${requestPlatform}.api.riotgames.com/lol`;
          }
          const url = `${baseURL}${endpoint}`;
          
          // Remove the temporary _userRegion param before making the request
          const cleanParams = { ...params };
          delete cleanParams._userRegion;
          
          // Ensure API key is valid before making request
          if (!this.apiKey || typeof this.apiKey !== 'string' || this.apiKey.trim().length === 0) {
            const error = new Error('RIOT_API_KEY is empty or invalid');
            error.response = { status: 401, statusText: 'Unauthorized' };
            reject(error);
            continue;
          }
          
          // Build headers dynamically to ensure API key is always included
          const requestHeaders = {
            'X-Riot-Token': this.apiKey.trim(),
            'Accept': 'application/json'
          };
          
          // Log request details for debugging (without exposing full API key)
          const apiKeyPreview = this.apiKey ? `${this.apiKey.substring(0, 8)}...${this.apiKey.substring(this.apiKey.length - 4)}` : 'MISSING';
          console.log(`🔍 Making API request:`, {
            endpoint: endpoint,
            baseURL: baseURL,
            apiKeyPreview: apiKeyPreview,
            apiKeyLength: this.apiKey?.length || 0,
            headerName: 'X-Riot-Token',
            headerValueSet: !!requestHeaders['X-Riot-Token']
          });
          
          const response = await axios.get(url, {
            headers: requestHeaders,
            params: cleanParams,
            timeout: 30000, // 30 second timeout (increased from 10s for slow connections)
            responseType: 'json',
            // Additional axios configuration for better timeout handling
            validateStatus: function (status) {
              return status < 500; // Don't throw for 4xx errors, only 5xx
            }
          });
          
          // Check if response contains an error status object (Riot API error format)
          if (response.data && response.data.status && response.data.status.status_code) {
            // This is an error response from Riot API
            const error = new Error(response.data.status.message || 'API Error');
            error.response = {
              status: response.data.status.status_code,
              statusText: response.data.status.message || 'Error',
              data: response.data
            };
            error.config = { url };
            error.url = url; // Store URL directly on error for easier access
            reject(error);
            continue;
          }
          
          // Check for HTTP error status codes
          if (response.status >= 400) {
            const error = new Error(`HTTP ${response.status}: ${response.statusText || 'Error'}`);
            error.response = {
              status: response.status,
              statusText: response.statusText,
              data: response.data
            };
            error.config = { url };
            error.url = url; // Store URL directly on error for easier access
            reject(error);
            continue;
          }
          
          resolve(response.data);
          
          // Small delay between requests to respect rate limits
          await new Promise(resolveDelay => setTimeout(resolveDelay, 50));
        } catch (error) {
          // Enhanced error logging
          if (error.response) {
            const status = error.response.status;
            const errorUrl = error.url || error.config?.url || 'Unknown URL';
            console.error(`API Error [${status}]:`, {
              url: errorUrl,
              status: status,
              statusText: error.response.statusText,
              data: error.response.data
            });
            
            // Special handling for 403 errors
            if (status === 403) {
              const errorUrl = error.url || error.config?.url || 'Unknown URL';
              console.error('\n🔑 API Key Authentication Failed (403 Forbidden)');
              console.error('   Request URL:', errorUrl);
              console.error('   Response data:', JSON.stringify(error.response.data, null, 2));
              console.error('   API Key length:', this.apiKey?.length || 0);
              console.error('   API Key preview:', this.apiKey ? `${this.apiKey.substring(0, 8)}...${this.apiKey.substring(this.apiKey.length - 4)}` : 'MISSING');
              console.error('   API Key format:', this.apiKey?.startsWith('RGAPI-') ? 'RGAPI- (Personal Key)' : 'Unknown format');
              console.error('   Header used:', 'X-Riot-Token');
              console.error('   Region configured:', this.region);
              console.error('   Platform configured:', this.platform);
              console.error('\n   ⚠️  IMPORTANT: Riot Personal API Keys expire after 24 hours!');
              console.error('\n   Possible causes:');
              console.error('   1. API key expired (most common - keys expire after 24 hours)');
              console.error('   2. API key does not have Account API v1 permissions');
              console.error('   3. API key type mismatch (needs Personal API Key, not Production)');
              console.error('   4. API key is for a different region');
              console.error('   5. API key contains extra whitespace or characters');
              console.error('\n📝 To fix this:');
              console.error('   1. Go to https://developer.riotgames.com/');
              console.error('   2. Log in and check your API keys');
              console.error('   3. Generate a NEW "Personal API Key" (old ones expire!)');
              console.error('   4. Copy the key EXACTLY (no spaces before/after)');
              console.error('   5. Update your .env file: RIOT_API_KEY=your_new_key_here');
              console.error('   6. Make sure the key has access to Account API v1');
              console.error('   7. Restart the bot');
              console.error('\n💡 Run "node test-account-api.js" to test your API key\n');
            }
          } else if (error.request) {
            if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
              // Timeout error - retry with exponential backoff (max 3 retries)
              const retryCount = (params._retryCount || 0) + 1;
              if (retryCount > 3) {
                console.error('API Request Timeout (Max retries reached):', {
                  url: error.config?.url,
                  message: 'Request timed out after 3 attempts'
                });
                reject(new Error('Request timeout: The API server did not respond in time. Please try again later.'));
                continue;
              }
              
              const backoffDelay = Math.min(1000 * Math.pow(2, retryCount - 1), 5000); // Exponential backoff: 1s, 2s, 4s (max 5s)
              console.warn(`⏱️  Request timeout. Retrying in ${backoffDelay}ms... (Attempt ${retryCount}/3)`);
              console.warn(`   URL: ${error.config?.url}`);
              await new Promise(resolveDelay => setTimeout(resolveDelay, backoffDelay));
              this.requestQueue.unshift({ 
                endpoint, 
                params: { ...params, _retryCount: retryCount }, 
                resolve, 
                reject, 
                useMatchAPI,
                useAccountAPI,
                userRegion
              });
              continue;
            } else {
              console.error('API Request Error:', {
                url: error.config?.url,
                message: error.message,
                code: error.code
              });
            }
          } else {
            console.error('API Error:', error.message);
          }
          
          // Handle rate limiting (429 errors)
          if (error.response?.status === 429) {
            const retryCount = (params._retryCount || 0) + 1;
            if (retryCount > 3) {
              reject(new Error('Rate limit exceeded. Maximum retries reached.'));
              continue;
            }
            
            const retryAfter = parseInt(error.response.headers['retry-after'] || '1', 10);
            console.log(`Rate limited. Waiting ${retryAfter} seconds... (Attempt ${retryCount}/3)`);
            await new Promise(resolveDelay => setTimeout(resolveDelay, retryAfter * 1000));
            this.requestQueue.unshift({ 
              endpoint, 
              params: { ...params, _retryCount: retryCount }, 
              resolve, 
              reject, 
              useMatchAPI,
              useAccountAPI,
              userRegion
            });
            continue;
          }
          
          // For all other errors, reject immediately
          reject(error);
        }
      }
    } catch (error) {
      console.error('❌ Critical error in request queue processing:', error);
      // Reject all pending requests
      while (this.requestQueue.length > 0) {
        const { reject } = this.requestQueue.shift();
        reject(new Error('Request queue processing failed'));
      }
    } finally {
      this.isProcessing = false;
    }
  }

  // Get account by Riot ID (gameName + tagLine)
  // Uses REGIONAL routing value (Account API v1)
  // See: https://developer.riotgames.com/apis#account-v1/GET_getByRiotId
  async getAccountByRiotId(gameName, tagLine, userRegion = null) {
    if (!gameName || typeof gameName !== 'string' || gameName.trim().length === 0) {
      throw new Error('Game name is required and must be a non-empty string');
    }
    
    if (!tagLine || typeof tagLine !== 'string' || tagLine.trim().length === 0) {
      throw new Error('Tag line is required and must be a non-empty string');
    }
    
    // Endpoint is /account/v1/... (base URL already includes /riot)
    const endpoint = `/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
    
    try {
      // Account API uses REGIONAL routing (v1 API) - separate base URL
      const account = await this.makeRequest(endpoint, {}, false, true, userRegion);
      
      // Validate response structure
      if (!account || typeof account !== 'object') {
        throw new Error('Invalid API response: Expected object but received ' + typeof account);
      }
      
      // Check if response is an error object
      if (account.status && account.status.status_code) {
        const statusCode = account.status.status_code;
        const errorMessage = account.status.message || 'API Error';
        
        const apiError = new Error(errorMessage);
        apiError.response = {
          status: statusCode,
          statusText: errorMessage,
          data: account
        };
        throw apiError;
      }
      
      // Validate required fields
      if (!account.puuid) {
        throw new Error('Invalid API response: Account data missing PUUID field');
      }
      
      return account;
    } catch (error) {
      // Preserve error status codes
      if (error.response?.status) {
        const apiError = new Error(error.message || 'API Error');
        apiError.response = error.response;
        apiError.status = error.response.status;
        throw apiError;
      }
      throw error;
    }
  }

  // Get summoner by PUUID
  // Uses PLATFORM routing value (v4 API)
  // See: https://developer.riotgames.com/apis#summoner-v4/GET_getByPUUID
  async getSummonerByPUUID(puuid, userRegion = null) {
    if (!puuid || typeof puuid !== 'string' || puuid.trim().length === 0) {
      throw new Error('PUUID is required and must be a non-empty string');
    }
    
    const endpoint = `/summoner/v4/summoners/by-puuid/${encodeURIComponent(puuid)}`;
    
    try {
      // Summoner API uses PLATFORM routing (v4 API)
      const summoner = await this.makeRequest(endpoint, {}, false, false, userRegion);
      
      // Validate response structure
      if (!summoner || typeof summoner !== 'object') {
        throw new Error('Invalid API response: Expected object but received ' + typeof summoner);
      }
      
      // Check if response is an error object
      if (summoner.status && summoner.status.status_code) {
        const statusCode = summoner.status.status_code;
        const errorMessage = summoner.status.message || 'API Error';
        
        const apiError = new Error(errorMessage);
        apiError.response = {
          status: statusCode,
          statusText: errorMessage,
          data: summoner
        };
        throw apiError;
      }
      
      // Validate required fields
      if (!summoner.puuid) {
        throw new Error('Invalid API response: Summoner data missing PUUID field');
      }
      
      return summoner;
    } catch (error) {
      // Preserve error status codes
      if (error.response?.status) {
        const apiError = new Error(error.message || 'API Error');
        apiError.response = error.response;
        apiError.status = error.response.status;
        throw apiError;
      }
      throw error;
    }
  }

  // Get summoner by Riot ID (handles Name#Tag format)
  // This is the new recommended method - uses Account API v1 + Summoner API v4
  // Replaces the deprecated by-name endpoint
  async getSummonerByRiotId(riotId, userRegion = null) {
    if (!riotId || typeof riotId !== 'string' || riotId.trim().length === 0) {
      throw new Error('Riot ID is required and must be a non-empty string');
    }
    
    // Parse Riot ID format: GameName#TagLine
    const parts = riotId.split('#');
    if (parts.length !== 2) {
      throw new Error('Invalid Riot ID format. Expected format: GameName#TagLine (e.g., "SummonerName#TAG1")');
    }
    
    const gameName = parts[0].trim();
    const tagLine = parts[1].trim();
    
    if (gameName.length === 0 || tagLine.length === 0) {
      throw new Error('Invalid Riot ID format. Both game name and tag line are required.');
    }
    
    try {
      // Step 1: Get account (PUUID) from Riot ID using Account API v1 (regional routing)
      console.log(`🔍 Looking up Riot ID: ${gameName}#${tagLine}${userRegion ? ` (region: ${userRegion})` : ''}`);
      const account = await this.getAccountByRiotId(gameName, tagLine, userRegion);
      
      if (!account || !account.puuid) {
        throw new Error('Failed to retrieve account PUUID from Riot ID');
      }
      
      console.log(`✅ Found account with PUUID: ${account.puuid.substring(0, 8)}...`);
      
      // Step 2: Get summoner data from PUUID using Summoner API v4 (platform routing)
      // Use the same region to determine the platform
      const summoner = await this.getSummonerByPUUID(account.puuid, userRegion);
      
      // Merge account and summoner data for complete information
      return {
        ...summoner,
        gameName: account.gameName || gameName,
        tagLine: account.tagLine || tagLine,
        riotId: `${account.gameName || gameName}#${account.tagLine || tagLine}`
      };
    } catch (error) {
      // Preserve error status codes for proper handling
      if (error.response?.status === 404) {
        const regionMsg = userRegion ? ` in region ${userRegion}` : '';
        const apiError = new Error(`Riot ID "${gameName}#${tagLine}" not found${regionMsg}`);
        apiError.response = error.response;
        apiError.status = 404;
        apiError.region = userRegion;
        throw apiError;
      }
      if (error.response?.status === 403) {
        const apiError = new Error('API key is invalid or expired (403 Forbidden)');
        apiError.response = error.response;
        apiError.status = 403;
        apiError.region = userRegion;
        throw apiError;
      }
      throw error;
    }
  }

  // DEPRECATED: Get summoner by name (for backward compatibility)
  // This endpoint is deprecated by Riot - use getSummonerByRiotId instead
  // Kept for backward compatibility but will be removed in future versions
  async getSummonerByName(summonerName) {
    console.warn('⚠️  getSummonerByName is deprecated. Use getSummonerByRiotId with format "GameName#TagLine" instead.');
    
    // Try to parse as Riot ID first
    if (summonerName.includes('#')) {
      return this.getSummonerByRiotId(summonerName);
    }
    
    // Fallback to old endpoint for backward compatibility
    const nameOnly = summonerName.trim();
    if (nameOnly.length === 0) {
      throw new Error('Invalid summoner name format');
    }
    
    const endpoint = `/summoner/v4/summoners/by-name/${encodeURIComponent(nameOnly)}`;
    
    try {
      const summoner = await this.makeRequest(endpoint, {}, false);
      
      if (!summoner || typeof summoner !== 'object') {
        throw new Error('Invalid API response: Expected object but received ' + typeof summoner);
      }
      
      if (summoner.status && summoner.status.status_code) {
        const statusCode = summoner.status.status_code;
        const errorMessage = summoner.status.message || 'API Error';
        
        const apiError = new Error(errorMessage);
        apiError.response = {
          status: statusCode,
          statusText: errorMessage,
          data: summoner
        };
        throw apiError;
      }
      
      if (!summoner.puuid) {
        throw new Error('Invalid API response: Summoner data missing PUUID field');
      }
      
      return summoner;
    } catch (error) {
      if (error.response?.status === 404) {
        const apiError = new Error(`Summoner "${nameOnly}" not found. Please use Riot ID format: GameName#TagLine`);
        apiError.response = error.response;
        apiError.status = 404;
        throw apiError;
      }
      if (error.response?.status === 403) {
        const apiError = new Error('API key is invalid or expired (403 Forbidden)');
        apiError.response = error.response;
        apiError.status = 403;
        throw apiError;
      }
      throw error;
    }
  }

  // Get match history
  // Uses REGIONAL routing value (v5 API)
  async getMatchHistory(puuid, start = 0, count = 20, userRegion = null) {
    if (!puuid || typeof puuid !== 'string' || puuid.trim().length === 0) {
      throw new Error('PUUID is required and must be a non-empty string');
    }
    
    if (start < 0 || count < 0 || count > 100) {
      throw new Error('Invalid start or count parameters');
    }
    
    const endpoint = `/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids`;
    return this.makeRequest(endpoint, {
      start,
      count,
      queue: 420 // Ranked Solo Queue
    }, true, false, userRegion);
  }

  // Get match details
  // Uses REGIONAL routing value (v5 API)
  async getMatchDetails(matchId, userRegion = null) {
    if (!matchId || typeof matchId !== 'string' || matchId.trim().length === 0) {
      throw new Error('Match ID is required and must be a non-empty string');
    }
    
    const endpoint = `/match/v5/matches/${encodeURIComponent(matchId)}`;
    return this.makeRequest(endpoint, {}, true, false, userRegion);
  }

  // Get league entries for summoner
  // Uses PLATFORM routing value (v4 API)
  async getLeagueEntries(summonerId) {
    if (!summonerId || typeof summonerId !== 'string' || summonerId.trim().length === 0) {
      throw new Error('Summoner ID is required and must be a non-empty string');
    }
    
    const endpoint = `/league/v4/entries/by-summoner/${encodeURIComponent(summonerId)}`;
    return this.makeRequest(endpoint, {}, false);
  }

  // Get champion mastery
  // Uses PLATFORM routing value (v4 API)
  async getChampionMastery(summonerId) {
    if (!summonerId || typeof summonerId !== 'string' || summonerId.trim().length === 0) {
      throw new Error('Summoner ID is required and must be a non-empty string');
    }
    
    const endpoint = `/champion-mastery/v4/champion-masteries/by-summoner/${encodeURIComponent(summonerId)}`;
    return this.makeRequest(endpoint, { count: 10 }, false); // Top 10 champions
  }
}

module.exports = new RiotAPIService();