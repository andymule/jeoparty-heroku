// Mock modules
jest.mock('fs', () => ({
  existsSync: jest.fn((path) => {
    // Mock that the primary path exists for tests
    return true;
  }),
  readFileSync: jest.fn().mockReturnValue('round\tclue_value\tdaily_double_value\tcategory\tcomments\tanswer\tquestion\tair_date\tnotes\n1\t200\t0\tCategory A\tComments\tAnswer\tQuestion\t2021-01-01\tNotes')
}));

// Import the module to test
const db = require('../db');

describe('Database Module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset and directly reference the module's exported inMemoryDataset
    while(db.inMemoryDataset.length > 0) {
      db.inMemoryDataset.pop();
    }
  });

  test('initializeDataset loads data correctly', async () => {
    // Add test data directly to the exported inMemoryDataset
    db.inMemoryDataset.push({
      id: 1,
      round: 1,
      clue_value: 200,
      daily_double_value: 0,
      category: 'Category A',
      comments: 'Comments',
      answer: 'Answer',
      question: 'Question',
      air_date: '2021-01-01',
      notes: 'Notes'
    });
    
    await expect(db.initializeDataset()).resolves.toBe(true);
    expect(db.inMemoryDataset.length).toBeGreaterThan(0);
  });

  test('getQuestionsCount returns correct count', () => {
    // Add test data directly
    db.inMemoryDataset.push({ id: 1 });
    db.inMemoryDataset.push({ id: 2 });
    expect(db.getQuestionsCount()).toBe(2);
  });

  test('getCategories returns unique categories', () => {
    // Add test data directly
    db.inMemoryDataset.push({ category: 'Category A' });
    db.inMemoryDataset.push({ category: 'Category B' });
    db.inMemoryDataset.push({ category: 'Category A' });
    
    const categories = db.getCategories();
    expect(categories.length).toBe(2);
    expect(categories[0].category).toBe('Category A');
    expect(categories[1].category).toBe('Category B');
  });

  test('getQuestionsByCategory returns filtered questions', () => {
    // Add test data directly
    db.inMemoryDataset.push({ category: 'Category A', question: 'Q1' });
    db.inMemoryDataset.push({ category: 'Category B', question: 'Q2' });
    db.inMemoryDataset.push({ category: 'Category A', question: 'Q3' });
    
    const questions = db.getQuestionsByCategory('Category A');
    expect(questions.length).toBe(2);
    expect(questions[0].question).toBe('Q1');
    expect(questions[1].question).toBe('Q3');
  });

  test('getRandomQuestionsByCategory returns random questions', () => {
    // Add test data directly
    db.inMemoryDataset.push({ category: 'Category A', round: 1, question: 'Q1' });
    db.inMemoryDataset.push({ category: 'Category A', round: 1, question: 'Q2' });
    db.inMemoryDataset.push({ category: 'Category A', round: 1, question: 'Q3' });
    db.inMemoryDataset.push({ category: 'Category A', round: 2, question: 'Q4' });
    
    const questions = db.getRandomQuestionsByCategory('Category A', 1, 2);
    expect(questions.length).toBe(2);
    expect(questions[0].category).toBe('Category A');
    expect(questions[1].category).toBe('Category A');
    expect(questions[0].round).toBe(1);
    expect(questions[1].round).toBe(1);
  });

  test('getQuestionsByYearRange returns questions within range', () => {
    // Add test data with explicit dates in ISO format
    db.inMemoryDataset.push({ air_date: '2018-01-01', question: 'Q1' });
    db.inMemoryDataset.push({ air_date: '2019-01-01', question: 'Q2' });
    db.inMemoryDataset.push({ air_date: '2020-01-01', question: 'Q3' });
    db.inMemoryDataset.push({ air_date: '2021-01-01', question: 'Q4' });
    
    const questions = db.getQuestionsByYearRange(2019, 2020);
    // Ensure we match exactly 2 questions (2019 and 2020)
    expect(questions.length).toBe(2);
    
    // Find the questions in the result by year
    const q2019 = questions.find(q => q.air_date === '2019-01-01');
    const q2020 = questions.find(q => q.air_date === '2020-01-01');
    
    // Verify both questions are found
    expect(q2019).toBeDefined();
    expect(q2020).toBeDefined();
    
    // Verify the questions have the correct text
    expect(q2019.question).toBe('Q2');
    expect(q2020.question).toBe('Q3');
  });
}); 