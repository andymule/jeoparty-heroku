const path = require('path');
const fs = require('fs');

// In-memory dataset
let inMemoryDataset = [];
const datasetPath = path.join(__dirname, '../data/combined_season1-40.tsv');
// Alternative dataset locations to try if primary location fails
const alternateDatasetPaths = [
  path.join(__dirname, '../data/jeopardy_clue_dataset-main/combined_season1-40.tsv'),
  path.join(__dirname, '../../data/combined_season1-40.tsv'),
  path.join(__dirname, '../../data/jeopardy_clue_dataset-main/combined_season1-40.tsv')
];

// Added indexes for fast lookup
const indexes = {
  byYear: {},        // { 1990: [questionIds], 1991: [questionIds], ... }
  byCategory: {},    // { "HISTORY": [questionIds], "SCIENCE": [questionIds], ... }
  byRound: {         // { 1: [questionIds], 2: [questionIds], 3: [questionIds] }
    1: [],
    2: [],
    3: []
  },
  byCategoryAndRound: {}, // { "HISTORY_1": [questionIds], "HISTORY_2": [questionIds], ... }
  byYearAndRound: {}  // { "1990_1": [questionIds], "1990_2": [questionIds], ... }
};

// Function to reset indexes - useful for testing
function resetIndexes() {
  // Clear all indexes
  Object.keys(indexes.byYear).forEach(key => delete indexes.byYear[key]);
  Object.keys(indexes.byCategory).forEach(key => delete indexes.byCategory[key]);
  indexes.byRound[1] = [];
  indexes.byRound[2] = [];
  indexes.byRound[3] = [];
  Object.keys(indexes.byCategoryAndRound).forEach(key => delete indexes.byCategoryAndRound[key]);
  Object.keys(indexes.byYearAndRound).forEach(key => delete indexes.byYearAndRound[key]);
}

// Function to unescape any remaining escaped quotes in a string
function unescapeString(str) {
  if (!str) return '';
  return str.replace(/\\"/g, '"');
}

// Function to load the entire dataset into memory
const loadDatasetIntoMemory = () => {
  try {
    console.time('loadDatasetIntoMemory');
    console.log('Loading Jeopardy dataset into memory...');
    
    // Try the primary path first
    let filePath = datasetPath;
    let fileExists = fs.existsSync(filePath);
    
    // If primary path doesn't exist, try alternates
    if (!fileExists) {
      for (const altPath of alternateDatasetPaths) {
        if (fs.existsSync(altPath)) {
          filePath = altPath;
          fileExists = true;
          console.log(`Using alternate dataset path: ${filePath}`);
          break;
        }
      }
    }
    
    if (!fileExists) {
      console.error(`Dataset file not found at ${datasetPath} or any alternate locations`);
      throw new Error(`Dataset file not found. Tried: ${datasetPath} and alternates`);
    }
    
    const isProduction = process.env.NODE_ENV === 'production';
    // In production (Heroku), limit to 10,000 questions to avoid memory issues
    const maxQuestionsInProduction = 10000;
    
    console.time('readFile');
    const data = fs.readFileSync(filePath, 'utf8');
    console.timeEnd('readFile');
    console.log(`File read complete. Size: ${(data.length / 1024 / 1024).toFixed(2)} MB`);
    
    console.time('parseData');
    const lines = data.split('\n');
    console.log(`Total lines in file: ${lines.length}`);
    
    // Skip header row
    let loadedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    
    for (let i = 1; i < lines.length; i++) {
      if (isProduction && loadedCount >= maxQuestionsInProduction) {
        console.log(`Reached limit of ${maxQuestionsInProduction} questions for production environment`);
        break;
      }
      
      const line = lines[i].trim();
      if (!line) {
        skippedCount++;
        continue;
      }
      
      try {
        // Handle TSV with potential quotes by using a custom split
        // This is more robust than a simple split('\t')
        const values = splitTsvLine(line);
        
        if (values.length < 7) {
          // console.warn(`Skipping line ${i}: insufficient columns (${values.length})`);
          skippedCount++;
          continue;
        }
        
        const questionData = {
          id: i,
          round: parseInt(values[0]) || 0,
          clue_value: parseInt(values[1]) || 0,
          daily_double_value: parseInt(values[2]) || 0,
          category: unescapeString(values[3]) || 'Unknown Category',
          comments: unescapeString(values[4]) || '',
          answer: unescapeString(values[5]) || '', // This is the clue shown to contestants
          question: unescapeString(values[6]) || '', // This is what contestants must respond with
          air_date: values[7] || null,
          notes: values.length > 8 ? unescapeString(values[8]) : ''
        };
        
        inMemoryDataset.push(questionData);
        
        // Add to indexes as we load
        indexQuestion(questionData);
        
        loadedCount++;
        
        // Log progress periodically
        if (loadedCount % 50000 === 0) {
          console.log(`Processed ${loadedCount} questions...`);
        }
      } catch (lineError) {
        console.warn(`Error parsing line ${i}: ${lineError.message}`);
        errorCount++;
      }
    }
    console.timeEnd('parseData');
    
    console.time('buildIndexes');
    // Count index sizes
    const roundQuestions = {
      1: indexes.byRound[1].length,
      2: indexes.byRound[2].length,
      3: indexes.byRound[3].length
    };
    console.timeEnd('buildIndexes');
    
    console.log(`Successfully loaded ${inMemoryDataset.length} questions into memory.`);
    console.log(`Skipped ${skippedCount} lines, encountered ${errorCount} errors during parsing.`);
    
    // Log indexes statistics
    console.log(`Created indexes: ${Object.keys(indexes.byYear).length} years, ${Object.keys(indexes.byCategory).length} categories`);
    console.log(`Questions by round: Round 1: ${roundQuestions[1]}, Round 2: ${roundQuestions[2]}, Round 3: ${roundQuestions[3]}`);
    console.timeEnd('loadDatasetIntoMemory');
    
    return true;
  } catch (error) {
    console.error('Error loading dataset into memory:', error);
    throw error;
  }
};

// Function to add a question to all indexes
function indexQuestion(question) {
  const id = question.id;
  const round = question.round;
  const category = question.category;
  
  // Index by round
  if (round > 0 && round <= 3) {
    if (!indexes.byRound[round]) {
      indexes.byRound[round] = [];
    }
    indexes.byRound[round].push(id);
  }
  
  // Index by category
  if (category) {
    if (!indexes.byCategory[category]) {
      indexes.byCategory[category] = [];
    }
    indexes.byCategory[category].push(id);
  }
  
  // Index by category and round
  if (category && round > 0 && round <= 3) {
    const key = `${category}_${round}`;
    if (!indexes.byCategoryAndRound[key]) {
      indexes.byCategoryAndRound[key] = [];
    }
    indexes.byCategoryAndRound[key].push(id);
  }
  
  // Index by year
  if (question.air_date) {
    let year;
    try {
      // Try to parse date as ISO format first (YYYY-MM-DD)
      if (question.air_date.match(/^\d{4}-\d{2}-\d{2}$/)) {
        year = parseInt(question.air_date.substring(0, 4));
      } else {
        // Fall back to Date object parsing
        year = new Date(question.air_date).getFullYear();
      }
      
      // Only add valid years
      if (!isNaN(year)) {
        if (!indexes.byYear[year]) {
          indexes.byYear[year] = [];
        }
        indexes.byYear[year].push(id);
        
        // Index by year and round
        if (round > 0 && round <= 3) {
          const yearRoundKey = `${year}_${round}`;
          if (!indexes.byYearAndRound[yearRoundKey]) {
            indexes.byYearAndRound[yearRoundKey] = [];
          }
          indexes.byYearAndRound[yearRoundKey].push(id);
        }
      }
    } catch (error) {
      // Skip invalid dates
    }
  }
}

// Helper function to split TSV line handling quoted fields
function splitTsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  // Special case for common patterns in our dataset
  // If line doesn't contain quotes, use simple split for performance
  if (!line.includes('"')) {
    return line.split('\t');
  }
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      // Toggle quote state
      inQuotes = !inQuotes;
    } else if (char === '\\' && i + 1 < line.length && line[i + 1] === '"') {
      // Handle escaped quotes - add the quote without the backslash
      current += '"';
      i++; // Skip the next character (the quote)
    } else if (char === '\t' && !inQuotes) {
      // End of field if not in quotes
      result.push(current);
      current = '';
    } else {
      // Add character to current field
      current += char;
    }
  }
  
  // Add the last field
  result.push(current);
  return result;
}

// Helper function to get questions by IDs
const getQuestionsByIds = (ids) => {
  return ids.map(id => inMemoryDataset.find(q => q.id === id)).filter(q => q !== undefined);
};

// Functions to query the in-memory dataset
const getQuestionsCount = () => {
  return inMemoryDataset.length;
};

const getCategories = () => {
  // Use the indexes for faster access
  return Object.keys(indexes.byCategory).map(category => ({ category }));
};

const getQuestionsByCategory = (categoryName) => {
  // Use the index instead of filtering the entire dataset
  if (indexes.byCategory[categoryName]) {
    return getQuestionsByIds(indexes.byCategory[categoryName]);
  }
  return [];
};

// Get random questions for a category and round
const getRandomQuestionsByCategory = (categoryName, round, count = 5) => {
  // Use the category and round index for faster lookup
  const key = `${categoryName}_${round}`;
  let questions = [];
  
  if (indexes.byCategoryAndRound[key]) {
    // Get all questions for this category and round
    questions = getQuestionsByIds(indexes.byCategoryAndRound[key]);
  } else {
    // Fallback to filtering (should rarely happen with proper indexing)
    questions = inMemoryDataset.filter(q => 
      q.category === categoryName && q.round === round
    );
  }
  
  // First sort by clue_value to ensure relative difficulty levels are respected
  const sortedByDifficulty = questions.sort((a, b) => {
    // Handle cases where clue_value might be undefined or 0
    const aValue = a.clue_value || 0;
    const bValue = b.clue_value || 0;
    return aValue - bValue;
  });
  
  // If we have more questions than needed, pick consecutive questions from the sorted list
  // to maintain difficulty progression
  if (sortedByDifficulty.length > count) {
    // Try to pick questions evenly distributed across the difficulty range
    const step = Math.max(1, Math.floor(sortedByDifficulty.length / count));
    const result = [];
    
    for (let i = 0; i < count && i * step < sortedByDifficulty.length; i++) {
      result.push(sortedByDifficulty[i * step]);
    }
    
    // Fill any remaining slots with questions not yet selected
    while (result.length < count && result.length < sortedByDifficulty.length) {
      const remaining = sortedByDifficulty.filter(q => !result.includes(q));
      if (remaining.length > 0) {
        result.push(remaining[0]);
      } else {
        break;
      }
    }
    
    return result;
  }
  
  // Return all questions if we don't have enough
  return sortedByDifficulty;
};

// Get questions by year range
const getQuestionsByYearRange = (startYear, endYear) => {
  console.time('getQuestionsByYearRange');
  
  // Use the year indexes for much faster lookup
  const questionIds = new Set();
  
  // Collect all IDs for questions in the year range
  for (let year = startYear; year <= endYear; year++) {
    if (indexes.byYear[year]) {
      indexes.byYear[year].forEach(id => questionIds.add(id));
    }
  }
  
  const result = getQuestionsByIds(Array.from(questionIds));
  console.timeEnd('getQuestionsByYearRange');
  return result;
};

// Get questions by year range and round
const getQuestionsByYearRangeAndRound = (startYear, endYear, round) => {
  console.time('getQuestionsByYearRangeAndRound');
  
  // Use the year and round indexes for even faster lookup
  const questionIds = new Set();
  
  // Collect all IDs for questions in the year range and round
  for (let year = startYear; year <= endYear; year++) {
    const key = `${year}_${round}`;
    if (indexes.byYearAndRound[key]) {
      indexes.byYearAndRound[key].forEach(id => questionIds.add(id));
    }
  }
  
  const result = getQuestionsByIds(Array.from(questionIds));
  console.timeEnd('getQuestionsByYearRangeAndRound');
  return result;
};

// Initialize the dataset
const initializeDataset = async () => {
  try {
    // If we already have data in memory (e.g., in test cases), don't reload
    if (inMemoryDataset.length > 0) {
      // Re-index the in-memory data (in case tests added data directly)
      resetIndexes();
      inMemoryDataset.forEach(question => indexQuestion(question));
      console.log('Dataset initialized successfully');
      return true;
    }
    
    // Load the dataset into memory
    const loaded = loadDatasetIntoMemory();
    
    if (!loaded || inMemoryDataset.length === 0) {
      throw new Error('Failed to load dataset into memory');
    }
    
    console.log('Dataset initialized successfully');
    return true;
  } catch (error) {
    console.error('Error initializing dataset:', error);
    throw error;
  }
};

// Add a function to add a question and index it properly
function addQuestion(question) {
  // If id is not provided, generate one
  if (!question.id) {
    question.id = inMemoryDataset.length + 1;
  }
  
  // Add to in-memory dataset
  inMemoryDataset.push(question);
  
  // Add to indexes
  indexQuestion(question);
  
  return question;
}

module.exports = {
  initializeDataset,
  inMemoryDataset,
  getQuestionsCount,
  getCategories,
  getQuestionsByCategory,
  getRandomQuestionsByCategory,
  getQuestionsByYearRange,
  getQuestionsByYearRangeAndRound,
  resetIndexes,
  addQuestion  // Export the new function
}; 