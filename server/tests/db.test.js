// Mock modules
jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(true),
  readFileSync: jest.fn().mockReturnValue('1\tValue\t0\tCategory\tComments\tAnswer\tQuestion\t2021-01-01\tNotes')
}));

// Import the module to test
const db = require('../db');

describe('Database Module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('initializeDataset loads data correctly', async () => {
    await expect(db.initializeDataset()).resolves.toBe(true);
    expect(db.inMemoryDataset.length).toBeGreaterThan(0);
  });

  test('getQuestionsCount returns correct count', () => {
    db.inMemoryDataset = [{ id: 1 }, { id: 2 }];
    expect(db.getQuestionsCount()).toBe(2);
  });

  test('getCategories returns unique categories', () => {
    db.inMemoryDataset = [
      { category: 'Category A' },
      { category: 'Category B' },
      { category: 'Category A' }
    ];
    const categories = db.getCategories();
    expect(categories.length).toBe(2);
    expect(categories[0].category).toBe('Category A');
    expect(categories[1].category).toBe('Category B');
  });

  test('getQuestionsByCategory returns filtered questions', () => {
    db.inMemoryDataset = [
      { category: 'Category A', question: 'Q1' },
      { category: 'Category B', question: 'Q2' },
      { category: 'Category A', question: 'Q3' }
    ];
    const questions = db.getQuestionsByCategory('Category A');
    expect(questions.length).toBe(2);
    expect(questions[0].question).toBe('Q1');
    expect(questions[1].question).toBe('Q3');
  });

  test('getRandomQuestionsByCategory returns random questions', () => {
    db.inMemoryDataset = [
      { category: 'Category A', round: 1, question: 'Q1' },
      { category: 'Category A', round: 1, question: 'Q2' },
      { category: 'Category A', round: 1, question: 'Q3' },
      { category: 'Category A', round: 2, question: 'Q4' }
    ];
    const questions = db.getRandomQuestionsByCategory('Category A', 1, 2);
    expect(questions.length).toBe(2);
    expect(questions[0].category).toBe('Category A');
    expect(questions[1].category).toBe('Category A');
    expect(questions[0].round).toBe(1);
    expect(questions[1].round).toBe(1);
  });

  test('getQuestionsByYearRange returns questions within range', () => {
    db.inMemoryDataset = [
      { air_date: '2018-01-01', question: 'Q1' },
      { air_date: '2019-01-01', question: 'Q2' },
      { air_date: '2020-01-01', question: 'Q3' },
      { air_date: '2021-01-01', question: 'Q4' }
    ];
    const questions = db.getQuestionsByYearRange(2019, 2020);
    expect(questions.length).toBe(2);
    expect(questions[0].question).toBe('Q2');
    expect(questions[1].question).toBe('Q3');
  });
}); 