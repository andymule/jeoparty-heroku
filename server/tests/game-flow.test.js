const { Server } = require('socket.io');
const { createServer } = require('http');
const { io: Client } = require('socket.io-client');
const datasetLoader = require('../utils/datasetLoader');

describe('Game Flow Tests', () => {
  let io, serverSocket, clientSocket;
  let jeopardyDataset;

  beforeAll((done) => {
    // Initialize the dataset
    jeopardyDataset = datasetLoader.loadDataset();
    
    // Create HTTP server
    const httpServer = createServer();
    
    // Create Socket.io server
    io = new Server(httpServer);
    
    // Start server on port 5001
    httpServer.listen(5001, () => {
      // Create client socket
      clientSocket = new Client('http://localhost:5001');
      
      // Wait for connection
      io.on('connection', (socket) => {
        serverSocket = socket;
      });
      
      clientSocket.on('connect', done);
    });
  });

  afterAll(() => {
    io.close();
    clientSocket.close();
  });

  test('should create a game room', (done) => {
    const roomCode = 'TEST123';
    
    clientSocket.emit('createRoom', roomCode);
    
    serverSocket.on('createRoom', (code) => {
      expect(code).toBe(roomCode);
      done();
    });
  });

  test('should start a game with valid board', (done) => {
    const roomCode = 'TEST123';
    
    clientSocket.emit('startGame', roomCode);
    
    serverSocket.on('startGame', (code) => {
      const gameState = {
        round: 1,
        board: jeopardyDataset.generateBoard(),
        players: {},
        currentQuestion: null
      };
      
      io.to(roomCode).emit('gameStarted', gameState);
      
      clientSocket.on('gameStarted', (state) => {
        expect(state.round).toBe(1);
        expect(Object.keys(state.board)).toHaveLength(6);
        done();
      });
    });
  });

  test('should handle player buzzing', (done) => {
    const roomCode = 'TEST123';
    const playerName = 'Test Player';
    
    clientSocket.emit('buzzIn', { roomCode, playerName });
    
    serverSocket.on('buzzIn', (data) => {
      expect(data.roomCode).toBe(roomCode);
      expect(data.playerName).toBe(playerName);
      done();
    });
  });

  test('should handle answer submission', (done) => {
    const roomCode = 'TEST123';
    const playerName = 'Test Player';
    const answer = 'Test Answer';
    
    clientSocket.emit('submitAnswer', { roomCode, playerName, answer });
    
    serverSocket.on('submitAnswer', (data) => {
      expect(data.roomCode).toBe(roomCode);
      expect(data.playerName).toBe(playerName);
      expect(data.answer).toBe(answer);
      done();
    });
  });
}); 