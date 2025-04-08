/**
 * Test script to identify which API route is correctly configured for game creation
 */
const axios = require('axios');

// Common request data
const testData = {
  hostName: 'TestUser',
  gameDate: null,
  yearRange: { start: 1984, end: 2024 }
};

// Array of routes to test
const routesToTest = [
  'http://localhost:5005/api/games/create',
  'http://localhost:5005/games/create',
  'http://localhost:5005/games', 
  'http://localhost:5005/api/games',
  'http://localhost:5005/create'
];

// Test each route
async function testRoutes() {
  console.log('Starting API route tests...\n');

  for (const route of routesToTest) {
    console.log(`Testing route: ${route}`);
    try {
      const response = await axios.post(route, testData, {
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      console.log(`✅ SUCCESS! Status: ${response.status}`);
      console.log('Response data:', JSON.stringify(response.data, null, 2));
      console.log(`Route ${route} is working properly!\n`);
    } catch (error) {
      console.log(`❌ FAILED! Status: ${error.response?.status || 'NETWORK ERROR'}`);
      console.log(`Error: ${error.message}`);
      if (error.response?.data) {
        console.log('Response data:', JSON.stringify(error.response.data, null, 2));
      }
      console.log('\n');
    }
  }
  
  console.log('API route tests completed.');
}

// Execute the tests
testRoutes().catch(err => {
  console.error('Test script error:', err);
}); 