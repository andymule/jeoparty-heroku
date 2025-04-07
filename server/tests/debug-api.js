/**
 * Debug script to test the API endpoints directly
 * Run with: node tests/debug-api.js
 */

const http = require('http');
const https = require('https');
const io = require('socket.io-client');

// Configuration
const API_URL = process.env.API_URL || 'http://localhost:5000';
const isHttps = API_URL.startsWith('https');
const httpClient = isHttps ? https : http;

console.log(`Testing API at ${API_URL}`);

// Test creating a game via HTTP
async function testCreateGame() {
  return new Promise((resolve, reject) => {
    const url = new URL('/api/games/create', API_URL);
    
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };
    
    const requestBody = JSON.stringify({
      playerName: 'DebugTestHost'
    });
    
    console.log(`Sending request to ${url.toString()} with options:`, options);
    
    const req = httpClient.request(url, options, (res) => {
      console.log(`Response status: ${res.statusCode}`);
      console.log(`Response headers:`, res.headers);
      
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        console.log(`Response body (raw): ${data}`);
        
        try {
          const parsedData = JSON.parse(data);
          console.log(`Response body (parsed):`, parsedData);
          resolve(parsedData);
        } catch (error) {
          console.error(`Error parsing response: ${error.message}`);
          console.error(`Raw response: ${data}`);
          reject(error);
        }
      });
    });
    
    req.on('error', (error) => {
      console.error(`Request error: ${error.message}`);
      reject(error);
    });
    
    req.write(requestBody);
    req.end();
  });
}

// Test listing games via HTTP
async function testListGames() {
  return new Promise((resolve, reject) => {
    const url = new URL('/api/games', API_URL);
    
    const options = {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    };
    
    console.log(`Sending request to ${url.toString()} with options:`, options);
    
    const req = httpClient.request(url, options, (res) => {
      console.log(`Response status: ${res.statusCode}`);
      console.log(`Response headers:`, res.headers);
      
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        console.log(`Response body (raw): ${data}`);
        
        try {
          const parsedData = JSON.parse(data);
          console.log(`Response body (parsed):`, parsedData);
          resolve(parsedData);
        } catch (error) {
          console.error(`Error parsing response: ${error.message}`);
          console.error(`Raw response: ${data}`);
          reject(error);
        }
      });
    });
    
    req.on('error', (error) => {
      console.error(`Request error: ${error.message}`);
      reject(error);
    });
    
    req.end();
  });
}

// Test creating and joining a game via Socket.io
async function testSocketFlow() {
  return new Promise(async (resolve, reject) => {
    try {
      console.log(`Connecting to Socket.io server at ${API_URL}`);
      
      // Create a game first via HTTP to get a room code
      const gameData = await testCreateGame();
      
      if (!gameData.success) {
        throw new Error(`Failed to create game: ${JSON.stringify(gameData)}`);
      }
      
      const roomCode = gameData.roomCode;
      console.log(`Game created with room code: ${roomCode}`);
      
      // Connect as host
      const hostSocket = io(API_URL);
      
      hostSocket.on('connect', () => {
        console.log(`Host socket connected with ID: ${hostSocket.id}`);
        
        // Join as host
        hostSocket.emit('createGame', {
          playerName: 'SocketTestHost',
          roomCode: roomCode
        });
      });
      
      hostSocket.on('gameCreated', (data) => {
        console.log(`Host received gameCreated event:`, data);
        
        // Now connect a player
        const playerSocket = io(API_URL);
        
        playerSocket.on('connect', () => {
          console.log(`Player socket connected with ID: ${playerSocket.id}`);
          
          // Join as player
          playerSocket.emit('joinGame', {
            playerName: 'SocketTestPlayer',
            roomCode: roomCode
          });
        });
        
        playerSocket.on('gameJoined', (data) => {
          console.log(`Player received gameJoined event:`, data);
          
          // Start the game
          hostSocket.emit('startGame', roomCode);
        });
        
        playerSocket.on('gameStarted', (data) => {
          console.log(`Player received gameStarted event:`, data);
          
          // Clean up
          setTimeout(() => {
            console.log('Test completed, disconnecting sockets');
            hostSocket.disconnect();
            playerSocket.disconnect();
            resolve({ success: true, roomCode });
          }, 2000);
        });
        
        playerSocket.on('error', (error) => {
          console.error(`Player socket error:`, error);
          playerSocket.disconnect();
          reject(error);
        });
        
        playerSocket.on('connect_error', (error) => {
          console.error(`Player socket connection error:`, error);
          reject(error);
        });
      });
      
      hostSocket.on('error', (error) => {
        console.error(`Host socket error:`, error);
        hostSocket.disconnect();
        reject(error);
      });
      
      hostSocket.on('connect_error', (error) => {
        console.error(`Host socket connection error:`, error);
        reject(error);
      });
      
      // Set a timeout for the entire test
      setTimeout(() => {
        console.error('Test timed out');
        try {
          hostSocket.disconnect();
        } catch (e) {}
        reject(new Error('Test timed out'));
      }, 10000);
    } catch (error) {
      console.error(`Error in socket flow test:`, error);
      reject(error);
    }
  });
}

// Run the tests
async function runTests() {
  try {
    console.log('=== Testing Create Game API ===');
    await testCreateGame();
    
    console.log('\n=== Testing List Games API ===');
    await testListGames();
    
    console.log('\n=== Testing Socket.io Flow ===');
    await testSocketFlow();
    
    console.log('\n✅ All tests passed!');
  } catch (error) {
    console.error('\n❌ Tests failed:', error);
    process.exit(1);
  }
}

runTests(); 