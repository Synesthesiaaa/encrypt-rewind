// src/services/RiotAPIService.js
const axios = require('axios');
require('dotenv').config();
const Logger = require('../utils/Logger');
const CacheService = require('../utils/CacheService');
const APIMonitor = require('../utils/APIMonitor');
const APIKeyManager = require('../utils/APIKeyManager');

class RiotAPIService {
  constructor() {
    // API keys are now managed by APIKeyManager
    // Keep this.apiKey for backward compatibility (will use first available key)
    try {
      const firstKey = APIKeyManager.getNextAPIKey();
      this.apiKey = firstKey ? firstKey.key : null;
    } catch (error) {
      this.apiKey = null;
    }
    
    if (!this.apiKey) {
      Logger.error('No API keys available!');
      Logger.error('Please set RIOT_API_KEY or RIOT_API_KEY_2, RIOT_API_KEY_3, etc. in your .env file');
      Logger.error('Get your API key from: https://developer.riotgames.com/');
    } else {
      Logger.success(`RiotAPIService initialized with ${APIKeyManager.apiKeys.length} API key(s)`);
    }
    
    // ============================================================================
    // ROUTING VALUES CONFIGURATION
    // ============================================================================
    // Riot API uses DIFFERENT routing values for different APIs:
    // 1. Account API v1: REGIONAL routing (americas, asia, europe) - NO sea support!
    //    - Can query accounts from any region using these three values
    //    - SEA accounts must be queried using 'asia' regional value
    // 2. Match API v5: REGIONAL routing (americas, asia, europe, sea) - includes sea
    // 3. Summoner/League/Champion Mastery v4: PLATFORM routing (na1, euw1, sg2, oc1, etc.)
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
    
    // Request throttling - track requests per time window
    this.requestTimestamps = [];
    this.lastRequestTime = 0;
    this.minRequestInterval = 50; // Minimum 50ms between requests (20 req/sec max)
    
    // Cleanup old timestamps periodically
    setInterval(() => {
      const oneMinuteAgo = Date.now() - 60000;
      this.requestTimestamps = this.requestTimestamps.filter(ts => ts > oneMinuteAgo);
    }, 60000); // Clean every minute
  }

  // Helper method to resolve region and platform from user input
  // IMPORTANT: Different APIs use different routing values:
  // - Account API v1: uses americas, asia, europe (NO sea - maps SEA to asia)
  // - Match API v5: uses americas, asia, europe, sea (includes sea)
  // - Summoner/League/Champion Mastery v4: uses platform values (na1, euw1, sg2, etc.)
  resolveRegionAndPlatform(userRegion, forAccountAPI = false, forMatchAPI = false) {
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
      // SEA region platforms → sea regional routing (for Match API v5)
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
    
    // CRITICAL FIX: Account API v1 only supports americas, asia, europe (NOT sea)
    // If using Account API and region is sea, map to asia
    if (forAccountAPI && region === 'sea') {
      console.log(`   ⚠️  Account API v1 doesn't support 'sea' region. Mapping to 'asia' instead.`);
      region = 'asia';
    }
    
    // Match API v5 supports sea, so no mapping needed for that
    
    return { region, platform };
  }

  // Throttle requests to respect rate limits
  async throttleRequest() {
    const now = Date.now();
    
    // Ensure minimum interval between requests
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.minRequestInterval) {
      const waitTime = this.minRequestInterval - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    // Track request timestamp
    this.requestTimestamps.push(Date.now());
    this.lastRequestTime = Date.now();
    
    // Check if we're approaching rate limit (20 requests per second)
    const oneSecondAgo = now - 1000;
    const recentRequests = this.requestTimestamps.filter(ts => ts > oneSecondAgo);
    
    if (recentRequests.length >= this.maxRequestsPerWindow) {
      // Wait until we can make another request
      const oldestRequest = Math.min(...recentRequests);
      const waitTime = 1000 - (now - oldestRequest) + 10; // Add 10ms buffer
      Logger.debug(`Rate limit approaching, waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  // Queue system to handle rate limiting
  async makeRequest(endpoint, params = {}, useMatchAPI = false, useAccountAPI = false, userRegion = null) {
    // Check if we have any API keys available
    if (APIKeyManager.apiKeys.length === 0) {
      throw new Error('No API keys configured. Please set RIOT_API_KEY in your .env file.');
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
        // Check rate limits before processing
        const rateLimitCheck = APIMonitor.canMakeRequest();
        if (!rateLimitCheck.allowed) {
          Logger.warn(`Rate limit reached, waiting ${rateLimitCheck.retryAfter}s`);
          await new Promise(resolve => setTimeout(resolve, rateLimitCheck.retryAfter * 1000));
          continue;
        }
        
        // Throttle requests to respect rate limits
        await this.throttleRequest();
        
        const { endpoint, params, resolve, reject, useMatchAPI, useAccountAPI, userRegion } = this.requestQueue.shift();
        
        // Retry logic: try up to 3 API keys on 401 errors
        let requestSucceeded = false;
        let lastError = null;
        const maxKeyRetries = Math.min(APIKeyManager.apiKeys.length, 3);
        let keysTried = [];
        
        for (let keyAttempt = 0; keyAttempt < maxKeyRetries && !requestSucceeded; keyAttempt++) {
          // Get API key for this request
          let apiKeyInfo;
          try {
            apiKeyInfo = APIKeyManager.getNextAPIKey();
          } catch (keyError) {
            Logger.error('Failed to get API key:', keyError.message);
            if (keyAttempt === 0) {
              const error = new Error('No API keys available. Please configure RIOT_API_KEY in your .env file.');
              error.response = { status: 500, statusText: 'Internal Server Error' };
              reject(error);
            }
            break;
          }
          
          const apiKey = apiKeyInfo.key;
          const apiKeyId = apiKeyInfo.id;
          keysTried.push(apiKeyId);
          
          if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
            Logger.warn(`API key ${apiKeyId} is invalid, trying next key...`);
            APIKeyManager.recordError(apiKeyId, 401);
            continue;
          }
          
          try {
          // Resolve region and platform for this request (use user-provided region if available)
          // IMPORTANT: Pass API type flags to handle Account API v1's limitation (no 'sea' support)
          const { region: requestRegion, platform: requestPlatform } = this.resolveRegionAndPlatform(
            userRegion || null,
            useAccountAPI,  // Account API v1 only supports americas, asia, europe
            useMatchAPI     // Match API v5 supports americas, asia, europe, sea
          );
          
          // Determine base URL based on API type and resolved region:
          // - Account API v1: uses REGIONAL routing (americas, asia, europe only - NO sea)
          // - v4 APIs (Summoner, League, Champion Mastery): use PLATFORM routing values
          // - v5 APIs (Match): use REGIONAL routing values (includes sea)
          let baseURL;
          if (useAccountAPI) {
            // Account API v1: https://{americas|asia|europe}.api.riotgames.com/riot
            baseURL = `https://${requestRegion}.api.riotgames.com/riot`;
          } else if (useMatchAPI) {
            // Match API v5: https://{americas|asia|europe|sea}.api.riotgames.com/lol
            baseURL = `https://${requestRegion}.api.riotgames.com/lol`;
          } else {
            // v4 APIs: https://{platform}.api.riotgames.com/lol (e.g., sg2, na1, euw1)
            baseURL = `https://${requestPlatform}.api.riotgames.com/lol`;
          }
          const url = `${baseURL}${endpoint}`;
          
          // Remove the temporary _userRegion param before making the request
          const cleanParams = { ...params };
          delete cleanParams._userRegion;
          
          // API key already validated above
          
          // Build headers dynamically to ensure API key is always included
          const requestHeaders = {
            'X-Riot-Token': apiKey.trim(),
            'Accept': 'application/json'
          };
          
          // Log request details for debugging (without exposing full API key)
          const apiKeyPreview = apiKey ? `${apiKey.substring(0, 8)}...${apiKey.substring(apiKey.length - 4)}` : 'MISSING';
          Logger.debug(`Making API request`, {
            endpoint: endpoint,
            baseURL: baseURL,
            fullURL: url,
            requestRegion: requestRegion,
            requestPlatform: requestPlatform,
            userRegion: userRegion || 'default',
            apiKeyId: apiKeyId,
            apiKeyPreview: apiKeyPreview,
            apiKeyLength: apiKey?.length || 0,
            headerName: 'X-Riot-Token',
            headerValueSet: !!requestHeaders['X-Riot-Token'],
            useAccountAPI: useAccountAPI,
            useMatchAPI: useMatchAPI
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
          
          const requestDuration = Date.now() - (response.config?.metadata?.startTime || Date.now());
          
          // Check if response contains an error status object (Riot API error format)
          if (response.data && response.data.status && response.data.status.status_code) {
            // This is an error response from Riot API
            const statusCode = response.data.status.status_code;
            
            // If 401 (authentication error), try next API key
            if (statusCode === 401 && keyAttempt < maxKeyRetries - 1) {
              Logger.warn(`API key ${apiKeyId} returned 401 (Unknown apikey), trying next key...`);
              APIMonitor.recordRequest(apiKeyId, endpoint, statusCode, false, requestDuration);
              APIKeyManager.recordError(apiKeyId, statusCode);
              lastError = new Error(response.data.status.message || 'Unknown apikey');
              lastError.response = {
                status: statusCode,
                statusText: response.data.status.message || 'Error',
                data: response.data
              };
              lastError.apiKeyId = apiKeyId;
              continue; // Try next key
            }
            
            Logger.apiRequest('GET', endpoint, statusCode, requestDuration);
            Logger.error(`API Error Response`, {
              endpoint,
              statusCode,
              message: response.data.status.message,
              url,
              apiKeyId
            });
            
            // Record error
            APIMonitor.recordRequest(apiKeyId, endpoint, statusCode, false, requestDuration);
            APIKeyManager.recordError(apiKeyId, statusCode);
            
            const error = new Error(response.data.status.message || 'API Error');
            error.response = {
              status: statusCode,
              statusText: response.data.status.message || 'Error',
              data: response.data
            };
            error.config = { url };
            error.url = url;
            error.apiKeyId = apiKeyId;
            reject(error);
            requestSucceeded = true; // Mark as handled
            break;
          }
          
          // Check for HTTP error status codes
          if (response.status >= 400) {
            // If 401 (authentication error), try next API key
            if (response.status === 401 && keyAttempt < maxKeyRetries - 1) {
              Logger.warn(`API key ${apiKeyId} returned 401, trying next key...`);
              APIMonitor.recordRequest(apiKeyId, endpoint, response.status, false, requestDuration);
              APIKeyManager.recordError(apiKeyId, response.status);
              lastError = new Error(`HTTP ${response.status}: ${response.statusText || 'Error'}`);
              lastError.response = {
                status: response.status,
                statusText: response.statusText,
                data: response.data
              };
              lastError.apiKeyId = apiKeyId;
              continue; // Try next key
            }
            
            Logger.apiRequest('GET', endpoint, response.status, requestDuration);
            Logger.error(`HTTP Error`, {
              endpoint,
              status: response.status,
              statusText: response.statusText,
              url,
              apiKeyId
            });
            
            // Record error
            APIMonitor.recordRequest(apiKeyId, endpoint, response.status, false, requestDuration);
            APIKeyManager.recordError(apiKeyId, response.status);
            
            const error = new Error(`HTTP ${response.status}: ${response.statusText || 'Error'}`);
            error.response = {
              status: response.status,
              statusText: response.statusText,
              data: response.data
            };
            error.config = { url };
            error.url = url;
            error.apiKeyId = apiKeyId;
            reject(error);
            requestSucceeded = true; // Mark as handled
            break;
          }
          
          // Success!
          Logger.apiRequest('GET', endpoint, response.status, requestDuration);
          
          // Record success
          APIMonitor.recordRequest(apiKeyId, endpoint, response.status, false, requestDuration);
          APIKeyManager.recordSuccess(apiKeyId);
          
          resolve(response.data);
          requestSucceeded = true;
          
          // Small delay between requests to respect rate limits (already throttled above)
          await new Promise(resolveDelay => setTimeout(resolveDelay, 10));
          break; // Exit retry loop on success
        } catch (error) {
          // Handle axios errors
          if (error.response && error.response.status === 401 && keyAttempt < maxKeyRetries - 1) {
            Logger.warn(`API key ${apiKeyId} returned 401, trying next key...`);
            APIMonitor.recordRequest(apiKeyId, endpoint, 401, false, 0);
            APIKeyManager.recordError(apiKeyId, 401);
            lastError = error;
            lastError.apiKeyId = apiKeyId;
            continue; // Try next key
          }
          
          // For other errors, break and handle below
          lastError = error;
          lastError.apiKeyId = apiKeyId;
          break;
        }
      }
      
      // If we exhausted all keys or had a non-401 error, reject
      if (!requestSucceeded) {
        if (lastError) {
          Logger.error(`All API keys failed or error occurred:`, {
            keysTried: keysTried,
            lastError: lastError.message,
            lastApiKeyId: lastError.apiKeyId
          });
          reject(lastError);
        } else {
          const error = new Error('All API keys failed authentication (401). Please check your API keys in .env file.');
          error.response = { status: 401, statusText: 'Unauthorized' };
          reject(error);
        }
        continue;
      }
      }
    } catch (error) {
      Logger.error('Critical error in request queue processing:', {
        message: error.message,
        stack: error.stack,
        queueLength: this.requestQueue.length
      });
      
      // Reject all pending requests with detailed error
      while (this.requestQueue.length > 0) {
        const { reject: rejectRequest } = this.requestQueue.shift();
        const errorMessage = error.message || 'Request queue processing failed';
        rejectRequest(new Error(errorMessage));
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
    
    // Check cache first
    const cacheKey = CacheService.generateKey('account', gameName.toLowerCase(), tagLine.toLowerCase(), userRegion || 'default');
    const cachedAccount = CacheService.get(cacheKey);
    if (cachedAccount) {
      Logger.info(`Account cache HIT: ${gameName}#${tagLine}`, { region: userRegion });
      // Record cache hit in monitor
      APIMonitor.recordRequest('cache', 'account', 200, true, 0);
      return cachedAccount;
    }
    
    // Resolve region to ensure correct routing
    const { region: resolvedRegion } = this.resolveRegionAndPlatform(userRegion || null);
    Logger.info(`Account API Request - Region: ${resolvedRegion}, GameName: ${gameName}, TagLine: ${tagLine}`);
    
    // Endpoint is /account/v1/... (base URL already includes /riot)
    const endpoint = `/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
    
    try {
      const startTime = Date.now();
      // Account API uses REGIONAL routing (v1 API) - separate base URL
      const account = await this.makeRequest(endpoint, {}, false, true, userRegion);
      const duration = Date.now() - startTime;
      Logger.apiRequest('GET', endpoint, 200, duration);
      
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
      
      // Cache the account data
      CacheService.set(cacheKey, account);
      
      return account;
    } catch (error) {
      // Preserve error status codes with region context
      if (error.response?.status) {
        const { region: resolvedRegion } = this.resolveRegionAndPlatform(userRegion || null);
        const apiError = new Error(error.message || 'API Error');
        apiError.response = error.response;
        apiError.status = error.response.status;
        apiError.region = resolvedRegion;
        apiError.userRegion = userRegion;
        
        // Special logging for SEA region errors
        if (resolvedRegion === 'sea') {
          console.error(`⚠️  SEA Region API Error [${error.response.status}]:`);
          console.error(`   Endpoint: /account/v1/accounts/by-riot-id/${gameName}/${tagLine}`);
          console.error(`   Regional URL: https://sea.api.riotgames.com/riot/account/v1/accounts/by-riot-id/...`);
          console.error(`   Error: ${error.message}`);
          console.error(`   Response:`, JSON.stringify(error.response.data, null, 2));
        }
        
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
    
    // Check cache first
    const cacheKey = CacheService.generateKey('summoner', puuid, userRegion || 'default');
    const cachedSummoner = CacheService.get(cacheKey);
    if (cachedSummoner) {
      Logger.info(`Summoner cache HIT: ${puuid.substring(0, 8)}...`, { region: userRegion });
      // Record cache hit in monitor
      APIMonitor.recordRequest('cache', 'summoner', 200, true, 0);
      return cachedSummoner;
    }
    
    const endpoint = `/summoner/v4/summoners/by-puuid/${encodeURIComponent(puuid)}`;
    
    try {
      const startTime = Date.now();
      // Summoner API uses PLATFORM routing (v4 API)
      const summoner = await this.makeRequest(endpoint, {}, false, false, userRegion);
      const duration = Date.now() - startTime;
      Logger.apiRequest('GET', endpoint, 200, duration);
      
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
      
      // Cache the summoner data
      CacheService.set(cacheKey, summoner);
      
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
      // Resolve region for logging
      // Account API v1 only supports americas, asia, europe (NOT sea)
      const { region: resolvedRegion, platform: resolvedPlatform } = this.resolveRegionAndPlatform(userRegion || null, true, false);
      console.log(`🔍 Looking up Riot ID: ${gameName}#${tagLine}`);
      console.log(`   User-provided region: ${userRegion || 'none (using default)'}`);
      console.log(`   Resolved region for Account API: ${resolvedRegion}${userRegion === 'sea' ? ' (mapped from sea to asia)' : ''}`);
      console.log(`   Resolved platform for v4 APIs: ${resolvedPlatform}`);
      console.log(`   Account API endpoint: https://${resolvedRegion}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/...`);
      console.log(`   Note: Account API v1 uses americas/asia/europe (maps SEA to asia)`);
      
      // Step 1: Get account (PUUID) from Riot ID using Account API v1 (regional routing)
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
      // Account API v1 only supports americas, asia, europe (NOT sea)
      const { region: resolvedRegion } = this.resolveRegionAndPlatform(userRegion || null, true, false);
      
      if (error.response?.status === 404) {
        const regionMsg = userRegion ? ` in region ${userRegion === 'sea' ? 'asia (Account API v1 maps sea to asia)' : resolvedRegion}` : '';
        const apiError = new Error(`Riot ID "${gameName}#${tagLine}" not found${regionMsg}`);
        apiError.response = error.response;
        apiError.status = 404;
        apiError.region = resolvedRegion;
        apiError.userRegion = userRegion;
        throw apiError;
      }
      if (error.response?.status === 403) {
        const apiError = new Error(`API key is invalid or expired (403 Forbidden) - Region: ${resolvedRegion}`);
        apiError.response = error.response;
        apiError.status = 403;
        apiError.region = resolvedRegion;
        apiError.userRegion = userRegion;
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
  // Note: No queue filter - fetches ALL game types (ranked, normal, ARAM, etc.)
  async getMatchHistory(puuid, start = 0, count = 20, userRegion = null, queueId = null) {
    if (!puuid || typeof puuid !== 'string' || puuid.trim().length === 0) {
      throw new Error('PUUID is required and must be a non-empty string');
    }
    
    if (start < 0 || count < 0 || count > 100) {
      throw new Error('Invalid start or count parameters');
    }
    
    const endpoint = `/match/v5/matches/by-puuid/${encodeURIComponent(puuid)}/ids`;
    const params = {
      start,
      count
    };
    
    // Only add queue filter if specified (for backward compatibility)
    if (queueId !== null) {
      params.queue = queueId;
    }
    
    return this.makeRequest(endpoint, params, true, false, userRegion);
  }

  // Get all match IDs for a season (paginated)
  // Fetches ALL game types (ranked, normal, ARAM, etc.) - no queue filter
  // Fetches matches in batches of 100 until no more matches are found
  // Removed safety limit to fetch ALL matches for the season
  async getAllMatchHistoryForYear(puuid, season, userRegion = null) {
    if (!puuid || typeof puuid !== 'string' || puuid.trim().length === 0) {
      throw new Error('PUUID is required and must be a non-empty string');
    }
    
    const allMatchIds = [];
    let start = 0;
    const batchSize = 100; // Maximum allowed by Riot API
    let hasMore = true;
    let consecutiveEmptyBatches = 0;
    const maxEmptyBatches = 2; // Stop after 2 consecutive empty batches
    
    console.log(`📊 Fetching ALL matches for Season ${season} (all game types, no limit)...`);
    
    while (hasMore) {
      try {
        Logger.debug(`Fetching batch: start=${start}, count=${batchSize}...`);
        // Fetch ALL game types (no queue filter) - includes ranked, normal, ARAM, etc.
        const matchIds = await this.getMatchHistory(puuid, start, batchSize, userRegion, null);
        
        if (!matchIds || !Array.isArray(matchIds) || matchIds.length === 0) {
          consecutiveEmptyBatches++;
          Logger.debug(`Empty batch received (consecutive empty: ${consecutiveEmptyBatches})`);
          
          if (consecutiveEmptyBatches >= maxEmptyBatches) {
            Logger.info(`No more matches found after ${consecutiveEmptyBatches} empty batches`);
            hasMore = false;
            break;
          }
          // Continue to next batch even if this one was empty
          start += batchSize;
          await new Promise(resolve => setTimeout(resolve, 100));
          continue;
        }
        
        // Reset empty batch counter if we got matches
        consecutiveEmptyBatches = 0;
        
        allMatchIds.push(...matchIds);
        Logger.debug(`Fetched ${matchIds.length} matches (total: ${allMatchIds.length}, start=${start})`);
        
        // Always increment start for next batch
        start += batchSize;
        
        // If we got less than batchSize, we might have reached the end
        // But still check next batch to be absolutely sure
        if (matchIds.length < batchSize) {
          Logger.debug(`Received ${matchIds.length} < ${batchSize} matches. Checking next batch to confirm end...`);
          // Wait a bit before checking next batch
          await new Promise(resolve => setTimeout(resolve, 200));
        } else {
          // Got full batch, continue fetching
          // Add a small delay between batches to respect rate limits
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        
      } catch (error) {
        Logger.error(`Error fetching matches at start=${start}:`, error.message);
        // If it's a rate limit error, wait and retry
        if (error.response?.status === 429) {
          const retryAfter = parseInt(error.response.headers['retry-after'] || '2', 10);
          Logger.warn(`Rate limited. Waiting ${retryAfter} seconds before retry...`);
          await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
          // Retry the same batch (don't increment start)
          continue;
        }
        // For other errors, try to continue with next batch
        Logger.warn(`Continuing to next batch despite error...`);
        start += batchSize;
        consecutiveEmptyBatches++;
        if (consecutiveEmptyBatches >= maxEmptyBatches) {
          Logger.warn(`Too many consecutive errors, stopping pagination`);
          hasMore = false;
        } else {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }
    }
    
    Logger.success(`Total match IDs fetched: ${allMatchIds.length}`);
    return allMatchIds;
  }

  // Get match details
  // Uses REGIONAL routing value (v5 API)
  async getMatchDetails(matchId, userRegion = null) {
    if (!matchId || typeof matchId !== 'string' || matchId.trim().length === 0) {
      throw new Error('Match ID is required and must be a non-empty string');
    }
    
    // Check cache first (match details rarely change)
    const cacheKey = CacheService.generateKey('matchDetails', matchId, userRegion || 'default');
    const cachedMatch = CacheService.get(cacheKey);
    if (cachedMatch) {
      Logger.debug(`Match details cache HIT: ${matchId}`);
      // Record cache hit in monitor
      APIMonitor.recordRequest('cache', 'matchDetails', 200, true, 0);
      return cachedMatch;
    }
    
    const endpoint = `/match/v5/matches/${encodeURIComponent(matchId)}`;
    const startTime = Date.now();
    const matchDetails = await this.makeRequest(endpoint, {}, true, false, userRegion);
    const duration = Date.now() - startTime;
    Logger.apiRequest('GET', endpoint, 200, duration);
    
    // Cache the match details (24 hour TTL)
    CacheService.set(cacheKey, matchDetails);
    
    return matchDetails;
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