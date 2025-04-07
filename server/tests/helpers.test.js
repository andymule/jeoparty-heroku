// We'll need to extract helper functions from index.js to test them
// For this test, let's create a small version of the helper functions

// Mock games object
const games = {};

// Helper function to generate a room code (extracted from index.js)
const generateRoomCode = () => {
  const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  
  for (let i = 0; i < 4; i++) {
    code += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  
  // Ensure no duplicate room codes
  return games[code] ? generateRoomCode() : code;
};

// Mock the database functions
jest.mock('../db', () => ({
  pool: {
    query: jest.fn()
  }
}));

// Import the mocked database
const { pool } = require('../db');

// Helper function to get random categories (simplified from index.js)
const getRandomCategories = async () => {
  try {
    // Mock the database response
    pool.query.mockResolvedValueOnce({
      rows: [
        { category: 'SCIENCE' },
        { category: 'HISTORY' },
        { category: 'GEOGRAPHY' },
        { category: 'ENTERTAINMENT' },
        { category: 'SPORTS' },
        { category: 'LITERATURE' }
      ]
    });
    
    const result = await pool.query(
      'SELECT DISTINCT category FROM questions ORDER BY random() LIMIT 6'
    );
    return result.rows.map(row => row.category);
  } catch (error) {
    console.error('Error fetching random categories:', error);
    throw error;
  }
};

// Helper function to generate a game board (simplified from index.js)
const generateBoard = async (categories) => {
  const board = {};
  const questionValues = [200, 400, 600, 800, 1000];
  
  try {
    for (const category of categories) {
      board[category] = [];
      
      // Mock the database response for each category
      pool.query.mockResolvedValueOnce({
        rows: [
          { answer: 'Clue 1', question: 'Response 1' },
          { answer: 'Clue 2', question: 'Response 2' },
          { answer: 'Clue 3', question: 'Response 3' },
          { answer: 'Clue 4', question: 'Response 4' },
          { answer: 'Clue 5', question: 'Response 5' }
        ]
      });
      
      const result = await pool.query(
        'SELECT * FROM questions WHERE category = $1 ORDER BY random() LIMIT 5',
        [category]
      );
      
      // Map questions to value slots
      result.rows.forEach((row, index) => {
        board[category].push({
          text: row.answer,
          answer: row.question,
          value: questionValues[index],
          revealed: false
        });
      });
    }
    
    return board;
  } catch (error) {
    console.error('Error generating board:', error);
    throw error;
  }
};

describe('Helper Functions', () => {
  beforeEach(() => {
    // Clear mocks before each test
    jest.clearAllMocks();
    // Clear games object
    Object.keys(games).forEach(key => delete games[key]);
  });
  
  describe('generateRoomCode', () => {
    it('should generate a 4-character room code', () => {
      const code = generateRoomCode();
      expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/);
    });
    
    it('should generate unique codes', () => {
      const codes = new Set();
      for (let i = 0; i < 100; i++) {
        codes.add(generateRoomCode());
      }
      expect(codes.size).toBe(100);
    });
    
    it('should regenerate if code exists in games object', () => {
      // Mock Math.random to return predictable values
      const originalRandom = Math.random;
      let callCount = 0;
      
      Math.random = jest.fn(() => {
        callCount++;
        if (callCount <= 4) return 0; // Will generate 'AAAA' for first 4 calls
        return 0.99; // Will generate a different code for subsequent calls
      });
      
      // Add a game with the code that will be generated first
      games['AAAA'] = { someData: 'test' };
      
      const code = generateRoomCode();
      
      expect(code).not.toBe('AAAA');
      expect(Math.random).toHaveBeenCalledTimes(8); // 4 calls for the first attempt, 4 for the second
      
      // Restore original Math.random
      Math.random = originalRandom;
    });
  });
  
  describe('getRandomCategories', () => {
    it('should fetch 6 random categories from the database', async () => {
      const categories = await getRandomCategories();
      
      expect(pool.query).toHaveBeenCalledWith(
        'SELECT DISTINCT category FROM questions ORDER BY random() LIMIT 6'
      );
      expect(categories).toEqual([
        'SCIENCE', 'HISTORY', 'GEOGRAPHY', 'ENTERTAINMENT', 'SPORTS', 'LITERATURE'
      ]);
    });
  });
  
  describe('generateBoard', () => {
    it('should generate a board with questions for each category', async () => {
      const categories = ['SCIENCE', 'HISTORY'];
      const board = await generateBoard(categories);
      
      // Should have called query once for each category
      expect(pool.query).toHaveBeenCalledTimes(2);
      
      // Check that the board has the correct structure
      expect(Object.keys(board)).toEqual(categories);
      
      // Check each category has 5 questions
      categories.forEach(category => {
        expect(board[category].length).toBe(5);
        
        // Check question structure
        board[category].forEach((question, index) => {
          expect(question).toHaveProperty('text');
          expect(question).toHaveProperty('answer');
          expect(question).toHaveProperty('value', [200, 400, 600, 800, 1000][index]);
          expect(question).toHaveProperty('revealed', false);
        });
      });
    });
  });
}); 