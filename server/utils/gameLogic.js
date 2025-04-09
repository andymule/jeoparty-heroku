const { v4: uuidv4 } = require('uuid');
const db = require('../db');

// Constants for game setup
const CATEGORIES_PER_ROUND = 6;
const CLUES_PER_CATEGORY = 5;

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

// Use database indexes for efficient lookup
// Returns a set of categories with appropriate questions for the given round
async function getCategoriesForRound(round, yearRange = null) {
  console.time(`getCategoriesForRound-${round}`);
  
  // Get all categories
  const allCategories = db.getCategories();
  
  // Shuffle to get random selection each time
  const shuffledCategories = shuffleArray(allCategories.slice());
  
  // Variables to track our progress
  const categories = [];
  const processedCategories = new Set();
  const maxCategoriesToProcess = 1000; // Limit to prevent hanging
  let startTime = Date.now();
  let timeoutOccurred = false;
  
  console.log(`Finding categories for round ${round}${yearRange ? ` within years ${yearRange[0]}-${yearRange[1]}` : ''}`);
  
  // First try with year range if specified (with timeout protection)
  if (yearRange && Array.isArray(yearRange) && yearRange.length === 2) {
    const [startYear, endYear] = yearRange;
    let counter = 0;
    
    // Set a timeout for the year range filtering
    const timeoutPromise = new Promise(resolve => {
      setTimeout(() => {
        timeoutOccurred = true;
        console.log(`Year range filtering timeout after 5 seconds`);
        resolve([]);
      }, 5000); // 5 second timeout
    });
    
    // Process categories with year range filtering
    const processingPromise = new Promise(resolve => {
      const resultCategories = [];
      
      // Process categories up to the limit
      for (const category of shuffledCategories) {
        if (counter >= maxCategoriesToProcess || resultCategories.length >= CATEGORIES_PER_ROUND) {
          break;
        }
        
        // Skip if already processed
        if (processedCategories.has(category.category)) {
          continue;
        }
        
        processedCategories.add(category.category);
        counter++;
        
        // Use the optimized function that uses indexes
        const questions = db.getQuestionsByYearRangeAndRound(startYear, endYear, round);
        
        // Filter to just this category
        const categoryQuestions = questions.filter(q => q.category === category.category);
        
        // Check if this category has enough questions
        if (categoryQuestions.length >= CLUES_PER_CATEGORY) {
          resultCategories.push({
            name: category.category,
            questions: sortQuestionsByDifficulty(categoryQuestions).slice(0, CLUES_PER_CATEGORY)
          });
          
          console.log(`Found category: ${category.category} (within year range)`);
          
          // Stop if we have enough categories
          if (resultCategories.length >= CATEGORIES_PER_ROUND) {
            break;
          }
        }
        
        // Check for timeout
        if (Date.now() - startTime > 5000) {
          timeoutOccurred = true;
          console.log(`Year range filtering execution timeout`);
          break;
        }
      }
      
      resolve(resultCategories);
    });
    
    // Race between timeout and processing
    const categoriesWithinYearRange = await Promise.race([
      timeoutPromise,
      processingPromise
    ]);
    
    categories.push(...categoriesWithinYearRange);
    
    console.log(`Found ${categories.length} categories with year range filter`);
  }
  
  // If we don't have enough categories from year range filtering, fill with any categories
  if (categories.length < CATEGORIES_PER_ROUND) {
    if (yearRange) {
      console.log(`Not enough categories found with year range. Falling back to all categories.`);
    }
    
    let counter = 0;
    startTime = Date.now(); // Reset timer for the general search
    
    for (const category of shuffledCategories) {
      if (counter >= maxCategoriesToProcess || categories.length >= CATEGORIES_PER_ROUND) {
        break;
      }
      
      // Skip if already processed
      if (processedCategories.has(category.category)) {
        continue;
      }
      
      processedCategories.add(category.category);
      counter++;
      
      // Get all questions for this category and round
      const allCategoryQuestions = db.getRandomQuestionsByCategory(category.category, round, CLUES_PER_CATEGORY);
      
      // Check if this category has enough questions
      if (allCategoryQuestions.length >= CLUES_PER_CATEGORY) {
        categories.push({
          name: category.category,
          questions: sortQuestionsByDifficulty(allCategoryQuestions).slice(0, CLUES_PER_CATEGORY)
        });
        
        console.log(`Found category: ${category.category} (general search)`);
      }
      
      // Check for timeout
      if (Date.now() - startTime > 3000) {
        console.log(`General category search timeout`);
        break;
      }
    }
  }
  
  // Do not create placeholder categories - if we don't have enough, return what we have
  if (categories.length < CATEGORIES_PER_ROUND) {
    console.log(`Warning: Only found ${categories.length} categories for round ${round}. This is fewer than the desired ${CATEGORIES_PER_ROUND}.`);
  }
  
  const duration = Date.now() - startTime;
  console.log(`Final categories for round ${round}: ${categories.map(c => c.name).join(', ')}`);
  console.log(`Time to construct categories for round ${round}: ${duration}ms`);
  console.timeEnd(`getCategoriesForRound-${round}`);
  
  return categories.slice(0, categories.length);
}

// Sort questions by their clue value (difficulty)
function sortQuestionsByDifficulty(questions) {
  return [...questions].sort((a, b) => {
    const aValue = a.clue_value || 0;
    const bValue = b.clue_value || 0;
    return aValue - bValue;
  });
}

// Shuffle array using Fisher-Yates algorithm
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// Setup a regular Jeopardy game
async function setupJeopardy(yearRange = null) {
  console.time('setupJeopardy');
  
  try {
    // Get categories specifically for the Jeopardy round (round 1)
    const categories = await getCategoriesForRound(1, yearRange);
    
    if (categories.length === 0) {
      throw new Error("Could not find any categories for Jeopardy round");
    }
    
    // Format the game board
    const board = categories.map(category => {
      return {
        name: category.name,
        clues: category.questions.map((question, index) => {
          const clueValue = ((index + 1) * 200);
          
          return {
            id: question.id,
            value: clueValue,
            clue: question.answer,
            response: question.question,
            dailyDouble: false,
            originalClueValue: question.clue_value,
            additionalInfo: {
              category: question.category,
              airDate: question.air_date || null,
              categoryComments: question.comments || null,
              notes: question.notes || null
            }
          };
        })
      };
    });
    
    // Randomly select one clue as a Daily Double
    if (board.length > 0) {
      const randomCategoryIndex = Math.floor(Math.random() * board.length);
      if (board[randomCategoryIndex].clues.length > 0) {
        const randomClueIndex = Math.floor(Math.random() * board[randomCategoryIndex].clues.length);
        board[randomCategoryIndex].clues[randomClueIndex].dailyDouble = true;
      }
    }
    
    console.log(`Set up Jeopardy board with ${board.length} categories`);
    console.timeEnd('setupJeopardy');
    
    return {
      round: 1,
      board
    };
  } catch (error) {
    console.error('Error setting up Jeopardy game:', error);
    throw error;
  }
}

// Setup a Double Jeopardy game
async function setupDoubleJeopardy(yearRange = null) {
  console.time('setupDoubleJeopardy');
  
  try {
    // Get categories specifically for the Double Jeopardy round (round 2)
    const categories = await getCategoriesForRound(2, yearRange);
    
    if (categories.length === 0) {
      throw new Error("Could not find any categories for Double Jeopardy round");
    }
    
    // Format the game board
    const board = categories.map(category => {
      return {
        name: category.name,
        clues: category.questions.map((question, index) => {
          const clueValue = ((index + 1) * 400);
          
          return {
            id: question.id,
            value: clueValue,
            clue: question.answer,
            response: question.question,
            dailyDouble: false,
            originalClueValue: question.clue_value,
            additionalInfo: {
              category: question.category,
              airDate: question.air_date || null,
              categoryComments: question.comments || null,
              notes: question.notes || null
            }
          };
        })
      };
    });
    
    // Only set daily doubles if we have categories
    if (board.length > 0) {
      // Randomly select two clues as Daily Doubles
      // Try to put them in different categories
      const firstCategoryIndex = Math.floor(Math.random() * board.length);
      if (board[firstCategoryIndex].clues.length > 0) {
        const firstClueIndex = Math.floor(Math.random() * board[firstCategoryIndex].clues.length);
        board[firstCategoryIndex].clues[firstClueIndex].dailyDouble = true;
        
        // For the second daily double, try a different category if possible
        if (board.length > 1) {
          let secondCategoryIndex;
          do {
            secondCategoryIndex = Math.floor(Math.random() * board.length);
          } while (board.length > 1 && secondCategoryIndex === firstCategoryIndex);
          
          if (board[secondCategoryIndex].clues.length > 0) {
            const secondClueIndex = Math.floor(Math.random() * board[secondCategoryIndex].clues.length);
            board[secondCategoryIndex].clues[secondClueIndex].dailyDouble = true;
          }
        } else if (board[firstCategoryIndex].clues.length > 1) {
          // If only one category, pick another clue in same category
          let secondClueIndex;
          do {
            secondClueIndex = Math.floor(Math.random() * board[firstCategoryIndex].clues.length);
          } while (secondClueIndex === firstClueIndex);
          
          board[firstCategoryIndex].clues[secondClueIndex].dailyDouble = true;
        }
      }
    }
    
    console.log(`Set up Double Jeopardy board with ${board.length} categories`);
    console.timeEnd('setupDoubleJeopardy');
    
    return {
      round: 2,
      board
    };
  } catch (error) {
    console.error('Error setting up Double Jeopardy game:', error);
    throw error;
  }
}

// Setup Final Jeopardy
async function setupFinalJeopardy(yearRange = null) {
  console.time('setupFinalJeopardy');
  
  try {
    // Get categories for the Final Jeopardy round (round 3)
    const categories = await getCategoriesForRound(3, yearRange);
    
    // Take the first category with a question
    let finalCategory = null;
    let finalQuestion = null;
    
    for (const category of categories) {
      if (category.questions.length > 0) {
        finalCategory = category.name;
        finalQuestion = category.questions[0];
        break;
      }
    }
    
    // If no final question was found, return an error
    if (!finalCategory || !finalQuestion) {
      console.error('No final Jeopardy question found.');
      throw new Error('Could not find a valid Final Jeopardy question');
    }
    
    console.log(`Set up Final Jeopardy with category: ${finalCategory}`);
    console.timeEnd('setupFinalJeopardy');
    
    return {
      round: 3,
      category: finalCategory,
      clue: finalQuestion.answer,
      response: finalQuestion.question,
      additionalInfo: {
        category: finalQuestion.category,
        airDate: finalQuestion.air_date || null,
        categoryComments: finalQuestion.comments || null,
        notes: finalQuestion.notes || null
      }
    };
  } catch (error) {
    console.error('Error setting up Final Jeopardy:', error);
    throw error;
  }
}

// Setup a complete Jeopardy game with all rounds
async function setupGame(yearRange = null) {
  console.time('setupCompleteGame');
  
  try {
    console.log(`Setting up game ${yearRange ? `with year range ${yearRange[0]}-${yearRange[1]}` : 'with no year range'}`);
    
    const jeopardyRound = await setupJeopardy(yearRange);
    const doubleJeopardyRound = await setupDoubleJeopardy(yearRange);
    const finalJeopardyRound = await setupFinalJeopardy(yearRange);
    
    console.log('Game setup complete');
    console.timeEnd('setupCompleteGame');
    
    return {
      jeopardy: jeopardyRound,
      doubleJeopardy: doubleJeopardyRound,
      finalJeopardy: finalJeopardyRound
    };
  } catch (error) {
    console.error('Error setting up complete game:', error);
    throw error;
  }
}

// Setup the game board with categories and questions for all rounds
async function setupGameBoard(yearStart = null, yearEnd = null) {
  console.time('setupGameBoard');
  try {
    console.log(`Setting up game board ${yearStart && yearEnd ? `with year range ${yearStart}-${yearEnd}` : 'with no year range'}`);
    
    // Create year range array if both values are provided
    const yearRange = (yearStart && yearEnd) ? [parseInt(yearStart), parseInt(yearEnd)] : null;
    
    // Set up all rounds
    const jeopardyRound = await setupJeopardy(yearRange);
    const doubleJeopardyRound = await setupDoubleJeopardy(yearRange);
    const finalJeopardyRound = await setupFinalJeopardy(yearRange);
    
    console.log('Game board setup complete');
    console.timeEnd('setupGameBoard');
    
    return {
      jeopardy: jeopardyRound,
      doubleJeopardy: doubleJeopardyRound,
      finalJeopardy: finalJeopardyRound
    };
  } catch (error) {
    console.error('Error setting up game board:', error);
    throw error;
  }
}

module.exports = {
  generateRoomCode,
  isPlayerRejoining,
  setupJeopardy,
  setupDoubleJeopardy,
  setupFinalJeopardy,
  setupGame,
  setupGameBoard,
  
  // For testing
  getCategoriesForRound,
  CATEGORIES_PER_ROUND,
  CLUES_PER_CATEGORY
}; 