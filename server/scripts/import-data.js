require('dotenv').config({ path: '../.env' });
const path = require('path');
const fs = require('fs');
const { importDataset, initializeDB } = require('../db');

const defaultDatasetPath = path.join(__dirname, '../../data/combined_season1-40.tsv');

const run = async () => {
  console.log('Initializing database...');
  await initializeDB();
  
  // Check for dataset file
  const datasetPath = process.argv[2] || defaultDatasetPath;
  
  if (!fs.existsSync(datasetPath)) {
    console.log(`Dataset file not found at ${datasetPath}`);
    console.log('Please download the Jeopardy dataset from: https://github.com/jwolle1/jeopardy_clue_dataset');
    console.log('And place it in the data folder, or specify a path: node import-data.js /path/to/dataset.tsv');
    return;
  }
  
  try {
    console.log(`Importing dataset from: ${datasetPath}`);
    const count = await importDataset(datasetPath);
    console.log(`Successfully imported ${count} questions.`);
  } catch (error) {
    console.error('Error importing dataset:', error);
  } finally {
    process.exit();
  }
};

run(); 