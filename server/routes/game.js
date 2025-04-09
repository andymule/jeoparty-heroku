const express = require('express');
const router = express.Router();
const db = require('../db');
const gameLogic = require('../utils/gameLogic');
const gameStore = require('../store/gameStore');

// Get all categories
router.get('/categories', (req, res) => {
  try {
    const categories = db.getCategories();
    res.json(categories);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// Get year range
router.get('/years', (req, res) => {
  try {
    const years = db.getYearRange();
    res.json(years);
  } catch (error) {
    console.error('Error fetching year range:', error);
    res.status(500).json({ error: 'Failed to fetch year range' });
  }
});

// Create a new game (room)
router.post('/create', async (req, res) => {
  try {
    const { playerName, yearRange } = req.body;
    const roomCode = gameLogic.generateRoomCode();
    
    console.log(`Creating game with room code: ${roomCode}`);
    console.log(`Year range: ${yearRange ? JSON.stringify(yearRange) : 'none'}`);
    
    // Set up the game using the game logic
    const game = await gameLogic.setupGame(yearRange);
    
    // Create a game room with initial state
    const gameRoom = {
      roomCode,
      status: 'lobby',
      currentRound: 'jeopardy',
      players: [{
        id: 1,
        name: playerName,
        score: 0,
        isHost: true
      }],
      hostId: 1,
      currentPlayerId: null,
      questions: {
        jeopardy: game.jeopardy,
        doubleJeopardy: game.doubleJeopardy,
        finalJeopardy: game.finalJeopardy
      },
      createdAt: new Date(),
      settings: {
        yearRange: yearRange || null
      }
    };
    
    // Store the game
    gameStore.set(roomCode, gameRoom);
    console.log(`Game created with room code: ${roomCode}`);
    
    // Return room code and player ID to the client
    res.json({
      roomCode,
      playerId: 1,
      isHost: true
    });
    
  } catch (error) {
    console.error('Error creating game room:', error);
    res.status(500).json({ error: 'Failed to create game room' });
  }
});

// Join an existing game
router.post('/join', (req, res) => {
  try {
    const { roomCode, playerName } = req.body;
    
    // Check if room exists
    const game = gameStore.get(roomCode);
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }
    
    // Check if player is rejoining
    const existingPlayer = gameLogic.isPlayerRejoining(game, playerName);
    if (existingPlayer) {
      return res.json({
        roomCode,
        playerId: existingPlayer.id,
        isHost: existingPlayer.isHost
      });
    }
    
    // Check if game is in progress
    if (game.status !== 'lobby') {
      return res.status(403).json({ error: 'Game is already in progress' });
    }
    
    // Get the next player ID
    const nextPlayerId = Math.max(...game.players.map(p => p.id)) + 1;
    
    // Add player to the game
    game.players.push({
      id: nextPlayerId,
      name: playerName,
      score: 0,
      isHost: false
    });
    
    // Update the game state
    gameStore.set(roomCode, game);
    console.log(`Player ${playerName} joined game ${roomCode}`);
    
    // Return room code and player ID to the client
    res.json({
      roomCode,
      playerId: nextPlayerId,
      isHost: false
    });
    
  } catch (error) {
    console.error('Error joining game:', error);
    res.status(500).json({ error: 'Failed to join game' });
  }
});

// Get game state
router.get('/:roomCode', (req, res) => {
  try {
    const { roomCode } = req.params;
    
    // Check if room exists
    const game = gameStore.get(roomCode);
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }
    
    // Return the game state
    res.json(game);
    
  } catch (error) {
    console.error('Error fetching game state:', error);
    res.status(500).json({ error: 'Failed to fetch game state' });
  }
});

// Start the game
router.post('/:roomCode/start', (req, res) => {
  try {
    const { roomCode } = req.params;
    const { playerId } = req.body;
    
    // Check if room exists
    const game = gameStore.get(roomCode);
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }
    
    // Check if player is the host
    const player = game.players.find(p => p.id === parseInt(playerId));
    if (!player || !player.isHost) {
      return res.status(403).json({ error: 'Only the host can start the game' });
    }
    
    // Update game status
    game.status = 'playing';
    game.currentRound = 'jeopardy';
    game.currentPlayerId = game.players[0].id; // First player starts
    
    // Update the game state
    gameStore.set(roomCode, game);
    console.log(`Game ${roomCode} started by host`);
    
    // Return success
    res.json({ success: true });
    
  } catch (error) {
    console.error('Error starting game:', error);
    res.status(500).json({ error: 'Failed to start game' });
  }
});

// Select a question
router.post('/:roomCode/select', (req, res) => {
  try {
    const { roomCode } = req.params;
    const { playerId, categoryIndex, valueIndex } = req.body;
    
    // Check if room exists
    const game = gameStore.get(roomCode);
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }
    
    // Check if it's this player's turn
    if (game.currentPlayerId !== parseInt(playerId)) {
      return res.status(403).json({ error: 'Not your turn' });
    }
    
    // Check if we're in a playing round
    if (game.currentRound !== 'jeopardy' && game.currentRound !== 'doubleJeopardy') {
      return res.status(400).json({ error: 'Cannot select question in current round' });
    }
    
    // Get the current board
    const board = game.questions[game.currentRound].board;
    
    // Find the category
    if (categoryIndex < 0 || categoryIndex >= board.length) {
      return res.status(400).json({ error: 'Invalid category' });
    }
    
    const category = board[categoryIndex];
    
    // Find the clue
    if (valueIndex < 0 || valueIndex >= category.clues.length) {
      return res.status(400).json({ error: 'Invalid clue' });
    }
    
    const clue = category.clues[valueIndex];
    
    // Check if this question has already been revealed
    if (clue.revealed) {
      return res.status(400).json({ error: 'Question already revealed' });
    }
    
    // Mark the question as revealed
    clue.revealed = true;
    
    // Set the active question
    game.activeQuestion = {
      categoryIndex,
      valueIndex,
      category: category.name,
      value: clue.value,
      clue: clue.clue,
      response: clue.response,
      dailyDouble: clue.dailyDouble,
      playerId: parseInt(playerId),
      answered: false,
      wager: clue.dailyDouble ? null : clue.value
    };
    
    // If it's a daily double, wait for wager
    if (clue.dailyDouble) {
      game.status = 'dailyDouble';
    } else {
      game.status = 'questionRevealed';
    }
    
    // Update the game state
    gameStore.set(roomCode, game);
    console.log(`Player ${playerId} selected ${category.name} for $${clue.value}`);
    
    // Return success
    res.json({ success: true });
    
  } catch (error) {
    console.error('Error selecting question:', error);
    res.status(500).json({ error: 'Failed to select question' });
  }
});

// Submit a wager for Daily Double or Final Jeopardy
router.post('/:roomCode/wager', (req, res) => {
  try {
    const { roomCode } = req.params;
    const { playerId, wager } = req.body;
    
    // Check if room exists
    const game = gameStore.get(roomCode);
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }
    
    // Check if it's this player's turn or Final Jeopardy
    if (game.currentRound !== 'finalJeopardy' && game.currentPlayerId !== parseInt(playerId)) {
      return res.status(403).json({ error: 'Not your turn' });
    }
    
    // Validate wager is a number
    const wagerAmount = parseInt(wager);
    if (isNaN(wagerAmount) || wagerAmount < 0) {
      return res.status(400).json({ error: 'Invalid wager' });
    }
    
    // For Final Jeopardy, each player submits a wager
    if (game.currentRound === 'finalJeopardy') {
      // Find the player
      const player = game.players.find(p => p.id === parseInt(playerId));
      if (!player) {
        return res.status(404).json({ error: 'Player not found' });
      }
      
      // Check wager against player's score
      if (wagerAmount > player.score) {
        return res.status(400).json({ error: 'Wager cannot exceed score' });
      }
      
      // Record the player's wager
      if (!game.finalJeopardyWagers) {
        game.finalJeopardyWagers = {};
      }
      game.finalJeopardyWagers[playerId] = wagerAmount;
      
      // Check if all players have wagered
      if (Object.keys(game.finalJeopardyWagers).length === game.players.length) {
        game.status = 'finalJeopardyQuestion';
      }
    } else if (game.status === 'dailyDouble') {
      // For Daily Double, only the current player wagers
      const player = game.players.find(p => p.id === parseInt(playerId));
      
      // Validate wager amount (max is max of player's score or highest clue value)
      const maxClueValue = game.currentRound === 'jeopardy' ? 1000 : 2000;
      const maxWager = Math.max(player.score, maxClueValue);
      
      if (wagerAmount > maxWager) {
        return res.status(400).json({ error: `Wager cannot exceed ${maxWager}` });
      }
      
      // Set the wager and update status
      game.activeQuestion.wager = wagerAmount;
      game.status = 'questionRevealed';
    } else {
      return res.status(400).json({ error: 'No active question requiring a wager' });
    }
    
    // Update the game state
    gameStore.set(roomCode, game);
    console.log(`Player ${playerId} wagered ${wagerAmount}`);
    
    // Return success
    res.json({ success: true });
    
  } catch (error) {
    console.error('Error submitting wager:', error);
    res.status(500).json({ error: 'Failed to submit wager' });
  }
});

// Submit an answer
router.post('/:roomCode/answer', (req, res) => {
  try {
    const { roomCode } = req.params;
    const { playerId, answer, isCorrect } = req.body;
    
    // Check if room exists
    const game = gameStore.get(roomCode);
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }
    
    // Check if there's an active question
    if (!game.activeQuestion && game.currentRound !== 'finalJeopardy') {
      return res.status(400).json({ error: 'No active question' });
    }
    
    // Find the player
    const player = game.players.find(p => p.id === parseInt(playerId));
    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }
    
    // For regular questions and Daily Doubles
    if (game.currentRound !== 'finalJeopardy') {
      // Check if it's this player's turn
      if (game.activeQuestion.playerId !== parseInt(playerId)) {
        return res.status(403).json({ error: 'Not your turn' });
      }
      
      // Calculate score change
      const scoreChange = isCorrect ? game.activeQuestion.wager : -game.activeQuestion.wager;
      
      // Update player's score
      player.score += scoreChange;
      
      // Mark question as answered
      game.activeQuestion.answered = true;
      game.activeQuestion.isCorrect = isCorrect;
      game.activeQuestion.submittedAnswer = answer;
      
      // If answer is correct, player keeps control, otherwise, next player
      if (isCorrect) {
        game.currentPlayerId = parseInt(playerId);
      } else {
        // Find next player's index
        const currentPlayerIndex = game.players.findIndex(p => p.id === parseInt(playerId));
        const nextPlayerIndex = (currentPlayerIndex + 1) % game.players.length;
        game.currentPlayerId = game.players[nextPlayerIndex].id;
      }
      
      // Check if all questions in round are answered
      const board = game.questions[game.currentRound].board;
      let allAnswered = true;
      
      for (const category of board) {
        for (const clue of category.clues) {
          if (!clue.revealed) {
            allAnswered = false;
            break;
          }
        }
        if (!allAnswered) break;
      }
      
      // If all questions answered, move to next round
      if (allAnswered) {
        if (game.currentRound === 'jeopardy') {
          game.currentRound = 'doubleJeopardy';
          game.status = 'playing';
        } else if (game.currentRound === 'doubleJeopardy') {
          game.currentRound = 'finalJeopardy';
          game.status = 'finalJeopardyCategory';
        }
      } else {
        game.status = 'playing';
        game.activeQuestion = null;
      }
    } else {
      // For Final Jeopardy
      // Record the player's answer
      if (!game.finalJeopardyAnswers) {
        game.finalJeopardyAnswers = {};
      }
      
      game.finalJeopardyAnswers[playerId] = {
        answer,
        isCorrect
      };
      
      // Apply score change
      const wager = game.finalJeopardyWagers[playerId] || 0;
      const scoreChange = isCorrect ? wager : -wager;
      player.score += scoreChange;
      
      // Check if all players have answered
      if (Object.keys(game.finalJeopardyAnswers).length === game.players.length) {
        game.status = 'gameOver';
      }
    }
    
    // Update the game state
    gameStore.set(roomCode, game);
    console.log(`Player ${playerId} answered ${isCorrect ? 'correctly' : 'incorrectly'}`);
    
    // Return success
    res.json({ success: true });
    
  } catch (error) {
    console.error('Error submitting answer:', error);
    res.status(500).json({ error: 'Failed to submit answer' });
  }
});

// Move to final jeopardy
router.post('/:roomCode/finalJeopardy', (req, res) => {
  try {
    const { roomCode } = req.params;
    const { playerId } = req.body;
    
    // Check if room exists
    const game = gameStore.get(roomCode);
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }
    
    // Check if player is the host
    const player = game.players.find(p => p.id === parseInt(playerId));
    if (!player || !player.isHost) {
      return res.status(403).json({ error: 'Only the host can advance to Final Jeopardy' });
    }
    
    // Update game status
    game.currentRound = 'finalJeopardy';
    game.status = 'finalJeopardyCategory';
    
    // Update the game state
    gameStore.set(roomCode, game);
    console.log(`Game ${roomCode} advanced to Final Jeopardy`);
    
    // Return success
    res.json({ success: true });
    
  } catch (error) {
    console.error('Error advancing to Final Jeopardy:', error);
    res.status(500).json({ error: 'Failed to advance to Final Jeopardy' });
  }
});

// Reveal Final Jeopardy question
router.post('/:roomCode/revealFinalJeopardy', (req, res) => {
  try {
    const { roomCode } = req.params;
    const { playerId } = req.body;
    
    // Check if room exists
    const game = gameStore.get(roomCode);
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }
    
    // Check if player is the host
    const player = game.players.find(p => p.id === parseInt(playerId));
    if (!player || !player.isHost) {
      return res.status(403).json({ error: 'Only the host can reveal the Final Jeopardy question' });
    }
    
    // Update game status
    game.status = 'finalJeopardyQuestion';
    
    // Update the game state
    gameStore.set(roomCode, game);
    console.log(`Game ${roomCode} revealed Final Jeopardy question`);
    
    // Return success
    res.json({ success: true });
    
  } catch (error) {
    console.error('Error revealing Final Jeopardy question:', error);
    res.status(500).json({ error: 'Failed to reveal Final Jeopardy question' });
  }
});

module.exports = router; 