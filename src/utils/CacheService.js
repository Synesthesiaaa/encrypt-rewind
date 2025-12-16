// src/utils/CacheService.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Logger = require('./Logger');
const moment = require('moment');
const APIMonitor = require('./APIMonitor');

class CacheService {
  constructor() {
    this.cacheDir = path.join(process.cwd(), 'data', 'cache');
    this.ensureCacheDirectory();
    
    // In-memory cache for frequently accessed data (faster than disk I/O)
    this.memoryCache = new Map();
    this.memoryCacheMaxSize = 1000; // Max entries in memory cache
    
    // IMPORTANT: Cache is PERMANENTLY stored locally to avoid rate limiting
    // Disk cache never expires - data is stored indefinitely
    // Only memory cache has TTL for performance optimization
    this.permanentCache = true; // Enable permanent disk cache storage
    
    // Memory cache TTL (for performance - disk cache is permanent)
    this.memoryCacheTTL = {
      matchIds: 2 * 60 * 60 * 1000,        // 2 hours in memory
      matchHistoryBatch: 3 * 60 * 60 * 1000, // 3 hours in memory
      matchDetails: 24 * 60 * 60 * 1000,  // 24 hours in memory
      summoner: 1 * 60 * 60 * 1000,        // 1 hour in memory
      account: 2 * 60 * 60 * 1000,         // 2 hours in memory
      matchHistoryFull: 4 * 60 * 60 * 1000  // 4 hours in memory
    };
    
    // Cleanup intervals (only for memory cache - disk cache is permanent)
    this.cleanupInterval = setInterval(() => this.cleanupMemoryCache(), 5 * 60 * 1000); // Every 5 minutes
    // DISABLED: Disk cache cleanup - cache is permanent
    // this.diskCleanupInterval = setInterval(() => this.clearExpired(), 30 * 60 * 1000);
  }

  ensureCacheDirectory() {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
      Logger.info(`Created cache directory: ${this.cacheDir}`);
    }
    
    // Log permanent cache status
    if (this.permanentCache) {
      Logger.info('✅ Permanent cache enabled - data stored indefinitely to avoid rate limiting');
      Logger.info(`   Cache directory: ${this.cacheDir}`);
      Logger.info('   Disk cache: PERMANENT (never expires)');
      Logger.info('   Memory cache: Temporary (for performance)');
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

  // Check if cache entry is valid
  // IMPORTANT: For disk cache, this always returns true if data exists (permanent cache)
  // Only checks if data structure is valid, not expiration
  isValid(cacheData, ttl = null) {
    if (!cacheData || cacheData.data === undefined) {
      return false;
    }
    
    // Since disk cache is permanent, we only check if data exists
    // TTL is ignored for disk cache (permanent storage)
    return true;
  }

  // Get cached data (checks memory first, then disk)
  // IMPORTANT: Disk cache is PERMANENT - never expires to avoid rate limiting
  get(key, ttl = null, allowStale = false) {
    // First check in-memory cache (fastest, has TTL for performance)
    const memoryEntry = this.memoryCache.get(key);
    if (memoryEntry) {
      const cacheTTL = ttl || this.getMemoryTTLForKey(key);
      const age = Date.now() - memoryEntry.timestamp;
      
      if (age < cacheTTL) {
        // Fresh data in memory
        APIMonitor.recordCacheHit();
        Logger.debug(`Memory cache HIT: ${key}`);
        return memoryEntry.data;
      } else {
        // Memory cache expired, but disk cache is permanent - check disk
        this.memoryCache.delete(key);
      }
    }
    
    // Check disk cache (PERMANENT - never expires)
    try {
      const cacheFile = this.getCacheFilePath(key);
      
      if (!fs.existsSync(cacheFile)) {
        APIMonitor.recordCacheMiss();
        Logger.debug(`Cache MISS: ${key}`);
        return null;
      }

      const fileContent = fs.readFileSync(cacheFile, 'utf8');
      const cacheData = JSON.parse(fileContent);

      // IMPORTANT: Disk cache is PERMANENT - always return if file exists
      // This prevents rate limiting by using cached data indefinitely
      if (cacheData && cacheData.data !== undefined) {
        // Cache exists and is valid - return it (permanent storage)
        // Also refresh memory cache for faster access
        this.setMemoryCache(key, cacheData.data);
        APIMonitor.recordCacheHit();
        const age = Date.now() - (cacheData.timestamp || 0);
        Logger.debug(`Disk cache HIT (permanent): ${key} (age: ${moment.duration(age).humanize()})`);
        return cacheData.data;
      } else {
        // Corrupted cache file
        Logger.warn(`Corrupted cache file for key: ${key}, deleting...`);
        this.delete(key);
        APIMonitor.recordCacheMiss();
        return null;
      }
    } catch (error) {
      APIMonitor.recordCacheMiss();
      Logger.error(`Error reading cache for key ${key}:`, error.message);
      return null;
    }
  }
  
  // Get memory cache TTL (disk cache is permanent)
  getMemoryTTLForKey(key) {
    if (key.startsWith('matchIds_')) return this.memoryCacheTTL.matchIds;
    if (key.startsWith('matchHistoryBatch_')) return this.memoryCacheTTL.matchHistoryBatch;
    if (key.startsWith('matchHistoryFull_')) return this.memoryCacheTTL.matchHistoryFull;
    if (key.startsWith('matchDetails_')) return this.memoryCacheTTL.matchDetails;
    if (key.startsWith('summoner_')) return this.memoryCacheTTL.summoner;
    if (key.startsWith('account_')) return this.memoryCacheTTL.account;
    return 60 * 60 * 1000; // Default 1 hour for memory cache
  }
  
  // Get key type from key prefix
  getKeyType(key) {
    if (key.startsWith('matchIds_') || key.startsWith('matchHistoryBatch_')) return 'matchHistoryBatch';
    if (key.startsWith('matchHistoryFull_')) return 'matchHistoryFull';
    if (key.startsWith('matchDetails_')) return 'matchDetails';
    if (key.startsWith('summoner_')) return 'summoner';
    if (key.startsWith('account_')) return 'account';
    return 'matchIds';
  }
  
  // Set in-memory cache
  setMemoryCache(key, data) {
    // Evict oldest entries if cache is full
    if (this.memoryCache.size >= this.memoryCacheMaxSize) {
      const firstKey = this.memoryCache.keys().next().value;
      this.memoryCache.delete(firstKey);
    }
    
    this.memoryCache.set(key, {
      data,
      timestamp: Date.now()
    });
  }
  
  // Cleanup in-memory cache (disk cache is permanent and never cleaned automatically)
  cleanupMemoryCache() {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, entry] of this.memoryCache.entries()) {
      const ttl = this.getMemoryTTLForKey(key);
      if (now - entry.timestamp > ttl * 2) { // Remove entries older than 2x TTL from memory
        this.memoryCache.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      Logger.debug(`Cleaned ${cleaned} expired memory cache entries (disk cache is permanent)`);
    }
  }

  // Set cached data (stores in both memory and disk)
  set(key, data, ttl = null) {
    try {
      // Store in memory cache (fast access)
      this.setMemoryCache(key, data);
      
      // Store in disk cache (persistent)
      const cacheFile = this.getCacheFilePath(key);
      const cacheData = {
        timestamp: Date.now(),
        data: data
      };

      fs.writeFileSync(cacheFile, JSON.stringify(cacheData, null, 2), 'utf8');
      Logger.debug(`Cache SET: ${key}`);
      
      return true;
    } catch (error) {
      Logger.error(`Error writing cache for key ${key}:`, error.message);
      return false;
    }
  }
  
  // Batch set multiple cache entries (more efficient for match history)
  setBatch(entries) {
    let successCount = 0;
    for (const { key, data, ttl } of entries) {
      if (this.set(key, data, ttl)) {
        successCount++;
      }
    }
    Logger.debug(`Batch cached ${successCount}/${entries.length} entries`);
    return successCount;
  }

  // Delete cached data (from both memory and disk)
  delete(key) {
    try {
      // Remove from memory cache
      this.memoryCache.delete(key);
      
      // Remove from disk cache
      const cacheFile = this.getCacheFilePath(key);
      if (fs.existsSync(cacheFile)) {
        fs.unlinkSync(cacheFile);
        Logger.debug(`Cache DELETE: ${key}`);
        return true;
      }
      return false;
    } catch (error) {
      Logger.error(`Error deleting cache for key ${key}:`, error.message);
      return false;
    }
  }

  // Get TTL based on key prefix (DEPRECATED - disk cache is now permanent)
  // Kept for backward compatibility, but disk cache never expires
  getTTLForKey(key) {
    // Return a very large TTL (effectively infinite) since disk cache is permanent
    return Number.MAX_SAFE_INTEGER; // Effectively infinite TTL for disk cache
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

  // Clear expired cache entries (DISABLED - cache is permanent)
  // Only clears corrupted files, not expired ones
  clearExpired() {
    if (!this.permanentCache) {
      // Only run if permanent cache is disabled (shouldn't happen)
      Logger.warn('clearExpired called but cache is permanent - skipping');
      return 0;
    }
    
    try {
      const files = fs.readdirSync(this.cacheDir);
      let deleted = 0;
      
      files.forEach(file => {
        if (file.endsWith('.json')) {
          const cacheFile = path.join(this.cacheDir, file);
          try {
            const fileContent = fs.readFileSync(cacheFile, 'utf8');
            const cacheData = JSON.parse(fileContent);
            
            // Only delete corrupted files, not expired ones (cache is permanent)
            if (!cacheData || cacheData.data === undefined) {
              Logger.warn(`Deleting corrupted cache file: ${file}`);
              fs.unlinkSync(cacheFile);
              deleted++;
            }
          } catch (error) {
            // If file is corrupted or unreadable, delete it
            Logger.warn(`Deleting corrupted/unreadable cache file: ${file}`);
            fs.unlinkSync(cacheFile);
            deleted++;
          }
        }
      });
      
      if (deleted > 0) {
        Logger.info(`Cleared ${deleted} corrupted cache entries (cache is permanent, only corrupted files removed)`);
      }
      return deleted;
    } catch (error) {
      Logger.error('Error clearing corrupted cache:', error.message);
      return 0;
    }
  }

  // Get cache statistics (includes both memory and disk cache)
  getStats() {
    try {
      const files = fs.readdirSync(this.cacheDir);
      const stats = {
        memory: {
          entries: this.memoryCache.size,
          maxSize: this.memoryCacheMaxSize
        },
        disk: {
          total: 0,
          valid: 0,
          corrupted: 0,
          size: 0
        },
        total: {
          entries: 0,
          valid: 0,
          corrupted: 0,
          size: 0
        },
        permanent: this.permanentCache // Indicate if cache is permanent
      };

      files.forEach(file => {
        if (file.endsWith('.json')) {
          stats.disk.total++;
          const cacheFile = path.join(this.cacheDir, file);
          try {
            const fileContent = fs.readFileSync(cacheFile, 'utf8');
            const cacheData = JSON.parse(fileContent);
            
            const fileStats = fs.statSync(cacheFile);
            stats.disk.size += fileStats.size;
            
            // Since cache is permanent, all valid cache files are considered valid
            if (cacheData && cacheData.data !== undefined) {
              stats.disk.valid++;
            } else {
              stats.disk.corrupted++;
            }
          } catch (error) {
            stats.disk.corrupted++;
          }
        }
      });

      // Calculate totals
      stats.total.entries = stats.memory.entries + stats.disk.total;
      stats.total.valid = stats.memory.entries + stats.disk.valid;
      stats.total.corrupted = stats.disk.corrupted;
      stats.total.size = stats.disk.size;

      return stats;
    } catch (error) {
      Logger.error('Error getting cache stats:', error.message);
      return null;
    }
  }
  
  // Get cache hit rate (requires APIMonitor integration)
  getCacheHitRate() {
    const monitorStats = APIMonitor.getLiveStats();
    return {
      hitRate: monitorStats.cacheHitRate || 0,
      hits: monitorStats.cacheHits || 0,
      misses: monitorStats.cacheMisses || 0
    };
  }
}

module.exports = new CacheService();

