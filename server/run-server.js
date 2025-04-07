/**
 * Simple server runner that bypasses database initialization
 */

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');

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
      startTime: Date.now()
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

// Start the server
const PORT = 5000;
server.listen(PORT, () => {
  console.log(`Simple test server running on port ${PORT}`);
}); 