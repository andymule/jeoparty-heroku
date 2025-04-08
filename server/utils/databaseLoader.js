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
  const dateQuestions = inMemoryDataset.filter(q => q.air_date === date);
  
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
      value: q.clue_value || (round === 'round1' ? 200 : 400) * (gameData[round].board[category].length + 1),
      revealed: false
    });
  });
  
  // If we don't have enough categories or questions, generate some categories
  if (gameData.round1.categories.length < 6 || gameData.round2.categories.length < 6) {
    console.log(`No complete game data found for date ${date}. Using questions from other dates.`);
    
    // Get all categories
    const allCategories = [...new Set(inMemoryDataset.map(q => q.category))];
    
    // For each round, ensure we have 6 categories with 5 questions each
    ['round1', 'round2'].forEach(roundKey => {
      const roundNum = roundKey === 'round1' ? 1 : 2;
      
      // Add more categories if needed
      while (gameData[roundKey].categories.length < 6) {
        // Get a random category that's not already in this round
        const randomCategory = allCategories[Math.floor(Math.random() * allCategories.length)];
        if (!gameData[roundKey].categories.includes(randomCategory)) {
          gameData[roundKey].categories.push(randomCategory);
          
          // Add questions for this category
          const categoryQuestions = inMemoryDataset.filter(q => 
            q.category === randomCategory && q.round === roundNum
          );
          
          if (categoryQuestions.length > 0) {
            gameData[roundKey].board[randomCategory] = [];
            
            // Take up to 5 questions, or generate synthetic ones if needed
            for (let i = 0; i < 5; i++) {
              const value = roundKey === 'round1' ? (i + 1) * 200 : (i + 1) * 400;
              
              if (i < categoryQuestions.length) {
                gameData[roundKey].board[randomCategory].push({
                  text: categoryQuestions[i].answer,
                  answer: categoryQuestions[i].question,
                  value: value,
                  revealed: false
                });
              } else {
                gameData[roundKey].board[randomCategory].push({
                  text: `Clue for ${randomCategory} worth $${value}`,
                  answer: `What is the answer to ${randomCategory} for $${value}?`,
                  value: value,
                  revealed: false
                });
              }
            }
          }
        }
      }
      
      // Ensure each category has 5 questions
      gameData[roundKey].categories.forEach(category => {
        if (!gameData[roundKey].board[category]) {
          gameData[roundKey].board[category] = [];
        }
        
        while (gameData[roundKey].board[category].length < 5) {
          const value = (gameData[roundKey].board[category].length + 1) * (roundKey === 'round1' ? 200 : 400);
          
          gameData[roundKey].board[category].push({
            text: `Clue for ${category} worth $${value}`,
            answer: `What is the answer to ${category} for $${value}?`,
            value: value,
            revealed: false
          });
        }
      });
    });
    
    // Ensure we have a Final Jeopardy question
    if (!gameData.finalJeopardy) {
      const finalJeopardyQuestions = inMemoryDataset.filter(q => q.round === 3);
      
      if (finalJeopardyQuestions.length > 0) {
        const randomFinal = finalJeopardyQuestions[Math.floor(Math.random() * finalJeopardyQuestions.length)];
        gameData.finalJeopardy = {
          category: randomFinal.category,
          text: randomFinal.answer,
          answer: randomFinal.question
        };
      } else {
        // Create a synthetic Final Jeopardy
        const randomCategory = allCategories[Math.floor(Math.random() * allCategories.length)];
        gameData.finalJeopardy = {
          category: randomCategory,
          text: `This is a Final Jeopardy clue in the category ${randomCategory}`,
          answer: `What is the answer to Final Jeopardy in ${randomCategory}?`
        };
      }
    }
  }
  
  return gameData;
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