/**
 * Utility module for loading and parsing the Jeopardy clue dataset
 * Source: https://github.com/jwolle1/jeopardy_clue_dataset
 */

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { inMemoryDataset } = require('../db');

// Only use the combined dataset file
const datasetPath = path.join(__dirname, '../../data/combined_season1-40.tsv');

// Check if the dataset exists
function datasetExists() {
  try {
    return fs.existsSync(datasetPath);
  } catch (error) {
    console.error('Error checking for dataset:', error);
    return false;
  }
}

// Provide instructions for checking the dataset
function downloadInstructions() {
  return `
    Jeopardy dataset should be located at:
    
    ${datasetPath}
    
    Please verify that the file exists in the data directory.
  `;
}

// Get available game dates from the dataset
async function getAvailableDates(yearRange = null) {
  if (!datasetExists()) {
    throw new Error('Dataset file not found. Please download and place in the data directory.');
  }
  
  const dates = new Set();
  
  // Use in-memory dataset
  inMemoryDataset.forEach(q => {
    if (q.air_date) {
      // Filter by year range if provided
      if (yearRange) {
        const year = new Date(q.air_date).getFullYear();
        if (year >= yearRange.start && year <= yearRange.end) {
          dates.add(q.air_date);
        }
      } else {
        dates.add(q.air_date);
      }
    }
  });
  
  return [...dates].sort();
}

// Get dates filtered by year range
async function getDatesByYearRange(startYear, endYear) {
  if (!startYear || !endYear) {
    return getAvailableDates();
  }
  
  return getAvailableDates({ start: startYear, end: endYear });
}

// Load game data for a specific date
async function loadGameByDate(date) {
  if (!datasetExists()) {
    throw new Error(`Dataset file not found. Please download and place in the data directory.`);
  }
  
  const gameData = {
    date,
    round1: { categories: [], board: {} },
    round2: { categories: [], board: {} },
    finalJeopardy: null
  };
  
  // Get questions for this date from in-memory dataset
  let dateQuestions = inMemoryDataset.filter(q => q.air_date === date);
  
  // If no questions found for this date, try to find a different date from the same year
  if (dateQuestions.length === 0) {
    const year = date.substring(0, 4);
    console.log(`No questions found for date ${date}. Trying to find questions from year ${year}...`);
    
    // Get all dates from the same year
    const datesInYear = [...new Set(
      inMemoryDataset
        .filter(q => q.air_date && q.air_date.startsWith(year))
        .map(q => q.air_date)
    )];
    
    if (datesInYear.length > 0) {
      // Pick a random date from the same year
      const randomDateFromYear = datesInYear[Math.floor(Math.random() * datesInYear.length)];
      console.log(`Using alternative date ${randomDateFromYear} from the same year.`);
      
      // Update the date in the game data
      gameData.date = randomDateFromYear;
      
      // Get questions for the new date
      dateQuestions = inMemoryDataset.filter(q => q.air_date === randomDateFromYear);
    } else {
      console.log(`No questions found for year ${year}. Will create a synthetic game board.`);
    }
  }
  
  // Process each question
  dateQuestions.forEach(q => {
    const category = q.category;
    const roundNum = q.round;
    
    let round;
    if (roundNum === 1) {
      round = 'round1';
    } else if (roundNum === 2) {
      round = 'round2';
    } else if (roundNum === 3) {
      round = 'final';
    } else {
      return; // Skip if invalid round
    }
    
    if (round === 'final') {
      gameData.finalJeopardy = {
        category,
        text: q.answer, // The clue shown to contestants
        answer: q.question // What contestants must respond with
      };
      return;
    }
    
    // Add category if not already added
    if (!gameData[round].categories.includes(category)) {
      gameData[round].categories.push(category);
    }
    
    // Initialize category in board if not exists
    if (!gameData[round].board[category]) {
      gameData[round].board[category] = [];
    }
    
    // Add question to the board
    gameData[round].board[category].push({
      text: q.answer, // The clue shown to contestants
      answer: q.question, // What contestants must respond with
      value: (round === 'round1' ? 200 : 400) * (gameData[round].board[category].length + 1),
      originalValue: q.clue_value, // Store original value for reference only
      revealed: false
    });
  });
  
  // Ensure we have enough categories and questions
  ensureCompleteGameBoard(gameData);
  
  // Create fallback final Jeopardy if none exists
  if (!gameData.finalJeopardy) {
    console.log("No Final Jeopardy question found, finding a real one from the dataset");
    
    // Get all final jeopardy questions from the dataset
    const finalJeopardyQuestions = inMemoryDataset.filter(q => q.round === 3);
    
    if (finalJeopardyQuestions.length > 0) {
      // Choose a random Final Jeopardy question
      const randomIndex = Math.floor(Math.random() * finalJeopardyQuestions.length);
      const finalQuestion = finalJeopardyQuestions[randomIndex];
      
      gameData.finalJeopardy = {
        category: finalQuestion.category,
        text: finalQuestion.answer, // The clue shown to contestants
        answer: finalQuestion.question // What contestants must respond with
      };
      
      console.log(`Found replacement Final Jeopardy question in category: ${finalQuestion.category}`);
    } else {
      console.error("No Final Jeopardy questions found in the entire dataset!");
      throw new Error("Could not find any Final Jeopardy questions in the dataset.");
    }
  }
  
  console.log(`Loaded game data for date ${gameData.date}:`);
  console.log(`Round 1 has ${gameData.round1.categories.length} categories`);
  console.log(`Selected categories: ${gameData.round1.categories.join(', ')}`);
  console.log(`Board created with ${Object.keys(gameData.round1.board).length} categories`);
  
  return gameData;
}

// Helper function to ensure the game board is complete with 6 categories and 5 questions each
function ensureCompleteGameBoard(gameData) {
  // This function ensures each round has 6 categories with 5 questions each
  ['round1', 'round2'].forEach(roundKey => {
    const round = gameData[roundKey];
    const roundNum = roundKey === 'round1' ? 1 : 2;
    
    // Safety check: ensure all categories are valid strings
    round.categories = round.categories.filter(category => 
      category && typeof category === 'string' && category.trim() !== '' && isNaN(category)
    );
    
    // Get all possible valid categories for this round with at least 5 questions
    const validCategoriesMap = {};
    inMemoryDataset
      .filter(q => q.round === roundNum)
      .forEach(q => {
        // Skip numeric categories or empty categories
        if (!q.category || q.category === '' || !isNaN(q.category)) {
          return;
        }
        
        if (!validCategoriesMap[q.category]) {
          validCategoriesMap[q.category] = 0;
        }
        validCategoriesMap[q.category]++;
      });
    
    // Filter to categories with at least 5 questions
    const validCategories = Object.keys(validCategoriesMap)
      .filter(category => validCategoriesMap[category] >= 5)
      // Filter out any numeric category names that might have slipped through
      .filter(category => isNaN(category));
    
    console.log(`Found ${validCategories.length} valid categories with at least 5 questions for round ${roundNum}`);
    
    // Get currently valid categories (those with 5 questions)
    const currentValidCategories = round.categories.filter(category => 
      round.board[category] && round.board[category].length === 5
    );
    
    // If we don't have 6 valid categories, replace the invalid ones
    if (currentValidCategories.length < 6) {
      console.log(`Round ${roundNum} has only ${currentValidCategories.length} valid categories. Finding replacements...`);
      
      // Get categories we can use as replacements (not already in use)
      const unusedValidCategories = validCategories.filter(category => 
        !round.categories.includes(category)
      );
      
      // Shuffle for randomness
      const shuffledReplacements = unusedValidCategories.sort(() => 0.5 - Math.random());
      
      // Replace invalid categories or add new ones until we have 6 valid ones
      while (currentValidCategories.length < 6 && shuffledReplacements.length > 0) {
        const newCategory = shuffledReplacements.pop();
        
        if (!round.categories.includes(newCategory)) {
          // Add as a new category
          round.categories.push(newCategory);
          currentValidCategories.push(newCategory);
          
          // Initialize with empty array for questions
          round.board[newCategory] = [];
          
          console.log(`Added new category: ${newCategory}`);
        }
      }
      
      // If we still don't have 6 valid categories, we have a problem
      if (currentValidCategories.length < 6) {
        console.error(`Could not find 6 valid categories with 5+ questions for round ${roundNum}. Only found ${currentValidCategories.length}.`);
        throw new Error(`Not enough valid categories for round ${roundNum}. Try a different date.`);
      }
      
      // Ensure we use only valid categories
      round.categories = currentValidCategories;
    }
    
    // Ensure we have exactly 6 categories (truncate if more than 6)
    if (round.categories.length > 6) {
      console.log(`Round ${roundNum} has ${round.categories.length} categories. Trimming to 6.`);
      const extraCategories = round.categories.slice(6);
      round.categories = round.categories.slice(0, 6);
      
      // Remove the extra categories from the board
      extraCategories.forEach(category => {
        delete round.board[category];
      });
    }
    
    // Ensure each category has exactly 5 questions with real content
    let needsRebuild = false;
    round.categories.forEach(category => {
      if (!round.board[category]) {
        console.log(`Category ${category} has no questions. Adding questions from dataset.`);
        round.board[category] = [];
      }
      
      // If category has less than 5 questions, add more real ones
      if (round.board[category].length < 5) {
        addQuestionsToCategory(round, category, roundNum, 5 - round.board[category].length);
      }
      
      // If we still don't have 5 questions, this category is not valid
      if (round.board[category].length < 5) {
        console.error(`Failed to add 5 questions to category ${category}. This category should be replaced.`);
        
        // Find a replacement category
        const unusedValidCategories = validCategories.filter(cat => 
          !round.categories.includes(cat) && cat !== category
        );
        
        if (unusedValidCategories.length > 0) {
          // Replace this category with a valid one
          const replacementCategory = unusedValidCategories[0];
          const categoryIndex = round.categories.indexOf(category);
          if (categoryIndex !== -1) {
            round.categories[categoryIndex] = replacementCategory;
          }
          
          // Remove old category from board
          delete round.board[category];
          
          // Initialize replacement category
          round.board[replacementCategory] = [];
          
          // Add 5 questions to the replacement
          const addSuccess = addQuestionsToCategory(round, replacementCategory, roundNum, 5);
          
          // Verify questions were added successfully
          if (!addSuccess || !round.board[replacementCategory] || round.board[replacementCategory].length < 5) {
            console.error(`Failed to add questions to replacement category ${replacementCategory}. Trying another category.`);
            console.log(`Category has ${round.board[replacementCategory]?.length || 0} questions`);
            
            // Try another category
            if (unusedValidCategories.length > 1) {
              const nextReplacement = unusedValidCategories[1];
              round.categories[categoryIndex] = nextReplacement;
              
              // Remove the failed replacement
              delete round.board[replacementCategory];
              
              // Initialize new replacement
              round.board[nextReplacement] = [];
              
              // Add 5 questions to the new replacement
              const secondSuccess = addQuestionsToCategory(round, nextReplacement, roundNum, 5);
              console.log(`Second replacement category ${nextReplacement} has ${round.board[nextReplacement]?.length || 0} questions`);
              
              if (!secondSuccess || !round.board[nextReplacement] || round.board[nextReplacement].length < 5) {
                console.error(`Second replacement also failed. Starting fresh with different categories.`);
                
                // Instead of failing, try to rebuild the board with different categories
                needsRebuild = true;
              }
              
              console.log(`Replaced invalid category ${category} with ${nextReplacement} (second attempt)`);
            } else {
              // Instead of failing, signal that we need to rebuild
              needsRebuild = true;
            }
          } else {
            console.log(`Replaced invalid category ${category} with ${replacementCategory}`);
          }
        } else {
          console.error(`Could not find valid replacement for category ${category}. Need to rebuild.`);
          needsRebuild = true;
        }
      }
      
      // If category has more than 5 questions, trim to 5
      if (round.board[category] && round.board[category].length > 5) {
        console.log(`Category ${category} has ${round.board[category].length} questions. Trimming to 5.`);
        round.board[category] = round.board[category].slice(0, 5);
      }
      
      // Ensure questions have correct values (200-1000 for round 1, 400-2000 for round 2)
      if (round.board[category]) {
        for (let i = 0; i < round.board[category].length; i++) {
          const question = round.board[category][i];
          question.value = (roundNum === 1 ? 200 : 400) * (i + 1);
        }
      }
    });
    
    // Check if we need to rebuild due to failed replacements
    if (needsRebuild) {
      console.warn(`Rebuilding board due to failed category replacements`);
      return rebuildBoard(round, roundNum, validCategories);
    }
    
    // Double-check we have exactly 6 categories with 5 questions each
    console.log(`Round ${roundNum} final check: ${round.categories.length} categories`);
    let allCategoriesValid = true;
    for (const category of round.categories) {
      if (!round.board[category] || round.board[category].length !== 5) {
        allCategoriesValid = false;
        console.error(`Category ${category} has ${round.board[category]?.length || 0} questions, expected 5.`);
      }
    }
    
    if (!allCategoriesValid || round.categories.length !== 6) {
      console.error('Board validation failed. Rebuilding the board with new categories.');
      return rebuildBoard(round, roundNum, validCategories);
    }
  });
  
  return true;
}

// Helper function to rebuild a board with fresh categories
function rebuildBoard(round, roundNum, validCategories) {
  console.log(`Rebuilding board for round ${roundNum}`);
  
  // Avoid categories we've already tried
  const previousCategories = new Set(round.categories);
  const freshValidCategories = validCategories.filter(cat => !previousCategories.has(cat));
  
  // If we don't have enough fresh categories, use any valid ones
  const categoriesToUse = freshValidCategories.length >= 6 ? freshValidCategories : validCategories;
  
  // Start over with completely new categories
  round.categories = [];
  round.board = {};
  
  // Get a fresh set of categories, avoiding ones we've already tried if possible
  const freshCategories = categoriesToUse
    .sort(() => 0.5 - Math.random())
    .slice(0, Math.min(12, categoriesToUse.length)); // Get more than we need in case some fail
  
  if (freshCategories.length < 6) {
    console.error(`Could not find enough valid categories. Only found ${freshCategories.length}`);
    throw new Error(`Not enough valid categories for round ${roundNum}. Try a different date.`);
  }
  
  console.log(`Selected ${freshCategories.length} potential categories for rebuild`);
  
  // Find 6 categories that work
  const validCategoryList = [];
  
  for (const category of freshCategories) {
    if (validCategoryList.length >= 6) break;
    
    round.board[category] = [];
    const success = addQuestionsToCategory(round, category, roundNum, 5);
    
    if (success && round.board[category] && round.board[category].length === 5) {
      validCategoryList.push(category);
      console.log(`Added valid category: ${category}`);
    } else {
      console.log(`Category ${category} failed validation during rebuild, skipping`);
      delete round.board[category];
    }
  }
  
  // Check if we found enough valid categories
  if (validCategoryList.length < 6) {
    console.error(`Rebuild failed: could only find ${validCategoryList.length} valid categories`);
    throw new Error(`Failed to build a valid game board. Try a different date.`);
  }
  
  // Use only the valid categories
  round.categories = validCategoryList.slice(0, 6);
  
  // Double-check that all categories have 5 questions
  let allValid = true;
  for (const category of round.categories) {
    if (!round.board[category] || round.board[category].length !== 5) {
      allValid = false;
      console.error(`After rebuild, category ${category} has ${round.board[category]?.length || 0} questions`);
    }
  }
  
  if (!allValid) {
    console.error(`Rebuild failed validation check`);
    throw new Error(`Failed to create a valid game board with 6 categories of 5 questions each for round ${roundNum}.`);
  }
  
  console.log(`Rebuilt round ${roundNum} with 6 new categories: ${round.categories.join(', ')}`);
  return true;
}

// Add categories from the dataset
function addCategoriesFromDataset(round, numCategories, roundNum) {
  // Get categories from current round
  const categoriesForRound = [...new Set(
    inMemoryDataset
      .filter(q => q.round === roundNum)
      .map(q => q.category)
  )];
  
  console.log(`Found ${categoriesForRound.length} total categories for round ${roundNum}`);
  
  // Thoroughly shuffle the categories for true randomness
  const shuffledCategories = categoriesForRound
    .sort(() => 0.5 - Math.random())  // First shuffle
    .sort(() => 0.5 - Math.random())  // Second shuffle for extra randomness
    .sort(() => 0.5 - Math.random()); // Third shuffle for good measure
  
  // Take more categories than we need to increase variety between games
  const categoriesToProcess = Math.min(shuffledCategories.length, Math.max(numCategories * 3, 20));
  const candidateCategories = shuffledCategories.slice(0, categoriesToProcess);
  
  console.log(`Selected ${candidateCategories.length} candidate categories to evaluate`);
  
  // Score categories by how many questions they have
  const categoryScores = candidateCategories.map(category => {
    const questions = inMemoryDataset.filter(q => 
      q.category === category && 
      q.round === roundNum
    );
    
    return {
      category,
      questionCount: questions.length,
      // Add some randomness to the score to prevent always picking the same categories
      score: questions.length + (Math.random() * 2)
    };
  });
  
  // Sort by score (descending) and take the top ones
  const selectedCategories = categoryScores
    .sort((a, b) => b.score - a.score)
    .slice(0, numCategories)
    .map(c => c.category);
  
  console.log(`Final selected categories: ${selectedCategories.join(', ')}`);
  
  // Initialize all categories in the round
  for (const category of selectedCategories) {
    round.board[category] = [];
  }
  
  return selectedCategories;
}

// Helper function to add more questions to a category
function addQuestionsToCategory(round, category, roundNum, count) {
  console.log(`Adding ${count} more questions to category ${category} for round ${roundNum}`);
  
  try {
    // Skip invalid categories
    if (!category || typeof category !== 'string' || category.trim() === '' || !isNaN(category)) {
      console.error(`Invalid category: ${category}`);
      return false;
    }
    
    // Get questions for this category that aren't already used
    const existingQuestionIds = new Set(round.board[category].map(q => q.id).filter(Boolean));
    const availableQuestions = inMemoryDataset.filter(q => 
      q.category === category && 
      q.round === roundNum && 
      (!q.id || !existingQuestionIds.has(q.id))
    );
    
    if (availableQuestions.length > 0) {
      console.log(`Found ${availableQuestions.length} available questions from the dataset`);
      
      // Shuffle thoroughly for true randomness
      const shuffled = availableQuestions
        .sort(() => 0.5 - Math.random())  // First shuffle
        .sort(() => 0.5 - Math.random()); // Second shuffle for extra randomness
      
      const questionsToAdd = shuffled.slice(0, count);
      
      // Randomize which positions these questions will appear in
      const currentPositions = round.board[category].map((q, i) => i);
      const availablePositions = [0, 1, 2, 3, 4].filter(pos => !currentPositions.includes(pos));
      
      // Shuffle the available positions
      const shuffledPositions = availablePositions.sort(() => 0.5 - Math.random());
      
      // Add questions with appropriate values
      for (let i = 0; i < questionsToAdd.length; i++) {
        const q = questionsToAdd[i];
        
        // Use a shuffled position if available, otherwise append to the end
        const position = i < shuffledPositions.length 
          ? shuffledPositions[i] 
          : round.board[category].length;
        
        const value = (roundNum === 1 ? 200 : 400) * (position + 1);
        
        // Create the question object
        const questionObj = {
          id: q.id,
          text: q.answer,
          answer: q.question,
          value: value,
          originalValue: q.clue_value,
          revealed: false
        };
        
        // If the position is within array bounds, insert at that position
        if (position < round.board[category].length) {
          round.board[category][position] = questionObj;
        } else {
          // Otherwise append to the end
          round.board[category].push(questionObj);
        }
        
        console.log(`Added question at position ${position} with value $${value}`);
      }
    } else {
      console.log(`No real questions available for category ${category}. This category should be replaced.`);
      return false;
    }
    
    // Sort the category's questions by value to ensure correct ordering
    round.board[category].sort((a, b) => a.value - b.value);
    
    // Verify we have exactly 5 questions
    return round.board[category].length === 5;
  } catch (error) {
    console.error(`Error adding questions to category ${category}:`, error);
    return false;
  }
}

// Get a random date between specified year range or default to 1984-2023
function getRandomDate(yearRange = null) {
  let start, end;
  
  if (yearRange && yearRange.start && yearRange.end) {
    start = new Date(`${yearRange.start}-01-01`).getTime();
    end = new Date(`${yearRange.end}-12-31`).getTime();
  } else {
    start = new Date('1984-01-01').getTime();
    end = new Date('2023-12-31').getTime();
  }
  
  const randomTime = start + Math.random() * (end - start);
  const randomDate = new Date(randomTime);
  
  // Format as YYYY-MM-DD
  return randomDate.toISOString().split('T')[0];
}

/**
 * Build a game board by selecting random valid categories
 * @param {Object} yearRange - Optional year range for filtering
 * @returns {Object} Complete game board
 */
async function buildRandomGameBoard(yearRange = null) {
  console.log(`Building random game board ${yearRange ? `for years ${yearRange.start}-${yearRange.end}` : 'for all years'}`);
  
  // Initialize game data structure
  const gameData = {
    date: new Date().toISOString().slice(0, 10), // Today's date as default
    round1: {
      categories: [],
      board: {}
    },
    round2: {
      categories: [],
      board: {}
    },
    finalJeopardy: null
  };
  
  // Apply year filtering if provided
  let filteredDataset = inMemoryDataset;
  if (yearRange && yearRange.start && yearRange.end) {
    const startYear = parseInt(yearRange.start);
    const endYear = parseInt(yearRange.end);
    filteredDataset = inMemoryDataset.filter(q => {
      if (!q.air_date) return false;
      const year = new Date(q.air_date).getFullYear();
      return year >= startYear && year <= endYear;
    });
    console.log(`Filtered dataset to ${filteredDataset.length} questions within years ${startYear}-${endYear}`);
  }
  
  // Get all categories with their question counts for each round
  const categoryCounts = {};
  for (const roundNum of [1, 2]) {
    categoryCounts[roundNum] = {};
    filteredDataset
      .filter(q => q.round === roundNum)
      .forEach(q => {
        if (!q.category || typeof q.category !== 'string' || q.category.trim() === '' || !isNaN(q.category)) {
          return; // Skip invalid categories
        }
        
        if (!categoryCounts[roundNum][q.category]) {
          categoryCounts[roundNum][q.category] = 0;
        }
        categoryCounts[roundNum][q.category]++;
      });
  }
  
  // Function to build a single round
  const buildRound = async (roundNum, timeoutPromise) => {
    const roundKey = roundNum === 1 ? 'round1' : 'round2';
    const round = gameData[roundKey];
    
    console.log(`Building ${roundKey} board...`);
    
    // Get categories that have at least 5 questions
    const validCategories = Object.keys(categoryCounts[roundNum])
      .filter(category => categoryCounts[roundNum][category] >= 5)
      .filter(category => isNaN(category)); // Filter out numeric categories
    
    if (validCategories.length < 6) {
      console.error(`Not enough valid categories for round ${roundNum}. Found only ${validCategories.length}`);
      throw new Error(`Not enough valid categories for round ${roundNum}`);
    }
    
    console.log(`Found ${validCategories.length} valid categories for round ${roundNum}`);
    
    // Shuffle all valid categories
    const shuffled = [...validCategories].sort(() => 0.5 - Math.random());
    
    // Keep track of validated categories
    const validatedCategories = [];
    const testedCategories = new Set();
    
    // Try categories one by one until we have 6 valid ones
    for (const category of shuffled) {
      if (validatedCategories.length >= 6) break;
      if (testedCategories.has(category)) continue;
      
      testedCategories.add(category);
      
      // Initialize this category in the board
      round.board[category] = [];
      
      // Get all questions for this category and round
      const categoryQuestions = filteredDataset.filter(q => 
        q.category === category && q.round === roundNum
      );
      
      // Sort by clue value for appropriate difficulty progression
      categoryQuestions.sort((a, b) => {
        const aValue = a.clue_value || 0;
        const bValue = b.clue_value || 0;
        return aValue - bValue;
      });
      
      // Take 5 evenly distributed questions
      const totalQuestions = categoryQuestions.length;
      const step = Math.max(1, Math.floor(totalQuestions / 5));
      
      // Distribute questions evenly across the difficulty range
      for (let i = 0; i < 5; i++) {
        // Pick questions that are progressively more difficult
        const index = Math.min(i * step, totalQuestions - (5 - i));
        if (index < 0 || index >= categoryQuestions.length) continue;
        
        const q = categoryQuestions[index];
        const value = (roundNum === 1 ? 200 : 400) * (i + 1);
        
        // Sanitize question and answer text
        const questionText = q.answer ? sanitizeClue(q.answer) : '';
        const answerText = q.question ? sanitizeClue(q.question) : '';
        
        // Skip if question or answer is empty after sanitization
        if (!questionText || !answerText) continue;
        
        round.board[category].push({
          id: q.id,
          text: questionText,
          answer: answerText,
          value: value,
          originalValue: q.clue_value || 0,
          revealed: false
        });
      }
      
      // Check if this category has exactly 5 valid questions
      if (round.board[category].length === 5) {
        validatedCategories.push(category);
        console.log(`Validated category: ${category}`);
      } else {
        // Remove this category as it doesn't have 5 valid questions
        delete round.board[category];
        console.log(`Category ${category} failed validation: has ${round.board[category]?.length || 0} questions`);
      }
    }
    
    // Check if we found 6 valid categories
    if (validatedCategories.length < 6) {
      console.error(`Could not find 6 valid categories for round ${roundNum}. Only found ${validatedCategories.length}`);
      throw new Error(`Failed to find 6 valid categories for round ${roundNum}`);
    }
    
    // Use only the validated categories and ensure we have exactly 6
    round.categories = validatedCategories.slice(0, 6);
    
    // Verify the board structure
    console.log(`Round ${roundNum} board structure:`);
    for (const category of round.categories) {
      console.log(`Category "${category}" has ${round.board[category].length} questions with values: ${round.board[category].map(q => q.value).join(', ')}`);
    }
  };
  
  // Create a timeout promise
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Game board creation timed out after 15 seconds')), 15000);
  });
  
  try {
    // Build both rounds with timeout
    await Promise.race([buildRound(1, timeoutPromise), timeoutPromise]);
    await Promise.race([buildRound(2, timeoutPromise), timeoutPromise]);
    
    // Add Final Jeopardy question
    const finalJeopardyQuestions = filteredDataset.filter(q => q.round === 3);
    
    if (finalJeopardyQuestions.length > 0) {
      // Choose a random Final Jeopardy question
      const randomIndex = Math.floor(Math.random() * finalJeopardyQuestions.length);
      const finalQuestion = finalJeopardyQuestions[randomIndex];
      
      gameData.finalJeopardy = {
        category: finalQuestion.category,
        text: sanitizeClue(finalQuestion.answer), // The clue shown to contestants
        answer: sanitizeClue(finalQuestion.question) // What contestants must respond with
      };
      
      console.log(`Added Final Jeopardy question in category: ${finalQuestion.category}`);
    } else {
      console.warn("No Final Jeopardy questions found, trying to find one");
      
      // Try to find any final jeopardy from the full dataset
      const anyFinalJeopardy = inMemoryDataset.filter(q => q.round === 3);
      if (anyFinalJeopardy.length > 0) {
        const randomFJ = anyFinalJeopardy[Math.floor(Math.random() * anyFinalJeopardy.length)];
        gameData.finalJeopardy = {
          category: randomFJ.category,
          text: sanitizeClue(randomFJ.answer),
          answer: sanitizeClue(randomFJ.question)
        };
        console.log(`Found Final Jeopardy outside year range in category: ${randomFJ.category}`);
      } else {
        throw new Error("No Final Jeopardy questions found in dataset");
      }
    }
    
    return gameData;
  } catch (error) {
    console.error(`Error building game board: ${error.message}`);
    throw error;
  }
}

/**
 * Sanitize clue text
 */
function sanitizeClue(clueText) {
  if (!clueText) return '';
  
  // Remove content inside parentheses (often show commentary)
  let sanitized = clueText.replace(/\([^)]*\)/g, '').trim();
  
  // Remove dates in format YYYY-MM-DD that might appear at the end
  sanitized = sanitized.replace(/\s*\d{4}-\d{2}-\d{2}$/, '').trim();
  
  // Remove forward and backslashes
  sanitized = sanitized.replace(/[/\\]/g, ' ').trim();
  
  // Clean up multiple spaces
  sanitized = sanitized.replace(/\s+/g, ' ').trim();
  
  return sanitized;
}

module.exports = {
  getAvailableDates,
  getDatesByYearRange,
  loadGameByDate,
  getRandomDate,
  datasetExists,
  downloadInstructions,
  buildRandomGameBoard,
  sanitizeClue,
}; 