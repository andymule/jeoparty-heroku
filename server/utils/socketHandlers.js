const { v4: uuidv4 } = require('uuid');
const gameLogic = require('./gameLogic');
const answerChecker = require('./answerChecker');
const gameService = require('../services/gameService');
const SOCKET_EVENTS = require('../constants/socketEvents');

// Initialize socket handlers
function initializeSocketHandlers(io) {
  // Track connected sockets
  const connectedSockets = new Map();

  // Handle socket.io connections
  io.on(SOCKET_EVENTS.CONNECT, (socket) => {
    console.log('Client connected:', socket.id);
    connectedSockets.set(socket.id, socket);
    
    // Debug listener for easier troubleshooting
    socket.on('debug', (message) => {
      console.log(`DEBUG from ${socket.id}: ${JSON.stringify(message)}`);
      socket.emit('debug_response', { received: message, timestamp: Date.now() });
    });

    // Handle disconnections
    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
      handlePlayerDisconnect(socket);
    });

    // Create a new game
    socket.on(SOCKET_EVENTS.CREATE_GAME, async ({ playerName, yearStart, yearEnd }, callback) => {
      try {
        if (!playerName || !yearStart || !yearEnd) {
          throw new Error('Missing required parameters');
        }

        const game = await gameService.createGame({
          hostName: playerName,
          yearRange: { start: yearStart, end: yearEnd }
        });

        socket.join(game.roomCode);
        socket.gameData = {
          roomCode: game.roomCode,
          playerId: game.hostId,
          playerName
        };

        callback({
          success: true,
          roomCode: game.roomCode,
          hostUrl: `/host/${game.roomCode}`,
          playerUrl: `/play/${game.roomCode}`
        });

      } catch (error) {
        console.error('Error creating game:', error);
        callback({
          success: false,
          error: error.message
        });
      }
    });

    // Join an existing game
    socket.on(SOCKET_EVENTS.JOIN_GAME, async ({ roomCode, playerName }, callback) => {
      try {
        if (!roomCode || !playerName) {
          throw new Error('Room code and player name are required');
        }

        const game = await gameService.joinGame({
          roomCode,
          playerName,
          playerId: socket.id
        });

        // Store game data in socket for easy access
        socket.gameData = {
          roomCode,
          playerName
        };

        // Join the socket room
        socket.join(roomCode);

        // Notify all clients in the room about the new player
        io.to(roomCode).emit(SOCKET_EVENTS.PLAYER_JOINED, {
          player: {
            id: socket.id,
            name: playerName,
            score: 0
          },
          players: game.players
        });

        callback({
          success: true,
          game
        });
      } catch (error) {
        console.error('Error joining game:', error);
        callback({
          success: false,
          error: error.message
        });
      }
    });

    // Start the game
    socket.on('startGame', (roomCode) => {
      try {
        if (!roomCode) {
          return socket.emit('error', { message: 'Room code is required' });
        }

        console.log(`Starting game ${roomCode}`);
        handleStartGame(io, socket, { roomCode });
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

    socket.on(SOCKET_EVENTS.DISCONNECT, () => {
      console.log('Client disconnected:', socket.id);
      
      if (socket.gameData) {
        const { roomCode } = socket.gameData;
        const updatedGame = gameService.removePlayer(roomCode, socket.id);

        if (updatedGame) {
          io.to(roomCode).emit(SOCKET_EVENTS.PLAYER_DISCONNECTED, {
            playerId: socket.id,
            players: updatedGame.players
          });
        }
      }
    });
  });

  // Return methods that can be used by the main app
  return {
    getActiveGames: () => Array.from(gameService.getAllGames().values()),
    getGameById: (roomCode) => gameService.getGame(roomCode)
  };
}

// Socket handler implementations

// Update handleJoinGame to use game service
async function handleJoinGame(socket, playerName, roomCode) {
  const game = gameService.getGame(roomCode);
  
  if (!game) {
    return socket.emit('gameNotFound');
  }
  
  // Check if game is already in progress
  if (game.gameState !== 'waiting') {
    return socket.emit('error', { message: 'Game is already in progress' });
  }
  
  // Check if player with same name exists
  const existingPlayer = game.players.find(p => 
    p.name.toLowerCase() === playerName.toLowerCase()
  );
  
  if (existingPlayer) {
    return socket.emit('error', { message: 'Player name already taken' });
  }
  
  // Create new player
  const player = {
    id: socket.id,
    name: playerName,
    score: 0,
    isHost: false,
    connected: true
  };
  
  // Add player to game
  game.players.push(player);
  
  // Join socket to room
  socket.join(roomCode);
  socket.roomCode = roomCode;
  socket.playerName = playerName;
  
  // Notify everyone about the new player
  socket.emit('gameJoined', {
    success: true,
    roomCode,
    player,
    game
  });
  
  socket.to(roomCode).emit('playerJoined', {
    player,
    playerCount: game.players.length
  });
}

// Update handlePlayerDisconnect to use game service
function handlePlayerDisconnect(socket) {
  if (!socket.roomCode) return;
  
  const game = gameService.getGame(socket.roomCode);
  if (!game) return;
  
  const playerIndex = game.players.findIndex(p => p.id === socket.id);
  if (playerIndex === -1) return;
  
  const player = game.players[playerIndex];
  player.connected = false;
  
  // Notify other players
  socket.to(game.roomCode).emit('playerDisconnected', {
    playerId: player.id,
    playerName: player.name
  });
  
  // If host disconnected, notify all players
  if (player.isHost) {
    socket.to(game.roomCode).emit('hostDisconnected');
  }
  
  // Clean up empty games after a delay
  setTimeout(() => {
    cleanupEmptyGames();
  }, 60000);
}

// Update cleanupEmptyGames to use game service
function cleanupEmptyGames() {
  const games = gameService.getAllGames();
  
  games.forEach((game, roomCode) => {
    // Check if all players are disconnected
    const allDisconnected = game.players.every(p => !p.connected);
    
    if (allDisconnected) {
      console.log(`Removing inactive game ${roomCode}`);
      gameService.removeGame(roomCode);
    }
  });
}

// Start a game
const handleStartGame = async (io, socket, { roomCode }) => {
  console.log(`[SOCKET] Start game request for room ${roomCode}`);
  
  try {
    if (!roomCode) {
      throw new Error('Room code is required');
    }
    
    // Get the game from the game service
    const game = gameService.getGame(roomCode);
    if (!game) {
      throw new Error(`Game with room code ${roomCode} not found`);
    }
    
    // Check if this player is the host
    if (socket.id !== game.hostId) {
      throw new Error('Only the host can start the game');
    }
    
    // Check if game is already in progress
    if (game.gameState !== 'waiting') {
      throw new Error('Game is already in progress');
    }
    
    console.log(`Starting game in room ${roomCode}`);
    
    // Update game state
    game.gameState = 'inProgress';
    
    // Notify all players that the game has started
    io.to(roomCode).emit(SOCKET_EVENTS.GAME_STARTED, {
      game: {
        ...game,
        players: game.players.filter(p => !p.isHost) // Filter out host from player list
      },
      categories: game.categories,
      board: game.board,
      selectingPlayerId: game.selectingPlayer?.id
    });
    
    console.log(`Game in room ${roomCode} started with ${game.categories.length} categories`);
    
    return { success: true };
  } catch (error) {
    console.error(`Error starting game: ${error.message}`);
    socket.emit(SOCKET_EVENTS.ERROR, { message: error.message });
    return { success: false, error: error.message };
  }
};

// Implement other handlers...

module.exports = {
  initializeSocketHandlers
}; 