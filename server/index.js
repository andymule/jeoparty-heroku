const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');

// Load database module
const { pool, initializeDB } = require('./db');

dotenv.config();

// Initialize Express app
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Log all incoming HTTP requests for debugging
app.use((req, res, next) => {
  console.log(`HTTP ${req.method} ${req.url}`, req.body);
  next();
});

// Serve static files if in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/build')));
}

// Create HTTP server and socket.io instance
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' ? '*' : 'http://localhost:3000',
    methods: ['GET', 'POST']
  }
});

// Game state
const games = {};

// Socket.io connection handler
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);
  
  // Handle disconnections
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    
    // Find the game where this player is a host
    const hostedGame = Object.values(games).find(game => 
      game.hostId === socket.id
    );
    
    if (hostedGame) {
      console.log(`Host disconnected from game ${hostedGame.roomCode}`);
      
      // Notify all players that the host has disconnected
      io.to(hostedGame.roomCode).emit('hostDisconnected');
      
      // Remove the game
      delete games[hostedGame.roomCode];
      
      console.log(`Game ${hostedGame.roomCode} removed due to host disconnect`);
    } else {
      // Check if this player was in any games and mark them as disconnected
      Object.values(games).forEach(game => {
        const playerIndex = game.players.findIndex(p => p.id === socket.id);
        
        if (playerIndex !== -1) {
          console.log(`Player ${game.players[playerIndex].name} disconnected from game ${game.roomCode}`);
          
          // Mark player as disconnected but don't remove them
          game.players[playerIndex].connected = false;
          
          // Notify host
          io.to(game.hostId).emit('playerDisconnected', {
            playerId: socket.id,
            playerName: game.players[playerIndex].name
          });
        }
      });
    }
  });
  
  // Handle creating a new game
  socket.on('createGame', (data) => {
    try {
      console.log('createGame event received:', { data, socketId: socket.id });
      
      // Handle both string and object parameters
      let playerName;
      let roomCode;
      
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
      }
      
      if (!playerName) {
        playerName = 'Host';
        console.log('createGame: using default playerName:', playerName);
      }
      
      // Generate a room code if not provided, or check if the provided one exists
      if (!roomCode) {
        roomCode = generateRoomCode();
        console.log(`createGame: generated room code: ${roomCode}`);
      } else {
        // If room exists, check if we can take it over
        if (games[roomCode]) {
          console.log(`createGame: room ${roomCode} already exists`);
          
          // Check if the host is disconnected
          const game = games[roomCode];
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
      
      // Set up the initial game state
      games[roomCode] = {
        roomCode,
        hostId: socket.id,
        host: socket.id, // For backward compatibility
        hostName: playerName,
        players: [{
          id: socket.id,
          name: playerName,
          score: 0,
          isHost: true,
          connected: true
        }],
        categories: [],
        board: {},
        gameState: 'waiting',
        state: 'waiting', // For backward compatibility
        buzzedPlayer: null,
        selectingPlayer: null,
        currentQuestion: null,
        startTime: Date.now()
      };
      
      // Join the socket to the room
      socket.join(roomCode);
      socket.roomCode = roomCode;
      socket.playerName = playerName;
      
      console.log(`Game created by ${playerName} with room code ${roomCode}`);
      
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
          players: games[roomCode].players
        }
      };
      
      console.log('Emitting gameCreated event with response:', response);
      
      // Send the room code back to the host
      socket.emit('gameCreated', response);
    } catch (error) {
      console.error('Error creating game:', error);
      socket.emit('error', { message: 'Failed to create game: ' + error.message });
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
      if (!games[roomCode]) {
        console.log(`Game with room code ${roomCode} not found`);
        return socket.emit('gameNotFound');
      }
      
      const game = games[roomCode];
      
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
          if (game.buzzedPlayer && game.buzzedPlayer.id === game.players[existingPlayerIndex].id) {
            game.buzzedPlayer = game.players[existingPlayerIndex];
          }
          
          // If this player was the selecting player, update the reference
          if (game.selectingPlayer && game.selectingPlayer.id === game.players[existingPlayerIndex].id) {
            game.selectingPlayer = game.players[existingPlayerIndex];
          }
        } else {
          console.log(`Player name ${playerName} is already taken in game ${roomCode}`);
          return socket.emit('error', { message: 'Player name already taken' });
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
      socket.emit('error', { message: 'Failed to join game' });
    }
  });
  
  // Handle player buzz
  socket.on('buzz', (roomCode) => {
    if (!roomCode) {
      console.error('No room code provided for buzz');
      return socket.emit('error', { message: 'Room code is required' });
    }
    
    // Convert to uppercase for consistency
    roomCode = roomCode.toUpperCase();
    
    const game = games[roomCode];
    if (!game) {
      console.error(`Game not found for room ${roomCode}`);
      return socket.emit('error', { message: 'Game not found' });
    }
    
    // Check state using both state and gameState for compatibility
    const gameIsInQuestionState = game.state === 'questionActive' || game.gameState === 'questionActive';
    
    if (!gameIsInQuestionState || !game.currentQuestion) {
      console.error(`No active question or game not in question state for room ${roomCode}`);
      return socket.emit('error', { message: 'No active question' });
    }
    
    if (game.buzzedPlayer) {
      console.error(`Another player already buzzed in for room ${roomCode}`);
      return socket.emit('error', { message: 'Another player already buzzed in' });
    }
    
    // Find the player
    const playerIndex = game.players.findIndex(p => p.id === socket.id);
    if (playerIndex === -1) {
      console.error(`Player not found in game ${roomCode}`);
      return socket.emit('error', { message: 'Player not found in game' });
    }
    
    const player = game.players[playerIndex];
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
    
    // Set as the buzzed player - store the whole player object
    game.buzzedPlayer = player;
    
    // Emit event to all players in the room
    io.to(roomCode).emit('playerBuzzed', {
      player: player,
      playerId: player.id,
      playerName: player.name
    });
    
    // Backward compatibility
    io.to(roomCode).emit('player-buzzed', {
      id: player.id,
      name: player.name
    });
  });
  
  // Log all incoming events for debugging
  const originalOnEvent = socket.onevent;
  socket.onevent = function(packet) {
    const args = packet.data || [];
    console.log(`[SOCKET EVENT] ${socket.id} emitted '${args[0]}'`, args.slice(1));
    originalOnEvent.call(this, packet);
  };
  
  // When a host starts the game
  socket.on('startGame', (roomCodeOrData) => {
    console.log(`Start game request for room:`, roomCodeOrData);
    
    let roomCode;
    
    // Handle both function signatures
    if (typeof roomCodeOrData === 'string') {
      roomCode = roomCodeOrData;
    } else if (typeof roomCodeOrData === 'object' && roomCodeOrData.roomCode) {
      roomCode = roomCodeOrData.roomCode;
    } else {
      console.error('Invalid startGame parameters');
      socket.emit('error', { message: 'Invalid parameters for startGame' });
      return;
    }
    
    // Convert to uppercase for consistency
    roomCode = roomCode.toString().toUpperCase();
    
    if (!games[roomCode]) {
      console.log('Invalid startGame: game not found');
      socket.emit('error', { message: 'Game not found' });
      return;
    }
    
    const game = games[roomCode];
    
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
    
    // Get random categories and generate the game board
    getRandomCategories()
      .then(categories => {
        game.categories = categories;
        
        return generateBoard(categories);
      })
      .then(board => {
        game.board = board;
        
        // Update game state consistently
        game.state = 'inProgress';
        game.gameState = 'inProgress'; // For backward compatibility
        
        // Select a random player to choose the first question
        if (game.players.length > 0) {
          // Filter out the host from player selection
          const nonHostPlayers = game.players.filter(player => !player.isHost);
          
          if (nonHostPlayers.length > 0) {
            const randomIndex = Math.floor(Math.random() * nonHostPlayers.length);
            const randomPlayer = nonHostPlayers[randomIndex];
            game.selectingPlayer = randomPlayer;
            console.log(`Random player ${randomPlayer.name} selected to choose first question`);
          } else {
            console.log('No non-host players available to select first question');
          }
        }
        
        // Emit to all players
        io.to(roomCode).emit('gameStarted', {
          game: {
            ...game,
            players: game.players.filter(p => !p.isHost) // Filter out host from player list
          },
          gameState: game.state,
          categories: game.categories,
          board: game.board,
          selectingPlayerId: game.selectingPlayer ? game.selectingPlayer.id : null
        });
        
        console.log(`Game ${roomCode} started with ${game.players.filter(p => !p.isHost).length} players and ${game.categories.length} categories`);
      })
      .catch(error => {
        console.error('Error starting game:', error);
        socket.emit('error', { message: 'Failed to start game' });
      });
  });
  
  // When a question is selected
  socket.on('selectQuestion', (roomCodeOrData, categoryIndexParam, valueIndexParam) => {
    console.log(`selectQuestion called with:`, { roomCodeOrData, categoryIndexParam, valueIndexParam });
    
    let roomCode, categoryIndex, valueIndex;
    
    // Handle both function signatures
    if (typeof roomCodeOrData === 'string') {
      // New format: (roomCode, categoryIndex, valueIndex)
      roomCode = roomCodeOrData;
      categoryIndex = categoryIndexParam;
      valueIndex = valueIndexParam;
    } else if (typeof roomCodeOrData === 'object') {
      // Legacy format: { roomCode, categoryIndex, valueIndex }
      roomCode = roomCodeOrData.roomCode;
      categoryIndex = roomCodeOrData.categoryIndex;
      valueIndex = roomCodeOrData.valueIndex;
    } else {
      console.error('Invalid selectQuestion parameters');
      socket.emit('error', { message: 'Invalid parameters for selectQuestion' });
      return;
    }
    
    // Validate input
    if (!roomCode) {
      console.error('No room code provided for selectQuestion');
      socket.emit('error', { message: 'Room code is required' });
      return;
    }
    
    // Convert to uppercase for consistency
    roomCode = roomCode.toString().toUpperCase();
    
    if (!games[roomCode]) {
      console.log('Invalid selectQuestion: game not found');
      socket.emit('error', { message: 'Game not found' });
      return;
    }
    
    // Get game and check state
    const game = games[roomCode];
    
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
    
    // Check if question is already revealed
    if (board[category][valueIndex].revealed) {
      console.log('Question already revealed');
      socket.emit('error', { message: 'Question already revealed' });
      return;
    }
    
    // Get question details
    const question = board[category][valueIndex];
    
    // Set current question
    game.currentQuestion = {
      category,
      categoryIndex,
      valueIndex,
      text: question.text,
      value: question.value,
      answer: question.answer
    };
    
    // Update game state
    game.state = 'questionActive';
    game.gameState = 'questionActive'; // For backward compatibility
    game.buzzedPlayer = null;
    game.canBuzzIn = false; // Initially buzzing is not allowed
    game.earlyBuzzPenalties = {}; // Track players who buzzed in early
    
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
      if (games[roomCode] && games[roomCode].currentQuestion) {
        games[roomCode].canBuzzIn = true;
        io.to(roomCode).emit('buzzerEnabled', {
          roomCode,
          questionId: games[roomCode].currentQuestion.text
        });
        console.log(`Buzzer enabled for room ${roomCode}`);
      }
    }, 5000); // 5 seconds matches the typical time for host to read the question
    
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
      if (!games[roomCode]) {
        console.log(`Game with room code ${roomCode} not found`);
        return socket.emit('gameNotFound');
      }
      
      const game = games[roomCode];
      
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
    
    const game = games[roomCode];
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
    } else {
      console.log(`Answer is incorrect! Subtracting ${questionValue} from ${playerToUse.name}'s score`);
      game.players[playerIndex].score -= questionValue;
    }
    
    // Emit the answer judged event to all players in the room
    io.to(roomCode).emit('answerJudged', {
      playerId: playerToUse.id,
      playerName: playerToUse.name,
      answer: answerToUse,
      correct: isCorrectToUse,
      score: game.players[playerIndex].score,
      selectingPlayerId: isCorrectToUse ? playerToUse.id : null
    });
    
    // If the answer is correct, schedule a return to the board after 3 seconds
    if (isCorrectToUse) {
      setTimeout(() => {
        // Mark the question as revealed in the board
        const question = game.currentQuestion;
        game.board[question.category][question.valueIndex].revealed = true;
        
        // Reset the current question and update game state
        game.currentQuestion = null;
        game.buzzedPlayer = null;
        game.state = 'inProgress';
        game.gameState = 'inProgress'; // For backward compatibility
        
        // Notify all players to return to the board
        io.to(roomCode).emit('returnToBoard', {
          game: game,
          selectingPlayerId: game.selectingPlayer?.id
        });
        
        console.log(`Game ${roomCode} returned to board. ${playerToUse.name} will select the next question.`);
      }, 3000);
    }
  });
  
  // Host judges answer
  socket.on('judgeAnswer', ({ roomCode, playerId, isCorrect }) => {
    if (!games[roomCode] || games[roomCode].hostId !== socket.id || games[roomCode].host !== socket.id) {
      return;
    }
    
    const currentQuestion = games[roomCode].currentQuestion;
    const player = games[roomCode].players[playerId];
    
    if (!currentQuestion || !player) {
      return;
    }
    
    // Update score
    const pointValue = currentQuestion.value;
    if (isCorrect) {
      player.score += pointValue;
      games[roomCode].scores[playerId] += pointValue;
    } else {
      player.score -= pointValue;
      games[roomCode].scores[playerId] -= pointValue;
    }
    
    // Reset current question state
    games[roomCode].gameState = 'inProgress';
    games[roomCode].currentQuestion = null;
    
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
    if (games[roomCode] && (socket.id === games[roomCode].hostId || socket.id === games[roomCode].host || true)) { // Allow any player to end for debugging
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
    
    const game = games[roomCode];
    if (!game) {
      console.error(`Game not found for room ${roomCode}`);
      return socket.emit('error', { message: 'Game not found' });
    }
    
    // Check if this is the host
    if (socket.id !== game.hostId && socket.id !== game.host) {
      console.error(`Only the host can signal when reading is finished`);
      return socket.emit('error', { message: 'Only the host can signal when reading is finished' });
    }
    
    // Set buzzing to be allowed
    game.canBuzzIn = true;
    
    // Emit event to all players in the room
    io.to(roomCode).emit('buzzerEnabled', {
      roomCode,
      questionId: game.currentQuestion?.text
    });
    
    console.log(`Buzzer enabled for room ${roomCode}`);
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
    
    const game = games[roomCode];
    if (!game) {
      console.error(`Game not found for room ${roomCode}`);
      return socket.emit('error', { message: 'Game not found' });
    }
    
    // Check if this is the host
    if (socket.id !== game.hostId && socket.id !== game.host) {
      console.error(`Only the host can signal when time has expired`);
      return socket.emit('error', { message: 'Only the host can signal when time has expired' });
    }
    
    // Check if there's an active question
    if (!game.currentQuestion) {
      console.error(`No active question for room ${roomCode}`);
      return socket.emit('error', { message: 'No active question' });
    }
    
    // Disable buzzing
    game.canBuzzIn = false;
    
    // Mark the question as revealed in the board
    const question = game.currentQuestion;
    if (game.board[question.category] && game.board[question.category][question.valueIndex]) {
      game.board[question.category][question.valueIndex].revealed = true;
    }
    
    // Emit to all players that time expired
    io.to(roomCode).emit('timeExpired', {
      question: game.currentQuestion
    });
    
    console.log(`Time expired for question in room ${roomCode}, no points awarded`);
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
    
    const game = games[roomCode];
    if (!game) {
      console.error(`Game not found for room ${roomCode}`);
      return socket.emit('error', { message: 'Game not found' });
    }
    
    // Reset the game state for next question
    game.currentQuestion = null;
    game.buzzedPlayer = null;
    game.state = 'inProgress';
    game.gameState = 'inProgress'; // For backward compatibility
    
    // Check for selecting player in data
    if (data.selectingPlayerId) {
      const selectingPlayer = game.players.find(p => p.id === data.selectingPlayerId);
      if (selectingPlayer) {
        game.selectingPlayer = selectingPlayer;
        console.log(`${selectingPlayer.name} will select the next question`);
      }
    }
    
    // Notify all players to return to the board
    io.to(roomCode).emit('returnToBoard', {
      game: game,
      board: game.board,
      selectingPlayerId: game.selectingPlayer?.id
    });
    
    console.log(`Returned to board for room ${roomCode}`);
    
    // Check if the game is complete (all questions revealed)
    checkGameCompletion(roomCode);
  });
});

// Helper functions
const generateRoomCode = () => {
  const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  
  for (let i = 0; i < 4; i++) {
    code += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  
  // Ensure no duplicate room codes
  return games[code] ? generateRoomCode() : code;
};

// Mock data for when database is not available
const mockCategories = [
  'History', 'Science', 'Geography', 'Entertainment', 'Sports', 'Literature'
];

const mockQuestions = {
  'History': [
    { question: 'Who was the first U.S. President?', answer: 'George Washington' },
    { question: 'In what year did World War II end?', answer: '1945' },
    { question: 'Who wrote the Declaration of Independence?', answer: 'Thomas Jefferson' },
    { question: 'What ancient civilization built the pyramids?', answer: 'Egyptians' },
    { question: 'Who was the first woman to fly solo across the Atlantic?', answer: 'Amelia Earhart' }
  ],
  'Science': [
    { question: 'What is the chemical symbol for gold?', answer: 'Au' },
    { question: 'What planet is known as the Red Planet?', answer: 'Mars' },
    { question: 'What is the hardest natural substance on Earth?', answer: 'Diamond' },
    { question: 'What is the largest organ in the human body?', answer: 'Skin' },
    { question: 'What gas do plants absorb from the atmosphere?', answer: 'Carbon dioxide' }
  ],
  'Geography': [
    { question: 'What is the capital of Japan?', answer: 'Tokyo' },
    { question: 'What is the largest country by land area?', answer: 'Russia' },
    { question: 'What is the longest river in the world?', answer: 'Nile' },
    { question: 'What is the largest ocean on Earth?', answer: 'Pacific Ocean' },
    { question: 'What country is known as the Land of a Thousand Lakes?', answer: 'Finland' }
  ],
  'Entertainment': [
    { question: 'Who played Iron Man in the Marvel Cinematic Universe?', answer: 'Robert Downey Jr.' },
    { question: 'What is the highest-grossing film of all time?', answer: 'Avatar' },
    { question: 'Who is the lead singer of the band U2?', answer: 'Bono' },
    { question: 'What was the first feature-length animated movie?', answer: 'Snow White and the Seven Dwarfs' },
    { question: 'Which artist painted the Mona Lisa?', answer: 'Leonardo da Vinci' }
  ],
  'Sports': [
    { question: 'What country won the FIFA World Cup in 2018?', answer: 'France' },
    { question: 'How many players are on a standard soccer team?', answer: '11' },
    { question: 'Who has won the most Grand Slam tennis tournaments?', answer: 'Novak Djokovic' },
    { question: 'In what sport would you perform a slam dunk?', answer: 'Basketball' },
    { question: 'How many rings are on the Olympic flag?', answer: '5' }
  ],
  'Literature': [
    { question: 'Who wrote "Romeo and Juliet"?', answer: 'William Shakespeare' },
    { question: 'What is the first book in the Harry Potter series?', answer: 'Harry Potter and the Philosopher\'s Stone' },
    { question: 'Who wrote "To Kill a Mockingbird"?', answer: 'Harper Lee' },
    { question: 'What is the name of the lion in "The Chronicles of Narnia"?', answer: 'Aslan' },
    { question: 'Who created Sherlock Holmes?', answer: 'Arthur Conan Doyle' }
  ]
};

const getRandomCategories = async () => {
  try {
    const result = await pool.query(
      'SELECT DISTINCT category FROM questions ORDER BY random() LIMIT 6'
    );
    return result.rows.map(row => row.category);
  } catch (error) {
    console.error('Error fetching random categories:', error);
    console.log('Using mock categories instead...');
    return mockCategories;
  }
};

const generateBoard = async (categories) => {
  const board = {};
  const questionValues = [200, 400, 600, 800, 1000];
  
  try {
    for (const category of categories) {
      board[category] = [];
      
      try {
        const result = await pool.query(
          'SELECT * FROM questions WHERE category = $1 ORDER BY random() LIMIT 5',
          [category]
        );
        
        // Map questions to value slots
        result.rows.forEach((row, index) => {
          board[category].push({
            text: row.answer, // In Jeopardy, "answer" is the clue shown to contestants
            answer: row.question, // "question" is what contestants must respond with
            value: questionValues[index],
            revealed: false
          });
        });
      } catch (error) {
        console.error(`Error fetching questions for ${category}, using mock data instead:`, error);
        
        // Use mock data for this category
        if (mockQuestions[category]) {
          mockQuestions[category].forEach((q, index) => {
            board[category].push({
              text: q.question,
              answer: q.answer,
              value: questionValues[index],
              revealed: false
            });
          });
        } else {
          // If we don't have mock data for this specific category, generate generic questions
          for (let i = 0; i < 5; i++) {
            board[category].push({
              text: `${category} question for $${questionValues[i]}`,
              answer: `Answer to ${category} for $${questionValues[i]}`,
              value: questionValues[i],
              revealed: false
            });
          }
        }
      }
    }
    
    return board;
  } catch (error) {
    console.error('Error generating board:', error);
    
    // Fallback to completely mock board
    const mockBoard = {};
    for (const category of categories) {
      mockBoard[category] = [];
      
      if (mockQuestions[category]) {
        mockQuestions[category].forEach((q, index) => {
          mockBoard[category].push({
            text: q.question,
            answer: q.answer,
            value: questionValues[index],
            revealed: false
          });
        });
      } else {
        for (let i = 0; i < 5; i++) {
          mockBoard[category].push({
            text: `${category} question for $${questionValues[i]}`,
            answer: `Answer to ${category} for $${questionValues[i]}`,
            value: questionValues[i],
            revealed: false
          });
        }
      }
    }
    
    return mockBoard;
  }
};

// API Routes
app.get('/api/categories', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT DISTINCT category FROM questions ORDER BY category'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// API endpoint to create a game (for direct testing)
app.post('/api/games/create', (req, res) => {
  try {
    console.log('REST API: Create game request received', {
      contentType: req.headers['content-type'],
      body: req.body,
      method: req.method,
      url: req.url
    });
    
    // Validate that we have a body and it's properly parsed
    if (!req.body) {
      console.error('REST API: Missing request body');
      return res.status(400).json({
        success: false,
        error: 'Missing request body'
      });
    }
    
    // Validate content-type
    if (!req.is('application/json')) {
      console.error('REST API: Content-Type must be application/json, got', req.headers['content-type']);
      return res.status(400).json({
        success: false,
        error: 'Content-Type must be application/json'
      });
    }
    
    // Validate input
    const playerName = req.body?.playerName || 'APIHost';
    
    // Generate a room code or use existing one if provided
    const providedRoomCode = req.body?.roomCode?.toUpperCase();
    let roomCode;
    
    if (providedRoomCode) {
      // Check if room exists and if we can take it over
      if (games[providedRoomCode]) {
        console.log(`REST API: Room ${providedRoomCode} already exists, checking if we can take it over`);
        
        const game = games[providedRoomCode];
        const hostId = game.hostId || game.host;
        
        // Check if host is still connected
        if (hostId) {
          const hostSocket = io.sockets.sockets.get(hostId);
          if (hostSocket && hostSocket.connected) {
            return res.status(400).json({
              success: false,
              error: `Room ${providedRoomCode} already exists and has a host`
            });
          }
        }
        
        // Can take over the room
        roomCode = providedRoomCode;
        console.log(`REST API: Taking over room ${roomCode}`);
      } else {
        // Room doesn't exist, can use the provided code
        roomCode = providedRoomCode;
      }
    } else {
      // Generate a new room code
      roomCode = generateRoomCode();
    }
    
    // Create game state with a unique host ID
    const hostId = 'api-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
    
    games[roomCode] = {
      roomCode,
      hostId: hostId,
      host: hostId, // For backward compatibility
      hostName: playerName,
      players: [{
        id: hostId,
        name: playerName,
        score: 0,
        isHost: true,
        connected: true
      }],
      categories: [],
      board: {},
      gameState: 'waiting',
      state: 'waiting', // For backward compatibility
      buzzedPlayer: null,
      selectingPlayer: null,
      currentQuestion: null,
      startTime: Date.now()
    };
    
    console.log(`REST API: Game created with room code ${roomCode}`);
    
    // Prepare response
    const response = {
      success: true, 
      roomCode,
      hostUrl: `/game/host/${roomCode}`,
      playerUrl: `/game/player/${roomCode}`,
      game: {
        roomCode,
        hostId,
        hostName: playerName,
        players: games[roomCode].players,
        gameState: 'waiting'
      }
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

// API endpoint to list all active games (for debugging)
app.get('/api/games', (req, res) => {
  try {
    const gamesList = Object.keys(games).map(roomCode => ({
      roomCode,
      hostName: games[roomCode].hostName,
      playerCount: games[roomCode].players?.length || 0,
      state: games[roomCode].gameState || games[roomCode].state,
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

// Handle React routing in production
app.get('*', (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    res.sendFile(path.join(__dirname, '../client/build/index.html'));
  } else {
    res.status(404).send('Not found');
  }
});

const PORT = process.env.PORT || 5000;

// Initialize database before starting the server
initializeDB()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });

// Helper function to check answer correctness with some flexibility
function checkAnswerCorrectness(playerAnswer, correctAnswer) {
  // Exact match
  if (playerAnswer === correctAnswer) return true;
  
  // Check if player answer contains correct answer
  if (correctAnswer.length > 5 && playerAnswer.includes(correctAnswer)) return true;
  
  // Check if correct answer contains player answer (if player answer is substantial)
  if (playerAnswer.length > 5 && correctAnswer.includes(playerAnswer)) return true;
  
  // Levenshtein distance for similar answers
  if (playerAnswer.length > 3 && correctAnswer.length > 3) {
    const distance = levenshteinDistance(playerAnswer, correctAnswer);
    const maxLength = Math.max(playerAnswer.length, correctAnswer.length);
    // Allow some difference based on the length of the answer
    if (distance <= Math.min(3, Math.floor(maxLength / 3))) return true;
  }
  
  return false;
}

// Levenshtein distance calculation for fuzzy matching
function levenshteinDistance(a, b) {
  const matrix = [];
  
  // Initialize matrix
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  
  // Fill in the rest of the matrix
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  
  return matrix[b.length][a.length];
}

// Check if all questions have been answered
function checkGameCompletion(roomCode) {
  const game = games[roomCode];
  if (!game) return;
  
  let allRevealed = true;
  
  // Check if all questions have been revealed
  Object.keys(game.board).forEach(category => {
    game.board[category].forEach(question => {
      if (!question.revealed) {
        allRevealed = false;
      }
    });
  });
  
  // If all questions are revealed, end the game
  if (allRevealed) {
    console.log(`All questions revealed for game ${roomCode}. Ending game.`);
    endGame(roomCode);
  }
}

// Function to end a game and calculate final results
function endGame(roomCode) {
  const game = games[roomCode];
  if (!game) return;
  
  // Sort players by score
  const sortedPlayers = [...game.players].sort((a, b) => b.score - a.score);
  
  // Add rank to players
  const rankedPlayers = sortedPlayers.map((player, index) => ({
    ...player,
    rank: index + 1
  }));
  
  // Emit game ended event
  io.to(roomCode).emit('gameEnded', {
    gameState: 'completed',
    finalResults: rankedPlayers
  });
  
  // For backward compatibility
  io.to(roomCode).emit('game-ended', {
    gameState: 'completed',
    finalResults: rankedPlayers
  });
  
  // Log completion
  console.log(`Game ${roomCode} ended. Winner: ${rankedPlayers[0]?.name || 'No players'}`);
  
  // Delete the game after a delay
  setTimeout(() => {
    console.log(`Cleaning up game ${roomCode}`);
    delete games[roomCode];
  }, 60 * 60 * 1000); // Keep game data for 1 hour before cleaning up
}

// Helper function to check if a player is rejoining
function isPlayerRejoining(game, socketId, playerName) {
  return game.players.some(p => 
    p.name.toLowerCase() === playerName.toLowerCase() && !p.connected
  );
} 