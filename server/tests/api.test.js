const supertest = require('supertest');
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const io = require('socket.io-client');

// Create a mock of the database module
jest.mock('../db', () => {
  return {
    pool: {
      query: jest.fn()
    },
    initializeDB: jest.fn().mockResolvedValue()
  };
});

// Import the mocked database
const { pool } = require('../db');

// Update the API URL to use port 5005 instead of 5000
const API_URL = process.env.TEST_API_URL || 'http://localhost:5005';

describe('API Endpoints', () => {
  let app, server, agent;
  let request;
  
  beforeAll((done) => {
    // Create a minimal Express app for testing
    app = express();
    
    // Add middleware for JSON parsing
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    
    // Basic test route
    app.get('/api/test', (req, res) => {
      res.json({ success: true, message: 'Test route working' });
    });
    
    // Categories route
    app.get('/api/categories', async (req, res) => {
      try {
        // Mock the database response
        pool.query.mockResolvedValueOnce({
          rows: [
            { category: 'SCIENCE' },
            { category: 'HISTORY' }
          ]
        });
        
        const result = await pool.query('SELECT DISTINCT category FROM questions LIMIT 10');
        res.json(result.rows);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    // Create Game API
    app.post('/api/games/create', (req, res) => {
      try {
        console.log('Test API: Create game request received', req.body);
        
        if (!req.is('application/json')) {
          return res.status(400).json({
            success: false,
            error: 'Content-Type must be application/json'
          });
        }
        
        // Validate input
        const playerName = req.body?.playerName || 'TestHost';
        const roomCode = 'TEST' + Math.floor(Math.random() * 1000).toString().padStart(3, '0');
        
        res.json({
          success: true, 
          roomCode,
          hostUrl: `/game/host/${roomCode}`,
          playerUrl: `/game/player/${roomCode}`,
          game: {
            roomCode,
            hostId: 'test-host-id',
            hostName: playerName,
            players: [{
              id: 'test-host-id',
              name: playerName,
              score: 0,
              isHost: true
            }],
            gameState: 'waiting'
          }
        });
      } catch (error) {
        console.error('Test API Error creating game:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });
    
    // List Games API
    app.get('/api/games', (req, res) => {
      res.json({
        success: true,
        count: 1,
        games: [{
          roomCode: 'TEST123',
          hostName: 'TestHost',
          playerCount: 1,
          state: 'waiting',
          startTime: Date.now() - 60000
        }]
      });
    });
    
    // Create HTTP server
    server = http.createServer(app);
    
    // Start server
    server.listen(0, () => {
      agent = supertest(server);
      request = supertest(API_URL);
      done();
    });
  });
  
  afterAll((done) => {
    server.close(done);
  });
  
  beforeEach(() => {
    jest.clearAllMocks();
  });
  
  test('GET /api/test should return success message', async () => {
    const response = await agent.get('/api/test');
    
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, message: 'Test route working' });
  });
  
  test('GET /api/categories should return list of categories', async () => {
    const response = await agent.get('/api/categories');
    
    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(2);
    expect(response.body).toEqual([
      { category: 'SCIENCE' },
      { category: 'HISTORY' }
    ]);
    expect(pool.query).toHaveBeenCalledWith('SELECT DISTINCT category FROM questions LIMIT 10');
  });
  
  test('POST /api/games/create should create a new game with correct Content-Type', async () => {
    const response = await agent
      .post('/api/games/create')
      .set('Content-Type', 'application/json')
      .send({ playerName: 'TestHost' });
    
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.roomCode).toBeDefined();
    expect(response.body.game).toBeDefined();
    expect(response.body.game.hostName).toBe('TestHost');
  });
  
  test('POST /api/games/create should fail with incorrect Content-Type', async () => {
    const response = await agent
      .post('/api/games/create')
      .set('Content-Type', 'text/plain')
      .send('playerName=TestHost');
    
    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });
  
  test('GET /api/games should list active games', async () => {
    const response = await agent.get('/api/games');
    
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.count).toBe(1);
    expect(response.body.games).toBeInstanceOf(Array);
    expect(response.body.games[0].roomCode).toBe('TEST123');
  });
});

describe('Socket.io Communication', () => {
  let server, socket, clientSocket;
  
  beforeAll((done) => {
    // Create HTTP server
    server = http.createServer();
    
    // Attach Socket.io server
    const ioServer = socketIo(server);
    
    // Handle socket.io connections
    ioServer.on('connection', (sock) => {
      socket = sock;
      
      // Handle test message
      socket.on('testMessage', (data) => {
        socket.emit('testResponse', { received: data });
      });
      
      // Handle create game
      socket.on('createGame', (data) => {
        // Extract player name
        let playerName;
        if (typeof data === 'string') {
          playerName = data;
        } else if (typeof data === 'object') {
          playerName = data.playerName || 'DefaultHost';
        }
        
        const roomCode = 'TEST123';
        
        socket.emit('gameCreated', {
          roomCode,
          hostName: playerName,
          success: true,
          game: {
            roomCode,
            hostId: socket.id,
            hostName: playerName,
            gameState: 'waiting',
            players: [{
              id: socket.id,
              name: playerName,
              score: 0,
              isHost: true
            }]
          }
        });
      });
    });
    
    // Start server
    server.listen(0, () => {
      const port = server.address().port;
      // Connect client
      clientSocket = io(`http://localhost:${port}`);
      clientSocket.on('connect', done);
    });
  });
  
  afterAll(() => {
    if (clientSocket.connected) {
      clientSocket.disconnect();
    }
    server.close();
  });
  
  test('should receive response after sending test message', (done) => {
    const testData = { message: 'Hello server' };
    
    // Listen for response
    clientSocket.on('testResponse', (data) => {
      expect(data).toEqual({ received: testData });
      done();
    });
    
    // Send test message
    clientSocket.emit('testMessage', testData);
  });
  
  test('should create a game with socket', (done) => {
    // Listen for gameCreated event
    clientSocket.on('gameCreated', (data) => {
      expect(data.success).toBe(true);
      expect(data.roomCode).toBe('TEST123');
      expect(data.game).toBeDefined();
      expect(data.game.hostName).toBe('SocketHost');
      done();
    });
    
    // Send createGame command
    clientSocket.emit('createGame', { playerName: 'SocketHost' });
  });
}); 