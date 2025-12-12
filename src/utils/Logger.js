// src/utils/Logger.js
const fs = require('fs');
const path = require('path');
const moment = require('moment');

class Logger {
  constructor() {
    this.logsDir = path.join(process.cwd(), 'logs');
    this.ensureLogsDirectory();
  }

  ensureLogsDirectory() {
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
    }
  }

  getLogFileName() {
    return path.join(this.logsDir, `bot-${moment().format('YYYY-MM-DD')}.log`);
  }

  formatMessage(level, message, data = null) {
    const timestamp = moment().format('YYYY-MM-DD HH:mm:ss.SSS');
    let logMessage = `[${timestamp}] [${level}] ${message}`;
    
    if (data) {
      logMessage += `\n${JSON.stringify(data, null, 2)}`;
    }
    
    return logMessage;
  }

  writeToFile(message) {
    try {
      const logFile = this.getLogFileName();
      fs.appendFileSync(logFile, message + '\n', 'utf8');
    } catch (error) {
      console.error('Failed to write to log file:', error.message);
    }
  }

  log(level, message, data = null) {
    const formattedMessage = this.formatMessage(level, message, data);
    
    // Console output with colors
    const colors = {
      INFO: '\x1b[36m',    // Cyan
      WARN: '\x1b[33m',    // Yellow
      ERROR: '\x1b[31m',   // Red
      DEBUG: '\x1b[35m',   // Magenta
      SUCCESS: '\x1b[32m'  // Green
    };
    const reset = '\x1b[0m';
    
    const color = colors[level] || '';
    console.log(`${color}${formattedMessage}${reset}`);
    
    // File output (no colors)
    this.writeToFile(formattedMessage);
  }

  info(message, data = null) {
    this.log('INFO', message, data);
  }

  warn(message, data = null) {
    this.log('WARN', message, data);
  }

  error(message, data = null) {
    this.log('ERROR', message, data);
  }

  debug(message, data = null) {
    this.log('DEBUG', message, data);
  }

  success(message, data = null) {
    this.log('SUCCESS', message, data);
  }

  // Log API requests
  apiRequest(method, endpoint, statusCode = null, duration = null) {
    const message = `API ${method} ${endpoint}${statusCode ? ` - ${statusCode}` : ''}${duration ? ` (${duration}ms)` : ''}`;
    this.debug(message);
  }

  // Log cache operations
  cacheOperation(operation, key, hit = null) {
    const message = `Cache ${operation}: ${key}${hit !== null ? ` (${hit ? 'HIT' : 'MISS'})` : ''}`;
    this.debug(message);
  }
}

module.exports = new Logger();

