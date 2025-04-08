const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse');

class JeopardyDataset {
  constructor() {
    this.questions = [];
    this.categories = new Set();
  }

  async loadFromFile(filePath) {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`Dataset file not found at: ${filePath}`);
      }

      const fileContent = fs.readFileSync(filePath, 'utf-8');
      
      return new Promise((resolve, reject) => {
        const records = [];
        const parser = parse(fileContent, {
          columns: true,
          delimiter: '\t',
          skip_empty_lines: true,
          quote: '"',
          relax_quotes: true,
          escape: '\\'
        });

        parser.on('readable', () => {
          let record;
          while ((record = parser.read()) !== null) {
            records.push(record);
          }
        });

        parser.on('error', (err) => {
          reject(err);
        });

        parser.on('end', () => {
          this.questions = records;
          this.categories = new Set(records.map(q => q.category));
          console.log(`Loaded ${this.questions.length} questions and ${this.categories.size} categories from ${filePath}`);
          resolve(true);
        });
      });
    } catch (error) {
      console.error('Error loading dataset:', error);
      throw error;
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
  loadDataset: async () => {
    const datasetPath = path.join(__dirname, '../../data/jeopardy_clue_dataset-main/combined_season1-40.tsv');
    console.log('Loading dataset from:', datasetPath);
    await dataset.loadFromFile(datasetPath);
    return dataset;
  }
}; 