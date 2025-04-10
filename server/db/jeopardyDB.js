/**
 * JeopardyDB - Database utility for Jeopardy data
 */

const db = require('../db');

// Get all available dates with games
async function getAvailableDates() {
  console.log('Getting all available dates');
  
  try {
    // For now, return some sample dates until we implement the real database query
    const sampleDates = [];
    
    // Generate 500 random dates between 1984 and 2024
    const startYear = 1984;
    const endYear = 2024;
    
    for (let i = 0; i < 500; i++) {
      const year = Math.floor(Math.random() * (endYear - startYear + 1)) + startYear;
      const month = Math.floor(Math.random() * 12) + 1;
      const day = Math.floor(Math.random() * 28) + 1; // Avoid date validation issues
      
      const date = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
      if (!sampleDates.includes(date)) {
        sampleDates.push(date);
      }
    }
    
    return sampleDates.sort();
  } catch (error) {
    console.error('Error getting available dates:', error);
    return [];
  }
}

// Get dates filtered by year range
async function getDatesByYearRange(startYear, endYear) {
  console.log(`Getting dates between ${startYear} and ${endYear}`);
  
  try {
    // For now, generate sample dates within the specified year range
    const sampleDates = [];
    
    // Generate dates within the year range
    for (let i = 0; i < 200; i++) {
      const year = Math.floor(Math.random() * (endYear - startYear + 1)) + startYear;
      const month = Math.floor(Math.random() * 12) + 1;
      const day = Math.floor(Math.random() * 28) + 1; // Avoid date validation issues
      
      const date = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
      if (!sampleDates.includes(date)) {
        sampleDates.push(date);
      }
    }
    
    return sampleDates.sort();
  } catch (error) {
    console.error(`Error getting dates by year range (${startYear}-${endYear}):`, error);
    return [];
  }
}

// Load game data for a specific date
async function loadGameByDate(date) {
  console.log(`Loading game for date: ${date}`);
  
  try {
    // For now, return a placeholder game
    return {
      date,
      round1: {
        categories: ['HISTORY', 'SCIENCE', 'SPORTS', 'MOVIES', 'MUSIC', 'POTPOURRI'],
        board: {}
      },
      round2: {
        categories: ['ART', 'LITERATURE', 'GEOGRAPHY', 'FOOD', 'ANIMALS', 'TV SHOWS'],
        board: {}
      },
      finalJeopardy: {
        category: 'WORLD CAPITALS',
        question: 'This European capital sits on the Danube River',
        answer: 'What is Budapest?'
      }
    };
  } catch (error) {
    console.error(`Error loading game for date ${date}:`, error);
    return null;
  }
}

module.exports = {
  getAvailableDates,
  getDatesByYearRange,
  loadGameByDate
}; 