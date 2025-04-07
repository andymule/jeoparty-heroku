const pgp = require('pg-promise')();
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

// In-memory mock database for when PostgreSQL is not available
let useMockDB = false;
const mockQuestions = [];
let mockCounter = 0;

// Create a mock pool implementation
const mockPool = {
  query: async (text, params) => {
    console.log('Mock DB Query:', text, params);
    
    if (text.includes('CREATE TABLE')) {
      return { rows: [], rowCount: 0 };
    }
    
    if (text.includes('SELECT COUNT(*) as count')) {
      return { rows: [{ count: mockQuestions.length.toString() }], rowCount: 1 };
    }
    
    if (text.includes('SELECT DISTINCT category')) {
      // Return mock categories
      const categories = [
        { category: 'U.S. HISTORY' },
        { category: 'SCIENCE' },
        { category: 'GEOGRAPHY' },
        { category: 'ENTERTAINMENT' },
        { category: 'SPORTS' },
        { category: 'LITERATURE' }
      ];
      return { rows: categories, rowCount: categories.length };
    }
    
    if (text.includes('SELECT * FROM questions WHERE category')) {
      // Return mock questions for a category
      const categoryName = params[0];
      const questions = [];
      
      // Generate 5 mock questions for this category
      for (let i = 0; i < 5; i++) {
        questions.push({
          id: mockCounter++,
          round: 1,
          clue_value: (i + 1) * 200,
          daily_double_value: 0,
          category: categoryName,
          comments: '',
          answer: `This is a ${categoryName} clue #${i+1}`,
          question: `What is the answer to ${categoryName} clue #${i+1}?`,
          air_date: '2023-01-01',
          notes: ''
        });
      }
      
      return { rows: questions, rowCount: questions.length };
    }
    
    if (text.includes('INSERT INTO questions')) {
      // Simulate inserting sample questions
      mockQuestions.push(...Array(3).fill({}));
      return { rows: [], rowCount: 3 };
    }
    
    if (text.includes('TRUNCATE TABLE')) {
      // Clear mock questions
      mockQuestions.length = 0;
      return { rows: [], rowCount: 0 };
    }
    
    return { rows: [], rowCount: 0 };
  }
};

// Create a mock db implementation for pg-promise
const mockDb = {
  none: async (query) => {
    console.log('Mock DB None:', query);
    return null;
  },
  helpers: {
    ColumnSet: function() { return {}; },
    insert: function() { return ''; }
  }
};

// Database connection
const connectionString = process.env.DATABASE_URL || 'postgresql://localhost:5432/jeoparty';

// Create a new pool for single queries
let pool, db;

try {
  pool = new Pool({
    connectionString,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });
  
  // Test database connection
  pool.query('SELECT NOW()')
    .then(() => {
      console.log('PostgreSQL database connected successfully');
      useMockDB = false;
    })
    .catch(err => {
      console.warn('PostgreSQL connection failed, using mock database:', err.message);
      pool = mockPool;
      useMockDB = true;
    });
  
  // Create a pg-promise instance for batch operations
  db = pgp({
    connectionString,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });
} catch (error) {
  console.warn('Error setting up PostgreSQL, using mock database:', error.message);
  pool = mockPool;
  db = mockDb;
  useMockDB = true;
}

// Initialize database tables
const initializeDB = async () => {
  try {
    // Create questions table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS questions (
        id SERIAL PRIMARY KEY,
        round INTEGER,
        clue_value INTEGER,
        daily_double_value INTEGER,
        category TEXT NOT NULL,
        comments TEXT,
        answer TEXT NOT NULL,
        question TEXT NOT NULL,
        air_date DATE,
        notes TEXT
      )
    `);
    
    // Check if questions are already loaded
    const { rows } = await pool.query('SELECT COUNT(*) as count FROM questions');
    
    if (parseInt(rows[0].count) > 0) {
      console.log(`Database already contains ${rows[0].count} questions.`);
      return;
    }
    
    console.log('No questions found in database. Loading sample data...');
    
    // Load a small set of sample questions for development
    // In a production environment, you'd import questions from the Jeopardy dataset
    const sampleQuestions = [
      {
        round: 1,
        clue_value: 200,
        daily_double_value: 0,
        category: 'U.S. HISTORY',
        comments: '',
        answer: 'In 1796 he warned Americans against "entangling" foreign alliances',
        question: 'Who is George Washington?',
        air_date: '1984-09-10',
        notes: ''
      },
      {
        round: 1,
        clue_value: 200,
        daily_double_value: 0,
        category: 'SCIENCE',
        comments: '',
        answer: 'Lighter than air element discovered in the sun before it was found on Earth',
        question: 'What is helium?',
        air_date: '1984-09-10',
        notes: ''
      },
      {
        round: 1,
        clue_value: 400,
        daily_double_value: 0,
        category: 'SCIENCE',
        comments: '',
        answer: 'If you suffer from arachnophobia, you fear these',
        question: 'What are spiders?',
        air_date: '1984-09-10',
        notes: ''
      },
      // Add more sample questions as needed
    ];
    
    // Insert sample questions
    const values = sampleQuestions.map(q => 
      `(${q.round}, ${q.clue_value}, ${q.daily_double_value}, 
        '${q.category}', '${q.comments}', '${q.answer.replace(/'/g, "''")}', 
        '${q.question.replace(/'/g, "''")}', '${q.air_date}', '${q.notes}')`
    ).join(',\n');
    
    await pool.query(`
      INSERT INTO questions (
        round, clue_value, daily_double_value, category, 
        comments, answer, question, air_date, notes
      ) VALUES ${values}
    `);
    
    console.log(`Loaded ${sampleQuestions.length} sample questions.`);
  } catch (error) {
    console.error('Error initializing database:', error);
    console.log('Using mock data instead...');
    // If using mock DB and an error occurs, make sure we have some mock questions
    if (useMockDB && mockQuestions.length === 0) {
      mockQuestions.push(...Array(3).fill({}));
    }
  }
};

// Function to import questions from the Jeopardy dataset TSV file
const importDataset = async (filePath) => {
  if (!filePath) {
    throw new Error('File path not provided');
  }
  
  try {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    
    console.log(`Importing data from ${filePath}...`);
    
    if (useMockDB) {
      console.log('Using mock database, skipping actual import');
      return 100; // Mock return value
    }
    
    const data = fs.readFileSync(filePath, 'utf8');
    const lines = data.split('\n');
    
    // Skip header row
    const columns = lines[0].split('\t');
    
    console.log(`Found ${lines.length - 1} questions to import.`);
    
    // Process in batches to avoid memory issues
    const batchSize = 1000;
    let inserted = 0;
    
    // First, clear the table if needed
    await pool.query('TRUNCATE TABLE questions');
    
    for (let i = 1; i < lines.length; i += batchSize) {
      const batch = [];
      
      for (let j = i; j < Math.min(i + batchSize, lines.length); j++) {
        const line = lines[j].trim();
        if (!line) continue;
        
        const values = line.split('\t');
        if (values.length < 9) continue;
        
        batch.push({
          round: parseInt(values[0]) || 0,
          clue_value: parseInt(values[1]) || 0,
          daily_double_value: parseInt(values[2]) || 0,
          category: values[3],
          comments: values[4] || '',
          answer: values[5], // This is the clue shown to contestants
          question: values[6], // This is what contestants must respond with
          air_date: values[7] || null,
          notes: values[8] || ''
        });
      }
      
      if (batch.length > 0) {
        // Create a CS (Column Set) object to streamline insert statement
        const cs = new pgp.helpers.ColumnSet([
          'round', 'clue_value', 'daily_double_value', 'category',
          'comments', 'answer', 'question', 'air_date', 'notes'
        ], { table: 'questions' });
        
        // Generate the insert query
        const query = pgp.helpers.insert(batch, cs);
        
        // Execute the query
        await db.none(query);
        
        inserted += batch.length;
        console.log(`Inserted ${inserted} of ${lines.length - 1} questions...`);
      }
    }
    
    console.log(`Successfully imported ${inserted} questions.`);
    return inserted;
  } catch (error) {
    console.error('Error importing dataset:', error);
    throw error;
  }
};

module.exports = {
  pool,
  db,
  initializeDB,
  importDataset,
  useMockDB
}; 