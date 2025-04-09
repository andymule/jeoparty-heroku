/**
 * Server runner for the modular Jeoparty server
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Check if dataset exists
const datasetPaths = [
  path.join(__dirname, '../data/combined_season1-40.tsv'),
  path.join(__dirname, '../data/jeopardy_clue_dataset-main/combined_season1-40.tsv'),
  path.join(__dirname, '../../data/combined_season1-40.tsv'),
  path.join(__dirname, '../../data/jeopardy_clue_dataset-main/combined_season1-40.tsv')
];

let datasetExists = false;
for (const dataPath of datasetPaths) {
  if (fs.existsSync(dataPath)) {
    console.log(`Found dataset at ${dataPath}`);
    datasetExists = true;
    break;
  }
}

if (!datasetExists) {
  console.error('ERROR: Jeopardy dataset file not found');
  console.error('Please download the dataset and place it in the data directory');
  console.error('Expected paths:');
  datasetPaths.forEach(path => console.error(`- ${path}`));
  process.exit(1);
}

// Get environment variables
const PORT = process.env.PORT || 5005;
const NODE_ENV = process.env.NODE_ENV || 'development';

console.log(`Starting server in ${NODE_ENV} mode on port ${PORT}`);

// Determine which server file to run
const serverFile = 'index-new.js'; // Use the new modular server file

// Spawn the server process
const serverProcess = spawn('node', [serverFile], {
  cwd: __dirname,
  env: { ...process.env, PORT, NODE_ENV },
  stdio: 'inherit'
});

console.log(`Server process started with PID ${serverProcess.pid}`);

// Handle server process events
serverProcess.on('error', (error) => {
  console.error(`Failed to start server: ${error.message}`);
  process.exit(1);
});

serverProcess.on('exit', (code, signal) => {
  if (code !== 0) {
    console.error(`Server process exited with code ${code} and signal ${signal}`);
    process.exit(code);
  }
  console.log('Server process exited gracefully');
});

// Handle process signals to cleanly shut down the server
process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down server...');
  serverProcess.kill('SIGINT');
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down server...');
  serverProcess.kill('SIGTERM');
});

// Keep the main process running
console.log('Server runner is monitoring the server process');
console.log('Press Ctrl+C to stop the server'); 