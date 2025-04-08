const fs = require('fs');
const { parse } = require('csv-parse/sync');

class JeopardyDataset {
  constructor() {
    this.questions = [];
    this.categories = new Set();
  }

  loadFromFile(filePath) {
    try {
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const records = parse(fileContent, {
        columns: true,
        delimiter: '\t',
        skip_empty_lines: true
      });

      this.questions = records;
      this.categories = new Set(records.map(q => q.category));
      
      console.log(`Loaded ${this.questions.length} questions and ${this.categories.size} categories`);
      return true;
    } catch (error) {
      console.error('Error loading dataset:', error);
      return false;
    }
  }

  getRandomQuestions(count) {
    const shuffled = [...this.questions].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
  }

  getQuestionsByCategory(category) {
    return this.questions.filter(q => q.category === category);
  }

  getRandomCategories(count) {
    const shuffled = [...this.categories].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
  }

  generateBoard() {
    const categories = this.getRandomCategories(6);
    const board = {};

    categories.forEach(category => {
      const questions = this.getQuestionsByCategory(category)
        .sort((a, b) => a.clue_value - b.clue_value)
        .slice(0, 5);
      
      board[category] = questions;
    });

    return board;
  }
}

// Create and export a singleton instance
const dataset = new JeopardyDataset();

module.exports = {
  loadDataset: () => {
    const success = dataset.loadFromFile(path.join(__dirname, '../../data/combined_season1-40.tsv'));
    if (!success) {
      throw new Error('Failed to load dataset');
    }
    return dataset;
  }
}; 