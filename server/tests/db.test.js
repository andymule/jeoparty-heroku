// Use jest.mock to mock the entire db module
jest.mock('../db', () => require('./mock-db'));

// Import the mock database module
const { initializeDB, pool } = require('../db');

// Mock pg-promise and other modules
jest.mock('pg-promise', () => {
  // Create a mock for helpers.ColumnSet and helpers.insert
  const helpers = {
    ColumnSet: jest.fn(),
    insert: jest.fn()
  };
  
  // Return a mock pg-promise function
  return jest.fn(() => ({
    helpers,
    none: jest.fn()
  }));
});

jest.mock('pg', () => {
  const mockPool = {
    query: jest.fn(),
    on: jest.fn(),
    end: jest.fn()
  };
  
  return {
    Pool: jest.fn(() => mockPool)
  };
});

jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn()
}));

describe('Database Module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  
  test('should create tables if they do not exist', async () => {
    // Mock query to return 0 questions
    pool.query.mockImplementationOnce(() => ({
      rows: [{ count: '0' }]
    }));
    
    await initializeDB();
    
    // First call should create the table
    expect(pool.query.mock.calls[0][0]).toContain('CREATE TABLE IF NOT EXISTS questions');
    
    // Second call should check for existing questions
    expect(pool.query.mock.calls[1][0]).toBe('SELECT COUNT(*) as count FROM questions');
    
    // Third call should be the insert query
    expect(pool.query).toHaveBeenCalledTimes(3);
  });
  
  test('should not insert sample data if questions already exist', async () => {
    // Override the mockImplementation for this test only to return count > 0
    const originalMockImplementation = pool.query.mockImplementation;
    
    // Set a specific implementation for this test
    pool.query.mockImplementation((query) => {
      if (query.includes('SELECT COUNT(*) as count FROM questions')) {
        return { rows: [{ count: '5' }] };
      }
      return { rows: [] };
    });
    
    await initializeDB();
    
    // Should have called query with create table
    expect(pool.query.mock.calls[0][0]).toContain('CREATE TABLE IF NOT EXISTS questions');
    
    // Should have called query with count check
    expect(pool.query.mock.calls[1][0]).toBe('SELECT COUNT(*) as count FROM questions');
    
    // Should not call query a third time to insert data
    expect(pool.query.mock.calls.length).toBe(2);
  });
}); 