// src/utils/CacheService.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Logger = require('./Logger');
const moment = require('moment');

class CacheService {
  constructor() {
    this.cacheDir = path.join(process.cwd(), 'data', 'cache');
    this.ensureCacheDirectory();
    
    // Cache TTL (Time To Live) in milliseconds
    // Default: 1 hour for match IDs, 24 hours for match details
    this.defaultTTL = {
      matchIds: 60 * 60 * 1000,        // 1 hour
      matchDetails: 24 * 60 * 60 * 1000, // 24 hours
      summoner: 30 * 60 * 1000,        // 30 minutes
      account: 30 * 60 * 1000           // 30 minutes
    };
  }

  ensureCacheDirectory() {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
      Logger.info(`Created cache directory: ${this.cacheDir}`);
    }
  }

  // Generate cache key from parameters
  generateKey(prefix, ...params) {
    const keyString = `${prefix}_${params.join('_')}`;
    return crypto.createHash('md5').update(keyString).digest('hex');
  }

  // Get cache file path
  getCacheFilePath(key) {
    return path.join(this.cacheDir, `${key}.json`);
  }

  // Check if cache entry is valid (not expired)
  isValid(cacheData, ttl) {
    if (!cacheData || !cacheData.timestamp) {
      return false;
    }
    
    const age = Date.now() - cacheData.timestamp;
    return age < ttl;
  }

  // Get cached data
  get(key, ttl = null) {
    try {
      const cacheFile = this.getCacheFilePath(key);
      
      if (!fs.existsSync(cacheFile)) {
        Logger.cacheOperation('GET', key, false);
        return null;
      }

      const fileContent = fs.readFileSync(cacheFile, 'utf8');
      const cacheData = JSON.parse(fileContent);

      // Use provided TTL or default based on key prefix
      const cacheTTL = ttl || this.getTTLForKey(key);

      if (!this.isValid(cacheData, cacheTTL)) {
        Logger.cacheOperation('GET', key, false);
        Logger.debug(`Cache expired for key: ${key} (age: ${Date.now() - cacheData.timestamp}ms)`);
        // Delete expired cache
        this.delete(key);
        return null;
      }

      Logger.cacheOperation('GET', key, true);
      return cacheData.data;
    } catch (error) {
      Logger.error(`Error reading cache for key ${key}:`, error.message);
      return null;
    }
  }

  // Set cached data
  set(key, data, ttl = null) {
    try {
      const cacheFile = this.getCacheFilePath(key);
      const cacheData = {
        timestamp: Date.now(),
        data: data
      };

      fs.writeFileSync(cacheFile, JSON.stringify(cacheData, null, 2), 'utf8');
      Logger.cacheOperation('SET', key);
      
      return true;
    } catch (error) {
      Logger.error(`Error writing cache for key ${key}:`, error.message);
      return false;
    }
  }

  // Delete cached data
  delete(key) {
    try {
      const cacheFile = this.getCacheFilePath(key);
      if (fs.existsSync(cacheFile)) {
        fs.unlinkSync(cacheFile);
        Logger.cacheOperation('DELETE', key);
        return true;
      }
      return false;
    } catch (error) {
      Logger.error(`Error deleting cache for key ${key}:`, error.message);
      return false;
    }
  }

  // Get TTL based on key prefix
  getTTLForKey(key) {
    if (key.startsWith('matchIds_')) return this.defaultTTL.matchIds;
    if (key.startsWith('matchDetails_')) return this.defaultTTL.matchDetails;
    if (key.startsWith('summoner_')) return this.defaultTTL.summoner;
    if (key.startsWith('account_')) return this.defaultTTL.account;
    return 60 * 60 * 1000; // Default 1 hour
  }

  // Clear all cache
  clearAll() {
    try {
      const files = fs.readdirSync(this.cacheDir);
      let deleted = 0;
      
      files.forEach(file => {
        if (file.endsWith('.json')) {
          fs.unlinkSync(path.join(this.cacheDir, file));
          deleted++;
        }
      });
      
      Logger.info(`Cleared ${deleted} cache files`);
      return deleted;
    } catch (error) {
      Logger.error('Error clearing cache:', error.message);
      return 0;
    }
  }

  // Clear expired cache entries
  clearExpired() {
    try {
      const files = fs.readdirSync(this.cacheDir);
      let deleted = 0;
      
      files.forEach(file => {
        if (file.endsWith('.json')) {
          const cacheFile = path.join(this.cacheDir, file);
          try {
            const fileContent = fs.readFileSync(cacheFile, 'utf8');
            const cacheData = JSON.parse(fileContent);
            const key = file.replace('.json', '');
            const ttl = this.getTTLForKey(key);
            
            if (!this.isValid(cacheData, ttl)) {
              fs.unlinkSync(cacheFile);
              deleted++;
            }
          } catch (error) {
            // If file is corrupted, delete it
            fs.unlinkSync(cacheFile);
            deleted++;
          }
        }
      });
      
      if (deleted > 0) {
        Logger.info(`Cleared ${deleted} expired cache entries`);
      }
      return deleted;
    } catch (error) {
      Logger.error('Error clearing expired cache:', error.message);
      return 0;
    }
  }

  // Get cache statistics
  getStats() {
    try {
      const files = fs.readdirSync(this.cacheDir);
      const stats = {
        total: 0,
        valid: 0,
        expired: 0,
        size: 0
      };

      files.forEach(file => {
        if (file.endsWith('.json')) {
          stats.total++;
          const cacheFile = path.join(this.cacheDir, file);
          try {
            const fileContent = fs.readFileSync(cacheFile, 'utf8');
            const cacheData = JSON.parse(fileContent);
            const key = file.replace('.json', '');
            const ttl = this.getTTLForKey(key);
            
            const fileStats = fs.statSync(cacheFile);
            stats.size += fileStats.size;
            
            if (this.isValid(cacheData, ttl)) {
              stats.valid++;
            } else {
              stats.expired++;
            }
          } catch (error) {
            stats.expired++;
          }
        }
      });

      return stats;
    } catch (error) {
      Logger.error('Error getting cache stats:', error.message);
      return null;
    }
  }
}

module.exports = new CacheService();

