// src/utils/APIKeyManager.js
const Logger = require('./Logger');
const APIMonitor = require('./APIMonitor');

class APIKeyManager {
  constructor() {
    this.apiKeys = [];
    this.currentKeyIndex = 0;
    this.keyStats = {};
    this.loadAPIKeys();
  }

  loadAPIKeys() {
    // Load from environment variables
    // Support multiple keys: RIOT_API_KEY, RIOT_API_KEY_2, RIOT_API_KEY_3, etc.
    const keys = [];
    
    // Primary key
    if (process.env.RIOT_API_KEY) {
      keys.push({
        id: 'primary',
        key: this.cleanAPIKey(process.env.RIOT_API_KEY),
        enabled: true,
        lastUsed: 0,
        errorCount: 0,
        requestCount: 0
      });
    }
    
    // Additional keys (RIOT_API_KEY_2, RIOT_API_KEY_3, etc.)
    let keyIndex = 2;
    while (process.env[`RIOT_API_KEY_${keyIndex}`]) {
      const key = process.env[`RIOT_API_KEY_${keyIndex}`];
      keys.push({
        id: `key_${keyIndex}`,
        key: this.cleanAPIKey(key),
        enabled: true,
        lastUsed: 0,
        errorCount: 0,
        requestCount: 0
      });
      keyIndex++;
    }
    
    this.apiKeys = keys;
    
    if (this.apiKeys.length === 0) {
      Logger.error('No API keys found in environment variables!');
      Logger.error('Set RIOT_API_KEY or RIOT_API_KEY_2, RIOT_API_KEY_3, etc.');
    } else {
      Logger.info(`Loaded ${this.apiKeys.length} API key(s)`, {
        keys: this.apiKeys.map(k => k.id)
      });
    }
  }

  cleanAPIKey(rawKey) {
    if (!rawKey) return null;
    let cleaned = rawKey.trim();
    cleaned = cleaned.replace(/[\x00-\x1F\x7F-\x9F]/g, '');
    return cleaned;
  }

  // Get next available API key (round-robin with health checking)
  getNextAPIKey() {
    if (this.apiKeys.length === 0) {
      throw new Error('No API keys available. Please set RIOT_API_KEY in your .env file.');
    }
    
    // Filter enabled keys
    const enabledKeys = this.apiKeys.filter(k => k.enabled && k.key && k.key.trim().length > 0);
    
    if (enabledKeys.length === 0) {
      // Re-enable all valid keys if all are disabled (might be temporary)
      Logger.warn('All API keys disabled, attempting to re-enable valid keys');
      this.apiKeys.forEach(k => {
        if (k.key && k.key.trim().length > 0) {
          k.enabled = true;
          k.errorCount = 0; // Reset error count
        }
      });
      
      // Try again with re-enabled keys
      const reEnabledKeys = this.apiKeys.filter(k => k.enabled && k.key && k.key.trim().length > 0);
      if (reEnabledKeys.length === 0) {
        throw new Error('No valid API keys available. All keys are invalid or disabled.');
      }
      
      const key = reEnabledKeys[this.currentKeyIndex % reEnabledKeys.length];
      this.currentKeyIndex++;
      key.lastUsed = Date.now();
      key.requestCount++;
      return key;
    }
    
    // Round-robin selection
    const key = enabledKeys[this.currentKeyIndex % enabledKeys.length];
    this.currentKeyIndex++;
    
    // Validate key before returning
    if (!key.key || typeof key.key !== 'string' || key.key.trim().length === 0) {
      Logger.error(`API key ${key.id} is invalid, skipping`);
      key.enabled = false;
      
      // Check if there are other valid keys
      const remainingKeys = this.apiKeys.filter(k => k.enabled && k.key && k.key.trim().length > 0 && k.id !== key.id);
      if (remainingKeys.length === 0) {
        throw new Error('No valid API keys available. All configured keys are invalid.');
      }
      
      // Try next key (with recursion limit protection)
      if (this.currentKeyIndex < this.apiKeys.length * 2) {
        return this.getNextAPIKey();
      } else {
        throw new Error('Failed to find valid API key after checking all keys');
      }
    }
    
    // Update last used time
    key.lastUsed = Date.now();
    key.requestCount++;
    
    return key;
  }

  // Mark API key as having an error
  recordError(keyId, errorCode) {
    const key = this.apiKeys.find(k => k.id === keyId);
    if (!key) return;
    
    key.errorCount++;
    
    // Disable key if too many errors (429 rate limit or 403 auth errors)
    if (errorCode === 429 || errorCode === 403) {
      if (key.errorCount >= 3) {
        key.enabled = false;
        Logger.warn(`API key ${keyId} disabled due to ${key.errorCount} errors (last: ${errorCode})`);
        
        // Re-enable after 5 minutes
        setTimeout(() => {
          key.enabled = true;
          key.errorCount = 0;
          Logger.info(`API key ${keyId} re-enabled after cooldown`);
        }, 5 * 60 * 1000);
      }
    }
  }

  // Record successful request
  recordSuccess(keyId) {
    const key = this.apiKeys.find(k => k.id === keyId);
    if (key) {
      // Reset error count on success
      if (key.errorCount > 0) {
        key.errorCount = Math.max(0, key.errorCount - 1);
      }
    }
  }

  // Get statistics for all keys
  getStats() {
    return this.apiKeys.map(key => ({
      id: key.id,
      enabled: key.enabled,
      requestCount: key.requestCount,
      errorCount: key.errorCount,
      lastUsed: key.lastUsed,
      health: key.errorCount === 0 ? 'healthy' : key.errorCount < 3 ? 'degraded' : 'unhealthy'
    }));
  }
}

module.exports = new APIKeyManager();

