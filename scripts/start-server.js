/**
 * @file start-server.js
 * @description Starts the Express development server with dynamic port configuration.
 * 
 * @module scripts/start-server
 * @requires fs - File system operations
 * @requires path - Path utilities
 * @requires child_process - Process spawning
 * 
 * @connections
 * - Called by: npm run server (via root package.json)
 * - Reads: .env.ports (created by find-ports.js)
 * 
 * @summary
 * Starts Express server for development:
 * - Reads port from .env.ports (defaults to 3001)
 * - Spawns npm run dev --prefix server with PORT environment variable
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Reads server port from .env.ports file
function getServerPort() {
  try {
    const envPath = path.join(__dirname, '..', '.env.ports');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      const match = content.match(/SERVER_PORT=(\d+)/);
      return match ? match[1] : 3001;
    }
  } catch (error) {
  }
  return 3001;
}

// Set the PORT environment variable and start the server via npm script
const serverPort = getServerPort();

const child = spawn(
  process.platform === 'win32' ? 'npm.cmd' : 'npm',
  ['run', 'dev', '--prefix', 'server'],
  {
    stdio: 'inherit',
    env: { ...process.env, PORT: String(serverPort) },
  }
);

child.on('exit', (code) => {
  process.exit(code ?? 0);
});