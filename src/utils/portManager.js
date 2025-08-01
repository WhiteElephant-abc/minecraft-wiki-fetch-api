/**
 * Port management utility
 * Handles port availability checking and automatic port selection
 */

const net = require('net');
const { logger } = require('./logger');

/**
 * Checks if a port is available
 * @param {number} port - Port number to check
 * @returns {Promise<boolean>} - True if port is available, false otherwise
 */
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    
    server.listen(port, (err) => {
      if (err) {
        resolve(false);
        return;
      }
      
      server.once('close', () => {
        resolve(true);
      });
      
      server.close();
    });
    
    server.on('error', () => {
      resolve(false);
    });
  });
}

/**
 * Finds the next available port starting from a given port
 * @param {number} startPort - Starting port number
 * @param {number} maxAttempts - Maximum number of ports to try (default: 100)
 * @returns {Promise<number|null>} - Available port number or null if none found
 */
async function findAvailablePort(startPort, maxAttempts = 100) {
  for (let i = 0; i < maxAttempts; i++) {
    const port = startPort + i;
    
    // Skip invalid port numbers
    if (port < 1 || port > 65535) {
      continue;
    }
    
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  
  return null;
}

/**
 * Gets an available port, falling back to alternatives if the preferred port is occupied
 * @param {number} preferredPort - Preferred port number
 * @param {Object} options - Configuration options
 * @param {number} options.maxAttempts - Maximum number of ports to try (default: 100)
 * @param {boolean} options.logAttempts - Whether to log port attempts (default: true)
 * @returns {Promise<number>} - Available port number
 * @throws {Error} - If no available port is found
 */
async function getAvailablePort(preferredPort, options = {}) {
  const { maxAttempts = 100, logAttempts = true } = options;
  
  if (logAttempts) {
    logger.info(`Checking port availability`, { preferredPort });
  }
  
  // First, try the preferred port
  if (await isPortAvailable(preferredPort)) {
    if (logAttempts) {
      logger.info(`Port ${preferredPort} is available`);
    }
    return preferredPort;
  }
  
  if (logAttempts) {
    logger.warn(`Port ${preferredPort} is already in use, searching for alternative...`);
  }
  
  // Find next available port
  const availablePort = await findAvailablePort(preferredPort + 1, maxAttempts);
  
  if (availablePort === null) {
    const error = new Error(`No available port found after checking ${maxAttempts} ports starting from ${preferredPort}`);
    logger.error('Port search failed', { 
      preferredPort, 
      maxAttempts, 
      error: error.message 
    });
    throw error;
  }
  
  if (logAttempts) {
    logger.info(`Found available port ${availablePort}`, { 
      preferredPort, 
      selectedPort: availablePort,
      portsChecked: availablePort - preferredPort
    });
  }
  
  return availablePort;
}

/**
 * Waits for a port to become available
 * @param {number} port - Port number to wait for
 * @param {Object} options - Configuration options
 * @param {number} options.timeout - Timeout in milliseconds (default: 30000)
 * @param {number} options.interval - Check interval in milliseconds (default: 1000)
 * @returns {Promise<boolean>} - True if port becomes available, false if timeout
 */
async function waitForPort(port, options = {}) {
  const { timeout = 30000, interval = 1000 } = options;
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    if (await isPortAvailable(port)) {
      return true;
    }
    
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  
  return false;
}

/**
 * Validates port number
 * @param {number} port - Port number to validate
 * @throws {Error} - If port is invalid
 */
function validatePort(port) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port number: ${port}. Port must be an integer between 1 and 65535.`);
  }
}

module.exports = {
  isPortAvailable,
  findAvailablePort,
  getAvailablePort,
  waitForPort,
  validatePort
};