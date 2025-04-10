const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const gameLogic = require('../utils/gameLogic');
const gameService = require('../services/gameService');
const jeopardyDB = require('../db/jeopardyDB');

// Status endpoint for health checks
router.get('/status', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    datasetLoaded: db.getQuestionsCount() > 0,
    questionsCount: db.getQuestionsCount(),
    categoriesCount: db.getCategories().length
  });
});

// Get all categories
router.get('/categories', async (req, res) => {
  try {
    const categories = db.getCategories();
    
    // Limit the number of categories returned to prevent overwhelming responses
    const limitedCategories = categories.slice(0, 100);
    
    res.json({
      success: true,
      count: limitedCategories.length,
      categories: limitedCategories
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch categories'
    });
  }
});

// Create a new game
router.post('/games/create', async (req, res) => {
  try {
    console.log('[DEBUG] POST /api/games/create - Start');
    
    // Require JSON content type
    if (!req.is('application/json')) {
      console.log('[DEBUG] Invalid content type:', req.get('Content-Type'));
      return res.status(400).json({
        success: false,
        error: 'Content-Type must be application/json'
      });
    }
    
    // Log raw request body
    console.log('[DEBUG] Raw request body:', JSON.stringify(req.body));
    
    // Validate input
    const { hostName, playerName, yearRange, gameDate } = req.body;
    const nameToUse = hostName || playerName || 'Host';
    
    console.log('[DEBUG] Processed input:', {
      nameToUse,
      yearRange,
      gameDate
    });
    
    // Create game using game service
    console.log('[DEBUG] Calling gameService.createGame...');
    const game = await gameService.createGame({
      hostName: nameToUse,
      yearRange: yearRange || undefined,
      gameDate: gameDate || null
    });
    
    console.log('[DEBUG] Game created:', {
      roomCode: game.roomCode,
      categoriesCount: game.categories?.length,
      playersCount: game.players?.length
    });
    
    // Log success
    console.log(`Game created successfully with room code ${game.roomCode}`);
    
    const response = {
      success: true,
      roomCode: game.roomCode,
      hostUrl: `/game/host/${game.roomCode}`,
      playerUrl: `/game/player/${game.roomCode}`,
      game: {
        roomCode: game.roomCode,
        hostName: game.hostName,
        gameState: game.gameState,
        players: game.players,
        categories: game.categories,
        yearRange: game.yearRange
      }
    };
    
    console.log('[DEBUG] Sending response:', JSON.stringify(response));
    res.json(response);
  } catch (error) {
    console.error('[DEBUG] Error in /games/create:', error);
    console.error('[DEBUG] Error stack:', error.stack);
    res.status(500).json({
      success: false,
      error: 'Failed to create game',
      details: error.message
    });
  }
});

// List active games
router.get('/games', (req, res) => {
  try {
    const games = Array.from(gameService.getAllGames().values());
    
    res.json({
      success: true,
      count: games.length,
      activePlayerCount: gameService.getActivePlayerCount(),
      games
    });
  } catch (error) {
    console.error('Error listing games:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list games'
    });
  }
});

// Get stats about the dataset
router.get('/stats', (req, res) => {
  try {
    const questionCount = db.getQuestionsCount();
    const categories = db.getCategories();
    
    res.json({
      success: true,
      stats: {
        questions: questionCount,
        categories: categories.length
      }
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch stats'
    });
  }
});

// Get questions by year range for preview or filter testing
router.get('/questions/year-range', (req, res) => {
  try {
    const { start, end, limit = 10 } = req.query;
    
    if (!start || !end) {
      return res.status(400).json({
        success: false,
        error: 'Start and end years are required'
      });
    }
    
    const startYear = parseInt(start);
    const endYear = parseInt(end);
    
    // Validate years are numbers
    if (isNaN(startYear) || isNaN(endYear)) {
      return res.status(400).json({
        success: false,
        error: 'Years must be valid numbers'
      });
    }
    
    // Get questions in the year range
    const questions = db.getQuestionsByYearRange(startYear, endYear);
    
    // Limit the response to prevent large payloads
    const limitedQuestions = questions.slice(0, parseInt(limit));
    
    // Get unique categories from these questions
    const uniqueCategories = Array.from(
      new Set(limitedQuestions.map(q => q.category))
    ).sort();
    
    res.json({
      success: true,
      totalQuestions: questions.length,
      returnedQuestions: limitedQuestions.length,
      uniqueCategoriesCount: uniqueCategories.length,
      questions: limitedQuestions
    });
  } catch (error) {
    console.error('Error fetching questions by year range:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch questions by year range'
    });
  }
});

// Add API endpoint to get available dates
router.get('/jeopardy/dates', async (req, res) => {
  try {
    // Extract year range from query parameters if provided
    const startYear = req.query.startYear ? parseInt(req.query.startYear) : null;
    const endYear = req.query.endYear ? parseInt(req.query.endYear) : null;
    
    let dates;
    
    console.log(`API: Fetching dates between years ${startYear} and ${endYear}`);
    
    // If year range is provided, use it to filter dates
    if (startYear && endYear) {
      console.log(`Fetching dates between years ${startYear} and ${endYear}`);
      dates = await jeopardyDB.getDatesByYearRange(startYear, endYear);
    } else {
      dates = await jeopardyDB.getAvailableDates();
    }
    
    // Take a random sample for display (or all dates if less than 100)
    const randomSample = dates.length > 100 
      ? dates.sort(() => 0.5 - Math.random()).slice(0, 100) // Get 100 random dates
      : dates;
    
    res.json({
      success: true,
      dates: randomSample,
      total: dates.length
    });
  } catch (error) {
    console.error('Error getting Jeopardy dates:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get Jeopardy dates',
      error: error.message
    });
  }
});

// Add a test endpoint that uses the game service to create a simple test game
router.get('/test-game-creation', async (req, res) => {
  console.log('Test game creation endpoint called');
  
  try {
    console.log('Creating test game...');
    const game = await gameService.createGame({
      hostName: 'TestHost',
      yearRange: { start: 1984, end: 2024 }
    });
    
    console.log('Test game created successfully');
    res.json({
      success: true,
      roomCode: game.roomCode,
      categoriesCount: game.categories.length,
      playerCount: game.players.length
    });
  } catch (error) {
    console.error('Error creating test game:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router; 