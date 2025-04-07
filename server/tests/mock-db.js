// Mock version of the db.js file
const mockPool = {
  query: jest.fn(),
  on: jest.fn(),
  end: jest.fn()
};

const mockDb = {
  none: jest.fn(),
  helpers: {
    ColumnSet: jest.fn(),
    insert: jest.fn()
  }
};

// Mock implementations
mockPool.query.mockImplementation(async (query, params) => {
  if (query.includes('SELECT COUNT(*) as count FROM questions')) {
    return { rows: [{ count: '0' }] };
  }
  return { rows: [] };
});

const initializeDB = async () => {
  try {
    // Create questions table if it doesn't exist
    await mockPool.query(`
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
    const { rows } = await mockPool.query('SELECT COUNT(*) as count FROM questions');
    
    if (parseInt(rows[0].count) > 0) {
      console.log(`Database already contains ${rows[0].count} questions.`);
      return;
    }
    
    // Insert sample questions (simplified for testing)
    await mockPool.query(`INSERT INTO questions VALUES (...)`);
    
    console.log(`Loaded sample questions.`);
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  }
};

const importDataset = jest.fn().mockImplementation(async (filePath) => {
  console.log(`Mock importing data from ${filePath}...`);
  return 100; // Mock return value representing number of records imported
});

module.exports = {
  pool: mockPool,
  db: mockDb,
  initializeDB,
  importDataset
}; 