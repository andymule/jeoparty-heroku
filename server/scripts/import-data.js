require('dotenv').config({ path: '../.env' });
const path = require('path');
const fs = require('fs');

console.log('');
console.log('==========================================');
console.log('NOTICE: DATABASE IMPORT SCRIPT DEPRECATED');
console.log('==========================================');
console.log('');
console.log('The Jeoparty application now uses the in-memory dataset exclusively');
console.log('from combined_season1-40.tsv and no longer requires database imports.');
console.log('');
console.log('To use the application:');
console.log('1. Ensure combined_season1-40.tsv is in the data/ directory');
console.log('2. Start the server with npm start');
console.log('');
console.log('The dataset will be loaded into memory at startup.');
console.log(''); 