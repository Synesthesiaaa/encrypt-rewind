// src/utils/APIMonitor.js
const Logger = require('./Logger');
const fs = require('fs');
const path = require('path');
const moment = require('moment');

class APIMonitor {
  constructor() {
    this.statsFile = path.join(process.cwd(), 'data', 'api_stats.json');
    this.ensureStatsDirectory();
    this.stats = this.loadStats();
    
    // Rate limit thresholds (per API key)
    this.limits = {
      requestsPerSecond: 20,      // Riot API limit: 20 requests/second
      requestsPerMinute: 100,    // Riot API limit: 100 requests/minute
      requestsPerDay: 100000     // Conservative daily limit
    };
    
    // Alert thresholds
    this.alertThresholds = {
      requestsPerSecond: 15,      // Alert at 75% of limit
      requestsPerMinute: 80,      // Alert at 80% of limit
      requestsPerDay: 80000       // Alert at 80% of daily limit
    };
  }

  ensureStatsDirectory() {
    const statsDir = path.dirname(this.statsFile);
    if (!fs.existsSync(statsDir)) {
      fs.mkdirSync(statsDir, { recursive: true });
    }
  }

  loadStats() {
    try {
      if (fs.existsSync(this.statsFile)) {
        const data = fs.readFileSync(this.statsFile, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      Logger.error('Error loading API stats:', error.message);
    }
    
    // Initialize default stats structure
    return {
      totalRequests: 0,
      totalErrors: 0,
      totalCacheHits: 0,
      dailyStats: {},
      hourlyStats: {},
      minuteStats: {},
      apiKeys: {},
      lastReset: Date.now()
    };
  }

  saveStats() {
    try {
      fs.writeFileSync(this.statsFile, JSON.stringify(this.stats, null, 2), 'utf8');
    } catch (error) {
      Logger.error('Error saving API stats:', error.message);
    }
  }

  // Get current time buckets
  getTimeBuckets() {
    const now = moment();
    return {
      day: now.format('YYYY-MM-DD'),
      hour: now.format('YYYY-MM-DD-HH'),
      minute: now.format('YYYY-MM-DD-HH-mm')
    };
  }

  // Record an API request
  recordRequest(apiKeyId = 'default', endpoint = '', statusCode = 200, fromCache = false, duration = 0) {
    const buckets = this.getTimeBuckets();
    
    // Initialize structures if needed
    if (!this.stats.dailyStats[buckets.day]) {
      this.stats.dailyStats[buckets.day] = { requests: 0, errors: 0, cacheHits: 0 };
    }
    if (!this.stats.hourlyStats[buckets.hour]) {
      this.stats.hourlyStats[buckets.hour] = { requests: 0, errors: 0, cacheHits: 0 };
    }
    if (!this.stats.minuteStats[buckets.minute]) {
      this.stats.minuteStats[buckets.minute] = { requests: 0, errors: 0, cacheHits: 0 };
    }
    if (!this.stats.apiKeys[apiKeyId]) {
      this.stats.apiKeys[apiKeyId] = {
        totalRequests: 0,
        totalErrors: 0,
        totalCacheHits: 0,
        dailyRequests: {}
      };
    }
    
    // Update counters
    this.stats.totalRequests++;
    this.stats.apiKeys[apiKeyId].totalRequests++;
    this.stats.dailyStats[buckets.day].requests++;
    this.stats.hourlyStats[buckets.hour].requests++;
    this.stats.minuteStats[buckets.minute].requests++;
    
    if (fromCache) {
      this.stats.totalCacheHits++;
      this.stats.apiKeys[apiKeyId].totalCacheHits++;
      this.stats.dailyStats[buckets.day].cacheHits++;
      this.stats.hourlyStats[buckets.hour].cacheHits++;
      this.stats.minuteStats[buckets.minute].cacheHits++;
    }
    
    if (statusCode >= 400) {
      this.stats.totalErrors++;
      this.stats.apiKeys[apiKeyId].totalErrors++;
      this.stats.dailyStats[buckets.day].errors++;
      this.stats.hourlyStats[buckets.hour].errors++;
      this.stats.minuteStats[buckets.minute].errors++;
    }
    
    // Check for alerts
    this.checkAlerts(apiKeyId, buckets);
    
    // Save stats periodically (every 10 requests)
    if (this.stats.totalRequests % 10 === 0) {
      this.saveStats();
    }
  }

  // Check if we're approaching rate limits
  checkAlerts(apiKeyId, buckets) {
    const minuteStats = this.stats.minuteStats[buckets.minute] || { requests: 0 };
    const hourStats = this.stats.hourlyStats[buckets.hour] || { requests: 0 };
    const dayStats = this.stats.dailyStats[buckets.day] || { requests: 0 };
    
    // Check per-minute limit
    if (minuteStats.requests >= this.alertThresholds.requestsPerMinute) {
      Logger.warn(`⚠️  API Rate Limit Alert: ${minuteStats.requests} requests in current minute (limit: ${this.limits.requestsPerMinute})`);
    }
    
    // Check per-hour limit (approximate)
    if (hourStats.requests >= this.alertThresholds.requestsPerMinute * 60) {
      Logger.warn(`⚠️  API Hourly Usage Alert: ${hourStats.requests} requests in current hour`);
    }
    
    // Check daily limit
    if (dayStats.requests >= this.alertThresholds.requestsPerDay) {
      Logger.warn(`⚠️  API Daily Limit Alert: ${dayStats.requests} requests today (limit: ${this.limits.requestsPerDay})`);
    }
  }

  // Get current usage statistics
  getUsageStats(apiKeyId = 'default') {
    const buckets = this.getTimeBuckets();
    const minuteStats = this.stats.minuteStats[buckets.minute] || { requests: 0, errors: 0, cacheHits: 0 };
    const hourStats = this.stats.hourlyStats[buckets.hour] || { requests: 0, errors: 0, cacheHits: 0 };
    const dayStats = this.stats.dailyStats[buckets.day] || { requests: 0, errors: 0, cacheHits: 0 };
    const apiKeyStats = this.stats.apiKeys[apiKeyId] || { totalRequests: 0, totalErrors: 0, totalCacheHits: 0 };
    
    return {
      current: {
        minute: {
          requests: minuteStats.requests,
          errors: minuteStats.errors,
          cacheHits: minuteStats.cacheHits,
          limit: this.limits.requestsPerMinute,
          percentage: Math.round((minuteStats.requests / this.limits.requestsPerMinute) * 100)
        },
        hour: {
          requests: hourStats.requests,
          errors: hourStats.errors,
          cacheHits: hourStats.cacheHits
        },
        day: {
          requests: dayStats.requests,
          errors: dayStats.errors,
          cacheHits: dayStats.cacheHits,
          limit: this.limits.requestsPerDay,
          percentage: Math.round((dayStats.requests / this.limits.requestsPerDay) * 100)
        }
      },
      total: {
        requests: this.stats.totalRequests,
        errors: this.stats.totalErrors,
        cacheHits: this.stats.totalCacheHits,
        cacheHitRate: this.stats.totalRequests > 0 
          ? Math.round((this.stats.totalCacheHits / this.stats.totalRequests) * 100) 
          : 0
      },
      apiKey: {
        totalRequests: apiKeyStats.totalRequests,
        totalErrors: apiKeyStats.totalErrors,
        totalCacheHits: apiKeyStats.totalCacheHits,
        cacheHitRate: apiKeyStats.totalRequests > 0
          ? Math.round((apiKeyStats.totalCacheHits / apiKeyStats.totalRequests) * 100)
          : 0
      }
    };
  }

  // Clean up old stats (keep last 7 days)
  cleanupOldStats() {
    const cutoffDate = moment().subtract(7, 'days');
    let cleaned = 0;
    
    // Clean daily stats
    for (const day in this.stats.dailyStats) {
      if (moment(day).isBefore(cutoffDate)) {
        delete this.stats.dailyStats[day];
        cleaned++;
      }
    }
    
    // Clean hourly stats (keep last 24 hours)
    const hourCutoff = moment().subtract(24, 'hours');
    for (const hour in this.stats.hourlyStats) {
      if (moment(hour, 'YYYY-MM-DD-HH').isBefore(hourCutoff)) {
        delete this.stats.hourlyStats[hour];
        cleaned++;
      }
    }
    
    // Clean minute stats (keep last hour)
    const minuteCutoff = moment().subtract(1, 'hour');
    for (const minute in this.stats.minuteStats) {
      if (moment(minute, 'YYYY-MM-DD-HH-mm').isBefore(minuteCutoff)) {
        delete this.stats.minuteStats[minute];
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      Logger.info(`Cleaned up ${cleaned} old stat entries`);
      this.saveStats();
    }
  }

  // Check if we can make a request (rate limiting check)
  canMakeRequest(apiKeyId = 'default') {
    const buckets = this.getTimeBuckets();
    const minuteStats = this.stats.minuteStats[buckets.minute] || { requests: 0 };
    
    // Check per-minute limit
    if (minuteStats.requests >= this.limits.requestsPerMinute) {
      return {
        allowed: false,
        reason: 'rate_limit_per_minute',
        retryAfter: 60 - moment().seconds() // Seconds until next minute
      };
    }
    
    return { allowed: true };
  }
}

module.exports = new APIMonitor();

