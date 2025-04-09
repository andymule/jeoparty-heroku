const fs = require('fs');
const path = require('path');

// Cache for dataset
let questionsDataset = null;
let categoriesCache = null;
let yearRangeCache = null;

// Indexes for quick lookups
let categoryYearIndex = null;
let yearQuestionsIndex = null;
let difficultyIndex = null;

/**
 * Load the J! Archive dataset
 */
function loadDataset() {
  if (questionsDataset) return questionsDataset;
  
  console.log('Loading J! Archive dataset...');
  const dataPath = path.join(__dirname, '../../data/jeopardy_questions.json');
  
  try {
    const rawData = fs.readFileSync(dataPath, 'utf8');
    questionsDataset = JSON.parse(rawData);
    console.log(`Loaded ${questionsDataset.length} questions from dataset`);
    
    // Build indexes after loading the dataset
    buildIndexes();
    
    return questionsDataset;
  } catch (error) {
    console.error('Error loading dataset:', error);
    throw new Error('Failed to load Jeopardy dataset');
  }
}

/**
 * Build indexes for efficient data access
 */
function buildIndexes() {
  console.log('Building database indexes...');
  
  // Index categories by year
  categoryYearIndex = {};
  
  // Index questions by year
  yearQuestionsIndex = {};
  
  // Index by difficulty (value)
  difficultyIndex = {
    200: [],
    400: [],
    600: [],
    800: [],
    1000: []
  };
  
  // Process each question to build indexes
  for (const question of questionsDataset) {
    const year = new Date(question.air_date).getFullYear();
    const categoryId = question.category_id;
    const value = parseInt(question.value?.replace(/[^0-9]/g, '') || '0');
    
    // Build category year index
    if (!categoryYearIndex[year]) {
      categoryYearIndex[year] = new Set();
    }
    categoryYearIndex[year].add(categoryId);
    
    // Build year questions index
    if (!yearQuestionsIndex[year]) {
      yearQuestionsIndex[year] = [];
    }
    yearQuestionsIndex[year].push(question);
    
    // Build difficulty index
    // Map various values to standard ones (200, 400, 600, 800, 1000)
    let standardValue = 200;
    if (value > 0) {
      if (value <= 200) standardValue = 200;
      else if (value <= 400) standardValue = 400;
      else if (value <= 600) standardValue = 600;
      else if (value <= 800) standardValue = 800;
      else standardValue = 1000;
    }
    
    if (difficultyIndex[standardValue]) {
      difficultyIndex[standardValue].push(question);
    }
  }
  
  console.log(`Built indexes with ${Object.keys(categoryYearIndex).length} years`);
}

/**
 * Get all unique categories from the dataset
 */
function getCategories() {
  if (categoriesCache) return categoriesCache;
  
  const dataset = loadDataset();
  const categoriesMap = new Map();
  
  // Extract unique categories
  for (const question of dataset) {
    categoriesMap.set(question.category_id, {
      id: question.category_id,
      name: question.category,
      clue_count: categoriesMap.has(question.category_id) 
        ? categoriesMap.get(question.category_id).clue_count + 1 
        : 1
    });
  }
  
  // Convert map to array and sort by name
  categoriesCache = Array.from(categoriesMap.values()).sort((a, b) => 
    a.name.localeCompare(b.name)
  );
  
  return categoriesCache;
}

/**
 * Get min and max years from the dataset
 */
function getYearRange() {
  if (yearRangeCache) return yearRangeCache;
  
  const dataset = loadDataset();
  let minYear = 3000;
  let maxYear = 1000;
  
  // Find min and max years
  for (const question of dataset) {
    const year = new Date(question.air_date).getFullYear();
    minYear = Math.min(minYear, year);
    maxYear = Math.max(maxYear, year);
  }
  
  yearRangeCache = { min: minYear, max: maxYear };
  return yearRangeCache;
}

/**
 * Get categories filtered by year range
 * Uses the category year index for efficient filtering
 */
function getCategoriesByYearRange(minYear, maxYear) {
  loadDataset(); // Ensure dataset and indexes are loaded
  
  // Get all possible years within range
  const years = Object.keys(categoryYearIndex)
    .map(year => parseInt(year))
    .filter(year => year >= minYear && year <= maxYear);
  
  // Create a set of unique category IDs that appear in the year range
  const categoryIds = new Set();
  for (const year of years) {
    const categoriesForYear = categoryYearIndex[year];
    if (categoriesForYear) {
      for (const categoryId of categoriesForYear) {
        categoryIds.add(categoryId);
      }
    }
  }
  
  // Get full category data for these IDs
  const allCategories = getCategories();
  const filteredCategories = allCategories.filter(category => 
    categoryIds.has(category.id)
  );
  
  return filteredCategories;
}

/**
 * Get questions for a specific category
 */
function getQuestionsByCategory(categoryId) {
  const dataset = loadDataset();
  
  return dataset.filter(question => 
    question.category_id === categoryId
  );
}

/**
 * Get questions for a specific category filtered by year range
 * Uses indexed access for better performance
 */
function getQuestionsByCategoryAndYearRange(categoryId, minYear, maxYear) {
  loadDataset(); // Ensure dataset and indexes are loaded
  
  let result = [];
  
  // Use the year questions index to efficiently find questions
  for (let year = minYear; year <= maxYear; year++) {
    if (yearQuestionsIndex[year]) {
      const questionsInYear = yearQuestionsIndex[year].filter(q => 
        q.category_id === categoryId
      );
      result = result.concat(questionsInYear);
    }
  }
  
  return result;
}

/**
 * Get questions by difficulty (value)
 */
function getQuestionsByDifficulty(value) {
  loadDataset(); // Ensure dataset and indexes are loaded
  
  // Map value to standard values if needed
  let standardValue = 200;
  if (value <= 200) standardValue = 200;
  else if (value <= 400) standardValue = 400;
  else if (value <= 600) standardValue = 600;
  else if (value <= 800) standardValue = 800;
  else standardValue = 1000;
  
  return difficultyIndex[standardValue] || [];
}

/**
 * Get a random category with sufficient clues
 * Can filter by year range for more targeted selection
 */
function getRandomCategory(minClues = 5, minYear = null, maxYear = null) {
  // Get categories, optionally filtered by year range
  const categories = minYear && maxYear
    ? getCategoriesByYearRange(minYear, maxYear)
    : getCategories();
  
  // Filter categories with enough clues
  const eligibleCategories = categories.filter(category => 
    category.clue_count >= minClues
  );
  
  if (eligibleCategories.length === 0) {
    return null;
  }
  
  // Select a random category
  const randomIndex = Math.floor(Math.random() * eligibleCategories.length);
  return eligibleCategories[randomIndex];
}

module.exports = {
  loadDataset,
  getCategories,
  getYearRange,
  getCategoriesByYearRange,
  getQuestionsByCategory,
  getQuestionsByCategoryAndYearRange,
  getQuestionsByDifficulty,
  getRandomCategory
}; 