const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');
const fs = require('fs');

// Load environment variables
dotenv.config();

// Import modules
const db = require('./db');
const apiRoutes = require('./routes/api');
const socketHandlers = require('./utils/socketHandlers');

// Verify dataset requirements
if (!fs.existsSync(path.join(__dirname, '../data/combined_season1-40.tsv')) &&
    !fs.existsSync(path.join(__dirname, '../data/jeopardy_clue_dataset-main/combined_season1-40.tsv')) &&
    !fs.existsSync(path.join(__dirname, '../../data/combined_season1-40.tsv')) &&
    !fs.existsSync(path.join(__dirname, '../../data/jeopardy_clue_dataset-main/combined_season1-40.tsv'))) {
  console.error('FATAL ERROR: combined_season1-40.tsv dataset file not found in data directory');
  console.error('This file is required for the application to function');
  console.error('Please download the dataset and place it in the data directory');
  process.exit(1);
}

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Configure CORS
const isDevelopment = process.env.NODE_ENV !== 'production';
const corsOrigins = isDevelopment ? ['http://localhost:3001', 'http://localhost:3000'] : 
  (process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : '*');

console.log('CORS Origins:', corsOrigins);
app.use(cors({
  origin: corsOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Middleware for parsing request bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Log all incoming HTTP requests for debugging
app.use((req, res, next) => {
  console.log(`HTTP ${req.method} ${req.url}`, req.body);
  next();
});

// Set up API routes - this must come BEFORE static file handling
app.use('/api', apiRoutes);

// Serve static files from the client build directory in production only
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/build')));
  
  // Fallback route handler for SPA in production
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/build', 'index.html'));
  });
} else {
  // In development, we don't need to serve static files or handle SPA routing
  // as the React dev server will handle that
  app.get('*', (req, res) => {
    res.status(404).json({ error: 'Not found' });
  });
}

// Initialize Socket.io with CORS
const io = socketIo(server, {
  cors: {
    origin: corsOrigins,
    methods: ["GET", "POST"],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
  }
});

// Set up Socket.io handlers
const socketManager = socketHandlers.initializeSocketHandlers(io);

// Initialize database
const PORT = process.env.PORT || 5005;

// Start server after database is initialized
async function startServer() {
  try {
    // Initialize the dataset
    await db.initializeDataset();
    
    // Start the server
    server.listen(PORT, () => {
      console.log(`Server listening on port ${PORT}`);
      console.log(`Dataset loaded with ${db.getQuestionsCount()} questions`);
      console.log(`Unique categories: ${db.getCategories().length}`);
    });
  } catch (error) {
    console.error('Error starting server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down server...');
  server.close(() => {
    console.log('Server has been gracefully terminated');
    process.exit(0);
  });
});

// Start the server
startServer();

module.exports = server; // Export for testing 