const path = require('path');
const fs = require('fs');

// In-memory dataset
let inMemoryDataset = [];
const datasetPath = path.join(__dirname, '../data/combined_season1-40.tsv');

// Function to load the entire dataset into memory
const loadDatasetIntoMemory = () => {
  try {
    console.log('Loading Jeopardy dataset into memory...');
    if (!fs.existsSync(datasetPath)) {
      console.error(`Dataset file not found at ${datasetPath}`);
      throw new Error(`Dataset file not found at ${datasetPath}`);
    }
    
    const data = fs.readFileSync(datasetPath, 'utf8');
    const lines = data.split('\n');
    
    // Skip header row
    for (let i = 1; i < lines.length; i++) {
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
  
  // Shuffle the questions
  const shuffled = questions.sort(() => 0.5 - Math.random());
  
  // Return the requested number or all if less
  return shuffled.slice(0, count);
};

// Get questions by year range
const getQuestionsByYearRange = (startYear, endYear) => {
  return inMemoryDataset.filter(q => {
    if (!q.air_date) return false;
    const year = new Date(q.air_date).getFullYear();
    return year >= startYear && year <= endYear;
  });
};

// Initialize the dataset
const initializeDataset = async () => {
  // Load the dataset into memory
  const loaded = loadDatasetIntoMemory();
  
  if (!loaded || inMemoryDataset.length === 0) {
    throw new Error('Failed to load dataset into memory');
  }
  
  console.log('Dataset initialized successfully');
  return true;
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