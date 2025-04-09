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

// Function to set up the game board for a specific game
async function setupGameBoard(roomCode) {
  const gameState = gameStates[roomCode];
  
  if (!gameState) {
    console.error(`Game state not found for room ${roomCode}`);
    throw new Error(`Game state not found for room ${roomCode}`);
  }
  
  try {
    console.log(`Setting up game board for room ${roomCode}...`);
    
    // Get all available categories - always use in-memory dataset
    const allCategories = getCategories();
    
    if (!allCategories || allCategories.length === 0) {
      console.error(`No categories available in dataset. Ensure the dataset is properly loaded.`);
      throw new Error(`No categories available in dataset. Ensure the dataset is properly loaded.`);
    }
    
    console.log(`Found ${allCategories.length} total categories in dataset`);
    
    // Optional filtering by year range
    let filteredCategories = allCategories;
    if (gameState.yearRange && gameState.yearRange.start && gameState.yearRange.end) {
      // Filter in-memory dataset by year range
      const startYear = parseInt(gameState.yearRange.start);
      const endYear = parseInt(gameState.yearRange.end);
      
      console.log(`Filtering questions by year range: ${startYear}-${endYear}`);
      
      // Get filtered questions by year range
      const filteredQuestions = getQuestionsByYearRange(startYear, endYear);
      console.log(`Found ${filteredQuestions.length} questions in year range ${startYear}-${endYear}`);
      
      // Extract unique categories from filtered dataset
      const uniqueCategories = new Set();
      filteredQuestions.forEach(q => uniqueCategories.add(q.category));
      filteredCategories = Array.from(uniqueCategories).map(category => ({ category }));
      
      console.log(`Found ${filteredCategories.length} unique categories in year range ${startYear}-${endYear}`);
    }
    
    if (filteredCategories.length < 6) {
      console.warn(`Warning: Only found ${filteredCategories.length} categories after filtering, which is less than the 6 required.`);
      console.warn(`Using unfiltered categories to ensure enough content.`);
      filteredCategories = allCategories;
    }
    
    // Randomly select 6 categories
    const shuffledCategories = filteredCategories.sort(() => 0.5 - Math.random());
    const selectedCategories = shuffledCategories.slice(0, 6);
    
    // Store selected categories
    gameState.categories = selectedCategories.map(c => c.category || c);
    
    console.log(`Selected 6 categories for game board:`, gameState.categories);
    
    // Initialize board with empty questions
    gameState.board = {};
    
    // Populate board with questions for each category
    for (const category of gameState.categories) {
      // Get questions from in-memory dataset
      let categoryQuestions = getQuestionsByCategory(category);
      
      if (!categoryQuestions || categoryQuestions.length === 0) {
        console.warn(`No questions found for category "${category}". Creating placeholder questions.`);
        categoryQuestions = [];
      } else {
        console.log(`Found ${categoryQuestions.length} questions for category "${category}"`);
      }
      
      // Apply year range filter if needed
      if (gameState.yearRange && gameState.yearRange.start && gameState.yearRange.end) {
        const startYear = parseInt(gameState.yearRange.start);
        const endYear = parseInt(gameState.yearRange.end);
        
        categoryQuestions = categoryQuestions.filter(q => {
          if (!q.air_date) return false;
          const year = new Date(q.air_date).getFullYear();
          return year >= startYear && year <= endYear;
        });
        
        console.log(`After year filtering: ${categoryQuestions.length} questions for category "${category}"`);
      }
      
      // Filter by round
      categoryQuestions = categoryQuestions.filter(q => q.round === gameState.round);
      console.log(`After round filtering: ${categoryQuestions.length} questions for round ${gameState.round} in category "${category}"`);
      
      // Sort by value and select 5 questions (or fewer if not enough available)
      categoryQuestions.sort((a, b) => a.clue_value - b.clue_value);
      
      // If not enough questions, we'll need to adapt
      gameState.board[category] = [];
      
      // Add questions to the board
      for (let i = 0; i < 5; i++) {
        const value = gameState.round === 1 ? (i + 1) * 200 : (i + 1) * 400;
        
        // Find a suitable question with appropriate value
        const suitableQuestions = categoryQuestions.filter(q => 
          q.clue_value === value || (q.clue_value === 0 && q.round === gameState.round)
        );
        
        if (suitableQuestions.length > 0) {
          // Randomly select one question
          const question = suitableQuestions[Math.floor(Math.random() * suitableQuestions.length)];
          
          // Mark one random question as a daily double
          const isDaily = 
            (gameState.round === 1 && Math.random() < 0.05 && !gameState.board.dailyDouble) ||
            (gameState.round === 2 && Math.random() < 0.1 && gameState.board.dailyDoubleCount < 2);
          
          if (isDaily) {
            if (gameState.round === 1) {
              gameState.board.dailyDouble = `${category}-${value}`;
            } else {
              if (!gameState.board.dailyDoubleCount) gameState.board.dailyDoubleCount = 0;
              gameState.board.dailyDoubleCount++;
              
              if (gameState.board.dailyDouble) {
                gameState.board.dailyDouble2 = `${category}-${value}`;
              } else {
                gameState.board.dailyDouble = `${category}-${value}`;
              }
            }
          }
          
          gameState.board[category].push({
            id: question.id,
            value,
            question: question.answer, // Question is actually the clue shown to players
            answer: question.question, // Answer is what players must respond with
            revealed: false,
            isDaily
          });
        } else {
          // If no suitable question, create an empty slot
          console.warn(`No suitable question found for value $${value} in category "${category}". Creating placeholder.`);
          gameState.board[category].push({
            id: null,
            value,
            question: "No question available",
            answer: "No answer available",
            revealed: true, // Mark as revealed so it can't be selected
            isDaily: false
          });
        }
      }
    }
    
    console.log(`Game board created for room ${roomCode} with categories:`, gameState.categories);
  } catch (error) {
    console.error('Error setting up game board:', error);
    throw error; // Propagate error to caller
  }
}

// Create a new game session
app.post('/api/games', async (req, res) => {
  try {
    console.log('POST /api/games - Creating new game:', req.body);
    const { hostName, yearRange } = req.body;
    // Generate a unique 4-character room code
    const roomCode = Math.floor(1000 + Math.random() * 9000).toString();
    
    // Create a new game state
    gameStates[roomCode] = {
      roomCode,
      hostId: null,
      hostName,
      players: [],
      currentState: 'waiting',
      board: null,
      categories: [],
      selectedQuestion: null,
      round: 1,
      yearRange,
      scores: {},
      activePlayer: null,
      buzzerEnabled: false,
      buzzedPlayers: [],
      dailyDoubleWager: 0,
      usedQuestions: [],
      isInMemoryMode: true  // Always use in-memory mode
    };
    
    // Create a randomly selected set of categories and questions for this game
    try {
      await setupGameBoard(roomCode);
      console.log(`Game board successfully created for room ${roomCode}`);
    } catch (setupError) {
      console.error(`Error setting up game board for room ${roomCode}:`, setupError);
      return res.status(500).json({ error: `Failed to setup game board: ${setupError.message}` });
    }
    
    console.log(`Game successfully created with room code ${roomCode}`);
    res.json({
      roomCode,
      gameState: gameStates[roomCode]
    });
  } catch (error) {
    console.error('Error creating game:', error);
    res.status(500).json({ 
      error: 'Failed to create game', 
      details: error.message,
      stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
    });
  }
});

// Add compatibility endpoint for /api/games/create
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
    
    console.log(`POST /api/games/create - Creating game with name: ${nameToUse}`);
    
    // Create a new game state
    const roomCode = Math.floor(1000 + Math.random() * 9000).toString();
    
    gameStates[roomCode] = {
      roomCode,
      hostId: `api-${Date.now()}`,
      hostName: nameToUse,
      players: [{
        id: `api-${Date.now()}`,
        name: nameToUse,
        score: 0,
        isHost: true
      }],
      currentState: 'waiting',
      gameState: 'waiting',
      board: null,
      categories: [],
      selectedQuestion: null,
      round: 1,
      yearRange: yearRange || { start: 1984, end: 2024 },
      gameDate,
      scores: {},
      activePlayer: null,
      buzzerEnabled: false,
      buzzedPlayers: [],
      dailyDoubleWager: 0,
      usedQuestions: [],
      isInMemoryMode: true
    };
    
    // Create a randomly selected set of categories and questions for this game
    try {
      await setupGameBoard(roomCode);
      console.log(`Game board successfully created for room ${roomCode}`);
    } catch (setupError) {
      console.error(`Error setting up game board for room ${roomCode}:`, setupError);
      return res.status(500).json({
        success: false, 
        error: `Failed to setup game board: ${setupError.message}` 
      });
    }
    
    console.log(`Game successfully created with room code ${roomCode}`);
    res.json({
      success: true,
      roomCode,
      hostUrl: `/game/host/${roomCode}`,
      playerUrl: `/game/player/${roomCode}`,
      game: gameStates[roomCode]
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

// Socket.io connection handler
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);
  
  // Handle disconnections
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    
    // Find the game where this player is a host
    const hostedGame = Object.values(gameStates).find(game => 
      game.hostId === socket.id || game.host === socket.id
    );
    
    if (hostedGame) {
      console.log(`Host disconnected from game ${hostedGame.roomCode}`);
      
      // Notify all players that the host has disconnected
      io.to(hostedGame.roomCode).emit('hostDisconnected');
      
      // Keep the game alive for a while in case host reconnects
      // Set a timer to clean up the game after 5 minutes
      setTimeout(() => {
        if (gameStates[hostedGame.roomCode] && 
            (!gameStates[hostedGame.roomCode].host || 
             !io.sockets.sockets.get(gameStates[hostedGame.roomCode].host))) {
          console.log(`Game ${hostedGame.roomCode} removed after host timeout`);
          delete gameStates[hostedGame.roomCode];
        }
      }, 5 * 60 * 1000);
    } else {
      // Check if this player was in any games and mark them as disconnected
      Object.values(gameStates).forEach(game => {
        const playerIndex = game.players.findIndex(p => p.id === socket.id);
        
        if (playerIndex !== -1) {
          console.log(`Player ${game.players[playerIndex].name} disconnected from game ${game.roomCode}`);
          
          // Mark player as disconnected but don't remove them
          game.players[playerIndex].connected = false;
          
          // If this player was the buzzed player, update game state
          if (game.buzzedPlayer && game.buzzedPlayer.id === socket.id) {
            console.log(`Disconnected player was the buzzed player, handling as incorrect answer`);
            
            // Handle as if they answered incorrectly
            if (game.answeringTimeout) {
              clearTimeout(game.answeringTimeout);
              game.answeringTimeout = null;
            }
            
            // Re-enable buzzing for other players after a short delay
            setTimeout(() => {
              if (gameStates[game.roomCode]) {
                game.buzzedPlayer = null;
                io.to(game.roomCode).emit('buzzerReEnabled');
              }
            }, 1000);
          }
          
          // If this player was the selecting player, pick a new one
          if (game.selectingPlayer && game.selectingPlayer.id === socket.id) {
            console.log(`Disconnected player was the selecting player, picking a new one`);
            
            // Find a new player that's still connected
            const connectedPlayers = game.players.filter(p => p.connected && !p.isHost);
            if (connectedPlayers.length > 0) {
              // Pick the player with the highest score
              connectedPlayers.sort((a, b) => b.score - a.score);
              game.selectingPlayer = connectedPlayers[0];
              
              // Notify room of new selecting player
              io.to(game.roomCode).emit('newSelectingPlayer', {
                playerId: game.selectingPlayer.id,
                playerName: game.selectingPlayer.name
              });
            }
          }
          
          // Notify host and other players
          io.to(game.roomCode).emit('playerDisconnected', {
            playerId: socket.id,
            playerName: game.players[playerIndex].name
          });
        }
      });
    }
  });
  
  // Handle creating a new game
  socket.on('createGame', async (data) => {
    console.log('Create game request received:', data);
    
    try {
      // Handle both string and object parameters
      let playerName;
      let roomCode;
      let yearRange;
      
      if (typeof data === 'string') {
        playerName = data;
        console.log('createGame: received string parameter:', playerName);
      } else if (typeof data === 'object') {
        if (data.playerName) {
          playerName = data.playerName;
          console.log('createGame: received object parameter with playerName:', playerName);
        }
        
        if (data.roomCode) {
          roomCode = data.roomCode.toUpperCase();
          console.log('createGame: received roomCode in parameter:', roomCode);
        }
        
        if (data.yearRange) {
          yearRange = data.yearRange;
          console.log('createGame: received yearRange parameter:', yearRange);
        }
      }
      
      if (!playerName) {
        playerName = 'Host';
        console.log('createGame: using default playerName:', playerName);
      }
      
      if (!yearRange) {
        yearRange = { start: 1984, end: 2024 };
        console.log('createGame: using default yearRange:', yearRange);
      }
      
      // Generate a room code if not provided, or check if the provided one exists
      if (!roomCode) {
        roomCode = generateRoomCode();
        console.log(`createGame: generated room code: ${roomCode}`);
      } else {
        // If room exists, check if we can take it over
        if (gameStates[roomCode]) {
          console.log(`createGame: room ${roomCode} already exists`);
          
          // Check if the host is disconnected
          const game = gameStates[roomCode];
          const hostSocketId = game.hostId || game.host;
          
          // If we have a socket id for the host, check if they're still connected
          if (hostSocketId) {
            const hostSocket = io.sockets.sockets.get(hostSocketId);
            
            if (hostSocket && hostSocket.connected) {
              console.log(`createGame: room ${roomCode} already has connected host ${hostSocketId}`);
              socket.emit('error', { message: `Room ${roomCode} already exists and has a host` });
              return;
            }
          }
          
          console.log(`createGame: taking over room ${roomCode} as new host`);
        }
      }
      
      // Extract game date if provided
      const gameDate = typeof data === 'object' && data.gameDate ? data.gameDate : null;
      
      // Get a random date from the specified year range
      const gameDateTime = gameDate || jeopardyDB.getRandomDate(yearRange);
      
      console.log(`createGame: creating game with date ${gameDateTime}`);
      
      // Initialize game with current round
      const game = {
        roomCode: roomCode,
        host: socket.id,
        hostId: socket.id, // Keep both for backward compatibility  
        players: [{
          id: socket.id,
          name: playerName,
          score: 0,
          isHost: true
        }],
        state: 'waiting',
        gameState: 'waiting', // For backward compatibility
        currentRound: GAME_ROUNDS.SINGLE_JEOPARDY, // Start with Single Jeopardy
        roundsCompleted: [],
        selectingPlayer: null,
        currentQuestion: null,
        startTime: Date.now(),
        canBuzzIn: false,
        earlyBuzzPenalties: {},
        playerAttempts: {},
        answeringTimeout: null,
        questionTimeout: null,
        gameDate: gameDateTime, // Use provided date, random date from year range, or overall random date
        yearRange: yearRange, // Store year range for reference
      };
      
      // Store the game
      gameStates[roomCode] = game;
      
      // Join the socket to the room
      socket.join(roomCode);
      socket.roomCode = roomCode;
      socket.playerName = playerName;
      
      console.log(`Game created by ${playerName} with room code ${roomCode}`);
      
      // Load game data from Jeopardy dataset if needed
      try {
        // Create the game board by setting up categories and questions
        await setupGameBoard(roomCode);
        console.log(`Game board successfully created for room ${roomCode}`);
      } catch (setupError) {
        console.error(`Error setting up game board for room ${roomCode}:`, setupError);
        
        // Notify the client about the error but don't terminate
        socket.emit('error', { 
          message: `Game created but failed to setup board: ${setupError.message}`,
          gameCreated: true
        });
      }
      
      // Prepare response
      const response = { 
        roomCode,
        hostName: playerName,
        success: true,
        game: {
          roomCode,
          hostId: socket.id,
          hostName: playerName,
          gameState: 'waiting',
          players: gameStates[roomCode].players
        }
      };
      
      console.log('Emitting gameCreated event with response:', response);
      
      // Send the room code back to the host
      socket.emit('gameCreated', response);
    } catch (error) {
      console.error('Error in createGame socket handler:', error);
      socket.emit('error', { 
        message: `Failed to create game: ${error.message}`, 
        stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined 
      });
    }
  });
  
  // Handle joining a game
  socket.on('joinGame', (data) => {
    try {
      // Check if we have the necessary data
      if (!data || !data.roomCode || !data.playerName) {
        console.error('Invalid join data:', data);
        return socket.emit('error', { message: 'Invalid join data' });
      }
      
      const roomCode = data.roomCode.toUpperCase();
      const playerName = data.playerName.trim();
      
      console.log(`Player ${playerName} attempting to join room ${roomCode}`);
      
      // Check if the game exists
      if (!gameStates[roomCode]) {
        console.log(`Game with room code ${roomCode} not found`);
        return socket.emit('gameNotFound');
      }
      
      const game = gameStates[roomCode];
      
      // Check if game is already in progress and not allowing new players
      if (game.gameState !== 'waiting' && !isPlayerRejoining(game, socket.id, playerName)) {
        console.log(`Game ${roomCode} is already in progress and not accepting new players`);
        return socket.emit('error', { message: 'Game is already in progress' });
      }
      
      // Check if a player with this name already exists
      const existingPlayerIndex = game.players.findIndex(p => 
        p.name.toLowerCase() === playerName.toLowerCase()
      );
      
      if (existingPlayerIndex !== -1) {
        // If this is a reconnection, update the player's socket ID
        if (!game.players[existingPlayerIndex].connected) {
          console.log(`Player ${playerName} is reconnecting to game ${roomCode}`);
          
          // Update socket ID and connection status
          game.players[existingPlayerIndex].id = socket.id;
          game.players[existingPlayerIndex].connected = true;
          
          // If this player was the buzzed player, update the reference
          if (game.buzzedPlayer && game.buzzedPlayer.name === playerName) {
            game.buzzedPlayer = game.players[existingPlayerIndex];
          }
          
          // If this player was the selecting player, update the reference
          if (game.selectingPlayer && game.selectingPlayer.name === playerName) {
            game.selectingPlayer = game.players[existingPlayerIndex];
          }
        } else {
          console.log(`Player name ${playerName} is already taken in game ${roomCode}`);
          
          // Check if the player with this name is actually disconnected but not marked as such
          const existingPlayer = game.players[existingPlayerIndex];
          const existingSocketId = existingPlayer.id;
          const existingSocket = io.sockets.sockets.get(existingSocketId);
          
          if (!existingSocket || !existingSocket.connected) {
            console.log(`Player ${playerName} appears to be disconnected but not marked as such. Allowing rejoin.`);
            
            // Force update the player's connection status and socket ID
            existingPlayer.id = socket.id;
            existingPlayer.connected = true;
            
            // Update references if needed
            if (game.buzzedPlayer && game.buzzedPlayer.name === playerName) {
              game.buzzedPlayer = existingPlayer;
            }
            if (game.selectingPlayer && game.selectingPlayer.name === playerName) {
              game.selectingPlayer = existingPlayer;
            }
          } else {
            // The player is truly connected - reject the new connection
            return socket.emit('error', { message: 'Player name already taken' });
          }
        }
      } else {
        // Add the new player to the game
        const newPlayer = {
          id: socket.id,
          name: playerName,
          score: 0,
          connected: true,
          isHost: false
        };
        
        game.players.push(newPlayer);
        console.log(`Player ${playerName} joined game ${roomCode}`);
      }
      
      // Join the socket to the room
      socket.join(roomCode);
      socket.roomCode = roomCode;
      socket.playerName = playerName;
      
      // Get player data from the game state
      const playerData = game.players.find(p => p.id === socket.id);
      
      // Emit event to the client that they've joined
      socket.emit('gameJoined', {
        roomCode,
        gameState: game.gameState || game.state, // Handle both property names
        players: game.players.filter(p => !p.isHost), // Filter out host from player list
        player: playerData,
        categories: game.categories,
        board: game.board,
        score: playerData ? playerData.score : 0
      });
      
      // If the game is in progress, send current question if there is one
      if ((game.gameState === 'questionActive' || game.state === 'questionActive') && game.currentQuestion) {
        socket.emit('questionSelected', {
          question: game.currentQuestion
        });
        
        // If player is already buzzed in, send that info
        if (game.buzzedPlayer && game.buzzedPlayer.id === socket.id) {
          socket.emit('playerBuzzed', {
            player: game.buzzedPlayer
          });
        }
      }
      
      // Notify host and other players that a new player joined
      io.to(game.hostId || game.host).emit('playerJoined', {
        player: playerData,
        players: game.players.filter(p => !p.isHost) // Filter out host from player list
      });
      
      // Also notify other players
      socket.to(roomCode).emit('playerJoined', {
        player: playerData,
        players: game.players.filter(p => !p.isHost) // Filter out host from player list
      });
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
    
    // Convert to uppercase for consistency
    roomCode = roomCode.toString().toUpperCase();
    
    if (!gameStates[roomCode]) {
      console.log('Invalid startGame: game not found');
      socket.emit('error', { message: 'Game not found' });
      return;
    }
    
    const game = gameStates[roomCode];
    
    // Only the host can start the game
    if (socket.id !== game.hostId && socket.id !== game.host) {
      console.log(`Invalid startGame: not the host (${socket.id} vs ${game.hostId || game.host})`);
      socket.emit('error', { message: 'Only the host can start the game' });
      return;
    }
    
    // Check if game is already in progress
    if (game.state !== 'waiting' && game.gameState !== 'waiting') {
      console.log(`Invalid startGame: game already started (${game.state || game.gameState})`);
      socket.emit('error', { message: 'Game already started' });
      return;
    }
    
    // Load game data from Jeopardy dataset
    try {
      // Load full game data for this date
      const jeopardyGameData = await jeopardyDB.loadGameByDate(game.gameDate);
      
      // Store the full game data for later rounds
      game.jeopardyData = jeopardyGameData;
      
      // Set current round data (Single Jeopardy)
      const currentRoundData = jeopardyGameData.round1;
      const categories = currentRoundData.categories.slice(0, 6); // Limit to 6 categories
      
      // Create the board
      const board = {};
      categories.forEach(category => {
        if (currentRoundData.board[category]) {
          board[category] = currentRoundData.board[category].slice(0, 5); // Limit to 5 questions per category
        }
      });
      
      // Set the game properties
      game.categories = categories;
      game.board = board;
      game.state = 'inProgress';
      game.gameState = 'inProgress'; // For backward compatibility
      
      // Pick a random player to start
      const nonHostPlayers = game.players.filter(p => !p.isHost);
      if (nonHostPlayers.length > 0) {
        const randomIndex = Math.floor(Math.random() * nonHostPlayers.length);
        game.selectingPlayer = nonHostPlayers[randomIndex];
      }
      
      // Notify all players that the game has started
      io.to(roomCode).emit('gameStarted', {
        game: {
          ...game,
          players: game.players.filter(p => !p.isHost) // Filter out host from player list
        },
        categories,
        board,
        selectingPlayerId: game.selectingPlayer?.id
      });
      
      console.log(`Game in room ${roomCode} started with ${categories.length} categories`);
    } catch (error) {
      console.error(`Error starting game in room ${roomCode}:`, error);
      socket.emit('error', { message: `Failed to start game: ${error.message}` });
    }
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
    } else {
      // Handle object format (backward compatibility)
      roomCode = roomCodeOrData.roomCode;
      categoryIndex = roomCodeOrData.categoryIndex;
      valueIndex = roomCodeOrData.valueIndex;
    }
    
    // Convert to uppercase for consistency
    roomCode = roomCode.toString().toUpperCase();
    
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
    
    // Get selected category and check if valueIndex is valid
    const categories = game.categories;
    if (categoryIndex < 0 || categoryIndex >= categories.length) {
      console.log(`Invalid categoryIndex: ${categoryIndex}`);
      socket.emit('error', { message: 'Invalid category index' });
      return;
    }
    
    const category = categories[categoryIndex];
    const board = game.board;
    
    // Check if the category exists in the board
    if (!board[category]) {
      console.log(`Category ${category} not found in board`);
      socket.emit('error', { message: 'Category not found in board' });
      return;
    }
    
    // Check if the value index is valid
    if (valueIndex < 0 || valueIndex >= board[category].length) {
      console.log(`Invalid valueIndex: ${valueIndex} for category ${category}`);
      socket.emit('error', { message: 'Invalid value index' });
      return;
    }
    
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
    
    // Apply sanitization to the question text before sending to clients
    const questionText = sanitizeClue(question.text || question.question);
    const questionAnswer = question.answer;
    
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
    console.log(`Question selected by ${player ? player.name : 'host'}: ${category} for $${question.value}`);
    
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
      
      // Check if the game exists
      if (!gameStates[roomCode]) {
        console.log(`Game with room code ${roomCode} not found`);
        return socket.emit('gameNotFound');
      }
      
      const game = gameStates[roomCode];
      
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
      
      // If this player was the buzzed player, update the reference
      if (game.buzzedPlayer && game.buzzedPlayer.name === playerName) {
        game.buzzedPlayer = player;
      }
      
      // If this player was the selecting player, update the reference
      if (game.selectingPlayer && game.selectingPlayer.name === playerName) {
        game.selectingPlayer = player;
      }
      
      // Join the socket to the room
      socket.join(roomCode);
      socket.roomCode = roomCode;
      socket.playerName = playerName;
      
      // Emit event to the client that they've rejoined
      socket.emit('gameJoined', {
        roomCode,
        gameState: game.gameState || game.state,
        players: game.players.filter(p => !p.isHost), // Filter out host from player list
        player: player,
        categories: game.categories,
        board: game.board,
        score: player.score
      });
      
      // If the game is in progress, send current question if there is one
      if ((game.gameState === 'questionActive' || game.state === 'questionActive') && game.currentQuestion) {
        socket.emit('questionSelected', {
          question: game.currentQuestion
        });
        
        // If player is already buzzed in, send that info
        if (game.buzzedPlayer && game.buzzedPlayer.id === socket.id) {
          socket.emit('playerBuzzed', {
            player: game.buzzedPlayer
          });
        }
      }
      
      // Notify host and other players that a player has rejoined
      io.to(game.hostId || game.host).emit('playerRejoined', {
        player: player,
        players: game.players.filter(p => !p.isHost) // Filter out host from player list
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
    if (socket.id === game.hostId && socket.id === game.host && typeof answerOrPlayerId === 'string' && answer !== undefined && isCorrect !== undefined) {
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
      game.players[playerIndex].score += questionValue;
      
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
      
      // Mark the question as revealed in the board
      const question = game.currentQuestion;
      game.board[question.category][question.valueIndex].revealed = true;
      
      // Schedule a return to the board after 3 seconds
      setTimeout(() => {
        returnToBoard(roomCode);
      }, 3000);
    } else {
      // Handle incorrect answer (reusing the same function)
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
            answer: game.currentQuestion.answer
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
  socket.on('timeExpired', (roomCode) => {
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
      answer: game.currentQuestion.answer
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
    
    // Deduct points based on question value
    const deduction = currentQuestion.value;
    const playerIndex = game.players.findIndex(p => p.id === player.id);
    
    if (playerIndex !== -1) {
      game.players[playerIndex].score -= deduction;
      
      // Ensure score doesn't go below zero in tournament mode
      if (game.tournamentMode && game.players[playerIndex].score < 0) {
        game.players[playerIndex].score = 0;
      }
      
      console.log(`Player ${player.name} score updated to ${game.players[playerIndex].score}`);
    }
    
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
            answer: game.currentQuestion.answer
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
        answer: game.currentQuestion.answer
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

// Make sure the games/create endpoint is also registered (as a fallback)
app.post('/games/create', async (req, res) => {
  console.log('POST /games/create - Request received:', req.body);
  // Forward to the API endpoint
  try {
    // Get the hostName
    const { hostName, playerName, yearRange, gameDate } = req.body;
    
    // Check if we have a valid name parameter
    const nameToUse = hostName || playerName;
    
    if (!nameToUse) {
      console.error('POST /games/create - Missing required name parameter. Request body:', req.body);
      return res.status(400).json({ 
        error: 'Host name or player name is required',
        requestBody: req.body 
      });
    }
    
    console.log(`POST /games/create - Creating game with name: ${nameToUse}`);
    
    // Create a new game state
    const roomCode = Math.floor(1000 + Math.random() * 9000).toString();
    
    gameStates[roomCode] = {
      roomCode,
      hostId: null,
      hostName: nameToUse,
      players: [],
      currentState: 'waiting',
      board: null,
      categories: [],
      selectedQuestion: null,
      round: 1,
      yearRange: yearRange || { start: 1984, end: 2024 },
      gameDate,
      scores: {},
      activePlayer: null,
      buzzerEnabled: false,
      buzzedPlayers: [],
      dailyDoubleWager: 0,
      usedQuestions: [],
      isInMemoryMode: true
    };
    
    // Create a randomly selected set of categories and questions for this game
    try {
      await setupGameBoard(roomCode);
      console.log(`Game board successfully created for room ${roomCode}`);
    } catch (setupError) {
      console.error(`Error setting up game board for room ${roomCode}:`, setupError);
      return res.status(500).json({ error: `Failed to setup game board: ${setupError.message}` });
    }
    
    console.log(`Game successfully created with room code ${roomCode}`);
    res.json({
      success: true,
      roomCode,
      gameState: gameStates[roomCode]
    });
  } catch (error) {
    console.error('Error in /games/create endpoint:', error);
    res.status(500).json({ 
      error: 'Failed to create game', 
      details: error.message,
      stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined
    });
  }
});