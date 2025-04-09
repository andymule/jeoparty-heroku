const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const gameLogic = require('../utils/gameLogic');

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
router.post('/games/create', (req, res) => {
  try {
    // Require JSON content type
    if (!req.is('application/json')) {
      return res.status(400).json({
        success: false,
        error: 'Content-Type must be application/json'
      });
    }
    
    // Validate input
    const playerName = req.body?.playerName || 'Host';
    const yearStart = req.body?.yearStart || null;
    const yearEnd = req.body?.yearEnd || null;
    
    // Generate a unique room code
    const roomCode = gameLogic.generateRoomCode();
    
    // Create player/host object
    const host = {
      id: uuidv4(),
      name: playerName,
      score: 0,
      isHost: true
    };
    
    // Create initial game state
    const gameState = {
      roomCode,
      hostId: host.id,
      hostName: playerName,
      players: [host],
      gameState: 'waiting',
      yearRange: yearStart && yearEnd ? { start: yearStart, end: yearEnd } : null,
      startTime: Date.now()
    };
    
    // In a real implementation, this would be stored in a database or in-memory store
    // For now, the socket server will handle storing the game state
    
    res.json({
      success: true,
      roomCode,
      hostUrl: `/game/host/${roomCode}`,
      playerUrl: `/game/player/${roomCode}`,
      game: gameState
    });
  } catch (error) {
    console.error('Error creating game:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create game'
    });
  }
});

// List active games
router.get('/games', (req, res) => {
  try {
    // In a real implementation, this would fetch from a database or in-memory store
    // For now, we'll return a placeholder empty array since active games are managed by socket server
    
    res.json({
      success: true,
      count: 0,
      games: []
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

module.exports = router; 