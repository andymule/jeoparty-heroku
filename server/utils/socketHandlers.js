const { v4: uuidv4 } = require('uuid');
const gameLogic = require('./gameLogic');
const answerChecker = require('./answerChecker');

// In-memory store for active games
const activeGames = new Map();

// Helper to get active player count
function getActivePlayerCount() {
  let count = 0;
  activeGames.forEach(game => {
    count += game.players.length;
  });
  return count;
}

// Initialize socket handlers
function initializeSocketHandlers(io) {
  // Handle socket.io connections
  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);
    
    // Debug listener for easier troubleshooting
    socket.on('debug', (message) => {
      console.log(`DEBUG from ${socket.id}: ${JSON.stringify(message)}`);
      socket.emit('debug_response', { received: message, timestamp: Date.now() });
    });

    // Handle disconnections
    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id}`);
      handlePlayerDisconnect(socket);
    });

    // Create a new game
    socket.on('createGame', (data) => {
      try {
        const playerName = data?.playerName || 'Host';
        const roomCode = data?.roomCode;
        const yearStart = data?.yearStart || null;
        const yearEnd = data?.yearEnd || null;

        console.log(`Creating game for ${playerName} with room code ${roomCode}, year range: ${yearStart}-${yearEnd}`);
        
        handleCreateGame(socket, playerName, roomCode, yearStart, yearEnd)
          .then(game => {
            console.log(`Game created successfully for room ${game?.roomCode || 'unknown'}`);
          })
          .catch(error => {
            console.error(`Failed to create game: ${error.message}`);
            socket.emit('error', { message: `Failed to create game: ${error.message}` });
          });
      } catch (error) {
        console.error('Error in createGame handler:', error);
        socket.emit('error', { message: 'Failed to create game: ' + error.message });
      }
    });

    // Join an existing game
    socket.on('joinGame', (data) => {
      try {
        const playerName = data?.playerName;
        const roomCode = data?.roomCode;

        if (!playerName || !roomCode) {
          return socket.emit('error', { message: 'Player name and room code are required' });
        }

        console.log(`Player ${playerName} joining game ${roomCode}`);
        handleJoinGame(socket, playerName, roomCode);
      } catch (error) {
        console.error('Error in joinGame handler:', error);
        socket.emit('error', { message: 'Failed to join game' });
      }
    });

    // Start the game
    socket.on('startGame', (roomCode) => {
      try {
        if (!roomCode) {
          return socket.emit('error', { message: 'Room code is required' });
        }

        console.log(`Starting game ${roomCode}`);
        handleStartGame(socket, roomCode);
      } catch (error) {
        console.error('Error in startGame handler:', error);
        socket.emit('error', { message: 'Failed to start game' });
      }
    });

    // Select a question
    socket.on('selectQuestion', (roomCode, categoryIndex, valueIndex) => {
      try {
        if (!roomCode) {
          return socket.emit('error', { message: 'Room code is required' });
        }

        console.log(`Selecting question in game ${roomCode}: category ${categoryIndex}, value ${valueIndex}`);
        handleSelectQuestion(socket, roomCode, categoryIndex, valueIndex);
      } catch (error) {
        console.error('Error in selectQuestion handler:', error);
        socket.emit('error', { message: 'Failed to select question' });
      }
    });

    // Player buzzes in
    socket.on('buzz', (roomCode) => {
      try {
        if (!roomCode) {
          return socket.emit('error', { message: 'Room code is required' });
        }

        console.log(`Player ${socket.id} buzzing in for game ${roomCode}`);
        handlePlayerBuzz(socket, roomCode);
      } catch (error) {
        console.error('Error in buzz handler:', error);
        socket.emit('error', { message: 'Failed to process buzz' });
      }
    });

    // Submit answer
    socket.on('submitAnswer', (roomCode, answer) => {
      try {
        if (!roomCode || !answer) {
          return socket.emit('error', { message: 'Room code and answer are required' });
        }

        console.log(`Player ${socket.id} submitting answer for game ${roomCode}: ${answer}`);
        handleSubmitAnswer(socket, roomCode, answer);
      } catch (error) {
        console.error('Error in submitAnswer handler:', error);
        socket.emit('error', { message: 'Failed to submit answer' });
      }
    });

    // Judge answer (host)
    socket.on('judgeAnswer', (roomCode, playerId, isCorrect) => {
      try {
        if (!roomCode || !playerId) {
          return socket.emit('error', { message: 'Room code and player ID are required' });
        }

        console.log(`Host judging answer in game ${roomCode} for player ${playerId}: ${isCorrect ? 'correct' : 'incorrect'}`);
        handleJudgeAnswer(socket, roomCode, playerId, isCorrect);
      } catch (error) {
        console.error('Error in judgeAnswer handler:', error);
        socket.emit('error', { message: 'Failed to judge answer' });
      }
    });

    // Host continues to next question
    socket.on('nextQuestion', (roomCode) => {
      try {
        if (!roomCode) {
          return socket.emit('error', { message: 'Room code is required' });
        }

        console.log(`Moving to next question in game ${roomCode}`);
        handleNextQuestion(socket, roomCode);
      } catch (error) {
        console.error('Error in nextQuestion handler:', error);
        socket.emit('error', { message: 'Failed to continue to next question' });
      }
    });

    // Handle daily double wager
    socket.on('submitWager', (roomCode, wager) => {
      try {
        if (!roomCode || wager === undefined) {
          return socket.emit('error', { message: 'Room code and wager are required' });
        }

        console.log(`Player submitting wager in game ${roomCode}: ${wager}`);
        handleSubmitWager(socket, roomCode, wager);
      } catch (error) {
        console.error('Error in submitWager handler:', error);
        socket.emit('error', { message: 'Failed to submit wager' });
      }
    });

    // Start final jeopardy
    socket.on('startFinalJeopardy', (roomCode) => {
      try {
        if (!roomCode) {
          return socket.emit('error', { message: 'Room code is required' });
        }

        console.log(`Starting Final Jeopardy for game ${roomCode}`);
        handleStartFinalJeopardy(socket, roomCode);
      } catch (error) {
        console.error('Error in startFinalJeopardy handler:', error);
        socket.emit('error', { message: 'Failed to start Final Jeopardy' });
      }
    });

    // Submit final wager
    socket.on('submitFinalWager', (roomCode, wager) => {
      try {
        if (!roomCode || wager === undefined) {
          return socket.emit('error', { message: 'Room code and wager are required' });
        }

        console.log(`Player submitting Final Jeopardy wager in game ${roomCode}: ${wager}`);
        handleSubmitFinalWager(socket, roomCode, wager);
      } catch (error) {
        console.error('Error in submitFinalWager handler:', error);
        socket.emit('error', { message: 'Failed to submit Final Jeopardy wager' });
      }
    });

    // Submit final answer
    socket.on('submitFinalAnswer', (roomCode, answer) => {
      try {
        if (!roomCode || !answer) {
          return socket.emit('error', { message: 'Room code and answer are required' });
        }

        console.log(`Player submitting Final Jeopardy answer in game ${roomCode}: ${answer}`);
        handleSubmitFinalAnswer(socket, roomCode, answer);
      } catch (error) {
        console.error('Error in submitFinalAnswer handler:', error);
        socket.emit('error', { message: 'Failed to submit Final Jeopardy answer' });
      }
    });

    // Reveal final answers
    socket.on('revealFinalAnswers', (roomCode) => {
      try {
        if (!roomCode) {
          return socket.emit('error', { message: 'Room code is required' });
        }

        console.log(`Revealing Final Jeopardy answers for game ${roomCode}`);
        handleRevealFinalAnswers(socket, roomCode);
      } catch (error) {
        console.error('Error in revealFinalAnswers handler:', error);
        socket.emit('error', { message: 'Failed to reveal Final Jeopardy answers' });
      }
    });
  });

  // Return methods that can be used by the main app
  return {
    getActiveGames: () => Array.from(activeGames.values()),
    getActivePlayerCount,
    getGameById: (roomCode) => activeGames.get(roomCode)
  };
}

// Socket handler implementations

// Create a new game
async function handleCreateGame(socket, playerName, roomCode, yearStart, yearEnd) {
  try {
    // Generate a room code if not provided
    const gameRoomCode = roomCode || gameLogic.generateRoomCode();
    
    // Check if game with this code already exists
    if (activeGames.has(gameRoomCode)) {
      return socket.emit('error', { message: 'Game with this code already exists' });
    }
    
    // Create host player
    const host = {
      id: socket.id,
      socketId: socket.id,
      name: playerName,
      score: 0,
      isHost: true
    };
    
    // Set up initial game board
    console.log(`Creating game board for room ${gameRoomCode} with year range: ${yearStart}-${yearEnd}`);
    const board = await gameLogic.setupGameBoard(yearStart, yearEnd);
    
    // Create game state
    const game = {
      roomCode: gameRoomCode,
      hostId: host.id,
      hostName: playerName,
      players: [host],
      gameState: 'waiting',
      yearRange: yearStart && yearEnd ? { start: yearStart, end: yearEnd } : null,
      board,
      doubleJeopardyBoard: null,
      finalJeopardy: null,
      currentRound: 'jeopardy',
      currentQuestion: null,
      buzzingEnabled: false,
      buzzedPlayer: null,
      startTime: Date.now()
    };
    
    // Store game in memory
    activeGames.set(gameRoomCode, game);
    
    // Subscribe socket to game room
    socket.join(gameRoomCode);
    
    // Send game created event
    socket.emit('gameCreated', {
      success: true,
      roomCode: gameRoomCode,
      game: game
    });
    
    console.log(`Game created: ${gameRoomCode}`);
    return game;
  } catch (error) {
    console.error('Error creating game:', error);
    socket.emit('error', { message: 'Failed to create game' });
    return null;
  }
}

// Join an existing game
function handleJoinGame(socket, playerName, roomCode) {
  try {
    // Check if game exists
    if (!activeGames.has(roomCode)) {
      return socket.emit('gameNotFound');
    }
    
    const game = activeGames.get(roomCode);
    
    // Check if game is already in progress and not accepting new players
    if (game.gameState === 'in_progress' && !game.allowLateJoin) {
      return socket.emit('error', { message: 'Game is already in progress' });
    }
    
    // Check if player with same name already exists
    const existingPlayerIndex = game.players.findIndex(p => 
      p.name.toLowerCase() === playerName.toLowerCase()
    );
    
    // Check if player is rejoining
    const rejoinPlayerId = gameLogic.isPlayerRejoining(game, socket.id, playerName);
    
    if (rejoinPlayerId) {
      // Player is rejoining, update their socket ID
      const playerIndex = game.players.findIndex(p => p.id === rejoinPlayerId);
      if (playerIndex >= 0) {
        game.players[playerIndex].socketId = socket.id;
        
        // Join the socket to the game room
        socket.join(roomCode);
        
        // Send game state to rejoining player
        socket.emit('gameJoined', {
          success: true,
          roomCode,
          player: game.players[playerIndex],
          game: game,
          rejoined: true
        });
        
        // Notify other players
        socket.to(roomCode).emit('playerRejoined', {
          player: game.players[playerIndex]
        });
        
        console.log(`Player ${playerName} (${socket.id}) rejoined game ${roomCode}`);
        return;
      }
    } else if (existingPlayerIndex >= 0) {
      // Player with same name exists but not rejoining, reject
      return socket.emit('error', { message: 'A player with this name already exists in the game' });
    }
    
    // Create new player
    const newPlayer = {
      id: socket.id,
      socketId: socket.id,
      name: playerName,
      score: 0,
      isHost: false
    };
    
    // Add player to game
    game.players.push(newPlayer);
    
    // Save updated game
    activeGames.set(roomCode, game);
    
    // Join the socket to the game room
    socket.join(roomCode);
    
    // Send game state to new player
    socket.emit('gameJoined', {
      success: true,
      roomCode,
      player: newPlayer,
      game: game
    });
    
    // Notify other players
    socket.to(roomCode).emit('playerJoined', {
      player: newPlayer,
      playerCount: game.players.length
    });
    
    console.log(`Player ${playerName} (${socket.id}) joined game ${roomCode}`);
  } catch (error) {
    console.error('Error joining game:', error);
    socket.emit('error', { message: 'Failed to join game' });
  }
}

// Handle player disconnect
function handlePlayerDisconnect(socket) {
  try {
    // Find all games this player is in
    activeGames.forEach((game, roomCode) => {
      const playerIndex = game.players.findIndex(p => p.socketId === socket.id);
      
      if (playerIndex >= 0) {
        const player = game.players[playerIndex];
        
        // Mark player as disconnected but don't remove them
        // This allows them to rejoin later
        player.disconnected = true;
        
        // Update the game state
        activeGames.set(roomCode, game);
        
        // Notify other players
        socket.to(roomCode).emit('playerDisconnected', {
          playerId: player.id,
          playerName: player.name
        });
        
        console.log(`Player ${player.name} (${socket.id}) disconnected from game ${roomCode}`);
        
        // If host disconnected, notify all players
        if (player.isHost) {
          socket.to(roomCode).emit('hostDisconnected');
          console.log(`Host disconnected from game ${roomCode}`);
        }
        
        // Clean up empty games after a delay
        setTimeout(() => {
          cleanupEmptyGames();
        }, 60000); // Check after 1 minute
      }
    });
  } catch (error) {
    console.error('Error handling disconnect:', error);
  }
}

// Clean up games with no connected players
function cleanupEmptyGames() {
  try {
    activeGames.forEach((game, roomCode) => {
      // Check if all players are disconnected
      const allDisconnected = game.players.every(p => p.disconnected);
      
      // If all players have been disconnected for a while, remove the game
      if (allDisconnected) {
        console.log(`Removing inactive game ${roomCode}`);
        activeGames.delete(roomCode);
      }
    });
  } catch (error) {
    console.error('Error cleaning up games:', error);
  }
}

// Start a game
async function handleStartGame(socket, roomCode) {
  try {
    // Check if game exists
    if (!activeGames.has(roomCode)) {
      return socket.emit('error', { message: 'Game not found' });
    }
    
    const game = activeGames.get(roomCode);
    
    // Verify this is the host
    if (socket.id !== game.hostId) {
      return socket.emit('error', { message: 'Only the host can start the game' });
    }
    
    // Update game state
    game.gameState = 'in_progress';
    game.currentRound = 'jeopardy';
    
    // Update the game
    activeGames.set(roomCode, game);
    
    // Notify all players
    socket.to(roomCode).emit('gameStarted', { game });
    socket.emit('gameStarted', { game });
    
    console.log(`Game ${roomCode} started by host ${socket.id}`);
  } catch (error) {
    console.error('Error starting game:', error);
    socket.emit('error', { message: 'Failed to start game' });
  }
}

// Implement other handlers...

module.exports = {
  initializeSocketHandlers
}; 