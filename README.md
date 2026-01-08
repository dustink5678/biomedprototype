# BMed Prototype

A government recording and replay system prototype with real-time synchronization capabilities.

## Features

- **Dynamic Port Allocation**: Automatically finds available ports when default ports are occupied
- **Real-time Recording**: Live audio/video recording with transcription
- **Session Management**: Organize and manage recording sessions
- **Replay System**: Synchronized playback of recordings with transcriptions
- **User Authentication**: Secure login and user management
- **Socket.IO Integration**: Real-time communication between clients

## Dynamic Port Allocation

The project now automatically handles port conflicts by finding the next available ports when the default ports (3000 for client, 3001 for server) are occupied.

### How it works:

1. **Port Discovery**: The `npm run dev` command first runs `npm run find-ports` which:
   - Uses the `get-port` package to find available ports starting from 3000 and 3001
   - Saves the assigned ports to a temporary `.env.ports` file
   - Displays the assigned ports in the console

2. **Dynamic Configuration**: 
   - Client automatically reads its assigned port from `.env.ports`
   - Server automatically reads its assigned port from `.env.ports`
   - Client generates a `port-config.js` file with server port information for browser access

3. **Automatic Cleanup**: The `.env.ports` file is automatically cleaned up when the development server stops

### Usage:

```bash
# Start development servers with automatic port allocation
npm run dev

# The system will output something like:
# Ports assigned: { clientPort: 3000, serverPort: 3001 }
# Port configuration saved to .env.ports
# Starting server on port 3001
# Starting React client on port 3000 with server on port 3001
```

If ports 3000 or 3001 are occupied, the system will automatically find the next available ports (e.g., 3002, 3003, etc.).

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn

### Installation

1. Clone the repository
2. Copy `.env.example` to `.env` and configure your environment variables
3. Install dependencies:
   ```bash
   npm install
   ```

### Development

Start the development servers:
```bash
npm run dev
```

This will:
- Find available ports automatically
- Start the backend server
- Start the React development server
- Open the application in your browser

### Production Build

```bash
npm run build
```

## Project Structure

```
BMed Prototype/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── context/        # React context providers
│   │   ├── pages/          # Page components
│   │   └── ...
│   └── public/
├── server/                 # Node.js backend
│   ├── routes/             # API routes
│   ├── middleware/         # Express middleware
│   └── ...
├── scripts/                # Utility scripts
│   ├── find-ports.js       # Port allocation script
│   ├── start-client.js     # Client startup script
│   └── start-server.js     # Server startup script
└── ...
```

## API Endpoints

- `GET /api/health` - Health check
- `POST /api/auth/login` - User authentication
- `GET /api/sessions` - Get recording sessions
- `POST /api/uploads` - Upload recordings

## Socket.IO Events

- `recording-status` - Real-time recording status updates
- `transcription-update` - Live transcription updates

## Environment Variables

Copy `.env.example` to `.env` and configure the following:
- Firebase configuration (API keys, project settings)
- Authentication mode (firebase or dev)
- Cloud Functions URL

The system also automatically manages port configuration through the `.env.ports` file, which is generated at runtime and cleaned up automatically.

## Troubleshooting

If you encounter port conflicts:
1. The system will automatically find available ports
2. Check the console output for the assigned ports
3. Access the application using the displayed client port

## Project Maintenance

### Reinstalling Dependencies
This project uses npm workspaces. All dependencies are managed from the root:
```bash
npm install
```

### Python Environment (Functions)
```bash
cd functions
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

## License

PROPRIETARY - BMed Prototype Team 