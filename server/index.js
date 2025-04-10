/**
 * DEPRECATED: This file is being replaced by index-new.js which uses a more modular architecture.
 * Please use `npm run dev:new` or `npm run start:new` to run the server with the new architecture.
 * This file is kept for backward compatibility during the transition.
 */

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');
const { v4: uuidv4 } = require('uuid');
const stringSimilarity = require('string-similarity');
const fs = require('fs');
const natural = require('natural');
const { WordTokenizer, PorterStemmer } = natural;
const tokenizer = new WordTokenizer();

// Load in-memory dataset module
const { 
  initializeDataset, 
  inMemoryDataset, 
  getQuestionsCount, 
  getCategories, 
  getQuestionsByCategory,
  getRandomQuestionsByCategory,
  getQuestionsByYearRange
} = require('./db');

// Import the database loader
const jeopardyDB = require('./utils/databaseLoader');

// Verify dataset requirements
if (!fs.existsSync(path.join(__dirname, '../data/combined_season1-40.tsv'))) {
  console.error('FATAL ERROR: combined_season1-40.tsv dataset file not found in data directory');
  console.error('This file is required for the application to function');
  console.error('Please download the dataset and place it in the data directory');
  process.exit(1);
}

dotenv.config();

// Initialize Express app
const app = express();

// Configure CORS
const corsOrigins = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : '*';
console.log('CORS Origins:', corsOrigins);
app.use(cors({
  origin: (origin, callback) => {
    // Allow server-to-server requests (null origin)
    if (!origin || corsOrigins === '*' || corsOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`CORS blocked request from origin: ${origin}`);
      callback(null, false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Log all incoming HTTP requests for debugging
app.use((req, res, next) => {
  console.log(`HTTP ${req.method} ${req.url}`, req.body);
  next();
});

// Function to sanitize clue text before displaying
function sanitizeClue(clueText) {
  if (!clueText) return clueText;
  
  // Remove content inside parentheses (often show commentary)
  let sanitized = clueText.replace(/\([^)]*\)/g, '').trim();
  
  // Remove dates in format YYYY-MM-DD that might appear at the end of the answer
  sanitized = sanitized.replace(/\s*\d{4}-\d{2}-\d{2}$/, '').trim();
  
  // Remove forward and backslashes
  sanitized = sanitized.replace(/[/\\]/g, ' ').trim();
  
  // Clean up multiple spaces that might result from removals
  sanitized = sanitized.replace(/\s+/g, ' ').trim();
  
  return sanitized;
}

// Function to check answer correctness with permissive matching
function checkAnswerCorrectness(userAnswer, correctAnswer) {
  if (!userAnswer || !correctAnswer) return false;
  
  // Normalize both answers: lowercase, remove punctuation, extra spaces
  const normalizeAnswer = (answer) => {
    return answer.toString()
      .toLowerCase()
      .replace(/[^\w\s]/g, '') // Remove ALL punctuation including \ / " ' etc.
      .replace(/\s+/g, ' ')    // Replace multiple spaces with a single space
      .trim();
  };
  
  const normalizedUserAnswer = normalizeAnswer(userAnswer);
  const normalizedCorrectAnswer = normalizeAnswer(correctAnswer);
  
  // Log for debugging
  console.log(`Comparing: "${normalizedUserAnswer}" with "${normalizedCorrectAnswer}"`);
  
  // Exact match after normalization
  if (normalizedUserAnswer === normalizedCorrectAnswer) {
    console.log('Exact match after normalization');
    return true;
  }
  
  // Check if correct answer contains the user's answer (useful for partial answers)
  if (normalizedCorrectAnswer.includes(normalizedUserAnswer) && 
      normalizedUserAnswer.length > normalizedCorrectAnswer.length * 0.5) {
    console.log('User answer is substantial part of correct answer');
    return true;
  }
  
  // Check if user answer contains the correct answer (with minimum length)
  if (normalizedUserAnswer.includes(normalizedCorrectAnswer) && 
      normalizedCorrectAnswer.length > 3) {
    console.log('User answer contains the correct answer');
    return true;
  }
  
  // Tokenize and stem both answers for more robust comparison
  const stemWord = (word) => PorterStemmer.stem(word);
  const userTokens = tokenizer.tokenize(normalizedUserAnswer).map(stemWord);
  const correctTokens = tokenizer.tokenize(normalizedCorrectAnswer).map(stemWord);
  
  // Check for matching stems
  const userStemSet = new Set(userTokens);
  const correctStemSet = new Set(correctTokens);
  
  // Calculate the percentage of matching stems
  const intersection = [...correctStemSet].filter(stem => userStemSet.has(stem));
  const matchPercentage = correctStemSet.size > 0 ? 
    intersection.length / correctStemSet.size : 0;
  
  // If many stems match, it's probably correct
  if (matchPercentage >= 0.7 && correctStemSet.size >= 2) {
    console.log(`High stem match percentage: ${matchPercentage.toFixed(2)}`);
    return true;
  }
  
  // Check if answer contains important keywords
  const correctWords = normalizedCorrectAnswer.split(' ');
  const userWords = normalizedUserAnswer.split(' ');
  
  // For short answers (1-2 words), check if user got the main word
  if (correctWords.length <= 2) {
    // If it's a very short answer, be more permissive
    if (correctWords.some(word => userWords.includes(word) && word.length > 3)) {
      console.log('User got main word in a short answer');
      return true;
    }
  }
  
  // For longer answers, count how many significant words match
  if (correctWords.length > 2) {
    const significantWords = correctWords.filter(word => word.length > 3);
    const matchedWords = significantWords.filter(word => userWords.includes(word));
    if (matchedWords.length >= Math.ceil(significantWords.length * 0.6)) {
      console.log('User matched significant keywords');
      return true;
    }
  }
  
  // Use string similarity for fuzzy matching - use the better library
  const similarity = stringSimilarity.compareTwoStrings(normalizedUserAnswer, normalizedCorrectAnswer);
  console.log(`String similarity score: ${similarity}`);
  
  // More permissive threshold - 0.65 means answers are 65% similar
  if (similarity >= 0.65) {
    console.log('Answer is very similar');
    return true;
  }
  
  // Special case: names may have different formats (e.g., "John Doe" vs "Doe, John")
  if (correctWords.length === 2 && userWords.length === 2) {
    // Check if the words are the same but in different order
    if (correctWords[0] === userWords[1] && correctWords[1] === userWords[0]) {
      console.log('Name in different format');
      return true;
    }
  }
  
  // Special case: "What is" and "Who is" can be interchanged
  const stripPrefix = (text) => {
    return text.replace(/^(what|who)\s+is\s+/i, '').trim();
  };
  
  const userStripped = stripPrefix(normalizedUserAnswer);
  const correctStripped = stripPrefix(normalizedCorrectAnswer);
  
  if (userStripped === correctStripped || 
      stringSimilarity.compareTwoStrings(userStripped, correctStripped) >= 0.8) {
    console.log('Answers match after removing what/who prefix');
    return true;
  }
  
  return false;
}

// Create HTTP server and socket.io instance
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: corsOrigins,
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
  }
});

// Generate a room code
function generateRoomCode() {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 4; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

// Check if a player is rejoining the game
function isPlayerRejoining(game, socketId, playerName) {
  // Check if a player with this name exists in the game
  const existingPlayer = game.players.find(p => 
    p.name.toLowerCase() === playerName.toLowerCase()
  );
  
  // If player exists but is disconnected, they can rejoin
  if (existingPlayer && !existingPlayer.connected) {
    console.log(`Player ${playerName} is rejoining game`);
    return true;
  }
  
  // If player doesn't exist, they're not rejoining
  return false;
}

// Game state storage
const gameStates = {};

// Add at the beginning of the file, near the other state variables
// Game state
const GAME_ROUNDS = {
  SINGLE_JEOPARDY: 'singleJeopardy',
  DOUBLE_JEOPARDY: 'doubleJeopardy',
  FINAL_JEOPARDY: 'finalJeopardy',
  GAME_OVER: 'gameOver'
};

const gameService = require('./services/gameService');

// Keep only the /api/games/create endpoint and remove /games/create
app.post('/api/games/create', async (req, res) => {
  console.log('POST /api/games/create - Request received:', req.body);
  
  try {
    // Check if content type is correct
    if (!req.is('application/json')) {
      return res.status(400).json({
        success: false,
        error: 'Content-Type must be application/json'
      });
    }
    
    // Get parameters
    const { hostName, playerName, yearRange, gameDate } = req.body;
    
    // Check if we have a valid name parameter
    const nameToUse = hostName || playerName;
    
    if (!nameToUse) {
      console.error('POST /api/games/create - Missing required name parameter. Request body:', req.body);
      return res.status(400).json({ 
        success: false,
        error: 'Host name or player name is required',
        requestBody: req.body 
      });
    }
    
    // Create the game using the game service
    const game = await gameService.createGame({
      hostName: nameToUse,
      yearRange,
      gameDate
    });
    
    console.log(`Game successfully created with room code ${game.roomCode}`);
    res.json({
      success: true,
      roomCode: game.roomCode,
      hostUrl: `/game/host/${game.roomCode}`,
      playerUrl: `/game/player/${game.roomCode}`,
      game
    });
  } catch (error) {
    console.error('Error creating game via /api/games/create:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to create game', 
      details: error.message,
      stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
    });
  }
});

// Serve static files if in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/build')));
} else {
  // In development, serve the client build folder as static files too
  // This helps with testing the full application locally
  app.use(express.static(path.join(__dirname, '../client/build')));
}

// Add a status endpoint to verify API is working
app.get('/api/status', (req, res) => {
  res.json({
    status: 'online',
    inMemoryDataset: {
      loaded: inMemoryDataset.length > 0,
      questionCount: inMemoryDataset.length,
      categories: getCategories().length
    },
    serverTime: new Date().toISOString()
  });
});

// Add a debug endpoint to view active games
app.get('/api/debug', (req, res) => {
  // Only allow in development or with debug API key for security
  const apiKey = req.query.key || '';
  const debugEnabled = process.env.NODE_ENV !== 'production' || apiKey === process.env.DEBUG_API_KEY;
  
  if (!debugEnabled) {
    return res.status(403).json({ error: 'Debug access forbidden in production without valid API key' });
  }
  
  const activeGames = {};
  Object.keys(gameStates).forEach(roomCode => {
    const game = gameStates[roomCode];
    activeGames[roomCode] = {
      hostConnected: !!io.sockets.sockets.get(game.hostId || game.host),
      state: game.state || game.gameState,
      playerCount: game.players.filter(p => !p.isHost).length,
      connectedPlayerCount: game.players.filter(p => !p.isHost && p.connected).length,
      disconnectedPlayerCount: game.players.filter(p => !p.isHost && !p.connected).length,
      currentRound: game.currentRound,
      startTime: game.startTime,
      uptime: game.startTime ? Math.floor((Date.now() - game.startTime) / 1000) : null
    };
  });
  
  // Get total connected socket count
  const connectedSockets = io.sockets.sockets.size;
  
  res.json({
    environment: process.env.NODE_ENV || 'development',
    serverUptime: process.uptime(),
    activeGames: activeGames,
    gameCount: Object.keys(gameStates).length,
    connectedSockets: connectedSockets,
    memoryUsage: process.memoryUsage()
  });
});

// Catch-all route to serve React app in production
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/build', 'index.html'));
});

// Update the socket.io connection handler to use the game service
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);
  
  // Handle createGame event
  socket.on('createGame', async ({ playerName, roomCode }, callback) => {
    try {
      console.log(`Create game request received: ${JSON.stringify({ playerName, roomCode })}`);
      
      const game = await gameService.createGame({
        hostName: playerName,
        roomCode,
        yearRange: { start: 1984, end: 2024 }, // Add default yearRange
        hostId: socket.id
      });
      
      // Store room code in socket data for disconnect handling
      socket.gameData = { 
        roomCode, 
        playerName,
        isHost: true 
      };
      
      // Join the socket room
      socket.join(roomCode);
      
      console.log(`Game created successfully with room code ${game.roomCode}`);
      callback({ success: true, game });
    } catch (error) {
      console.error('Error creating game:', error);
      callback({ success: false, error: error.message });
    }
  });
  
  // Enhanced error handling for socket
  socket.on('error', (error) => {
    console.error(`Socket error for ${socket.id}:`, error);
  });
  
  // Handle disconnections
  socket.on('disconnect', (reason) => {
    console.log(`User disconnected: ${socket.id}, reason: ${reason}`);
    
    // Check if the user was in a game
    if (socket.gameData && socket.gameData.roomCode) {
      const { roomCode } = socket.gameData;
      
      // Remove player from game using game service
      try {
        const updatedGame = gameService.removePlayer(roomCode, socket.id);
        
        if (updatedGame) {
          // Notify others in the room of the disconnection
          io.to(roomCode).emit('playerDisconnected', {
            playerId: socket.id,
            playerName: socket.gameData.playerName,
            players: updatedGame.players.filter(p => !p.isHost)
          });
          
          console.log(`Player ${socket.gameData.playerName} disconnected from game ${roomCode}`);
        } else {
          console.log(`Game ${roomCode} removed after last player disconnected`);
        }
      } catch (error) {
        console.error(`Error handling disconnect for game ${roomCode}:`, error);
      }
    }
  });
  
  // Handle joining a game
  socket.on('joinGame', async (data) => {
    try {
      // Check if we have the necessary data
      if (!data || !data.roomCode || !data.playerName) {
        console.error('Invalid join data:', data);
        return socket.emit('error', { message: 'Invalid join data' });
      }
      
      const roomCode = data.roomCode.toUpperCase();
      const playerName = data.playerName.trim();
      
      console.log(`Player ${playerName} attempting to join room ${roomCode}`);
      
      // Show active games for debugging
      const activeGames = gameService.getAllGames();
      console.log(`Active games (${activeGames.size}):`, Array.from(activeGames.keys()));
      
      // Check if the game exists using gameService
      const game = gameService.getGame(roomCode);
      if (!game) {
        console.log(`Game with room code ${roomCode} not found`);
        return socket.emit('gameNotFound');
      }
      
      // Check if game is already in progress and not allowing new players
      if (game.gameState !== 'waiting' && !isPlayerRejoining(game, socket.id, playerName)) {
        console.log(`Game ${roomCode} is already in progress and not accepting new players`);
        return socket.emit('error', { message: 'Game is already in progress' });
      }
      
      try {
        // Use gameService to join the game
        await gameService.joinGame({
          roomCode,
          playerName,
          playerId: socket.id
        });
      
        // Store socket data
        socket.gameData = {
          roomCode,
          playerName
        };
        
        // Join the socket room
        socket.join(roomCode);
        
        // Get updated game data from the service
        const updatedGame = gameService.getGame(roomCode);
        const playerData = updatedGame.players.find(p => p.id === socket.id);
        
        // Emit event to the client that they've joined
        socket.emit('gameJoined', {
          roomCode,
          gameState: updatedGame.gameState,
          players: updatedGame.players.filter(p => !p.isHost),
          player: playerData,
          categories: updatedGame.categories,
          board: updatedGame.board,
          score: playerData ? playerData.score : 0
        });
        
        // Notify host and other players about the new player
        socket.to(roomCode).emit('playerJoined', {
          player: playerData,
          players: updatedGame.players.filter(p => !p.isHost)
        });
        
        console.log(`Player ${playerName} joined game ${roomCode}`);
      } catch (error) {
        console.error(`Error joining game: ${error.message}`);
        socket.emit('error', { message: error.message });
      }
    } catch (error) {
      console.error('Error joining game:', error);
      socket.emit('error', { message: `Failed to join game: ${error.message}` });
    }
  });
  
  // Handle player buzz
  socket.on('buzz', (roomCode) => {
    if (!roomCode) {
      console.error('No room code provided');
      return socket.emit('error', { message: 'Room code is required' });
    }
    
    // Convert to uppercase for consistency
    roomCode = roomCode.toUpperCase();
    
    if (!gameStates[roomCode]) {
      console.error(`Game not found for room ${roomCode}`);
      return socket.emit('error', { message: 'Game not found' });
    }
    
    const game = gameStates[roomCode];
    
    // Check if game is active
    if (game.state !== 'questionActive' && game.gameState !== 'questionActive') {
      console.log(`Invalid buzz: game not in question active state (${game.state || game.gameState})`);
      return socket.emit('error', { message: 'No active question' });
    }
    
    // Find player in game
    const playerIndex = game.players.findIndex(p => p.id === socket.id);
    if (playerIndex === -1) {
      console.error(`Player ${socket.id} not found in game ${roomCode}`);
      return socket.emit('error', { message: 'Player not found' });
    }
    
    const player = game.players[playerIndex];
    
    // Check if a player has already buzzed in
    if (game.buzzedPlayer) {
      console.log(`Player ${player.name} tried to buzz in, but ${game.buzzedPlayer.name} already buzzed`);
      return socket.emit('error', { message: 'Another player has already buzzed in' });
    }
    
    // Check if this player has already attempted this question
    if (game.playerAttempts[player.id]) {
      console.log(`Player ${player.name} already attempted this question`);
      return socket.emit('error', { message: 'You have already attempted this question' });
    }
    
    // Get current time for precise timing checks
    const now = Date.now();
    
    // Check if buzzing is allowed or if this is an early buzz
    if (!game.canBuzzIn) {
      console.log(`Player ${player.name} buzzed in too early`);
      
      // Apply early buzz penalty
      game.earlyBuzzPenalties[player.id] = now + 200; // 0.2 second penalty
      
      // Notify just this player of the early buzz
      socket.emit('earlyBuzz', {
        playerId: player.id,
        playerName: player.name,
        penalty: 0.2
      });
      
      return;
    }
    
    // Check if player has an active penalty
    if (game.earlyBuzzPenalties[player.id] && now < game.earlyBuzzPenalties[player.id]) {
      console.log(`Player ${player.name} still has an active buzz penalty`);
      return socket.emit('error', { message: 'You buzzed in too early. Wait for your penalty to expire.' });
    }
    
    console.log(`Player ${player.name} buzzed in for question in room ${roomCode}`);
    
    // Mark this player as having attempted the question
    game.playerAttempts[player.id] = true;
    
    // Set as the buzzed player - store the whole player object
    game.buzzedPlayer = player;
    
    // Clear any existing question timeout since someone buzzed in
    if (game.questionTimeout) {
      clearTimeout(game.questionTimeout);
      game.questionTimeout = null;
    }
    
    // Set a 7-second timeout for the player to answer
    game.answeringTimeout = setTimeout(() => {
      if (gameStates[roomCode] && gameStates[roomCode].buzzedPlayer && gameStates[roomCode].buzzedPlayer.id === player.id) {
        console.log(`Answer timeout for player ${player.name} in room ${roomCode}`);
        
        // Automatically process as incorrect answer
        handleIncorrectAnswer(roomCode, player);
      }
    }, 7000);
    
    // Use volatile flag for lower latency on buzz events
    // Using direct socket communication to minimize latency
    const buzzData = {
      player: player,
      playerId: player.id,
      playerName: player.name,
      timestamp: Date.now() // Add timestamp for more precise synchronization
    };
    
    // Send to host with highest priority using direct socket access
    const hostSocket = io.sockets.sockets.get(game.hostId || game.host);
    if (hostSocket) {
      hostSocket.volatile.emit('playerBuzzed', buzzData);
    }
    
    // Then broadcast to everyone else in the room
    socket.to(roomCode).volatile.emit('playerBuzzed', buzzData);
    
    // Send confirmation back to the player who buzzed in
    socket.volatile.emit('playerBuzzed', buzzData);
  });
  
  // Log all incoming events for debugging
  const originalOnEvent = socket.onevent;
  socket.onevent = function(packet) {
    const args = packet.data || [];
    console.log(`[SOCKET EVENT] ${socket.id} emitted '${args[0]}'`, args.slice(1));
    originalOnEvent.call(this, packet);
  };
  
  // When a host starts the game
  socket.on('startGame', async (roomCode) => {
    console.log(`Start game request received for room ${roomCode}`);
    
    if (!roomCode) {
      console.error('No room code provided');
      return socket.emit('error', { message: 'Room code is required' });
    }
    
    // Convert to uppercase for consistency
    roomCode = roomCode.toUpperCase();
    
    // Get the game from gameService instead of gameStates
    const game = gameService.getGame(roomCode);
    if (!game) {
      console.error(`Game not found for room ${roomCode}`);
      return socket.emit('error', { message: 'Game not found' });
    }
    
    // Check if this player is the host
    if (socket.id !== game.hostId) {
      console.log(`Non-host ${socket.id} tried to start game in room ${roomCode}`);
      socket.emit('error', { message: 'Only the host can start the game' });
      return;
    }
    
    // Check if game is already in progress
    if (game.gameState !== 'waiting') {
      console.log(`Invalid startGame: game already started (${game.gameState})`);
      socket.emit('error', { message: 'Game already started' });
      return;
    }
    
    console.log(`Starting game in room ${roomCode}`);
    
    // Update game state
    game.gameState = 'inProgress';
    
    // Notify all players that the game has started
    io.to(roomCode).emit('gameStarted', {
      game: {
        ...game,
        players: game.players.filter(p => !p.isHost) // Filter out host from player list
      },
      categories: game.categories,
      board: game.board,
      selectingPlayerId: game.selectingPlayer?.id
    });
    
    console.log(`Game in room ${roomCode} started with ${game.categories.length} categories`);
  });
  
  // When a question is selected
  socket.on('selectQuestion', (roomCodeOrData, categoryIndexParam, valueIndexParam) => {
    console.log(`selectQuestion called with:`, { roomCodeOrData, categoryIndexParam, valueIndexParam });
    
    // Extract parameters - handle both formats
    let roomCode, categoryIndex, valueIndex;
    
    if (typeof roomCodeOrData === 'string') {
      roomCode = roomCodeOrData;
      categoryIndex = categoryIndexParam;
      valueIndex = valueIndexParam;
    } else if (typeof roomCodeOrData === 'object') {
      // Handle object format (backward compatibility)
      roomCode = roomCodeOrData.roomCode;
      categoryIndex = roomCodeOrData.categoryIndex;
      valueIndex = roomCodeOrData.valueIndex;
    } else {
      console.error(`Invalid parameter format for selectQuestion`);
      return socket.emit('error', { message: 'Invalid parameter format' });
    }
    
    // Ensure parameters are all valid
    if (!roomCode) {
      console.error(`No room code provided`);
      return socket.emit('error', { message: 'Room code is required' });
    }
    
    // Convert to uppercase for consistency
    roomCode = roomCode.toString().toUpperCase();
    
    // Make sure the game exists
    if (!gameStates[roomCode]) {
      console.error(`Game not found for room ${roomCode}`);
      return socket.emit('error', { message: 'Game not found' });
    }
    
    const game = gameStates[roomCode];
    
    // Reset buzzer state completely
    game.canBuzzIn = false;
    game.buzzedPlayer = null;
    game.playerAttempts = {};
    game.earlyBuzzPenalties = {};
    
    if (game.buzzerEnableTime) {
      delete game.buzzerEnableTime;
    }
    
    // Check if game is in progress (using either state field)
    if (game.state !== 'inProgress' && game.gameState !== 'inProgress') {
      console.log(`Invalid selectQuestion: game not in progress (state: ${game.state || game.gameState})`);
      socket.emit('error', { message: 'Game not in progress' });
      return;
    }
    
    // Check if this player is allowed to select a question
    // Allow if: player is host, OR player is the selecting player
    const isHost = socket.id === game.hostId || socket.id === game.host;
    const isSelectingPlayer = game.selectingPlayer && 
      (socket.id === game.selectingPlayer.id || socket.id === game.selectingPlayer);
    
    if (!isHost && !isSelectingPlayer) {
      console.log(`Invalid selectQuestion: player ${socket.id} not authorized to select`);
      socket.emit('error', { message: 'You are not authorized to select a question' });
      return;
    }
    
    // Get selected category by index and ensure it's valid
    const categories = game.categories;
    if (categoryIndex === undefined || categoryIndex === null) {
      console.error(`No category index provided`);
      return socket.emit('error', { message: 'Category index is required' });
    }
    
    // Make sure categoryIndex is a number
    categoryIndex = Number(categoryIndex);
    if (isNaN(categoryIndex)) {
      console.error(`Invalid categoryIndex: NaN`);
      return socket.emit('error', { message: 'Invalid category index' });
    }
    
    // Check that the category index is within bounds
    if (categoryIndex < 0 || categoryIndex >= categories.length) {
      console.log(`Invalid categoryIndex: ${categoryIndex} (max: ${categories.length - 1})`);
      return socket.emit('error', { message: 'Invalid category index' });
    }
    
    const category = categories[categoryIndex];
    const board = game.board;
    
    // Check that the selected category exists in the board
    if (!board[category]) {
      console.error(`Category ${category} not found in board`);
      return socket.emit('error', { message: 'Category not found in board' });
    }
    
    // Ensure valueIndex is provided and a valid number
    if (valueIndex === undefined || valueIndex === null) {
      console.error(`No value index provided`);
      return socket.emit('error', { message: 'Value index is required' });
    }
    
    // Convert valueIndex to a number for proper comparison
    valueIndex = Number(valueIndex);
    
    // Make sure valueIndex is not NaN
    if (isNaN(valueIndex)) {
      console.log(`Invalid valueIndex: NaN for category ${category}`);
      socket.emit('error', { message: 'Invalid value index' });
      return;
    }
    
    // Check if the board has questions for this category
    if (!Array.isArray(board[category]) || board[category].length === 0) {
      console.log(`Category ${category} has no questions`);
      socket.emit('error', { message: 'Category has no questions' });
      return;
    }
    
    // Log detailed info about the board structure for debugging
    console.log(`Board for category ${category} has ${board[category].length} questions`);
    console.log(`Attempting to access question at index ${valueIndex}`);
    
    // Check if the value index is valid (should be 0-4 for standard 5 questions per category)
    if (valueIndex < 0 || valueIndex >= board[category].length) {
      console.log(`Invalid valueIndex: ${valueIndex} for category ${category}`);
      console.log(`Category ${category} has ${board[category].length} questions`);
      socket.emit('error', { message: 'Invalid value index' });
      return;
    }
    
    console.log(`Question at index ${valueIndex} exists:`, !!board[category][valueIndex]);
    
    // Check if question is already revealed - add more detailed logging
    if (board[category][valueIndex].revealed) {
      console.log(`Question at category ${category} (${categoryIndex}), value ${valueIndex} already revealed`);
      console.log(`Board state for this question:`, board[category][valueIndex]);
      socket.emit('error', { message: 'Question already revealed' });
      return;
    }
    
    // Mark the question as revealed
    board[category][valueIndex].revealed = true;
    
    // Get the question data
    const question = board[category][valueIndex];
    
    // Clear any existing question timeout
    if (game.questionTimeout) {
      clearTimeout(game.questionTimeout);
      game.questionTimeout = null;
    }
    
    // Apply sanitization to the question text and answer before sending to clients
    const questionText = sanitizeClue(question.text || question.question);
    const questionAnswer = sanitizeClue(question.answer);
    
    // Set current question
    game.currentQuestion = {
      category,
      categoryIndex,
      valueIndex,
      text: questionText,
      value: question.value,
      answer: questionAnswer
    };
    
    // Update game state
    game.state = 'questionActive';
    game.gameState = 'questionActive'; // For backward compatibility
    
    // Log who selected the question
    const player = game.players.find(p => p.id === socket.id);
    console.log(`Question selected by ${player ? player.name : 'host'}: ${category} for $${question.value} at position ${valueIndex + 1}`);
    
    // Emit to all players
    io.to(roomCode).emit('questionSelected', {
      question: game.currentQuestion,
      category,
      categoryIndex, 
      valueIndex,
      selectedBy: socket.id
    });
    
    // After a delay (matches host's time to read), enable buzzing
    setTimeout(() => {
      if (gameStates[roomCode] && gameStates[roomCode].currentQuestion) {
        gameStates[roomCode].canBuzzIn = true;
        io.to(roomCode).emit('buzzerEnabled', {
          roomCode,
          questionId: gameStates[roomCode].currentQuestion.text
        });
        console.log(`Buzzer enabled for room ${roomCode}`);
      }
    }, 7000); // 7 seconds matches the typical time for host to read the question
    
    console.log(`Question selected for room ${roomCode}:`, game.currentQuestion);
  });
  
  // Handle rejoining a game (used for reconnections)
  socket.on('rejoinGame', (data) => {
    try {
      // Check if we have the necessary data
      if (!data || !data.roomCode || !data.playerName) {
        console.error('Invalid rejoin data:', data);
        return socket.emit('error', { message: 'Invalid rejoin data' });
      }
      
      const roomCode = data.roomCode.toUpperCase();
      const playerName = data.playerName.trim();
      
      console.log(`Player ${playerName} attempting to rejoin room ${roomCode}`);
      
      // Check if the game exists using gameService
      const game = gameService.getGame(roomCode);
      if (!game) {
        console.log(`Game with room code ${roomCode} not found`);
        return socket.emit('gameNotFound');
      }
      
      // Look for the player in the game
      const playerIndex = game.players.findIndex(p => 
        p.name.toLowerCase() === playerName.toLowerCase()
      );
      
      if (playerIndex === -1) {
        console.log(`Player ${playerName} not found in game ${roomCode}`);
        return socket.emit('error', { message: 'Player not found in game' });
      }
      
      // Update the player's socket ID and connection status
      const player = game.players[playerIndex];
      player.id = socket.id;
      player.connected = true;
      
      // Store socket data
      socket.gameData = {
        roomCode,
        playerName
      };
      
      // Join the socket room
      socket.join(roomCode);
      
      // Emit event to the client that they've rejoined
      socket.emit('gameJoined', {
        roomCode,
        gameState: game.gameState,
        players: game.players.filter(p => !p.isHost),
        player,
        categories: game.categories,
        board: game.board,
        score: player.score
      });
      
      // Notify others that a player has rejoined
      socket.to(roomCode).emit('playerRejoined', {
        player,
        players: game.players.filter(p => !p.isHost)
      });
      
      console.log(`Player ${playerName} rejoined game ${roomCode}`);
    } catch (error) {
      console.error('Error rejoining game:', error);
      socket.emit('error', { message: 'Failed to rejoin game' });
    }
  });
  
  // Handle answer submission
  socket.on('submitAnswer', (roomCode, answerOrPlayerId, answer, isCorrect) => {
    console.log(`submitAnswer called with:`, { roomCode, answerOrPlayerId, answer, isCorrect });
    
    // Validate inputs and handle different function signatures
    if (!roomCode) {
      console.error('No room code provided for answer submission');
      return socket.emit('error', { message: 'Room code is required' });
    }
    
    // Convert room code to uppercase for consistency
    roomCode = roomCode.toUpperCase();
    
    const game = gameStates[roomCode];
    if (!game) {
      console.error(`Game not found for room ${roomCode}`);
      return socket.emit('error', { message: 'Game not found' });
    }
    
    if (!game.currentQuestion) {
      console.error(`No active question for room ${roomCode}`);
      return socket.emit('error', { message: 'No active question' });
    }
    
    let playerToUse, answerToUse, isCorrectToUse;
    
    // Case 1: Host explicitly submitting judgment (roomCode, playerId, answer, isCorrect)
    if (socket.id === game.hostId || socket.id === game.host && typeof answerOrPlayerId === 'string' && answer !== undefined && isCorrect !== undefined) {
      // Find the player by ID
      const playerIndex = game.players.findIndex(p => p.id === answerOrPlayerId);
      if (playerIndex === -1) {
        console.error(`Player ${answerOrPlayerId} not found in game ${roomCode}`);
        return socket.emit('error', { message: 'Player not found' });
      }
      
      playerToUse = game.players[playerIndex];
      answerToUse = answer;
      isCorrectToUse = isCorrect;
      
      console.log(`Host judging ${playerToUse.name}'s answer "${answerToUse}" as ${isCorrectToUse ? 'correct' : 'incorrect'}`);
    }
    // Case 2: Player submitting their answer (roomCode, answer)
    else if (typeof answerOrPlayerId === 'string' && answer === undefined) {
      // Find the player
      const playerIndex = game.players.findIndex(p => p.id === socket.id);
      if (playerIndex === -1) {
        console.error(`Player ${socket.id} not found in game ${roomCode}`);
        return socket.emit('error', { message: 'Player not found' });
      }
      
      playerToUse = game.players[playerIndex];
      answerToUse = answerOrPlayerId;
      
      // Auto-check the answer correctness
      const correctAnswer = game.currentQuestion.answer;
      isCorrectToUse = checkAnswerCorrectness(answerToUse, correctAnswer);
      
      // Store the answer in the player's data and in the buzzed player
      game.players[playerIndex].answer = answerToUse;
      if (game.buzzedPlayer && game.buzzedPlayer.id === socket.id) {
        game.buzzedPlayer.answer = answerToUse;
      }
      
      console.log(`Player ${playerToUse.name} submitted answer: "${answerToUse}"`);
      console.log(`Auto-checking: "${answerToUse}" against "${correctAnswer}" - ${isCorrectToUse ? 'CORRECT' : 'INCORRECT'}`);
      
      // Emit to the host for information only (not for judgment)
      io.to(game.hostId || game.host).emit('playerAnswered', {
        player: playerToUse,
        answer: answerToUse,
        correct: isCorrectToUse,
        autoJudged: true
      });
    }
    // Handle legacy format
    else {
      console.error('Invalid submitAnswer parameters');
      return socket.emit('error', { message: 'Invalid parameters for submitAnswer' });
    }
    
    // Update player's score based on the answer
    const questionValue = game.currentQuestion.value;
    const playerIndex = game.players.findIndex(p => p.id === playerToUse.id);
    
    if (isCorrectToUse === true) {
      console.log(`Answer is correct! Adding ${questionValue} to ${playerToUse.name}'s score`);
      
      // Update the player's score in the game state
      game.players[playerIndex].score += questionValue;
      
      // Make sure the score is updated in any other references to the player
      if (game.scores && game.scores[playerToUse.id] !== undefined) {
        game.scores[playerToUse.id] = game.players[playerIndex].score;
      }
      
      // Log the updated score for verification
      console.log(`${playerToUse.name}'s updated score: ${game.players[playerIndex].score}`);
      
      // Set this player as the selecting player for the next question
      game.selectingPlayer = game.players[playerIndex];
      console.log(`${playerToUse.name} will select the next question`);
      
      // Clear the answering timeout
      if (game.answeringTimeout) {
        clearTimeout(game.answeringTimeout);
        game.answeringTimeout = null;
      }
      
      // Emit the answer judged event to all players in the room
      io.to(roomCode).emit('answerJudged', {
        playerId: playerToUse.id,
        playerName: playerToUse.name,
        answer: answerToUse,
        correct: true,
        score: game.players[playerIndex].score,
        selectingPlayerId: playerToUse.id
      });
      
      // Also emit a separate scoreUpdate event to ensure all clients update their score displays
      io.to(roomCode).emit('scoreUpdate', {
        playerId: playerToUse.id,
        playerName: playerToUse.name,
        newScore: game.players[playerIndex].score,
        wasCorrect: true,
        answer: game.currentQuestion.answer
      });
      
      // Mark the question as revealed in the board
      const question = game.currentQuestion;
      game.board[question.category][question.valueIndex].revealed = true;
      
      // Schedule a return to the board after 3 seconds
      setTimeout(() => {
        returnToBoard(roomCode);
      }, 3000);
    } else {
      // For incorrect answers
      console.log(`Answer is incorrect! Deducting ${questionValue} from ${playerToUse.name}'s score`);
      
      // Update the player's score in the game state
      game.players[playerIndex].score -= questionValue;
      
      // Make sure the score is updated in any other references to the player
      if (game.scores && game.scores[playerToUse.id] !== undefined) {
        game.scores[playerToUse.id] = game.players[playerIndex].score;
      }
      
      // Ensure score doesn't go below zero in tournament mode
      if (game.tournamentMode && game.players[playerIndex].score < 0) {
        game.players[playerIndex].score = 0;
      }
      
      console.log(`${playerToUse.name}'s updated score: ${game.players[playerIndex].score}`);
      
      // Emit a separate scoreUpdate event to ensure all clients update their score displays
      io.to(roomCode).emit('scoreUpdate', {
        playerId: playerToUse.id,
        playerName: playerToUse.name,
        newScore: game.players[playerIndex].score,
        wasCorrect: false,
        answer: game.currentQuestion.answer
      });
      
      // Handle incorrect answer (reusing the function but with explicit score update)
      handleIncorrectAnswer(roomCode, playerToUse);
    }
  });
  
  // Host judges answer
  socket.on('judgeAnswer', ({ roomCode, playerId, isCorrect }) => {
    if (!gameStates[roomCode] || gameStates[roomCode].hostId !== socket.id || gameStates[roomCode].host !== socket.id) {
      return;
    }
    
    const currentQuestion = gameStates[roomCode].currentQuestion;
    const player = gameStates[roomCode].players[playerId];
    
    if (!currentQuestion || !player) {
      return;
    }
    
    // Update score
    const pointValue = currentQuestion.value;
    if (isCorrect) {
      player.score += pointValue;
      gameStates[roomCode].scores[playerId] += pointValue;
    } else {
      player.score -= pointValue;
      gameStates[roomCode].scores[playerId] -= pointValue;
    }
    
    // Reset current question state
    gameStates[roomCode].gameState = 'inProgress';
    gameStates[roomCode].currentQuestion = null;
    
    // Send updated scores to everyone
    io.to(roomCode).emit('scoreUpdate', {
      playerId,
      playerName: player.name,
      newScore: player.score,
      wasCorrect: isCorrect,
      answer: currentQuestion.answer
    });
  });
  
  // End game
  socket.on('endGame', ({ roomCode }) => {
    // Check if the user is the host
    if (gameStates[roomCode] && (socket.id === gameStates[roomCode].hostId || socket.id === gameStates[roomCode].host || true)) { // Allow any player to end for debugging
      endGame(roomCode);
    }
  });
  
  // When a host finishes reading a question
  socket.on('hostFinishedReading', (roomCode) => {
    console.log(`Host finished reading question in room ${roomCode}`);
    
    if (!roomCode) {
      console.error('No room code provided');
      return socket.emit('error', { message: 'Room code is required' });
    }
    
    // Convert to uppercase for consistency
    roomCode = roomCode.toUpperCase();
    
    const game = gameStates[roomCode];
    if (!game) {
      console.error(`Game not found for room ${roomCode}`);
      return socket.emit('error', { message: 'Game not found' });
    }
    
    // Check if this is the host
    if (socket.id !== game.hostId && socket.id !== game.host) {
      console.error(`Only the host can signal when reading is finished`);
      return socket.emit('error', { message: 'Only the host can signal when reading is finished' });
    }
    
    // Clear any existing timeout
    if (game.questionTimeout) {
      clearTimeout(game.questionTimeout);
    }
    
    // First, tell all clients buzzer will be enabled soon
    io.to(roomCode).emit('buzzerWillEnable', { roomCode });
    
    // Add a short delay before enabling the buzzer
    setTimeout(() => {
      // Set buzzing to be allowed
      game.canBuzzIn = true;
      
      // Emit event to all players in the room
      io.to(roomCode).emit('buzzerEnabled', {
        roomCode,
        questionId: game.currentQuestion?.text
      });
      
      console.log(`Buzzer enabled for room ${roomCode}`);
      
      // Set a 7-second timeout for the question
      game.questionTimeout = setTimeout(() => {
        // Only handle timeout if no one has buzzed in
        if (!game.buzzedPlayer && gameStates[roomCode]) {
          console.log(`Question timeout for room ${roomCode} - no one buzzed in`);
          
          // Disable buzzing
          game.canBuzzIn = false;
          
          // Mark the question as revealed in the board
          if (game.currentQuestion) {
            const question = game.currentQuestion;
            if (game.board[question.category] && game.board[question.category][question.valueIndex]) {
              game.board[question.category][question.valueIndex].revealed = true;
            }
          }
          
          // Emit timeout event
          io.to(roomCode).emit('timeExpired', {
            question: game.currentQuestion,
            answer: game.currentQuestion.answer,
            fromHost: false
          });
          
          // After 3 seconds, return to the board with the last correct player as the selecting player
          setTimeout(() => {
            returnToBoard(roomCode);
          }, 3000);
        }
      }, 7000);
    }, 500); // 500ms delay allows clients to prepare
  });
  
  // When time expires for a question without any buzzes
  socket.on('timeExpired', (roomCode, options = {}) => {
    console.log(`Time expired for question in room ${roomCode}`);
    
    if (!roomCode) {
      console.error('No room code provided');
      return socket.emit('error', { message: 'Room code is required' });
    }
    
    // Convert to uppercase for consistency
    roomCode = roomCode.toUpperCase();
    
    const game = gameStates[roomCode];
    if (!game) {
      console.error(`Game not found for room ${roomCode}`);
      return socket.emit('error', { message: 'Game not found' });
    }
    
    // Check if the question is active
    if (game.state !== 'questionActive' || !game.currentQuestion) {
      console.error(`No active question for room ${roomCode}`);
      return socket.emit('error', { message: 'No active question' });
    }
    
    // Log the expired question
    console.log(`Time expired for question in room ${roomCode}, no points awarded`);
    
    // Mark the question as revealed in the board
    const question = game.currentQuestion;
    if (game.board[question.category] && game.board[question.category][question.valueIndex]) {
      game.board[question.category][question.valueIndex].revealed = true;
    }
    
    // Emit the correct answer to all players
    io.to(roomCode).emit('timeExpired', {
      question: game.currentQuestion,
      answer: game.currentQuestion.answer,
      fromHost: options.fromHost || false
    });
    
    // After 3 seconds, return to the board
    setTimeout(() => {
      returnToBoard(roomCode);
    }, 3000);
  });
  
  // Handle returning to the board (either after answer or timeout)
  socket.on('returnToBoard', (data) => {
    console.log(`Return to board requested:`, data);
    
    if (!data || !data.roomCode) {
      console.error('No room code provided');
      return socket.emit('error', { message: 'Room code is required' });
    }
    
    // Convert to uppercase for consistency
    const roomCode = data.roomCode.toString().toUpperCase();
    
    const game = gameStates[roomCode];
    if (!game) {
      console.error(`Game not found for room ${roomCode}`);
      return socket.emit('error', { message: 'Game not found' });
    }
    
    // Check for selecting player in data and set it if provided
    if (data.selectingPlayerId) {
      const selectingPlayer = game.players.find(p => p.id === data.selectingPlayerId);
      if (selectingPlayer) {
        game.selectingPlayer = selectingPlayer;
        console.log(`Setting selecting player to ${selectingPlayer.name} from socket request`);
      }
    }
    
    // Call the helper function to handle the rest
    returnToBoard(roomCode);
  });

  // Function to handle incorrect answers
  function handleIncorrectAnswer(roomCode, player) {
    const game = gameStates[roomCode];
    
    if (!game) {
      console.error(`Game not found for room ${roomCode}`);
      return;
    }
    
    console.log(`Player ${player.name} answered incorrectly in room ${roomCode}`);
    
    // Deduct points for incorrect answer
    const currentQuestion = game.currentQuestion;
    if (!currentQuestion) {
      console.error(`No current question for room ${roomCode}`);
      return;
    }
    
    // Cancel the answer timeout
    if (game.answeringTimeout) {
      clearTimeout(game.answeringTimeout);
      game.answeringTimeout = null;
    }
    
    // NOTE: We don't deduct points here because they're already deducted in submitAnswer
    // This prevents double deduction for wrong answers
    
    // Reset the buzzed player to allow others to buzz in
    game.buzzedPlayer = null;
    
    // Re-enable buzzing if there are players who haven't attempted this question
    const playersWhoCanBuzz = game.players.filter(p => 
      !p.isHost && !game.playerAttempts[p.id]
    );
    
    if (playersWhoCanBuzz.length > 0) {
      console.log(`${playersWhoCanBuzz.length} players can still buzz in for this question`);
      game.canBuzzIn = true;
      
      // Emit buzzerReEnabled with simpler approach
      io.to(roomCode).emit('buzzerReEnabled', {
        roomCode,
        questionId: game.currentQuestion.text
      });
      
      // Set a short timeout for remaining players to buzz in
      game.questionTimeout = setTimeout(() => {
        if (gameStates[roomCode] && !gameStates[roomCode].buzzedPlayer) {
          console.log(`No more buzzes, revealing answer in room ${roomCode}`);
          
          // Disable buzzing
          game.canBuzzIn = false;
          
          // Mark the question as revealed in the board
          const question = game.currentQuestion;
          game.board[question.category][question.valueIndex].revealed = true;
          
          // Show the correct answer to all players
          io.to(roomCode).emit('timeExpired', {
            question: game.currentQuestion,
            answer: game.currentQuestion.answer,
            fromHost: false
          });
          
          // After 3 seconds, return to the board
          setTimeout(() => {
            returnToBoard(roomCode);
          }, 3000);
        }
      }, 7000); // 7 seconds for other players to buzz in
    } else {
      // If no one else can buzz in, reveal the answer
      const question = game.currentQuestion;
      game.board[question.category][question.valueIndex].revealed = true;
      
      // Show the correct answer to all players
      io.to(roomCode).emit('timeExpired', {
        question: game.currentQuestion,
        answer: game.currentQuestion.answer,
        fromHost: false
      });
      
      // After 3 seconds, return to the board
      setTimeout(() => {
        returnToBoard(roomCode);
      }, 3000);
    }
  }

  // Helper function to return to the board view
  function returnToBoard(roomCode) {
    console.log(`Helper function: returning to board for room ${roomCode}`);
    
    const game = gameStates[roomCode];
    if (!game) {
      console.error(`Game not found for room ${roomCode}`);
      return;
    }
    
    // Reset the game state for next question
    game.currentQuestion = null;
    game.buzzedPlayer = null;
    game.playerAttempts = {};
    game.state = 'inProgress';
    game.gameState = 'inProgress'; // For backward compatibility
    
    // Clear any timeouts
    if (game.answeringTimeout) {
      clearTimeout(game.answeringTimeout);
      game.answeringTimeout = null;
    }
    if (game.questionTimeout) {
      clearTimeout(game.questionTimeout);
      game.questionTimeout = null;
    }
    
    // If no selecting player is set, use the last player who answered correctly
    // or keep the current one if it exists
    if (!game.selectingPlayer) {
      // Find the last player who answered correctly by looking at scores
      const playersWithPositiveScores = game.players
        .filter(p => !p.isHost && p.score > 0)
        .sort((a, b) => b.score - a.score);
      
      if (playersWithPositiveScores.length > 0) {
        game.selectingPlayer = playersWithPositiveScores[0];
        console.log(`No selecting player, setting to ${game.selectingPlayer.name} based on score`);
      } else {
        // If no one has a positive score, pick a random player
        const nonHostPlayers = game.players.filter(p => !p.isHost);
        if (nonHostPlayers.length > 0) {
          const randomIndex = Math.floor(Math.random() * nonHostPlayers.length);
          game.selectingPlayer = nonHostPlayers[randomIndex];
          console.log(`No players with positive scores, randomly selected ${game.selectingPlayer.name}`);
        }
      }
    }
    
    // Notify all players to return to the board
    io.to(roomCode).emit('returnToBoard', {
      game: {
        ...game,
        players: game.players.filter(p => !p.isHost) // Filter out host from player list
      },
      board: game.board,
      selectingPlayerId: game.selectingPlayer?.id
    });
    
    console.log(`Returned to board for room ${roomCode}, selecting player: ${game.selectingPlayer?.name}`);
    
    // Check if the game is complete (all questions revealed)
    checkGameCompletion(roomCode);
  }

  // Add API endpoint to get available dates
  app.get('/api/jeopardy/dates', async (req, res) => {
    try {
      // Extract year range from query parameters if provided
      const startYear = req.query.startYear ? parseInt(req.query.startYear) : null;
      const endYear = req.query.endYear ? parseInt(req.query.endYear) : null;
      
      let dates;
      
      // If year range is provided, use it to filter dates
      if (startYear && endYear) {
        console.log(`Fetching dates between years ${startYear} and ${endYear}`);
        dates = await jeopardyDB.getDatesByYearRange(startYear, endYear);
      } else {
        dates = await jeopardyDB.getAvailableDates();
      }
      
      // Take a random sample for display (or all dates if less than 100)
      const randomSample = dates.length > 100 
        ? dates.sort(() => 0.5 - Math.random()).slice(0, 100) // Get 100 random dates
        : dates;
      
      res.json({
        success: true,
        dates: randomSample,
        total: dates.length
      });
    } catch (error) {
      console.error('Error getting Jeopardy dates:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get Jeopardy dates',
        error: error.message
      });
    }
  });

  // Add endpoint to get a specific date's game
  app.get('/api/jeopardy/game/:date', async (req, res) => {
    try {
      const { date } = req.params;
      const game = await jeopardyDB.loadGameByDate(date);
      
      res.json({
        success: true,
        game
      });
    } catch (error) {
      console.error(`Error getting Jeopardy game for date ${req.params.date}:`, error);
      res.status(500).json({
        success: false,
        message: 'Failed to get Jeopardy game',
        error: error.message
      });
    }
  });

  // Add a function to advance to the next round
  function advanceToNextRound(roomCode) {
    const game = gameStates[roomCode];
    if (!game) return false;
    
    // Determine next round
    let nextRound = null;
    switch (game.currentRound) {
      case GAME_ROUNDS.SINGLE_JEOPARDY:
        nextRound = GAME_ROUNDS.DOUBLE_JEOPARDY;
        game.roundsCompleted.push(GAME_ROUNDS.SINGLE_JEOPARDY);
        break;
      case GAME_ROUNDS.DOUBLE_JEOPARDY:
        nextRound = GAME_ROUNDS.FINAL_JEOPARDY;
        game.roundsCompleted.push(GAME_ROUNDS.DOUBLE_JEOPARDY);
        break;
      case GAME_ROUNDS.FINAL_JEOPARDY:
        nextRound = GAME_ROUNDS.GAME_OVER;
        game.roundsCompleted.push(GAME_ROUNDS.FINAL_JEOPARDY);
        break;
      default:
        return false;
    }
    
    game.currentRound = nextRound;
    
    // Set up the next round
    switch (nextRound) {
      case GAME_ROUNDS.DOUBLE_JEOPARDY:
        setupDoubleJeopardy(roomCode);
        break;
      case GAME_ROUNDS.FINAL_JEOPARDY:
        setupFinalJeopardy(roomCode);
        break;
      case GAME_ROUNDS.GAME_OVER:
        endGame(roomCode);
        break;
    }
    
    return true;
  }

  // Setup for Double Jeopardy round
  function setupDoubleJeopardy(roomCode) {
    const game = gameStates[roomCode];
    if (!game || !game.jeopardyData || !game.jeopardyData.round2) return false;
    
    // Get Double Jeopardy data
    const doubleJeopardyData = game.jeopardyData.round2;
    const categories = doubleJeopardyData.categories.slice(0, 6); // Limit to 6 categories
    
    // Create the board
    const board = {};
    categories.forEach(category => {
      if (doubleJeopardyData.board[category]) {
        // In Double Jeopardy, values are doubled
        board[category] = doubleJeopardyData.board[category].slice(0, 5).map(q => ({
          ...q,
          value: q.value * 2, // Double the values
          revealed: false
        }));
      }
    });
    
    // Update game
    game.categories = categories;
    game.board = board;
    game.currentQuestion = null;
    game.buzzedPlayer = null;
    game.state = 'inProgress';
    game.gameState = 'inProgress';
    
    // Start with the player who has the lowest score (if tied, pick random among them)
    const players = game.players.filter(p => !p.isHost);
    if (players.length > 0) {
      // Group by score
      const scoreGroups = {};
      players.forEach(p => {
        if (!scoreGroups[p.score]) scoreGroups[p.score] = [];
        scoreGroups[p.score].push(p);
      });
      
      // Get the lowest score
      const scores = Object.keys(scoreGroups).map(Number).sort((a, b) => a - b);
      const lowestScore = scores[0];
      const lowestScorePlayers = scoreGroups[lowestScore];
      
      // Pick random player from lowest score group
      const randomIndex = Math.floor(Math.random() * lowestScorePlayers.length);
      game.selectingPlayer = lowestScorePlayers[randomIndex];
    }
    
    // Notify all players about the round change
    io.to(roomCode).emit('roundChanged', {
      round: GAME_ROUNDS.DOUBLE_JEOPARDY,
      game: {
        ...game,
        players: game.players.filter(p => !p.isHost)
      },
      categories,
      board,
      selectingPlayerId: game.selectingPlayer?.id,
      message: "Double Jeopardy! All clue values are doubled!"
    });
    
    return true;
  }

  // Setup for Final Jeopardy round
  function setupFinalJeopardy(roomCode) {
    const game = gameStates[roomCode];
    if (!game || !game.jeopardyData || !game.jeopardyData.finalJeopardy) return false;
    
    // Get the Final Jeopardy data
    const finalJeopardy = game.jeopardyData.finalJeopardy;
    
    // Change game state
    game.currentRound = GAME_ROUNDS.FINAL_JEOPARDY;
    game.state = 'finalJeopardy';
    game.gameState = 'finalJeopardy';
    game.finalJeopardy = {
      category: finalJeopardy.category,
      question: finalJeopardy.text,
      answer: finalJeopardy.answer,
      wagers: {},
      answers: {},
      revealed: false
    };
    
    // Only players with positive scores can participate
    const eligiblePlayers = game.players.filter(p => !p.isHost && p.score > 0);
    game.finalJeopardyPlayers = eligiblePlayers.map(p => p.id);
    
    // Notify all players about Final Jeopardy
    io.to(roomCode).emit('finalJeopardy', {
      category: finalJeopardy.category,
      eligiblePlayers: game.finalJeopardyPlayers,
      message: "Final Jeopardy! Only players with positive scores can participate."
    });
    
    return true;
  }

  // Add event handler for Final Jeopardy wagers
  socket.on('finalJeopardyWager', (data) => {
    console.log('Final Jeopardy wager received:', data);
    
    // Check if this is a valid request
    const { roomCode, wager } = data;
    if (!roomCode || wager === undefined) {
      return socket.emit('error', { message: 'Room code and wager are required' });
    }
    
    // Validate room and player
    const game = gameStates[roomCode];
    if (!game) {
      return socket.emit('error', { message: 'Game not found' });
    }
    
    if (!game.finalJeopardyPlayers || !game.finalJeopardyPlayers.includes(socket.id)) {
      return socket.emit('error', { message: 'You are not eligible for Final Jeopardy' });
    }
    
    const playerIndex = game.players.findIndex(p => p.id === socket.id);
    if (playerIndex === -1) {
      return socket.emit('error', { message: 'Player not found in game' });
    }
    
    // Validate wager amount (0 to player's current score)
    const player = game.players[playerIndex];
    const wagerAmount = parseInt(wager);
    if (isNaN(wagerAmount) || wagerAmount < 0 || wagerAmount > player.score) {
      return socket.emit('error', { message: `Wager must be between 0 and ${player.score}` });
    }
    
    // Record the wager
    game.finalJeopardy.wagers[socket.id] = wagerAmount;
    
    // Check if all players have wagered
    const allWagered = game.finalJeopardyPlayers.every(id => game.finalJeopardy.wagers[id] !== undefined);
    
    if (allWagered) {
      // Proceed to showing the question
      io.to(roomCode).emit('finalJeopardyQuestion', {
        question: game.finalJeopardy.question
      });
    } else {
      // Notify about this player's wager
      socket.emit('wagerReceived', { message: `Your wager of $${wagerAmount} has been received.` });
      
      // Notify the host about the wager
      io.to(game.hostId).emit('playerWagered', {
        playerId: socket.id,
        playerName: player.name
      });
    }
  });

  // Add event handler for Final Jeopardy answers
  socket.on('finalJeopardyAnswer', (data) => {
    console.log('Final Jeopardy answer received:', data);
    
    // Check if this is a valid request
    const { roomCode, answer } = data;
    if (!roomCode || !answer) {
      return socket.emit('error', { message: 'Room code and answer are required' });
    }
    
    // Validate room and player
    const game = gameStates[roomCode];
    if (!game) {
      return socket.emit('error', { message: 'Game not found' });
    }
    
    if (!game.finalJeopardyPlayers || !game.finalJeopardyPlayers.includes(socket.id)) {
      return socket.emit('error', { message: 'You are not eligible for Final Jeopardy' });
    }
    
    const playerIndex = game.players.findIndex(p => p.id === socket.id);
    if (playerIndex === -1) {
      return socket.emit('error', { message: 'Player not found in game' });
    }
    
    // Record the answer
    game.finalJeopardy.answers[socket.id] = answer;
    
    // Check if all players have answered
    const allAnswered = game.finalJeopardyPlayers.every(id => game.finalJeopardy.answers[id] !== undefined);
    
    if (allAnswered) {
      // Notify the host that all answers are in
      io.to(game.hostId).emit('allFinalAnswersReceived');
    } else {
      // Notify about this player's answer
      socket.emit('answerReceived', { message: `Your answer has been received.` });
      
      // Notify the host about the answer
      io.to(game.hostId).emit('playerAnswered', {
        playerId: socket.id,
        playerName: game.players[playerIndex].name
      });
    }
  });

  // Add event handler for judging Final Jeopardy answers
  socket.on('judgeFinalAnswer', (data) => {
    console.log('Judging Final Jeopardy answer:', data);
    
    // Check if this is a valid request
    const { roomCode, playerId, correct } = data;
    if (!roomCode || !playerId || correct === undefined) {
      return socket.emit('error', { message: 'Room code, player ID, and judgment are required' });
    }
    
    // Validate room and judge
    const game = gameStates[roomCode];
    if (!game) {
      return socket.emit('error', { message: 'Game not found' });
    }
    
    if (socket.id !== game.hostId && socket.id !== game.host) {
      return socket.emit('error', { message: 'Only the host can judge answers' });
    }
    
    const playerIndex = game.players.findIndex(p => p.id === playerId);
    if (playerIndex === -1) {
      return socket.emit('error', { message: 'Player not found in game' });
    }
    
    // Update player's score based on wager
    const player = game.players[playerIndex];
    const wager = game.finalJeopardy.wagers[playerId] || 0;
    
    if (correct) {
      player.score += wager;
    } else {
      player.score -= wager;
    }
    
    // Track which players have been judged
    if (!game.finalJeopardy.judged) {
      game.finalJeopardy.judged = [];
    }
    game.finalJeopardy.judged.push(playerId);
    
    // Notify all players about the judgment
    io.to(roomCode).emit('finalAnswerJudged', {
      playerId,
      playerName: player.name,
      correct,
      wager,
      score: player.score,
      answer: game.finalJeopardy.answers[playerId]
    });
    
    // Check if all answers have been judged
    const allJudged = game.finalJeopardyPlayers.every(id => game.finalJeopardy.judged.includes(id));
    
    if (allJudged) {
      // Reveal the correct answer if not already revealed
      if (!game.finalJeopardy.revealed) {
        game.finalJeopardy.revealed = true;
        io.to(roomCode).emit('finalAnswerRevealed', {
          answer: game.finalJeopardy.answer
        });
      }
      
      // End the game after 5 seconds
      setTimeout(() => {
        endGame(roomCode);
      }, 5000);
    }
  });

  // Add function to check if all questions in the board are revealed
  function areAllQuestionsRevealed(board) {
    for (const category in board) {
      for (const question of board[category]) {
        if (!question.revealed) {
          return false;
        }
      }
    }
    return true;
  }

  // Update the checkGameCompletion function to handle multiple rounds
  function checkGameCompletion(roomCode) {
    const game = gameStates[roomCode];
    if (!game) return;
    
    // Check if all questions in the current board are revealed
    if (areAllQuestionsRevealed(game.board)) {
      console.log(`All questions revealed in room ${roomCode} for round ${game.currentRound}`);
      
      // Advance to the next round
      advanceToNextRound(roomCode);
    }
  }

  // Add specific end game function
  function endGame(roomCode) {
    const game = gameStates[roomCode];
    if (!game) return;
    
    game.currentRound = GAME_ROUNDS.GAME_OVER;
    game.state = 'gameOver';
    game.gameState = 'gameOver';
    
    // Sort players by score
    const sortedPlayers = [...game.players]
      .filter(p => !p.isHost)
      .sort((a, b) => b.score - a.score);
    
    // Determine winner
    const winner = sortedPlayers.length > 0 ? sortedPlayers[0] : null;
    
    // Notify all players about the game ending
    io.to(roomCode).emit('gameOver', {
      players: sortedPlayers,
      winner: winner ? {
        id: winner.id,
        name: winner.name,
        score: winner.score
      } : null
    });
    
    // Keep game state for a while, then clean up
    setTimeout(() => {
      if (gameStates[roomCode]) {
        console.log(`Cleaning up game ${roomCode}`);
        delete gameStates[roomCode];
      }
    }, 60 * 60 * 1000); // 1 hour
  }
});

// Ensure dataset is loaded at startup
initializeDataset().then(() => {
  console.log('Dataset loaded successfully, ready to serve game questions');
}).catch(err => {
  console.error('FATAL ERROR: Failed to load dataset:', err);
  process.exit(1); // Exit if unable to load dataset
});

// Start the server
const PORT = process.env.PORT || 5005;
server.listen(PORT, () => {
  const isDev = process.env.NODE_ENV !== 'production';
  console.log(`Jeoparty Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
  
  if (isDev) {
    console.log('');
    console.log('=========================================================');
    console.log('🎮 Jeoparty Development Server');
    console.log('=========================================================');
    console.log('');
    console.log('🔗 API URLs:');
    console.log(`   • Local:            http://localhost:${PORT}/api`);
    console.log(`   • On Your Network:  http://${getLocalIp()}:${PORT}/api`);
    console.log('');
    console.log('🌐 Access the game:');
    console.log(`   • Host (Desktop):   http://localhost:3001/`);
    console.log(`   • Player (Mobile):  http://${getLocalIp()}:3001/`);
    console.log('');
    console.log('📊 Test API Status:');
    console.log(`   • curl http://localhost:${PORT}/api/status`);
    console.log('');
    console.log('⚠️  Make sure both server and client are running:');
    console.log('   • Server: npm run dev:server');
    console.log('   • Client: npm run dev:client');
    console.log('   • Or both: npm run dev');
    console.log('=========================================================');
  }
});

// Helper function to get local IP for developer convenience
function getLocalIp() {
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      // Skip internal and non-IPv4 addresses
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost'; // Fallback to localhost
}

// Add a dedicated test endpoint
app.post('/test-endpoint', (req, res) => {
  console.log('TEST ENDPOINT CALLED:', req.body);
  res.json({
    success: true,
    message: 'Test endpoint working',
    receivedData: req.body
  });
});