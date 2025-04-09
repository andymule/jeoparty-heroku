const { v4: uuidv4 } = require('uuid');
const db = require('../db');

// Function to generate a unique room code
function generateRoomCode() {
  const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Omit confusing characters (O, 0, 1, I)
  let result = '';
  
  for (let i = 0; i < 4; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  
  return result;
}

// Check if a player is rejoining an existing game
function isPlayerRejoining(game, socketId, playerName) {
  if (!game || !game.players) return false;
  
  // Check if player exists with this name
  const existingPlayer = game.players.find(p => 
    p.name.toLowerCase() === playerName.toLowerCase() && 
    p.socketId !== socketId // Socket ID is different (reconnecting)
  );
  
  if (existingPlayer) {
    return existingPlayer.id;
  }
  
  return false;
}

// Set up the game board with categories and questions
async function setupGameBoard(categorySlug = null, yearStart = null, yearEnd = null) {
  // Get all categories from the database
  const allCategories = db.getCategories();
  
  // If filtered by year range, get only questions from that range
  let filteredQuestions = [];
  if (yearStart && yearEnd) {
    filteredQuestions = db.getQuestionsByYearRange(parseInt(yearStart), parseInt(yearEnd));
    
    // Get unique categories from the filtered questions
    const uniqueCategories = Array.from(new Set(filteredQuestions.map(q => q.category)))
      .map(category => ({ category }));
    
    // Use these categories instead of all categories
    if (uniqueCategories.length >= 6) {
      allCategories.length = 0;
      allCategories.push(...uniqueCategories);
    }
  }
  
  // Shuffle the categories and select 6 for the game
  const shuffledCategories = allCategories.sort(() => 0.5 - Math.random());
  const gameCategories = shuffledCategories.slice(0, 6);
  
  // Create the game board with selected categories
  const board = {
    categories: gameCategories.map(cat => cat.category),
    questions: []
  };
  
  // For each category, get 5 questions for round 1
  for (const category of board.categories) {
    let categoryQuestions;
    
    if (filteredQuestions.length > 0) {
      // If we have filtered questions, use those
      categoryQuestions = filteredQuestions
        .filter(q => q.category === category && q.round === 1)
        .sort(() => 0.5 - Math.random())
        .slice(0, 5);
      
      // If we don't have enough questions, get random ones
      if (categoryQuestions.length < 5) {
        const additionalQuestions = db.getRandomQuestionsByCategory(category, 1, 5 - categoryQuestions.length);
        categoryQuestions.push(...additionalQuestions);
      }
    } else {
      // Otherwise get random questions for this category
      categoryQuestions = db.getRandomQuestionsByCategory(category, 1, 5);
    }
    
    // Sort questions by their original clue_value to respect relative difficulty
    categoryQuestions.sort((a, b) => {
      // Handle cases where clue_value might be undefined or 0
      const aValue = a.clue_value || 0;
      const bValue = b.clue_value || 0;
      return aValue - bValue;
    });
    
    // Format the questions for the game
    const formattedQuestions = categoryQuestions.map((q, idx) => ({
      id: uuidv4(),
      value: (idx + 1) * 200, // Still assign standard values for the board
      question: q.answer || 'Question not available',
      answer: q.question || 'Answer not available',
      revealed: false,
      answered: false,
      dailyDouble: false,
      categoryIndex: board.categories.indexOf(category),
      valueIndex: idx,
      originalClueValue: q.clue_value || 0, // Preserve original value for reference
      additionalInfo: {
        airDate: q.air_date,
        categoryComments: q.comments
      }
    }));
    
    // Add the questions to the board
    board.questions.push(...formattedQuestions);
  }
  
  // Set one question as a Daily Double for round 1
  const eligibleQuestions = board.questions.filter(q => q.value >= 400);
  if (eligibleQuestions.length > 0) {
    const randomIndex = Math.floor(Math.random() * eligibleQuestions.length);
    const dailyDoubleQuestion = eligibleQuestions[randomIndex];
    dailyDoubleQuestion.dailyDouble = true;
  }
  
  return board;
}

// Check if all questions in a board have been revealed
function areAllQuestionsRevealed(board) {
  return board.questions.every(q => q.revealed);
}

// Set up the Double Jeopardy round
function setupDoubleJeopardy(board) {
  // Create a new board for Double Jeopardy round with same categories
  const doubleJeopardyBoard = {
    categories: [...board.categories],
    questions: []
  };
  
  // For each category, get 5 questions for round 2
  for (const category of doubleJeopardyBoard.categories) {
    // Get random questions for this category from round 2
    const categoryQuestions = db.getRandomQuestionsByCategory(category, 2, 5);
    
    // Sort questions by their original clue_value to respect relative difficulty
    categoryQuestions.sort((a, b) => {
      // Handle cases where clue_value might be undefined or 0
      const aValue = a.clue_value || 0;
      const bValue = b.clue_value || 0;
      return aValue - bValue;
    });
    
    // Format the questions for the game
    const formattedQuestions = categoryQuestions.map((q, idx) => ({
      id: uuidv4(),
      value: (idx + 1) * 400, // Double the values for Double Jeopardy
      question: q.answer || 'Question not available',
      answer: q.question || 'Answer not available',
      revealed: false,
      answered: false,
      dailyDouble: false,
      categoryIndex: doubleJeopardyBoard.categories.indexOf(category),
      valueIndex: idx,
      originalClueValue: q.clue_value || 0, // Preserve original value for reference
      additionalInfo: {
        airDate: q.air_date,
        categoryComments: q.comments
      }
    }));
    
    // Add the questions to the board
    doubleJeopardyBoard.questions.push(...formattedQuestions);
  }
  
  // Set two questions as Daily Doubles for round 2
  const eligibleQuestions = doubleJeopardyBoard.questions.filter(q => q.value >= 800);
  if (eligibleQuestions.length >= 2) {
    const shuffled = eligibleQuestions.sort(() => 0.5 - Math.random());
    shuffled[0].dailyDouble = true;
    shuffled[1].dailyDouble = true;
  }
  
  return doubleJeopardyBoard;
}

// Set up the Final Jeopardy round
function setupFinalJeopardy() {
  // Get all categories from the database
  const allCategories = db.getCategories();
  
  // Shuffle the categories and select one for Final Jeopardy
  const shuffledCategories = allCategories.sort(() => 0.5 - Math.random());
  const finalCategory = shuffledCategories[0].category;
  
  // Get a random question for this category from round 3
  const categoryQuestions = db.getRandomQuestionsByCategory(finalCategory, 3, 1);
  
  let finalQuestion = {
    id: uuidv4(),
    category: finalCategory,
    question: 'Question not available',
    answer: 'Answer not available'
  };
  
  if (categoryQuestions.length > 0) {
    finalQuestion = {
      id: uuidv4(),
      category: finalCategory,
      question: categoryQuestions[0].answer || 'Question not available',
      answer: categoryQuestions[0].question || 'Answer not available',
      additionalInfo: {
        airDate: categoryQuestions[0].air_date,
        categoryComments: categoryQuestions[0].comments
      }
    };
  }
  
  return finalQuestion;
}

module.exports = {
  generateRoomCode,
  isPlayerRejoining,
  setupGameBoard,
  areAllQuestionsRevealed,
  setupDoubleJeopardy,
  setupFinalJeopardy
}; 