const supertest = require('supertest');
const { spawn } = require('child_process');
const { promisify } = require('util');
const sleep = promisify(setTimeout);
const io = require('socket.io-client');

describe('Game Flow Integration Tests', () => {
  // These tests require a running server
  // This is a longer test suite that tests the entire game flow
  
  // Configuration for test
  const API_URL = process.env.TEST_API_URL || 'http://localhost:5000';
  const SOCKET_URL = process.env.TEST_SOCKET_URL || 'http://localhost:5000';
  let request;
  
  beforeAll(() => {
    request = supertest(API_URL);
  });
  
  test('1. Create game via API', async () => {
    try {
      const response = await request
        .post('/api/games/create')
        .set('Content-Type', 'application/json')
        .send({ playerName: 'TestHost' });
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.roomCode).toBeDefined();
      
      // Return the room code for use in subsequent tests
      return response.body.roomCode;
    } catch (error) {
      console.error('Error in create game test:', error);
      // Log response details if available
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response headers:', error.response.headers);
        console.error('Response body:', error.response.body);
        console.error('Response text:', error.response.text);
      }
      throw error;
    }
  });
  
  // This function can be used to run the full game flow test manually
  async function testFullGameFlow() {
    try {
      console.log('Starting full game flow test...');
      
      // 1. Create a game
      console.log('1. Creating a game via API...');
      const createResponse = await request
        .post('/api/games/create')
        .set('Content-Type', 'application/json')
        .send({ playerName: 'TestHost' });
      
      if (!createResponse.body.success) {
        throw new Error(`Failed to create game: ${JSON.stringify(createResponse.body)}`);
      }
      
      const roomCode = createResponse.body.roomCode;
      console.log(`Game created with room code: ${roomCode}`);
      
      // 2. Connect host via socket
      console.log('2. Connecting host via socket...');
      const hostSocket = io(SOCKET_URL);
      
      await new Promise((resolve, reject) => {
        hostSocket.on('connect', () => {
          console.log('Host socket connected');
          
          hostSocket.emit('createGame', {
            playerName: 'TestHost',
            roomCode: roomCode
          });
          
          hostSocket.on('gameCreated', (data) => {
            console.log('Host received gameCreated event:', data);
            resolve();
          });
          
          hostSocket.on('error', (error) => {
            console.error('Host socket error:', error);
            reject(new Error(`Host socket error: ${JSON.stringify(error)}`));
          });
          
          // Timeout for host connection
          setTimeout(() => {
            reject(new Error('Timeout waiting for host gameCreated event'));
          }, 5000);
        });
        
        hostSocket.on('connect_error', (error) => {
          console.error('Host socket connection error:', error);
          reject(new Error(`Host socket connection error: ${error.message}`));
        });
      });
      
      // 3. Connect player via socket
      console.log('3. Connecting player via socket...');
      const playerSocket = io(SOCKET_URL);
      
      await new Promise((resolve, reject) => {
        playerSocket.on('connect', () => {
          console.log('Player socket connected');
          
          playerSocket.emit('joinGame', {
            playerName: 'TestPlayer',
            roomCode: roomCode
          });
          
          playerSocket.on('gameJoined', (data) => {
            console.log('Player received gameJoined event:', data);
            resolve();
          });
          
          playerSocket.on('error', (error) => {
            console.error('Player socket error:', error);
            reject(new Error(`Player socket error: ${JSON.stringify(error)}`));
          });
          
          playerSocket.on('gameNotFound', () => {
            reject(new Error('Game not found when player tried to join'));
          });
          
          // Timeout for player connection
          setTimeout(() => {
            reject(new Error('Timeout waiting for player gameJoined event'));
          }, 5000);
        });
        
        playerSocket.on('connect_error', (error) => {
          console.error('Player socket connection error:', error);
          reject(new Error(`Player socket connection error: ${error.message}`));
        });
      });
      
      // 4. Host starts the game
      console.log('4. Host starting the game...');
      
      await new Promise((resolve, reject) => {
        // Listen for game started on both connections
        hostSocket.on('gameStarted', (data) => {
          console.log('Host received gameStarted event:', data);
          resolve();
        });
        
        playerSocket.on('gameStarted', (data) => {
          console.log('Player received gameStarted event:', data);
        });
        
        // Host starts the game
        hostSocket.emit('startGame', roomCode);
        
        // Timeout for game start
        setTimeout(() => {
          reject(new Error('Timeout waiting for gameStarted event'));
        }, 5000);
      });
      
      // 5. Host selects a question
      console.log('5. Host selecting a question...');
      
      await new Promise((resolve, reject) => {
        hostSocket.emit('selectQuestion', roomCode, 0, 0);
        
        playerSocket.on('questionSelected', (data) => {
          console.log('Player received questionSelected event:', data);
          resolve();
        });
        
        // Timeout for question selection
        setTimeout(() => {
          reject(new Error('Timeout waiting for questionSelected event'));
        }, 5000);
      });
      
      // 6. Player buzzes in
      console.log('6. Player buzzing in...');
      
      await new Promise((resolve, reject) => {
        playerSocket.emit('buzz', roomCode);
        
        hostSocket.on('playerBuzzed', (data) => {
          console.log('Host received playerBuzzed event:', data);
          resolve();
        });
        
        // Timeout for buzz
        setTimeout(() => {
          reject(new Error('Timeout waiting for playerBuzzed event'));
        }, 5000);
      });
      
      // 7. Player submits an answer
      console.log('7. Player submitting answer...');
      
      await new Promise((resolve, reject) => {
        playerSocket.emit('submitAnswer', roomCode, 'Test Answer');
        
        hostSocket.on('playerAnswered', (data) => {
          console.log('Host received playerAnswered event:', data);
          resolve();
        });
        
        // Timeout for answer submission
        setTimeout(() => {
          reject(new Error('Timeout waiting for playerAnswered event'));
        }, 5000);
      });
      
      // 8. Host judges the answer
      console.log('8. Host judging answer...');
      
      await new Promise((resolve, reject) => {
        hostSocket.emit('submitAnswer', roomCode, playerSocket.id, 'Test Answer', true);
        
        playerSocket.on('answerJudged', (data) => {
          console.log('Player received answerJudged event:', data);
          resolve();
        });
        
        // Timeout for judgment
        setTimeout(() => {
          reject(new Error('Timeout waiting for answerJudged event'));
        }, 5000);
      });
      
      // 9. Clean up
      console.log('9. Test completed successfully, cleaning up...');
      hostSocket.disconnect();
      playerSocket.disconnect();
      
      return { success: true, roomCode };
    } catch (error) {
      console.error('Error in full game flow test:', error);
      return { success: false, error: error.message };
    }
  }
  
  // Export the test function for manual use
  global.testGameFlow = testFullGameFlow;
}); 