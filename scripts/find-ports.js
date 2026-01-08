/**
 * @file find-ports.js
 * @description Finds available ports for client and server, writes to .env.ports.
 * 
 * @module scripts/find-ports
 * @requires get-port - Port availability detection
 * @requires fs - File system operations
 * @requires path - Path utilities
 * 
 * @connections
 * - Called by: npm run dev (via root package.json)
 * - Writes: .env.ports (read by start-client.js, start-server.js, setupProxy.js)
 * 
 * @summary
 * Detects available ports for development servers:
 * - Client: starts from 3000
 * - Server: starts from 3001
 * Writes CLIENT_PORT and SERVER_PORT to .env.ports file.
 * Cleans up .env.ports on SIGINT/SIGTERM.
 */

const fs = require('fs');
const path = require('path');

// Dynamic import wrapper for ESM-only get-port package
async function getGetPort() {
  try {
    // Prefer dynamic import to support ESM-only package in CJS context
    const mod = await import('get-port');
    return mod.default || mod;
  } catch (err) {
    // Fallback for environments where require still works
    try {
      // eslint-disable-next-line global-require, import/no-dynamic-require
      const reqMod = require('get-port');
      return reqMod.default || reqMod;
    } catch (err2) {
      throw err;
    }
  }
}

async function findPorts() {
  try {
    const envPath = path.join(__dirname, '..', '.env.ports');
    const getPort = await getGetPort();

    // Find available ports starting from 3000 and 3001
    const [clientPort, serverPort] = await Promise.all([
      getPort({ port: 3000 }),
      getPort({ port: 3001 })
    ]);

    // Write ports to .env.ports file
    const content = `CLIENT_PORT=${clientPort}\nSERVER_PORT=${serverPort}`;
    fs.writeFileSync(envPath, content);


    // Cleanup on process exit
    process.on('SIGINT', () => {
      if (fs.existsSync(envPath)) {
        fs.unlinkSync(envPath);
      }
      process.exit();
    });

    process.on('SIGTERM', () => {
      if (fs.existsSync(envPath)) {
        fs.unlinkSync(envPath);
      }
      process.exit();
    });

  } catch (error) {
    console.error('Error finding ports:', error);
    process.exit(1);
  }
}

findPorts(); 