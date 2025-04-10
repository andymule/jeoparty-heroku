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
  console.log(`[DEBUG] getCategoriesForRound: Start for round ${round}${yearRange ? ` with year range ${yearRange[0]}-${yearRange[1]}` : ''}`);
  
  // Get all categories
  console.log(`[DEBUG] getCategoriesForRound: Getting all categories from DB`);
  const allCategories = db.getCategories();
  console.log(`[DEBUG] getCategoriesForRound: Received ${allCategories.length} categories from DB`);
  
  // Shuffle to get random selection each time
  console.log(`[DEBUG] getCategoriesForRound: Shuffling categories`);
  const shuffledCategories = shuffleArray(allCategories.slice());
  
  // Variables to track our progress
  const categories = [];
  const processedCategories = new Set();
  const maxCategoriesToProcess = 1000; // Limit to prevent hanging
  let startTime = Date.now();
  let timeoutOccurred = false;
  
  console.log(`[DEBUG] Finding categories for round ${round}${yearRange ? ` within years ${yearRange[0]}-${yearRange[1]}` : ''}`);
  
  // First try with year range if specified (with timeout protection)
  if (yearRange && Array.isArray(yearRange) && yearRange.length === 2) {
    console.log(`[DEBUG] getCategoriesForRound: Starting year range filtering with ${yearRange[0]}-${yearRange[1]}`);
    const [startYear, endYear] = yearRange;
    let counter = 0;
    
    // Set a timeout for the year range filtering
    console.log(`[DEBUG] getCategoriesForRound: Setting up 5s timeout for year range filtering`);
    const timeoutPromise = new Promise(resolve => {
      setTimeout(() => {
        timeoutOccurred = true;
        console.log(`[DEBUG] Year range filtering timeout after 5 seconds`);
        resolve([]);
      }, 5000); // 5 second timeout
    });
    
    // Process categories with year range filtering
    console.log(`[DEBUG] getCategoriesForRound: Starting categories processing with year range`);
    const processingPromise = new Promise(resolve => {
      const resultCategories = [];
      
      // Process categories up to the limit
      console.log(`[DEBUG] getCategoriesForRound: Will process up to ${maxCategoriesToProcess} categories`);
      for (const category of shuffledCategories) {
        if (counter >= maxCategoriesToProcess || resultCategories.length >= CATEGORIES_PER_ROUND) {
          console.log(`[DEBUG] getCategoriesForRound: Hit processing limit or found enough categories`);
          break;
        }
        
        // Skip if already processed
        if (processedCategories.has(category.category)) {
          continue;
        }
        
        processedCategories.add(category.category);
        counter++;
        
        if (counter % 100 === 0) {
          console.log(`[DEBUG] getCategoriesForRound: Processed ${counter} categories so far`);
        }
        
        // Use the optimized function that uses indexes
        console.log(`[DEBUG] getCategoriesForRound: Getting questions for year range ${startYear}-${endYear} and round ${round}`);
        const questions = db.getQuestionsByYearRangeAndRound(startYear, endYear, round);
        
        // Filter to just this category
        console.log(`[DEBUG] getCategoriesForRound: Filtering questions for category "${category.category}"`);
        const categoryQuestions = questions.filter(q => q.category === category.category);
        
        // Check if this category has enough questions
        if (categoryQuestions.length >= CLUES_PER_CATEGORY) {
          console.log(`[DEBUG] getCategoriesForRound: Found enough questions (${categoryQuestions.length}) for category "${category.category}"`);
          resultCategories.push({
            name: category.category,
            questions: sortQuestionsByDifficulty(categoryQuestions).slice(0, CLUES_PER_CATEGORY)
          });
          
          console.log(`[DEBUG] Found category: ${category.category} (within year range)`);
          
          // Stop if we have enough categories
          if (resultCategories.length >= CATEGORIES_PER_ROUND) {
            console.log(`[DEBUG] getCategoriesForRound: Found ${CATEGORIES_PER_ROUND} categories, stopping search`);
            break;
          }
        } else {
          console.log(`[DEBUG] getCategoriesForRound: Not enough questions (${categoryQuestions.length}) for category "${category.category}"`);
        }
        
        // Check for timeout
        const elapsed = Date.now() - startTime;
        if (elapsed > 5000) {
          timeoutOccurred = true;
          console.log(`[DEBUG] Year range filtering execution timeout after ${elapsed}ms`);
          break;
        }
      }
      
      console.log(`[DEBUG] getCategoriesForRound: Year range filtering finished, found ${resultCategories.length} categories`);
      resolve(resultCategories);
    });
    
    // Race between timeout and processing
    console.log(`[DEBUG] getCategoriesForRound: Starting race between timeout and processing`);
    const categoriesWithinYearRange = await Promise.race([
      timeoutPromise,
      processingPromise
    ]);
    
    console.log(`[DEBUG] getCategoriesForRound: Race completed, resulted in ${categoriesWithinYearRange.length} categories`);
    categories.push(...categoriesWithinYearRange);
    
    console.log(`[DEBUG] Found ${categories.length} categories with year range filter`);
  }
  
  // If we don't have enough categories from year range filtering, fill with any categories
  if (categories.length < CATEGORIES_PER_ROUND) {
    if (yearRange) {
      console.log(`[DEBUG] getCategoriesForRound: Not enough categories found with year range. Falling back to all categories.`);
    }
    
    let counter = 0;
    startTime = Date.now(); // Reset timer for the general search
    
    console.log(`[DEBUG] getCategoriesForRound: Starting general category search`);
    for (const category of shuffledCategories) {
      if (counter >= maxCategoriesToProcess || categories.length >= CATEGORIES_PER_ROUND) {
        console.log(`[DEBUG] getCategoriesForRound: Hit processing limit or found enough categories in general search`);
        break;
      }
      
      // Skip if already processed
      if (processedCategories.has(category.category)) {
        continue;
      }
      
      processedCategories.add(category.category);
      counter++;
      
      if (counter % 100 === 0) {
        console.log(`[DEBUG] getCategoriesForRound: General search processed ${counter} categories so far`);
      }
      
      // Get all questions for this category and round
      console.log(`[DEBUG] getCategoriesForRound: Getting random questions for category "${category.category}"`);
      const allCategoryQuestions = db.getRandomQuestionsByCategory(category.category, round, CLUES_PER_CATEGORY);
      
      // Check if this category has enough questions
      if (allCategoryQuestions.length >= CLUES_PER_CATEGORY) {
        console.log(`[DEBUG] getCategoriesForRound: Found enough questions (${allCategoryQuestions.length}) for category "${category.category}" in general search`);
        categories.push({
          name: category.category,
          questions: sortQuestionsByDifficulty(allCategoryQuestions).slice(0, CLUES_PER_CATEGORY)
        });
        
        console.log(`[DEBUG] Found category: ${category.category} (general search)`);
      } else {
        console.log(`[DEBUG] getCategoriesForRound: Not enough questions (${allCategoryQuestions.length}) for category "${category.category}" in general search`);
      }
      
      // Check for timeout
      const elapsed = Date.now() - startTime;
      if (elapsed > 3000) {
        console.log(`[DEBUG] General category search timeout after ${elapsed}ms`);
        break;
      }
    }
  }
  
  // Do not create placeholder categories - if we don't have enough, return what we have
  if (categories.length < CATEGORIES_PER_ROUND) {
    console.log(`[DEBUG] getCategoriesForRound: Warning: Only found ${categories.length} categories for round ${round}. This is fewer than the desired ${CATEGORIES_PER_ROUND}.`);
  }
  
  const duration = Date.now() - startTime;
  console.log(`[DEBUG] Final categories for round ${round}: ${categories.map(c => c.name).join(', ')}`);
  console.log(`[DEBUG] getCategoriesForRound: Time to construct categories for round ${round}: ${duration}ms`);
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
  console.log('[DEBUG] setupGameBoard - Start:', { yearStart, yearEnd });
  
  try {
    // Create year range array if both values are provided
    const startYear = yearStart ? parseInt(yearStart) : 1984;
    const endYear = yearEnd ? parseInt(yearEnd) : 2024;
    
    console.log(`[DEBUG] Using year range: ${startYear}-${endYear}`);
    
    // Get categories for each round using the new preprocessed approach
    console.log('[DEBUG] Setting up Jeopardy round...');
    const round1Categories = db.getCompleteCategoriesForYearRange(startYear, endYear, 1, 6);
    console.log(`[DEBUG] Retrieved ${round1Categories.length} complete categories for round 1`);
    
    console.log('[DEBUG] Setting up Double Jeopardy round...');
    const round2Categories = db.getCompleteCategoriesForYearRange(startYear, endYear, 2, 6);
    console.log(`[DEBUG] Retrieved ${round2Categories.length} complete categories for round 2`);
    
    console.log('[DEBUG] Setting up Final Jeopardy...');
    const finalJeopardyCategories = db.getCompleteCategoriesForYearRange(startYear, endYear, 3, 1);
    console.log(`[DEBUG] Retrieved ${finalJeopardyCategories.length} complete categories for Final Jeopardy`);
    
    // Format the game board with the retrieved categories
    const result = {
      jeopardy: round1Categories.map(cat => ({
        name: cat.name,
        clues: cat.questions.map(q => ({
          id: q.id,
          value: q.clue_value || (q.round === 1 ? 200 : 400) * ((q.question_num || 1) % 5 + 1),
          clue: q.answer || q.clue, // In dataset, "answer" is the clue shown to players
          response: q.question || q.response, // "question" is what contestants must respond with
          dailyDouble: false, // We'll set daily doubles after
          originalClueValue: q.clue_value || 0,
          additionalInfo: {
            category: cat.name,
            airDate: cat.airDate,
            categoryComments: q.comments || null,
            notes: q.notes || null
          }
        }))
      })),
      doubleJeopardy: round2Categories.map(cat => ({
        name: cat.name,
        clues: cat.questions.map(q => ({
          id: q.id,
          value: q.clue_value || (q.round === 1 ? 200 : 400) * ((q.question_num || 1) % 5 + 1),
          clue: q.answer || q.clue,
          response: q.question || q.response,
          dailyDouble: false, // We'll set daily doubles after
          originalClueValue: q.clue_value || 0,
          additionalInfo: {
            category: cat.name,
            airDate: cat.airDate,
            categoryComments: q.comments || null,
            notes: q.notes || null
          }
        }))
      })),
      finalJeopardy: finalJeopardyCategories.length > 0 ? {
        round: 3,
        category: finalJeopardyCategories[0].name,
        clue: finalJeopardyCategories[0].questions[0].answer || finalJeopardyCategories[0].questions[0].clue,
        response: finalJeopardyCategories[0].questions[0].question || finalJeopardyCategories[0].questions[0].response,
        additionalInfo: {
          category: finalJeopardyCategories[0].name,
          airDate: finalJeopardyCategories[0].airDate,
          categoryComments: finalJeopardyCategories[0].questions[0].comments || null,
          notes: finalJeopardyCategories[0].questions[0].notes || null
        }
      } : createFallbackFinalJeopardy()
    };
    
    // Add daily doubles
    if (result.jeopardy && result.jeopardy.length > 0) {
      // One daily double in round 1
      const randomCategoryIndex = Math.floor(Math.random() * result.jeopardy.length);
      const randomClueIndex = Math.floor(Math.random() * result.jeopardy[randomCategoryIndex].clues.length);
      result.jeopardy[randomCategoryIndex].clues[randomClueIndex].dailyDouble = true;
    }
    
    if (result.doubleJeopardy && result.doubleJeopardy.length > 0) {
      // Two daily doubles in round 2
      // First daily double
      const randomCatIndex1 = Math.floor(Math.random() * result.doubleJeopardy.length);
      const randomClueIndex1 = Math.floor(Math.random() * result.doubleJeopardy[randomCatIndex1].clues.length);
      result.doubleJeopardy[randomCatIndex1].clues[randomClueIndex1].dailyDouble = true;
      
      // Second daily double (in a different location)
      let randomCatIndex2 = Math.floor(Math.random() * result.doubleJeopardy.length);
      let randomClueIndex2 = Math.floor(Math.random() * result.doubleJeopardy[randomCatIndex2].clues.length);
      
      // Make sure it's not the same as the first
      while (randomCatIndex2 === randomCatIndex1 && randomClueIndex2 === randomClueIndex1) {
        randomCatIndex2 = Math.floor(Math.random() * result.doubleJeopardy.length);
        randomClueIndex2 = Math.floor(Math.random() * result.doubleJeopardy[randomCatIndex2].clues.length);
      }
      
      result.doubleJeopardy[randomCatIndex2].clues[randomClueIndex2].dailyDouble = true;
    }
    
    console.log('[DEBUG] Game board setup complete:', {
      hasJeopardy: !!result.jeopardy,
      jeopardyCategories: result.jeopardy?.length,
      hasDoubleJeopardy: !!result.doubleJeopardy,
      doubleJeopardyCategories: result.doubleJeopardy?.length,
      hasFinalJeopardy: !!result.finalJeopardy
    });
    
    console.timeEnd('setupGameBoard');
    return result;
    
  } catch (error) {
    console.error('[DEBUG] Error in setupGameBoard:', error);
    console.error('[DEBUG] Error stack:', error.stack);
    console.log('[DEBUG] Using fallback data for the entire game');
    
    // Return fallback game data to ensure we don't hang
    const fallbackGame = {
      jeopardy: createFallbackRound(1).board,
      doubleJeopardy: createFallbackRound(2).board,
      finalJeopardy: createFallbackFinalJeopardy()
    };
    
    console.timeEnd('setupGameBoard');
    return fallbackGame;
  }
}

// Create fallback round data when DB queries fail
function createFallbackRound(roundNum) {
  console.log(`[DEBUG] Creating fallback data for round ${roundNum}`);
  const baseValue = roundNum === 1 ? 200 : 400;
  const categories = [
    'FALLBACK CATEGORY 1',
    'FALLBACK CATEGORY 2',
    'FALLBACK CATEGORY 3',
    'FALLBACK CATEGORY 4',
    'FALLBACK CATEGORY 5',
    'FALLBACK CATEGORY 6'
  ];
  
  const board = categories.map(categoryName => {
    return {
      name: categoryName,
      clues: Array.from({ length: 5 }, (_, index) => {
        const value = (index + 1) * baseValue;
        return {
          id: `fallback-${roundNum}-${categoryName}-${index}`,
          value: value,
          clue: `This is a fallback clue worth $${value}`,
          response: `What is a fallback answer for ${categoryName}?`,
          dailyDouble: false,
          originalClueValue: value,
          additionalInfo: {
            category: categoryName,
            airDate: null,
            categoryComments: null,
            notes: "This is fallback data"
          }
        };
      })
    };
  });
  
  // Add a daily double
  const randomCategoryIndex = Math.floor(Math.random() * board.length);
  const randomClueIndex = Math.floor(Math.random() * board[randomCategoryIndex].clues.length);
  board[randomCategoryIndex].clues[randomClueIndex].dailyDouble = true;
  
  // For Double Jeopardy, add a second daily double
  if (roundNum === 2) {
    let secondCategoryIndex = Math.floor(Math.random() * board.length);
    let secondClueIndex = Math.floor(Math.random() * board[secondCategoryIndex].clues.length);
    
    // Make sure it's different from the first one
    while (secondCategoryIndex === randomCategoryIndex && 
           secondClueIndex === randomClueIndex) {
      secondCategoryIndex = Math.floor(Math.random() * board.length);
      secondClueIndex = Math.floor(Math.random() * board[secondCategoryIndex].clues.length);
    }
    
    board[secondCategoryIndex].clues[secondClueIndex].dailyDouble = true;
  }
  
  return {
    round: roundNum,
    board
  };
}

// Create fallback Final Jeopardy data
function createFallbackFinalJeopardy() {
  console.log('[DEBUG] Creating fallback data for Final Jeopardy');
  return {
    round: 3,
    category: 'FALLBACK FINAL JEOPARDY',
    clue: 'This is a fallback Final Jeopardy clue',
    response: 'What is a fallback Final Jeopardy response?',
    additionalInfo: {
      category: 'FALLBACK FINAL JEOPARDY',
      airDate: null,
      categoryComments: null,
      notes: "This is fallback data"
    }
  };
}

module.exports = {
  generateRoomCode,
  isPlayerRejoining,
  setupJeopardy,
  setupDoubleJeopardy,
  setupFinalJeopardy,
  setupGame,
  setupGameBoard,
  createFallbackRound,
  createFallbackFinalJeopardy,
  
  // For testing
  getCategoriesForRound,
  CATEGORIES_PER_ROUND,
  CLUES_PER_CATEGORY
}; 