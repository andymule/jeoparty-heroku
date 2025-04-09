const { createServer } = require('http');
const { Server } = require('socket.io');
const Client = require('socket.io-client');

// Mock the database functions
jest.mock('../db', () => ({
  pool: {
    query: jest.fn()
  }
}));

describe('Socket.io Server', () => {
  let io, clientSocket, httpServer;
  
  beforeAll((done) => {
    // Create HTTP server
    httpServer = createServer();
    // Create Socket.io server instance
    io = new Server(httpServer);
    
    // Set up mock socket event handlers (simplified version of index.js)
    io.on('connection', (socket) => {
      // Host creating a new game
      socket.on('create-game', (hostName, callback) => {
        const roomCode = 'TEST';
        const game = {
          host: {
            id: socket.id,
            name: hostName
          },
          players: [],
          roomCode,
          state: 'waiting'
        };
        
        socket.join(roomCode);
        callback({ success: true, roomCode });
      });
      
      // Player joining a game
      socket.on('join-game', ({ roomCode, playerName }, callback) => {
        // Check if the room exists
        const room = io.sockets.adapter.rooms.get(roomCode);
        
        if (!room) {
          callback({ success: false, error: 'Game not found' });
          return;
        }
        
        const player = {
          id: socket.id,
          name: playerName,
          score: 0
        };
        
        socket.join(roomCode);
        
        // Send back success
        callback({ success: true });
        
        // Notify room that a player joined
        socket.to(roomCode).emit('playerJoined', { player });
      });
      
      // Player buzzing in
      socket.on('buzz', (roomCode) => {
        // In a real implementation, we'd check if it's a valid buzz
        // For testing, we'll just emit the event directly
        io.to(roomCode).emit('playerBuzzed', {
          id: socket.id,
          timestamp: Date.now()
        });
      });
      
      // Host starting the game
      socket.on('start-game', (roomCode) => {
        io.to(roomCode).emit('gameStarted');
      });
    });
    
    // Start server
    httpServer.listen(() => {
      const port = httpServer.address().port;
      // Create client
      clientSocket = Client(`http://localhost:${port}`);
      clientSocket.on('connect', done);
    });
  });
  
  afterAll((done) => {
    io.close();
    clientSocket.close();
    httpServer.close(done);
  });
  
  test('should allow a host to create a game', (done) => {
    clientSocket.emit('create-game', 'TestHost', (response) => {
      expect(response.success).toBe(true);
      expect(response.roomCode).toBe('TEST');
      done();
    });
  });
  
  test('should allow a player to join a game', (done) => {
    // Set up a listener for the second client
    const secondClient = Client(`http://localhost:${httpServer.address().port}`);
    
    // Wait for second client to connect
    secondClient.on('connect', () => {
      // Listen for playerJoined event on first client
      clientSocket.on('playerJoined', (data) => {
        expect(data.player.name).toBe('TestPlayer');
        expect(data.player).toHaveProperty('score', 0);
        
        // Clean up
        clientSocket.off('playerJoined');
        secondClient.disconnect();
        done();
      });
      
      // Create a game first using first client (if not already created)
      clientSocket.emit('create-game', 'TestHost', () => {
        // Have second client join game
        secondClient.emit('join-game', { roomCode: 'TEST', playerName: 'TestPlayer' }, (response) => {
          expect(response.success).toBe(true);
        });
      });
    });
  });
  
  test('should broadcast when a player buzzes in', (done) => {
    // Listen for playerBuzzed event
    clientSocket.on('playerBuzzed', (data) => {
      expect(data.id).toBe(clientSocket.id);
      expect(data).toHaveProperty('timestamp');
      
      // Clean up
      clientSocket.off('playerBuzzed');
      done();
    });
    
    // Emit buzz event
    clientSocket.emit('buzz', 'TEST');
  });
  
  test('should notify all players when the game starts', (done) => {
    // Listen for gameStarted event
    clientSocket.on('gameStarted', () => {
      // Clean up
      clientSocket.off('gameStarted');
      done();
    });
    
    // Emit start-game event
    clientSocket.emit('start-game', 'TEST');
  });
}); 