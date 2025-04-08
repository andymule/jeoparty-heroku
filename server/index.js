const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');
const datasetLoader = require('./utils/datasetLoader');

// Load environment variables
dotenv.config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// Load the dataset into memory
const jeopardyDataset = datasetLoader.loadDataset();

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('New client connected');

  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });

  // Game room management
  socket.on('createRoom', (roomCode) => {
    socket.join(roomCode);
    console.log(`Room created: ${roomCode}`);
  });

  socket.on('joinRoom', (roomCode) => {
    socket.join(roomCode);
    console.log(`Player joined room: ${roomCode}`);
  });

  // Game state management
  socket.on('startGame', (roomCode) => {
    // Initialize game state with questions from the dataset
    const gameState = {
      round: 1,
      board: jeopardyDataset.generateBoard(),
      players: {},
      currentQuestion: null
    };
    io.to(roomCode).emit('gameStarted', gameState);
  });

  // Handle player actions
  socket.on('buzzIn', (data) => {
    const { roomCode, playerName } = data;
    io.to(roomCode).emit('playerBuzzed', playerName);
  });

  socket.on('submitAnswer', (data) => {
    const { roomCode, playerName, answer } = data;
    io.to(roomCode).emit('answerSubmitted', { playerName, answer });
  });
});

// Start the server
const PORT = process.env.PORT || 5001;
const HOST = process.env.HOST || '0.0.0.0';
server.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  console.log(`For LAN access, use your computer's IP address: http://<your-ip>:${PORT}`);
}); 