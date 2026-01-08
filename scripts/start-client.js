/**
 * @file start-client.js
 * @description Starts the React development server with dynamic port configuration.
 * 
 * @module scripts/start-client
 * @requires fs - File system operations
 * @requires path - Path utilities
 * @requires child_process - Process spawning
 * 
 * @connections
 * - Called by: npm run client (via root package.json)
 * - Reads: .env.ports (created by find-ports.js)
 * - Writes: client/public/port-config.js
 * 
 * @summary
 * Starts Create React App dev server:
 * - Reads port from .env.ports (defaults to 3000)
 * - Writes port-config.js for client-side port awareness
 * - Spawns npm start with PORT environment variable
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Reads client port from .env.ports file
function getClientPort() {
  try {
    const envPath = path.join(__dirname, '..', '.env.ports');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      const match = content.match(/CLIENT_PORT=(\d+)/);
      return match ? match[1] : 3000;
    }
  } catch (error) {
  }
  return 3000;
}

const clientPort = getClientPort();

// Also write public/port-config.js for the client to know server and client port
try {
  const envPath = path.join(__dirname, '..', '.env.ports');
  const content = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const serverMatch = content.match(/SERVER_PORT=(\d+)/);
  const serverPort = serverMatch ? serverMatch[1] : 3001;
  const portConfigPath = path.join(__dirname, '..', 'client', 'public', 'port-config.js');
  fs.writeFileSync(
    portConfigPath,
    `window.SERVER_PORT = ${serverPort};\nwindow.CLIENT_PORT = ${clientPort};\n`
  );
} catch { }

const child = spawn(
  process.platform === 'win32' ? 'npm.cmd' : 'npm',
  ['start', '--prefix', 'client'],
  {
    stdio: 'inherit',
    env: { ...process.env, PORT: String(clientPort) },
  }
);

child.on('exit', (code) => {
  process.exit(code ?? 0);
});