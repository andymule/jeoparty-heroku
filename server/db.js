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

// Additional indexes for complete categories
const completeCategories = {
  byRound: {
    1: [], // Complete Jeopardy round categories with exactly 5 questions
    2: [], // Complete Double Jeopardy round categories with exactly 5 questions
    3: []  // Complete Final Jeopardy categories with exactly 1 question
  },
  byYearAndRound: {} // { "1990-2000_1": [categoryObjects], "1990-2000_2": [categoryObjects], ... }
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
  console.log(`[DB DEBUG] getQuestionsByIds: Fetching ${ids.length} questions by ID`);
  const start = Date.now();
  
  try {
    // Add a safety limit
    const MAX_IDS = 2000;
    const idsToProcess = ids.length > MAX_IDS ? ids.slice(0, MAX_IDS) : ids;
    
    if (ids.length > MAX_IDS) {
      console.log(`[DB DEBUG] getQuestionsByIds: Limiting from ${ids.length} to ${MAX_IDS} IDs`);
    }
    
    const result = [];
    const idSet = new Set(idsToProcess);
    
    // Process in chunks to avoid blocking the event loop
    const CHUNK_SIZE = 500;
    
    for (let i = 0; i < idsToProcess.length; i += CHUNK_SIZE) {
      const chunk = idsToProcess.slice(i, i + CHUNK_SIZE);
      console.log(`[DB DEBUG] getQuestionsByIds: Processing chunk ${i/CHUNK_SIZE + 1}/${Math.ceil(idsToProcess.length/CHUNK_SIZE)}, ${chunk.length} IDs`);
      
      // Fast lookup for this chunk
      for (const id of chunk) {
        const question = inMemoryDataset.find(q => q.id === id);
        if (question) {
          result.push(question);
        }
      }
      
      // Check if we've been running too long
      if (Date.now() - start > 2000) {
        console.log(`[DB DEBUG] getQuestionsByIds: Taking too long (${Date.now() - start}ms), returning partial results (${result.length} questions)`);
        break;
      }
    }
    
    const duration = Date.now() - start;
    console.log(`[DB DEBUG] getQuestionsByIds: Found ${result.length}/${idsToProcess.length} questions in ${duration}ms`);
    return result;
  } catch (error) {
    console.error(`[DB DEBUG] Error in getQuestionsByIds:`, error);
    // Return partial results or empty array on error
    return [];
  }
};

// Functions to query the in-memory dataset
const getQuestionsCount = () => {
  return inMemoryDataset.length;
};

const getCategories = () => {
  console.log('[DB DEBUG] getCategories: Starting to fetch all categories');
  const start = Date.now();
  
  try {
    const result = Object.keys(indexes.byCategory).map(category => ({ category }));
    const duration = Date.now() - start;
    console.log(`[DB DEBUG] getCategories: Fetched ${result.length} categories in ${duration}ms`);
    return result;
  } catch (error) {
    console.error('[DB DEBUG] getCategories ERROR:', error);
    return [];
  }
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
  console.log(`[DB DEBUG] getRandomQuestionsByCategory: category=${categoryName}, round=${round}, count=${count}`);
  const start = Date.now();
  
  try {
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
      
      const duration = Date.now() - start;
      console.log(`[DB DEBUG] getRandomQuestionsByCategory: Found ${result.length} questions in ${duration}ms`);
      return result;
    }
    
    // Return all questions if we don't have enough
    const duration = Date.now() - start;
    console.log(`[DB DEBUG] getRandomQuestionsByCategory: Found ${sortedByDifficulty.length} questions in ${duration}ms`);
    return sortedByDifficulty;
  } catch (error) {
    console.error('[DB DEBUG] getRandomQuestionsByCategory ERROR:', error);
    return [];
  }
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
  console.log(`[DB DEBUG] getQuestionsByYearRangeAndRound: start=${startYear}, end=${endYear}, round=${round}`);
  const start = Date.now();
  
  try {
    // Add a limit to prevent performance issues with large year ranges
    const MAX_QUESTIONS = 5000;
    const MAX_YEAR_SPAN = 20;
    
    // If year span is too large, limit it to prevent performance issues
    let actualStartYear = startYear;
    let actualEndYear = endYear;
    
    if (endYear - startYear > MAX_YEAR_SPAN) {
      console.log(`[DB DEBUG] Year range too large (${endYear - startYear} years), limiting to ${MAX_YEAR_SPAN} years`);
      actualEndYear = actualStartYear + MAX_YEAR_SPAN;
    }
    
    console.log(`[DB DEBUG] Using year range: ${actualStartYear}-${actualEndYear}`);
    
    // Use the year and round indexes for even faster lookup
    const questionIds = new Set();
    let totalCount = 0;
    
    // Collect all IDs for questions in the year range and round (with early exit if we hit the limit)
    for (let year = actualStartYear; year <= actualEndYear; year++) {
      const key = `${year}_${round}`;
      
      if (indexes.byYearAndRound[key]) {
        // Add IDs up to the limit
        for (const id of indexes.byYearAndRound[key]) {
          questionIds.add(id);
          totalCount++;
          
          // Early exit if we have too many questions
          if (questionIds.size >= MAX_QUESTIONS) {
            console.log(`[DB DEBUG] Reached question limit (${MAX_QUESTIONS}), stopping collection`);
            break;
          }
        }
      }
      
      // Early exit from year loop if we have too many questions
      if (questionIds.size >= MAX_QUESTIONS) {
        break;
      }
      
      // Add a timeout check - if this function is taking too long, stop collecting more
      if (Date.now() - start > 2000) {
        console.log(`[DB DEBUG] Question collection taking too long (${Date.now() - start}ms), stopping at year ${year}`);
        break;
      }
    }
    
    console.log(`[DB DEBUG] Collected ${questionIds.size} question IDs in ${Date.now() - start}ms`);
    
    // Add a time check before fetching the actual questions
    if (Date.now() - start > 3000) {
      console.log(`[DB DEBUG] Process already took ${Date.now() - start}ms, returning limited results`);
      // Get a subset to avoid further delays
      const limitedIds = Array.from(questionIds).slice(0, 1000);
      const result = getQuestionsByIds(limitedIds);
      
      const duration = Date.now() - start;
      console.log(`[DB DEBUG] Retrieved ${result.length} limited questions in ${duration}ms`);
      return result;
    }
    
    // Get the actual questions (with a time limit)
    const fetchStart = Date.now();
    const idArray = Array.from(questionIds);
    
    console.log(`[DB DEBUG] Fetching ${idArray.length} questions from IDs...`);
    const result = getQuestionsByIds(idArray);
    
    const duration = Date.now() - start;
    console.log(`[DB DEBUG] Retrieved ${result.length} questions in ${duration}ms (fetch took ${Date.now() - fetchStart}ms)`);
    return result;
  } catch (error) {
    console.error('[DB DEBUG] getQuestionsByYearRangeAndRound ERROR:', error);
    console.error('[DB DEBUG] Error stack:', error.stack);
    // Return an empty array instead of throwing
    return [];
  }
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
      
      // Build the complete categories index
      buildCompleteCategoriesIndex();
      
      return true;
    }
    
    // Load the dataset into memory
    const loaded = loadDatasetIntoMemory();
    
    if (!loaded || inMemoryDataset.length === 0) {
      throw new Error('Failed to load dataset into memory');
    }
    
    // Build the complete categories index
    buildCompleteCategoriesIndex();
    
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

// Function to build the complete categories index
function buildCompleteCategoriesIndex() {
  console.time('buildCompleteCategoriesIndex');
  console.log('[DB] Building complete categories index...');
  
  // Group questions by category, round, and air_date
  const categoryGroups = {};
  
  // Group all questions by category, round, and date
  for (const question of inMemoryDataset) {
    if (!question.category || !question.round || !question.air_date) continue;
    
    // Try to extract year from air_date (date format can be inconsistent)
    let year;
    try {
      if (question.air_date.match(/^\d{4}-\d{2}-\d{2}$/)) {
        year = parseInt(question.air_date.substring(0, 4));
      } else {
        year = new Date(question.air_date).getFullYear();
      }
    } catch (e) {
      continue; // Skip if date parsing fails
    }
    
    if (isNaN(year)) continue;
    
    // We need a unique key for each category+show combination
    // Including air_date ensures we group questions from the same show
    const key = `${question.category}_${question.round}_${question.air_date}`;
    
    if (!categoryGroups[key]) {
      categoryGroups[key] = {
        category: question.category,
        round: question.round,
        year: year,
        airDate: question.air_date,
        questions: []
      };
    }
    
    categoryGroups[key].questions.push(question);
  }
  
  console.log(`[DB] Grouped questions into ${Object.keys(categoryGroups).length} category/round/date combinations`);
  
  // Filter to only include complete categories (5 questions for rounds 1-2, 1 question for round 3)
  const completeCats = {
    1: [],
    2: [],
    3: []
  };
  
  // Find complete categories for each round
  for (const key in categoryGroups) {
    const group = categoryGroups[key];
    const round = group.round;
    const requiredQuestions = (round === 3) ? 1 : 5;
    
    if (group.questions.length >= requiredQuestions) {
      // Ensure the questions have proper values
      if (round !== 3) {
        // For regular rounds, check if we have a good distribution of values
        const questions = sortQuestionsByDifficulty(group.questions).slice(0, requiredQuestions);
        
        // Add complete category to the round index
        completeCats[round].push({
          name: group.category,
          year: group.year,
          airDate: group.airDate,
          questions: questions
        });
      } else {
        // Final Jeopardy just needs one question
        completeCats[round].push({
          name: group.category,
          year: group.year,
          airDate: group.airDate,
          questions: [group.questions[0]]
        });
      }
    }
  }
  
  // Store in the completeCategories index
  completeCategories.byRound[1] = completeCats[1];
  completeCategories.byRound[2] = completeCats[2];
  completeCategories.byRound[3] = completeCats[3];
  
  console.log(`[DB] Found ${completeCats[1].length} complete categories for round 1`);
  console.log(`[DB] Found ${completeCats[2].length} complete categories for round 2`);
  console.log(`[DB] Found ${completeCats[3].length} complete categories for round 3`);
  
  // Build year range indexes (in 10-year spans)
  const yearRanges = [];
  const startYear = 1984;
  const endYear = 2024;
  const spanSize = 10;
  
  for (let start = startYear; start < endYear; start += spanSize) {
    const end = Math.min(start + spanSize - 1, endYear);
    yearRanges.push([start, end]);
  }
  
  // Create indexes for each year range and round
  for (const [start, end] of yearRanges) {
    const key = `${start}-${end}`;
    
    // For each round
    for (let round = 1; round <= 3; round++) {
      const yearRoundKey = `${key}_${round}`;
      completeCategories.byYearAndRound[yearRoundKey] = [];
      
      // Filter complete categories within this year range
      for (const cat of completeCats[round]) {
        if (cat.year >= start && cat.year <= end) {
          completeCategories.byYearAndRound[yearRoundKey].push(cat);
        }
      }
      
      console.log(`[DB] Year range ${key}, round ${round}: ${completeCategories.byYearAndRound[yearRoundKey].length} categories`);
    }
  }
  
  console.timeEnd('buildCompleteCategoriesIndex');
  return true;
}

// Helper function to get complete categories for a year range and round
function getCompleteCategoriesForYearRange(startYear, endYear, round, count = 6) {
  console.log(`[DB] Getting ${count} complete categories for years ${startYear}-${endYear}, round ${round}`);
  
  // Find the closest pre-defined ranges that cover our range
  const matchingCategories = [];
  const spanSize = 10;
  
  // Go through each decade span that might overlap with our range
  for (let rangeStart = Math.floor(startYear / spanSize) * spanSize; 
       rangeStart <= endYear; 
       rangeStart += spanSize) {
    
    const rangeEnd = rangeStart + spanSize - 1;
    const key = `${rangeStart}-${rangeEnd}_${round}`;
    
    // If we have categories for this range
    if (completeCategories.byYearAndRound[key]) {
      // Filter to only include categories within our exact year range
      const categoriesInRange = completeCategories.byYearAndRound[key].filter(
        cat => cat.year >= startYear && cat.year <= endYear
      );
      
      matchingCategories.push(...categoriesInRange);
    }
  }
  
  console.log(`[DB] Found ${matchingCategories.length} categories in range ${startYear}-${endYear} for round ${round}`);
  
  // If we don't have enough categories, we can expand the search to nearby years
  if (matchingCategories.length < count) {
    console.log(`[DB] Not enough categories, using all available from round ${round}`);
    return completeCategories.byRound[round]
      .sort(() => Math.random() - 0.5)
      .slice(0, count);
  }
  
  // Shuffle and return the requested number of categories
  return matchingCategories
    .sort(() => Math.random() - 0.5)
    .slice(0, count);
}

// Helper function to sort questions by difficulty (based on value)
function sortQuestionsByDifficulty(questions) {
  // First, try to sort by explicit value if available
  return questions.sort((a, b) => {
    // First try clue_value
    const aValue = a.clue_value || 0;
    const bValue = b.clue_value || 0;
    
    if (aValue !== bValue) {
      return aValue - bValue; // Sort by value (lowest to highest)
    }
    
    // If values are the same, try to use order within the category if available
    const aOrder = a.question_num || 0;
    const bOrder = b.question_num || 0;
    
    return aOrder - bOrder;
  });
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
  addQuestion,  // Export the new function
  buildCompleteCategoriesIndex,
  getCompleteCategoriesForYearRange
}; 