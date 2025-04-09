/**
 * Simple server runner that bypasses database initialization
 */

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

// Initialize Express app
const app = express();
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Log all incoming HTTP requests for debugging
app.use((req, res, next) => {
  console.log(`HTTP ${req.method} ${req.url}`, req.body);
  next();
});

// Create HTTP server and socket.io instance
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS']
  }
});

// Game state
const games = {};

// Generate a random room code
const generateRoomCode = () => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 4; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
};

// API endpoint to create a game
app.post('/api/games/create', (req, res) => {
  try {
    console.log('REST API: Create game request received', req.body);
    
    // Validate input
    const playerName = req.body?.playerName || 'TestHost';
    const yearRange = req.body?.yearRange || { start: 1984, end: 2024 };
    
    // Generate a room code
    const roomCode = generateRoomCode();
    
    // Create game state with a unique host ID
    const hostId = 'api-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
    
    // Create game state
    games[roomCode] = {
      roomCode,
      hostId: hostId,
      hostName: playerName,
      players: [{
        id: hostId,
        name: playerName,
        score: 0,
        isHost: true,
        connected: true
      }],
      gameState: 'waiting',
      startTime: Date.now(),
      yearRange: yearRange // Store the year range for game generation
    };
    
    console.log(`REST API: Game created with room code ${roomCode}`);
    
    // Make sure the response format matches what the client expects
    const response = {
      success: true, 
      roomCode,
      hostUrl: `/game/host/${roomCode}`,
      playerUrl: `/game/player/${roomCode}`,
      game: games[roomCode]
    };
    
    // Set proper headers
    res.setHeader('Content-Type', 'application/json');
    
    // Send response
    res.json(response);
  } catch (error) {
    console.error('REST API Error creating game:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API endpoint to list all active games
app.get('/api/games', (req, res) => {
  try {
    const gamesList = Object.keys(games).map(roomCode => ({
      roomCode,
      hostName: games[roomCode].hostName,
      playerCount: games[roomCode].players?.length || 0,
      state: games[roomCode].gameState,
      startTime: games[roomCode].startTime
    }));
    
    res.json({
      success: true,
      count: gamesList.length,
      games: gamesList
    });
  } catch (error) {
    console.error('REST API Error listing games:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Check if dataset exists
const datasetPaths = [
  path.join(__dirname, '../data/combined_season1-40.tsv'),
  path.join(__dirname, '../data/jeopardy_clue_dataset-main/combined_season1-40.tsv'),
  path.join(__dirname, '../../data/combined_season1-40.tsv'),
  path.join(__dirname, '../../data/jeopardy_clue_dataset-main/combined_season1-40.tsv')
];

let datasetExists = false;
for (const dataPath of datasetPaths) {
  if (fs.existsSync(dataPath)) {
    console.log(`Found dataset at ${dataPath}`);
    datasetExists = true;
    break;
  }
}

if (!datasetExists) {
  console.error('ERROR: Jeopardy dataset file not found');
  console.error('Please download the dataset and place it in the data directory');
  console.error('Expected paths:');
  datasetPaths.forEach(path => console.error(`- ${path}`));
  process.exit(1);
}

// Get environment variables
const PORT = process.env.PORT || 5005;
const NODE_ENV = process.env.NODE_ENV || 'development';

console.log(`Starting server in ${NODE_ENV} mode on port ${PORT}`);

// Determine which server file to run
const serverFile = 'index-new.js'; // Use the new modular server file

// Spawn the server process
const serverProcess = spawn('node', [serverFile], {
  cwd: __dirname,
  env: { ...process.env, PORT, NODE_ENV },
  stdio: 'inherit'
});

console.log(`Server process started with PID ${serverProcess.pid}`);

// Handle server process events
serverProcess.on('error', (error) => {
  console.error(`Failed to start server: ${error.message}`);
  process.exit(1);
});

serverProcess.on('exit', (code, signal) => {
  if (code !== 0) {
    console.error(`Server process exited with code ${code} and signal ${signal}`);
    process.exit(code);
  }
  console.log('Server process exited gracefully');
});

// Handle process signals to cleanly shut down the server
process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down server...');
  serverProcess.kill('SIGINT');
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down server...');
  serverProcess.kill('SIGTERM');
});

// Keep the main process running
console.log('Server runner is monitoring the server process');
console.log('Press Ctrl+C to stop the server'); 