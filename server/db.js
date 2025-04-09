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

// Function to load the entire dataset into memory
const loadDatasetIntoMemory = () => {
  try {
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
    
    const data = fs.readFileSync(filePath, 'utf8');
    const lines = data.split('\n');
    
    // Skip header row
    let loadedCount = 0;
    for (let i = 1; i < lines.length; i++) {
      if (isProduction && loadedCount >= maxQuestionsInProduction) {
        console.log(`Reached limit of ${maxQuestionsInProduction} questions for production environment`);
        break;
      }
      
      const line = lines[i].trim();
      if (!line) continue;
      
      try {
        // Handle TSV with potential quotes by using a custom split
        // This is more robust than a simple split('\t')
        const values = splitTsvLine(line);
        
        if (values.length < 7) {
          // console.warn(`Skipping line ${i}: insufficient columns (${values.length})`);
          continue;
        }
        
        inMemoryDataset.push({
          id: i,
          round: parseInt(values[0]) || 0,
          clue_value: parseInt(values[1]) || 0,
          daily_double_value: parseInt(values[2]) || 0,
          category: values[3] || 'Unknown Category',
          comments: values[4] || '',
          answer: values[5] || '', // This is the clue shown to contestants
          question: values[6] || '', // This is what contestants must respond with
          air_date: values[7] || null,
          notes: values.length > 8 ? values[8] : ''
        });
        
        loadedCount++;
      } catch (lineError) {
        console.warn(`Error parsing line ${i}: ${lineError.message}`);
      }
    }
    
    console.log(`Successfully loaded ${inMemoryDataset.length} questions into memory.`);
    return true;
  } catch (error) {
    console.error('Error loading dataset into memory:', error);
    throw error;
  }
};

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

// Functions to query the in-memory dataset
const getQuestionsCount = () => {
  return inMemoryDataset.length;
};

const getCategories = () => {
  const uniqueCategories = new Set();
  inMemoryDataset.forEach(q => uniqueCategories.add(q.category));
  return Array.from(uniqueCategories).map(category => ({ category }));
};

const getQuestionsByCategory = (categoryName) => {
  return inMemoryDataset.filter(q => q.category === categoryName);
};

// Get random questions for a category and round
const getRandomQuestionsByCategory = (categoryName, round, count = 5) => {
  const questions = inMemoryDataset.filter(q => 
    q.category === categoryName && q.round === round
  );
  
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
  return inMemoryDataset.filter(q => {
    if (!q.air_date) return false;
    
    // Parse the date correctly - ensure we're handling various date formats
    let year;
    try {
      // Try to parse date as ISO format first (YYYY-MM-DD)
      if (q.air_date.match(/^\d{4}-\d{2}-\d{2}$/)) {
        year = parseInt(q.air_date.substring(0, 4));
      } else {
        // Fall back to Date object parsing
        year = new Date(q.air_date).getFullYear();
      }
      
      // Handle invalid dates that return NaN
      if (isNaN(year)) return false;
      
      return year >= startYear && year <= endYear;
    } catch (error) {
      console.warn(`Error parsing date: ${q.air_date}`, error);
      return false;
    }
  });
};

// Initialize the dataset
const initializeDataset = async () => {
  try {
    // If we already have data in memory (e.g., in test cases), don't reload
    if (inMemoryDataset.length > 0) {
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

module.exports = {
  initializeDataset,
  inMemoryDataset,
  getQuestionsCount,
  getCategories,
  getQuestionsByCategory,
  getRandomQuestionsByCategory,
  getQuestionsByYearRange
}; 