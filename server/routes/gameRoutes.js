const express = require('express');
const router = express.Router();
const { 
  getCategories, 
  getYearRange, 
  getCategoriesByYearRange, 
  getQuestionsByCategory,
  getQuestionsByCategoryAndYearRange,
  getQuestionsByDifficulty,
  getRandomCategory
} = require('../db');
const { generateRoomCode } = require('../utils/roomCode');

// Global storage for active game sessions
const gameSessions = {};

/**
 * Create a new game session
 */
router.post('/create', (req, res) => {
  const { yearStart, yearEnd } = req.body;
  
  // Validate year range
  const { min, max } = getYearRange();
  const startYear = yearStart ? Math.max(min, parseInt(yearStart)) : min;
  const endYear = yearEnd ? Math.min(max, parseInt(yearEnd)) : max;
  
  // Generate a unique room code
  let roomCode;
  do {
    roomCode = generateRoomCode();
  } while (gameSessions[roomCode]);
  
  // Create game session
  const gameSession = {
    id: roomCode,
    createdAt: new Date(),
    yearRange: { start: startYear, end: endYear },
    players: [],
    host: null,
    gameState: 'lobby', // lobby, setup, jeopardy, doubleJeopardy, finalJeopardy, complete
    board: null,
    currentQuestion: null,
    scores: {},
    buzzerState: {
      enabled: false,
      activePlayer: null,
      timestamp: null
    }
  };
  
  // Store game session
  gameSessions[roomCode] = gameSession;
  
  res.json({
    success: true,
    roomCode,
    gameSession
  });
});

/**
 * Join an existing game session
 */
router.post('/join', (req, res) => {
  const { roomCode, playerName, deviceType } = req.body;
  
  // Validate room code
  if (!gameSessions[roomCode]) {
    return res.status(404).json({
      success: false,
      message: 'Game session not found'
    });
  }
  
  const gameSession = gameSessions[roomCode];
  
  // Check if game is joinable
  if (gameSession.gameState !== 'lobby') {
    return res.status(400).json({
      success: false,
      message: 'Game has already started'
    });
  }
  
  // Register as host or player
  if (deviceType === 'desktop' && !gameSession.host) {
    gameSession.host = {
      name: playerName,
      deviceType,
      joinedAt: new Date()
    };
  } else {
    // Check if player name is unique
    if (gameSession.players.some(p => p.name === playerName)) {
      return res.status(400).json({
        success: false,
        message: 'Player name already taken'
      });
    }
    
    // Add player
    const player = {
      name: playerName,
      deviceType,
      joinedAt: new Date()
    };
    
    gameSession.players.push(player);
    gameSession.scores[playerName] = 0;
  }
  
  res.json({
    success: true,
    gameSession
  });
});

/**
 * Get game state
 */
router.get('/state/:roomCode', (req, res) => {
  const { roomCode } = req.params;
  
  // Validate room code
  if (!gameSessions[roomCode]) {
    return res.status(404).json({
      success: false,
      message: 'Game session not found'
    });
  }
  
  res.json({
    success: true,
    gameSession: gameSessions[roomCode]
  });
});

/**
 * Start the game and generate board
 */
router.post('/start', (req, res) => {
  const { roomCode } = req.body;
  
  // Validate room code
  if (!gameSessions[roomCode]) {
    return res.status(404).json({
      success: false,
      message: 'Game session not found'
    });
  }
  
  const gameSession = gameSessions[roomCode];
  
  // Check if game can start
  if (gameSession.players.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Need at least one player to start'
    });
  }
  
  if (!gameSession.host) {
    return res.status(400).json({
      success: false,
      message: 'Game requires a host to start'
    });
  }
  
  // Generate jeopardy board
  const { start: startYear, end: endYear } = gameSession.yearRange;
  const board = generateJeopardyBoard(startYear, endYear);
  
  // Update game state
  gameSession.gameState = 'jeopardy';
  gameSession.board = board;
  
  res.json({
    success: true,
    gameSession
  });
});

/**
 * Generate a complete Jeopardy board with categories and questions
 */
function generateJeopardyBoard(startYear, endYear) {
  // Get 6 random categories with sufficient questions
  const categories = [];
  const minClues = 5; // Need at least 5 questions per category
  
  while (categories.length < 6) {
    const category = getRandomCategory(minClues, startYear, endYear);
    
    // Skip if no suitable category found
    if (!category) continue;
    
    // Check if category is already selected
    if (categories.some(c => c.id === category.id)) continue;
    
    // Get questions for this category and filter by year range
    const questions = getQuestionsByCategoryAndYearRange(
      category.id, 
      startYear, 
      endYear
    );
    
    // Ensure we have enough questions
    if (questions.length < 5) continue;
    
    // Group by value and select one question per value
    const questionsByValue = {};
    const values = [200, 400, 600, 800, 1000];
    
    for (const question of questions) {
      // Parse the value
      const rawValue = question.value?.replace(/[^0-9]/g, '') || '0';
      const value = parseInt(rawValue);
      
      // Map to standard value
      let standardValue = 200;
      if (value <= 200) standardValue = 200;
      else if (value <= 400) standardValue = 400;
      else if (value <= 600) standardValue = 600;
      else if (value <= 800) standardValue = 800;
      else standardValue = 1000;
      
      // Skip questions with media requirements or other issues
      if (
        question.answer.includes('seen here') ||
        question.answer.includes('shown here') ||
        question.answer.includes('pictured') ||
        question.answer.includes('audio') ||
        question.answer.includes('video')
      ) {
        continue;
      }
      
      // Add to question pool for this value
      if (!questionsByValue[standardValue]) {
        questionsByValue[standardValue] = [];
      }
      questionsByValue[standardValue].push(question);
    }
    
    // Check if we have at least one question for each value
    if (values.every(v => questionsByValue[v] && questionsByValue[v].length > 0)) {
      // Select a random question for each value
      const selectedQuestions = {};
      
      for (const value of values) {
        const pool = questionsByValue[value];
        const randomIndex = Math.floor(Math.random() * pool.length);
        const question = pool[randomIndex];
        
        // Mark whether this is a daily double (random selection)
        const isDaily = false; // Will be set later
        
        selectedQuestions[value] = {
          ...question,
          standardValue: value,
          isDaily,
          isAnswered: false
        };
      }
      
      // Add category with its questions
      categories.push({
        ...category,
        questions: selectedQuestions
      });
    }
  }
  
  // Randomly assign daily doubles (1 in single jeopardy, 2 in double jeopardy)
  // For single jeopardy, prefer higher values
  const allQuestions = [];
  
  for (const category of categories) {
    for (const value of [200, 400, 600, 800, 1000]) {
      if (category.questions[value]) {
        allQuestions.push({
          categoryIndex: categories.indexOf(category),
          value,
          weight: value / 200 // Higher values are more likely
        });
      }
    }
  }
  
  // Sort by weight and pick one for daily double
  allQuestions.sort((a, b) => b.weight - a.weight);
  
  // Select one with higher probability for higher values
  let totalWeight = allQuestions.reduce((sum, q) => sum + q.weight, 0);
  let randomValue = Math.random() * totalWeight;
  let dailyDoubleIndex = 0;
  
  for (let i = 0; i < allQuestions.length; i++) {
    randomValue -= allQuestions[i].weight;
    if (randomValue <= 0) {
      dailyDoubleIndex = i;
      break;
    }
  }
  
  // Set the daily double
  const dd = allQuestions[dailyDoubleIndex];
  categories[dd.categoryIndex].questions[dd.value].isDaily = true;
  
  return {
    round: 'jeopardy',
    categories
  };
}

/**
 * Select a clue from the board
 */
router.post('/select-clue', (req, res) => {
  const { roomCode, categoryIndex, value } = req.body;
  
  // Validate room code
  if (!gameSessions[roomCode]) {
    return res.status(404).json({
      success: false,
      message: 'Game session not found'
    });
  }
  
  const gameSession = gameSessions[roomCode];
  
  // Validate game state
  if (gameSession.gameState !== 'jeopardy' && gameSession.gameState !== 'doubleJeopardy') {
    return res.status(400).json({
      success: false,
      message: 'Invalid game state for selecting clue'
    });
  }
  
  // Validate category and value
  if (
    categoryIndex < 0 || 
    categoryIndex >= gameSession.board.categories.length ||
    !gameSession.board.categories[categoryIndex].questions[value]
  ) {
    return res.status(400).json({
      success: false,
      message: 'Invalid category or value'
    });
  }
  
  // Get the selected question
  const category = gameSession.board.categories[categoryIndex];
  const question = category.questions[value];
  
  // Check if already answered
  if (question.isAnswered) {
    return res.status(400).json({
      success: false,
      message: 'This clue has already been answered'
    });
  }
  
  // Mark question as active
  question.isAnswered = true;
  gameSession.currentQuestion = {
    categoryIndex,
    value,
    category: category.name,
    clue: question.answer,
    response: question.question,
    isDaily: question.isDaily,
    activePlayer: null,
    state: question.isDaily ? 'wagering' : 'reading'
  };
  
  // Reset buzzer state
  gameSession.buzzerState = {
    enabled: false,
    activePlayer: null,
    timestamp: null
  };
  
  res.json({
    success: true,
    gameSession
  });
});

/**
 * Make a daily double wager
 */
router.post('/daily-wager', (req, res) => {
  const { roomCode, playerName, wager } = req.body;
  
  // Validate room code
  if (!gameSessions[roomCode]) {
    return res.status(404).json({
      success: false,
      message: 'Game session not found'
    });
  }
  
  const gameSession = gameSessions[roomCode];
  
  // Validate current question is a daily double
  if (
    !gameSession.currentQuestion || 
    !gameSession.currentQuestion.isDaily ||
    gameSession.currentQuestion.state !== 'wagering'
  ) {
    return res.status(400).json({
      success: false,
      message: 'No active daily double in wagering state'
    });
  }
  
  // Validate player
  if (!gameSession.players.some(p => p.name === playerName)) {
    return res.status(400).json({
      success: false,
      message: 'Player not found in game'
    });
  }
  
  // Get player's current score
  const playerScore = gameSession.scores[playerName] || 0;
  
  // Validate wager amount
  const maxWager = Math.max(
    gameSession.currentQuestion.value,
    playerScore
  );
  
  if (wager < 5 || wager > maxWager) {
    return res.status(400).json({
      success: false,
      message: `Wager must be between $5 and $${maxWager}`
    });
  }
  
  // Update question state
  gameSession.currentQuestion.wager = wager;
  gameSession.currentQuestion.activePlayer = playerName;
  gameSession.currentQuestion.state = 'answering';
  
  res.json({
    success: true,
    gameSession
  });
});

/**
 * Enable buzzing in for current question
 */
router.post('/enable-buzzer', (req, res) => {
  const { roomCode } = req.body;
  
  // Validate room code
  if (!gameSessions[roomCode]) {
    return res.status(404).json({
      success: false,
      message: 'Game session not found'
    });
  }
  
  const gameSession = gameSessions[roomCode];
  
  // Validate current question
  if (
    !gameSession.currentQuestion || 
    (gameSession.currentQuestion.isDaily && gameSession.currentQuestion.state !== 'answering') ||
    (!gameSession.currentQuestion.isDaily && gameSession.currentQuestion.state !== 'reading')
  ) {
    return res.status(400).json({
      success: false,
      message: 'No active question ready for buzzing'
    });
  }
  
  // Update buzzer state
  gameSession.buzzerState = {
    enabled: true,
    activePlayer: null,
    timestamp: Date.now(),
    lockouts: {} // Player name -> timestamp when they can buzz again
  };
  
  // Update question state
  if (!gameSession.currentQuestion.isDaily) {
    gameSession.currentQuestion.state = 'buzzing';
  }
  
  res.json({
    success: true,
    gameSession
  });
});

/**
 * Player buzzes in
 */
router.post('/buzz', (req, res) => {
  const { roomCode, playerName } = req.body;
  
  // Validate room code
  if (!gameSessions[roomCode]) {
    return res.status(404).json({
      success: false,
      message: 'Game session not found'
    });
  }
  
  const gameSession = gameSessions[roomCode];
  
  // Validate buzzer is enabled
  if (!gameSession.buzzerState.enabled || gameSession.buzzerState.activePlayer) {
    return res.status(400).json({
      success: false,
      message: 'Buzzing not currently allowed'
    });
  }
  
  // Validate player
  if (!gameSession.players.some(p => p.name === playerName)) {
    return res.status(400).json({
      success: false,
      message: 'Player not found in game'
    });
  }
  
  // Check for lockout
  const now = Date.now();
  const lockoutTime = gameSession.buzzerState.lockouts[playerName] || 0;
  
  if (now < lockoutTime) {
    return res.status(400).json({
      success: false,
      message: 'Player is locked out from buzzing',
      lockoutRemaining: lockoutTime - now
    });
  }
  
  // Update buzzer state
  gameSession.buzzerState.activePlayer = playerName;
  gameSession.buzzerState.timestamp = now;
  
  // Update question state
  gameSession.currentQuestion.activePlayer = playerName;
  gameSession.currentQuestion.state = 'answering';
  
  res.json({
    success: true,
    gameSession
  });
});

/**
 * Submit an answer for the current question
 */
router.post('/submit-answer', (req, res) => {
  const { roomCode, playerName, answer } = req.body;
  
  // Validate room code
  if (!gameSessions[roomCode]) {
    return res.status(404).json({
      success: false,
      message: 'Game session not found'
    });
  }
  
  const gameSession = gameSessions[roomCode];
  
  // Validate current question
  if (
    !gameSession.currentQuestion || 
    gameSession.currentQuestion.state !== 'answering' ||
    gameSession.currentQuestion.activePlayer !== playerName
  ) {
    return res.status(400).json({
      success: false,
      message: 'No active question for this player to answer'
    });
  }
  
  // Check if answer is correct
  const isCorrect = checkAnswerCorrectness(
    answer,
    gameSession.currentQuestion.response
  );
  
  // Calculate score change
  const value = gameSession.currentQuestion.isDaily 
    ? gameSession.currentQuestion.wager 
    : gameSession.currentQuestion.value;
  
  // Update player score
  const currentScore = gameSession.scores[playerName] || 0;
  gameSession.scores[playerName] = isCorrect 
    ? currentScore + value
    : currentScore - value;
  
  // Update question state
  gameSession.currentQuestion.state = 'answered';
  gameSession.currentQuestion.submittedAnswer = answer;
  gameSession.currentQuestion.isCorrect = isCorrect;
  
  // If incorrect and not daily double, re-enable buzzer for others
  if (!isCorrect && !gameSession.currentQuestion.isDaily) {
    // Apply lockout to this player
    gameSession.buzzerState = {
      enabled: true,
      activePlayer: null,
      timestamp: Date.now(),
      lockouts: {
        ...gameSession.buzzerState.lockouts,
        [playerName]: Date.now() + 200 // 200ms lockout
      }
    };
    gameSession.currentQuestion.state = 'buzzing';
    gameSession.currentQuestion.activePlayer = null;
  }
  
  res.json({
    success: true,
    isCorrect,
    gameSession
  });
});

/**
 * Finish the current question and return to board
 */
router.post('/finish-question', (req, res) => {
  const { roomCode } = req.body;
  
  // Validate room code
  if (!gameSessions[roomCode]) {
    return res.status(404).json({
      success: false,
      message: 'Game session not found'
    });
  }
  
  const gameSession = gameSessions[roomCode];
  
  // Clear current question and buzzer state
  gameSession.currentQuestion = null;
  gameSession.buzzerState = {
    enabled: false,
    activePlayer: null,
    timestamp: null
  };
  
  // Check if all questions are answered in current round
  const allAnswered = gameSession.board.categories.every(category => {
    return Object.values(category.questions).every(q => q.isAnswered);
  });
  
  // If all questions answered, advance to next round
  if (allAnswered) {
    if (gameSession.gameState === 'jeopardy') {
      // Generate Double Jeopardy board
      const { start: startYear, end: endYear } = gameSession.yearRange;
      const board = generateDoubleJeopardyBoard(startYear, endYear);
      
      gameSession.gameState = 'doubleJeopardy';
      gameSession.board = board;
    } else if (gameSession.gameState === 'doubleJeopardy') {
      // Generate Final Jeopardy
      const { start: startYear, end: endYear } = gameSession.yearRange;
      const finalJeopardy = generateFinalJeopardy(startYear, endYear);
      
      gameSession.gameState = 'finalJeopardy';
      gameSession.board = null;
      gameSession.finalJeopardy = finalJeopardy;
    }
  }
  
  res.json({
    success: true,
    gameSession
  });
});

/**
 * Generate a Double Jeopardy board with categories and questions
 */
function generateDoubleJeopardyBoard(startYear, endYear) {
  // Similar to generateJeopardyBoard but with double values
  // And two Daily Doubles
  
  // Get 6 random categories with sufficient questions
  const categories = [];
  const minClues = 5; 
  
  while (categories.length < 6) {
    const category = getRandomCategory(minClues, startYear, endYear);
    
    if (!category || categories.some(c => c.id === category.id)) continue;
    
    const questions = getQuestionsByCategoryAndYearRange(
      category.id, 
      startYear, 
      endYear
    );
    
    if (questions.length < 5) continue;
    
    const questionsByValue = {};
    const values = [400, 800, 1200, 1600, 2000];
    
    for (const question of questions) {
      const rawValue = question.value?.replace(/[^0-9]/g, '') || '0';
      const value = parseInt(rawValue);
      
      let standardValue = 400;
      if (value <= 400) standardValue = 400;
      else if (value <= 800) standardValue = 800;
      else if (value <= 1200) standardValue = 1200;
      else if (value <= 1600) standardValue = 1600;
      else standardValue = 2000;
      
      if (
        question.answer.includes('seen here') ||
        question.answer.includes('shown here') ||
        question.answer.includes('pictured') ||
        question.answer.includes('audio') ||
        question.answer.includes('video')
      ) {
        continue;
      }
      
      if (!questionsByValue[standardValue]) {
        questionsByValue[standardValue] = [];
      }
      questionsByValue[standardValue].push(question);
    }
    
    if (values.every(v => questionsByValue[v] && questionsByValue[v].length > 0)) {
      const selectedQuestions = {};
      
      for (const value of values) {
        const pool = questionsByValue[value];
        const randomIndex = Math.floor(Math.random() * pool.length);
        const question = pool[randomIndex];
        
        selectedQuestions[value] = {
          ...question,
          standardValue: value,
          isDaily: false,
          isAnswered: false
        };
      }
      
      categories.push({
        ...category,
        questions: selectedQuestions
      });
    }
  }
  
  // Assign two daily doubles with higher probability for higher values
  const allQuestions = [];
  
  for (const category of categories) {
    for (const value of [400, 800, 1200, 1600, 2000]) {
      if (category.questions[value]) {
        allQuestions.push({
          categoryIndex: categories.indexOf(category),
          value,
          weight: value / 400 // Higher values are more likely
        });
      }
    }
  }
  
  // Sort by weight
  allQuestions.sort((a, b) => b.weight - a.weight);
  
  // Select two daily doubles
  const dailyDoubles = [];
  let totalWeight = allQuestions.reduce((sum, q) => sum + q.weight, 0);
  
  for (let i = 0; i < 2; i++) {
    let randomValue = Math.random() * totalWeight;
    let selectedIndex = 0;
    
    for (let j = 0; j < allQuestions.length; j++) {
      if (dailyDoubles.includes(j)) continue;
      
      randomValue -= allQuestions[j].weight;
      if (randomValue <= 0) {
        selectedIndex = j;
        break;
      }
    }
    
    dailyDoubles.push(selectedIndex);
    
    // Remove the selected question's weight for next selection
    totalWeight -= allQuestions[selectedIndex].weight;
  }
  
  // Set the daily doubles
  for (const index of dailyDoubles) {
    const dd = allQuestions[index];
    categories[dd.categoryIndex].questions[dd.value].isDaily = true;
  }
  
  return {
    round: 'doubleJeopardy',
    categories
  };
}

/**
 * Generate Final Jeopardy question
 */
function generateFinalJeopardy(startYear, endYear) {
  // Get a random category
  const category = getRandomCategory(1, startYear, endYear);
  
  if (!category) {
    return null;
  }
  
  // Get questions for this category
  const questions = getQuestionsByCategoryAndYearRange(
    category.id, 
    startYear, 
    endYear
  );
  
  // Filter out questions with media requirements
  const validQuestions = questions.filter(q => 
    !q.answer.includes('seen here') &&
    !q.answer.includes('shown here') &&
    !q.answer.includes('pictured') &&
    !q.answer.includes('audio') &&
    !q.answer.includes('video')
  );
  
  if (validQuestions.length === 0) {
    return null;
  }
  
  // Select a random question
  const randomIndex = Math.floor(Math.random() * validQuestions.length);
  const question = validQuestions[randomIndex];
  
  return {
    category: category.name,
    clue: question.answer,
    response: question.question,
    state: 'wagering',
    wagers: {},
    answers: {},
    results: {}
  };
}

/**
 * Submit Final Jeopardy wager
 */
router.post('/final-wager', (req, res) => {
  const { roomCode, playerName, wager } = req.body;
  
  // Validate room code
  if (!gameSessions[roomCode]) {
    return res.status(404).json({
      success: false,
      message: 'Game session not found'
    });
  }
  
  const gameSession = gameSessions[roomCode];
  
  // Validate game state
  if (
    gameSession.gameState !== 'finalJeopardy' ||
    !gameSession.finalJeopardy ||
    gameSession.finalJeopardy.state !== 'wagering'
  ) {
    return res.status(400).json({
      success: false,
      message: 'Not in Final Jeopardy wagering state'
    });
  }
  
  // Validate player
  if (!gameSession.players.some(p => p.name === playerName)) {
    return res.status(400).json({
      success: false,
      message: 'Player not found in game'
    });
  }
  
  // Get player's current score
  const playerScore = gameSession.scores[playerName] || 0;
  
  // Players with zero or negative scores cannot participate
  if (playerScore <= 0) {
    return res.status(400).json({
      success: false,
      message: 'Players with zero or negative scores cannot participate in Final Jeopardy'
    });
  }
  
  // Validate wager amount
  if (wager < 0 || wager > playerScore) {
    return res.status(400).json({
      success: false,
      message: `Wager must be between $0 and $${playerScore}`
    });
  }
  
  // Record wager
  gameSession.finalJeopardy.wagers[playerName] = wager;
  
  // Check if all players have wagered
  const eligiblePlayers = gameSession.players.filter(p => 
    gameSession.scores[p.name] > 0
  );
  
  const allWagered = eligiblePlayers.every(p => 
    gameSession.finalJeopardy.wagers[p.name] !== undefined
  );
  
  // If all players have wagered, move to answering state
  if (allWagered) {
    gameSession.finalJeopardy.state = 'answering';
  }
  
  res.json({
    success: true,
    gameSession
  });
});

/**
 * Submit Final Jeopardy answer
 */
router.post('/final-answer', (req, res) => {
  const { roomCode, playerName, answer } = req.body;
  
  // Validate room code
  if (!gameSessions[roomCode]) {
    return res.status(404).json({
      success: false,
      message: 'Game session not found'
    });
  }
  
  const gameSession = gameSessions[roomCode];
  
  // Validate game state
  if (
    gameSession.gameState !== 'finalJeopardy' ||
    !gameSession.finalJeopardy ||
    gameSession.finalJeopardy.state !== 'answering'
  ) {
    return res.status(400).json({
      success: false,
      message: 'Not in Final Jeopardy answering state'
    });
  }
  
  // Validate player has wagered
  if (gameSession.finalJeopardy.wagers[playerName] === undefined) {
    return res.status(400).json({
      success: false,
      message: 'Player has not wagered'
    });
  }
  
  // Record answer
  gameSession.finalJeopardy.answers[playerName] = answer;
  
  // Check if all players have answered
  const playersWithWagers = Object.keys(gameSession.finalJeopardy.wagers);
  
  const allAnswered = playersWithWagers.every(p => 
    gameSession.finalJeopardy.answers[p] !== undefined
  );
  
  // If all players have answered, calculate results
  if (allAnswered) {
    gameSession.finalJeopardy.state = 'revealing';
    
    // Check each answer and update scores
    for (const player of playersWithWagers) {
      const answer = gameSession.finalJeopardy.answers[player];
      const wager = gameSession.finalJeopardy.wagers[player];
      const isCorrect = checkAnswerCorrectness(
        answer,
        gameSession.finalJeopardy.response
      );
      
      // Update player score
      const currentScore = gameSession.scores[player] || 0;
      gameSession.scores[player] = isCorrect 
        ? currentScore + wager
        : currentScore - wager;
      
      // Record result
      gameSession.finalJeopardy.results[player] = {
        isCorrect,
        newScore: gameSession.scores[player]
      };
    }
  }
  
  res.json({
    success: true,
    gameSession
  });
});

/**
 * End the game
 */
router.post('/end-game', (req, res) => {
  const { roomCode } = req.body;
  
  // Validate room code
  if (!gameSessions[roomCode]) {
    return res.status(404).json({
      success: false,
      message: 'Game session not found'
    });
  }
  
  const gameSession = gameSessions[roomCode];
  
  // Update game state
  gameSession.gameState = 'complete';
  
  // Determine winner(s)
  const scores = gameSession.scores;
  const players = Object.keys(scores);
  
  if (players.length === 0) {
    gameSession.winners = [];
  } else {
    // Find highest score
    const maxScore = Math.max(...players.map(p => scores[p]));
    
    // Find all players with the highest score
    const winners = players.filter(p => scores[p] === maxScore);
    
    gameSession.winners = winners;
  }
  
  res.json({
    success: true,
    gameSession
  });
});

/**
 * Check if a player's answer is correct
 * Uses a permissive comparison that ignores case sensitivity
 * and allows for partial matches
 */
function checkAnswerCorrectness(playerAnswer, correctAnswer) {
  if (!playerAnswer || !correctAnswer) return false;
  
  // Normalize answers
  const normalizedPlayerAnswer = playerAnswer.toLowerCase().trim();
  const normalizedCorrectAnswer = correctAnswer.toLowerCase().trim();
  
  // Direct match
  if (normalizedPlayerAnswer === normalizedCorrectAnswer) {
    return true;
  }
  
  // Handle "a/an/the" differences
  const articles = ['a ', 'an ', 'the '];
  
  let playerWithoutArticle = normalizedPlayerAnswer;
  let correctWithoutArticle = normalizedCorrectAnswer;
  
  for (const article of articles) {
    if (playerWithoutArticle.startsWith(article)) {
      playerWithoutArticle = playerWithoutArticle.substring(article.length);
    }
    
    if (correctWithoutArticle.startsWith(article)) {
      correctWithoutArticle = correctWithoutArticle.substring(article.length);
    }
  }
  
  if (playerWithoutArticle === correctWithoutArticle) {
    return true;
  }
  
  // Handle additional text in parentheses or brackets
  const cleanedCorrect = correctWithoutArticle
    .replace(/\([^)]*\)/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .trim();
  
  if (playerWithoutArticle === cleanedCorrect) {
    return true;
  }
  
  // Check for high similarity (simple implementation)
  // More sophisticated methods would use a proper similarity algorithm
  const minLength = Math.min(playerWithoutArticle.length, cleanedCorrect.length);
  const maxLength = Math.max(playerWithoutArticle.length, cleanedCorrect.length);
  
  if (minLength > 3) {
    // For short answers, they need to be very similar
    let commonChars = 0;
    
    for (let i = 0; i < playerWithoutArticle.length; i++) {
      if (cleanedCorrect.includes(playerWithoutArticle[i])) {
        commonChars++;
      }
    }
    
    const similarity = commonChars / maxLength;
    
    // If answers are at least 80% similar, consider it correct
    if (similarity >= 0.8) {
      return true;
    }
  }
  
  return false;
}

module.exports = router; 