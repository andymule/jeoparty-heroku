const { Server } = require('socket.io');
const { createServer } = require('http');
const { io: Client } = require('socket.io-client');
const datasetLoader = require('../utils/datasetLoader');

// Increase timeout for dataset loading and tests
jest.setTimeout(120000); // Increased timeout for loading the full dataset and running tests

describe('Game Flow Tests', () => {
  let io, serverSocket, clientSocket;
  let jeopardyDataset;
  let httpServer;

  beforeAll(async () => {
    // Initialize the dataset
    jeopardyDataset = await datasetLoader.loadDataset();
    
    // Create HTTP server
    httpServer = createServer();
    
    // Create Socket.io server
    io = new Server(httpServer);
    
    // Start server and create client socket
    await new Promise((resolve, reject) => {
      try {
        httpServer.listen(5001, () => {
          clientSocket = new Client('http://localhost:5001');
          io.on('connection', socket => {
            serverSocket = socket;
            resolve();
          });
          clientSocket.on('connect', () => {
            resolve();
          });
          clientSocket.on('error', (error) => {
            reject(error);
          });
        });
      } catch (error) {
        reject(error);
      }
    });
  });

  afterAll(async () => {
    return new Promise(resolve => {
      if (clientSocket) {
        clientSocket.disconnect();
      }
      if (httpServer) {
        httpServer.close(() => {
          if (io) {
            io.close();
          }
          resolve();
        });
      } else {
        resolve();
      }
    });
  });

  test('should create a game room', async () => {
    const roomCode = 'TEST123';
    
    await new Promise((resolve) => {
      clientSocket.emit('createRoom', roomCode);
      
      serverSocket.once('createRoom', (code) => {
        expect(code).toBe(roomCode);
        resolve();
      });
    });
  }, 30000);

  test('should start a game with valid board', async () => {
    const roomCode = 'TEST123';
    let gameState;

    // First, create the game state
    await new Promise((resolve) => {
      gameState = {
        round: 1,
        board: jeopardyDataset.generateBoard(),
        players: {},
        currentQuestion: null
      };
      resolve();
    });

    // Then test the socket communication
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Test timed out'));
      }, 50000);

      clientSocket.emit('startGame', roomCode);
      
      serverSocket.once('startGame', (code) => {
        io.to(roomCode).emit('gameStarted', gameState);
      });

      clientSocket.once('gameStarted', (state) => {
        try {
          expect(state.round).toBe(1);
          expect(Object.keys(state.board)).toHaveLength(6);
          // Verify we're using real data
          Object.values(state.board).forEach(category => {
            expect(category.length).toBeGreaterThan(0);
            expect(category[0]).toHaveProperty('clue_value');
            expect(category[0]).toHaveProperty('category');
            expect(category[0]).toHaveProperty('answer');
            expect(category[0]).toHaveProperty('question');
          });
          clearTimeout(timeout);
          resolve();
        } catch (error) {
          clearTimeout(timeout);
          reject(error);
        }
      });
    });
  }, 60000);

  test('should handle player buzzing', async () => {
    const roomCode = 'TEST123';
    const playerName = 'Test Player';
    
    await new Promise((resolve) => {
      clientSocket.emit('buzzIn', { roomCode, playerName });
      
      serverSocket.once('buzzIn', (data) => {
        expect(data.roomCode).toBe(roomCode);
        expect(data.playerName).toBe(playerName);
        resolve();
      });
    });
  }, 30000);

  test('should handle answer submission', async () => {
    const roomCode = 'TEST123';
    const playerName = 'Test Player';
    const answer = 'Test Answer';
    
    await new Promise((resolve) => {
      clientSocket.emit('submitAnswer', { roomCode, playerName, answer });
      
      serverSocket.once('submitAnswer', (data) => {
        expect(data.roomCode).toBe(roomCode);
        expect(data.playerName).toBe(playerName);
        expect(data.answer).toBe(answer);
        resolve();
      });
    });
  }, 30000);
}); 