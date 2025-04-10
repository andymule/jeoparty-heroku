const { v4: uuidv4 } = require('uuid');
const gameLogic = require('../utils/gameLogic');

// In-memory store for active games
const activeGames = new Map();

/**
 * Creates a new game with the specified options
 * @param {Object} options Game creation options
 * @param {string} options.hostName Name of the host
 * @param {string} [options.roomCode] Optional room code (will be generated if not provided)
 * @param {Object} [options.yearRange] Optional year range for questions
 * @param {string} [options.gameDate] Optional specific game date
 * @param {string} [options.hostId] Optional host socket ID
 * @returns {Promise<Object>} The created game state
 */
async function createGame(options) {
  console.log('[DEBUG] gameService.createGame - Start:', JSON.stringify(options, null, 2));
  console.log('[DEBUG] Active games before creation:', activeGames.size);
  
  const {
    hostName,
    roomCode = gameLogic.generateRoomCode(),
    yearRange = { start: 1984, end: 2024 },
    gameDate = null,
    hostId = null
  } = options;

  console.log('[DEBUG] Processed options:', {
    hostName,
    roomCode,
    yearRange: JSON.stringify(yearRange),
    gameDate,
    hostId
  });

  // Create host player
  const host = {
    id: hostId || uuidv4(),
    name: hostName,
    score: 0,
    isHost: true,
    connected: true
  };

  console.log('[DEBUG] Created host player:', JSON.stringify(host, null, 2));

  // Create initial game state
  console.log('[DEBUG] Creating initial game state...');
  const game = {
    roomCode,
    hostId: host.id,
    hostName,
    players: [host],
    gameState: 'waiting',
    board: null,
    categories: [],
    selectedQuestion: null,
    round: 1,
    yearRange,
    gameDate,
    scores: {},
    activePlayer: null,
    buzzerEnabled: false,
    buzzedPlayers: [],
    dailyDoubleWager: 0,
    usedQuestions: [],
    isInMemoryMode: true,
    startTime: Date.now()
  };

  console.log('[DEBUG] Initial game state created:', {
    roomCode: game.roomCode,
    hostId: game.hostId,
    playersCount: game.players.length,
    yearRange: JSON.stringify(game.yearRange)
  });

  // Set up the game board with a timeout to prevent hanging
  try {
    console.log('[DEBUG] Setting up game board with year range:', JSON.stringify(yearRange));
    console.log('[DEBUG] Calling gameLogic.setupGameBoard with 30s timeout...');
    
    // Create a promise that rejects after 30 seconds
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error('Game board setup timed out after 30 seconds'));
      }, 30000);
    });
    
    // Race between the actual setup and the timeout
    const gameBoardPromise = gameLogic.setupGameBoard(yearRange.start, yearRange.end);
    
    const gameBoard = await Promise.race([
      gameBoardPromise,
      timeoutPromise
    ]).then(result => {
      // Clear the timeout when the promise resolves
      clearTimeout(timeoutId);
      return result;
    }).catch(error => {
      // Also clear the timeout on error
      clearTimeout(timeoutId);
      console.error('[DEBUG] Game board setup timed out or failed:', error);
      console.log('[DEBUG] Using fallback game board');
      // Create a fallback game board
      return {
        jeopardy: gameLogic.createFallbackRound(1).board,
        doubleJeopardy: gameLogic.createFallbackRound(2).board,
        finalJeopardy: gameLogic.createFallbackFinalJeopardy()
      };
    });
    
    console.log('[DEBUG] Game board setup returned:', {
      hasJeopardy: !!gameBoard?.jeopardy,
      jeopardyLength: gameBoard?.jeopardy?.length,
      hasDoubleJeopardy: !!gameBoard?.doubleJeopardy,
      doubleJeopardyLength: gameBoard?.doubleJeopardy?.length,
      hasFinalJeopardy: !!gameBoard?.finalJeopardy
    });
    
    // Store all rounds data
    console.log('[DEBUG] Processing game board data...');
    game.jeopardyData = {
      round1: gameBoard.jeopardy,
      round2: gameBoard.doubleJeopardy,
      finalJeopardy: gameBoard.finalJeopardy
    };
    
    // Set up initial round (Single Jeopardy)
    const round1 = gameBoard.jeopardy;
    game.board = {};
    game.categories = [];
    
    console.log('[DEBUG] Processing round 1 data:', {
      hasRound1: !!round1,
      isArray: Array.isArray(round1),
      length: round1?.length
    });
    
    // Process categories and questions for the first round
    if (round1 && Array.isArray(round1)) {
      console.log('[DEBUG] Setting up categories and questions...');
      game.categories = round1.map(cat => cat.name);
      
      round1.forEach((category, index) => {
        console.log(`[DEBUG] Processing category ${index + 1}/${round1.length}:`, category.name);
        
        // With new format, questions are in the clues array
        game.board[category.name] = category.clues.map(clue => ({
          text: clue.clue,
          answer: clue.response,
          value: clue.value || 200,
          revealed: false
        }));
        
        console.log(`[DEBUG] Category ${category.name} has ${game.board[category.name].length} questions`);
      });
      
      console.log('[DEBUG] Categories processing complete:', {
        count: game.categories.length,
        names: game.categories
      });
    } else {
      console.warn('[DEBUG] Warning: round1 data is invalid:', round1);
      // Create fallback categories and questions
      console.log('[DEBUG] Creating fallback categories and questions');
      const fallbackRound = gameLogic.createFallbackRound(1);
      game.categories = fallbackRound.board.map(cat => cat.name);
      
      fallbackRound.board.forEach(category => {
        game.board[category.name] = category.clues.map(q => ({
          text: q.clue,
          answer: q.response,
          value: q.value || 200,
          revealed: false
        }));
      });
    }
    
  } catch (error) {
    console.error('[DEBUG] Error setting up game board:', error);
    console.error('[DEBUG] Error stack:', error.stack);
    
    // Create fallback categories and questions
    console.log('[DEBUG] Creating fallback categories and questions after error');
    const fallbackRound = gameLogic.createFallbackRound(1);
    game.categories = fallbackRound.board.map(cat => cat.name);
    
    game.board = {};
    fallbackRound.board.forEach(category => {
      game.board[category.name] = category.clues.map(q => ({
        text: q.clue,
        answer: q.response,
        value: q.value || 200,
        revealed: false
      }));
    });
  }

  // Store the game
  console.log('[DEBUG] Storing game in activeGames map...');
  activeGames.set(roomCode, game);
  console.log('[DEBUG] Active games after creation:', activeGames.size);

  console.log('[DEBUG] Game creation complete:', {
    roomCode,
    categoriesCount: game.categories.length,
    boardSize: Object.keys(game.board || {}).length,
    totalPlayers: game.players.length
  });

  return game;
}

/**
 * Gets a game by its room code
 * @param {string} roomCode The room code to look up
 * @returns {Object|null} The game state or null if not found
 */
function getGame(roomCode) {
  return activeGames.get(roomCode) || null;
}

/**
 * Removes a game from the store
 * @param {string} roomCode The room code of the game to remove
 */
function removeGame(roomCode) {
  activeGames.delete(roomCode);
}

/**
 * Gets all active games
 * @returns {Map<string, Object>} Map of all active games
 */
function getAllGames() {
  return activeGames;
}

/**
 * Gets the count of active games
 * @returns {number} Number of active games
 */
function getActiveGameCount() {
  return activeGames.size;
}

/**
 * Gets the total count of active players across all games
 * @returns {number} Number of active players
 */
function getActivePlayerCount() {
  let count = 0;
  activeGames.forEach(game => {
    count += game.players.length;
  });
  return count;
}

const joinGame = async ({ roomCode, playerName, playerId }) => {
  const game = activeGames.get(roomCode);
  if (!game) {
    throw new Error('Game not found');
  }

  // Check if player name is already taken
  if (game.players.some(p => p.name === playerName)) {
    throw new Error('Player name already taken');
  }

  const newPlayer = {
    id: playerId,
    name: playerName,
    score: 0,
    isHost: false
  };

  game.players.push(newPlayer);
  activeGames.set(roomCode, game);

  return game;
};

const removePlayer = (roomCode, playerId) => {
  const game = activeGames.get(roomCode);
  if (!game) {
    return null;
  }

  game.players = game.players.filter(p => p.id !== playerId);

  // If no players left, remove the game
  if (game.players.length === 0) {
    activeGames.delete(roomCode);
    return null;
  }

  // If host left, assign new host
  if (!game.players.some(p => p.isHost)) {
    game.players[0].isHost = true;
  }

  activeGames.set(roomCode, game);
  return game;
};

module.exports = {
  createGame,
  getGame,
  removeGame,
  getAllGames,
  getActiveGameCount,
  getActivePlayerCount,
  joinGame,
  removePlayer
}; 