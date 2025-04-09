const db = require('../db');
const { generateRoomCode } = require('../utils/roomCode');

/**
 * Generate a unique game board with categories and questions
 * @param {number} minYear - Minimum year for question filtering
 * @param {number} maxYear - Maximum year for question filtering
 * @returns {Object} Game board with categories and questions
 */
async function generateGameBoard(minYear, maxYear) {
  const NUM_CATEGORIES = 6;
  const CLUES_PER_CATEGORY = 5;
  const MIN_CLUES_REQUIRED = 5;
  
  console.log(`Generating game board with questions from ${minYear}-${maxYear}`);
  
  const gameBoard = {
    categories: [],
    questions: {}
  };
  
  // Select random categories with sufficient clues in the year range
  while (gameBoard.categories.length < NUM_CATEGORIES) {
    const category = db.getRandomCategory(MIN_CLUES_REQUIRED, minYear, maxYear);
    
    // Skip if we couldn't find a category or if it's already selected
    if (!category || gameBoard.categories.some(c => c.id === category.id)) {
      continue;
    }
    
    // Get questions for this category in the year range
    const questions = db.getQuestionsByCategoryAndYearRange(
      category.id, 
      minYear, 
      maxYear
    );
    
    // Skip if not enough questions
    if (questions.length < CLUES_PER_CATEGORY) {
      continue;
    }
    
    // Select random questions for different values
    const selectedQuestions = selectQuestionsForCategory(questions, CLUES_PER_CATEGORY);
    if (!selectedQuestions) {
      continue;
    }
    
    // Add to game board
    gameBoard.categories.push(category);
    gameBoard.questions[category.id] = selectedQuestions;
  }
  
  // Select one random question as Daily Double
  setDailyDoubles(gameBoard, 1);
  
  // Select Final Jeopardy question
  const finalJeopardyCategory = db.getRandomCategory(1, minYear, maxYear);
  if (finalJeopardyCategory) {
    const finalJeopardyQuestions = db.getQuestionsByCategoryAndYearRange(
      finalJeopardyCategory.id, 
      minYear, 
      maxYear
    );
    
    if (finalJeopardyQuestions.length > 0) {
      // Select a random question for Final Jeopardy
      const randomIndex = Math.floor(Math.random() * finalJeopardyQuestions.length);
      gameBoard.finalJeopardy = {
        category: finalJeopardyCategory,
        question: finalJeopardyQuestions[randomIndex]
      };
    }
  }
  
  return gameBoard;
}

/**
 * Select questions for a category with different point values
 * @param {Array} questions - All questions for a category
 * @param {number} count - Number of questions to select
 * @returns {Array|null} Selected questions or null if not enough variety
 */
function selectQuestionsForCategory(questions, count) {
  // Assign point values to questions (200, 400, 600, 800, 1000)
  const selectedQuestions = [];
  const values = [200, 400, 600, 800, 1000];
  
  // Shuffle questions to get random selection
  const shuffled = [...questions].sort(() => 0.5 - Math.random());
  
  // Select the required number of questions
  for (let i = 0; i < count && i < shuffled.length; i++) {
    const question = shuffled[i];
    selectedQuestions.push({
      ...question,
      value: values[i],
      revealed: false,
      answered: false,
      isDailyDouble: false
    });
  }
  
  return selectedQuestions.length === count ? selectedQuestions : null;
}

/**
 * Set daily doubles in the game board
 * @param {Object} gameBoard - The game board
 * @param {number} count - Number of daily doubles to set
 */
function setDailyDoubles(gameBoard, count) {
  // Get all eligible questions (not first row)
  const eligibleQuestions = [];
  
  for (const categoryId in gameBoard.questions) {
    // Daily doubles are typically not in the first row (200)
    const questions = gameBoard.questions[categoryId].filter(q => q.value > 200);
    questions.forEach(question => {
      eligibleQuestions.push({
        categoryId,
        questionIndex: gameBoard.questions[categoryId].findIndex(q => q.id === question.id)
      });
    });
  }
  
  // Randomly select daily doubles
  for (let i = 0; i < count && eligibleQuestions.length > 0; i++) {
    const randomIndex = Math.floor(Math.random() * eligibleQuestions.length);
    const { categoryId, questionIndex } = eligibleQuestions[randomIndex];
    
    // Mark as daily double
    gameBoard.questions[categoryId][questionIndex].isDailyDouble = true;
    
    // Remove from eligible questions
    eligibleQuestions.splice(randomIndex, 1);
  }
}

/**
 * Create a new game with the specified settings
 * @param {string} hostName - Name of the host player
 * @param {number} minYear - Minimum year for questions
 * @param {number} maxYear - Maximum year for questions
 * @returns {Object} New game state
 */
async function createGame(hostName, minYear, maxYear) {
  // Generate a unique room code
  const roomCode = generateRoomCode();
  
  // Generate game board
  const gameBoard = await generateGameBoard(minYear, maxYear);
  
  // Create initial game state
  const game = {
    roomCode,
    status: 'lobby',
    board: gameBoard,
    host: hostName,
    players: [
      { 
        name: hostName, 
        score: 0,
        isHost: true
      }
    ],
    currentPlayer: null,
    currentQuestion: null,
    revealedQuestions: 0,
    totalQuestions: Object.values(gameBoard.questions).reduce(
      (total, questions) => total + questions.length, 0
    ),
    settings: {
      minYear,
      maxYear
    },
    createdAt: new Date()
  };
  
  return game;
}

module.exports = {
  createGame,
  generateGameBoard
}; 