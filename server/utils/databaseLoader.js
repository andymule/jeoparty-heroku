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
    console.log("No Final Jeopardy question found, creating synthetic one");
    gameData.finalJeopardy = {
      category: "FINAL JEOPARDY",
      text: "This service helped create a synthetic Final Jeopardy question when none was available",
      answer: "What is AI?"
    };
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
    
    // If we don't have enough categories, add more from the dataset
    if (round.categories.length < 6) {
      console.log(`Round ${roundNum} has only ${round.categories.length} categories. Adding more...`);
      addCategoriesFromDataset(round, 6 - round.categories.length, roundNum);
    }
    
    // Ensure each category has exactly 5 questions
    round.categories.forEach(category => {
      if (!round.board[category]) {
        console.log(`Category ${category} has no questions. Adding default questions.`);
        round.board[category] = [];
      }
      
      // If category has less than 5 questions, add more
      if (round.board[category].length < 5) {
        addQuestionsToCategory(round, category, roundNum, 5 - round.board[category].length);
      }
      
      // If category has more than 5 questions, trim to 5
      if (round.board[category].length > 5) {
        console.log(`Category ${category} has ${round.board[category].length} questions. Trimming to 5.`);
        round.board[category] = round.board[category].slice(0, 5);
      }
      
      // Ensure questions have correct values (200-1000 for round 1, 400-2000 for round 2)
      for (let i = 0; i < round.board[category].length; i++) {
        const question = round.board[category][i];
        question.value = (roundNum === 1 ? 200 : 400) * (i + 1);
      }
    });
  });
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
  
  // Get questions for this category that aren't already used
  const existingQuestionIds = new Set(round.board[category].map(q => q.id));
  const availableQuestions = inMemoryDataset.filter(q => 
    q.category === category && 
    q.round === roundNum && 
    !existingQuestionIds.has(q.id)
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
    console.log(`No real questions available for category ${category}, creating synthetic ones`);
  }
  
  // If we still don't have enough questions, add synthetic ones
  while (round.board[category].length < 5) {
    // Find the first missing position
    const existingPositions = round.board[category].map((q, i) => i);
    const allPositions = [0, 1, 2, 3, 4];
    const missingPositions = allPositions.filter(pos => !existingPositions.includes(pos));
    
    // Sort missing positions to fill from lowest to highest
    missingPositions.sort((a, b) => a - b);
    
    // Take the first missing position
    const position = missingPositions[0];
    const value = (roundNum === 1 ? 200 : 400) * (position + 1);
    
    // Create the synthetic question
    const syntheticQuestion = {
      id: `synthetic-${category}-${position}`,
      text: `Clue for ${category} worth $${value}`,
      answer: `What is the answer to ${category} for $${value}?`,
      value: value,
      originalValue: null,
      revealed: false
    };
    
    // Insert at the correct position
    if (position < round.board[category].length) {
      round.board[category][position] = syntheticQuestion;
    } else {
      round.board[category].push(syntheticQuestion);
    }
    
    console.log(`Added synthetic question at position ${position} with value $${value}`);
  }
  
  // Sort the category's questions by value to ensure correct ordering
  round.board[category].sort((a, b) => a.value - b.value);
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

module.exports = {
  getAvailableDates,
  getDatesByYearRange,
  loadGameByDate,
  getRandomDate,
  datasetExists,
  downloadInstructions,
}; 