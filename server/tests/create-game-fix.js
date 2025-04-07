/**
 * Simple test script to verify game creation without using the Jest framework
 * This isolates the issue with the game creation API
 */

const fetch = require('node-fetch');

async function testCreateGame() {
  console.log('Testing game creation API...');
  console.log('Sending request to http://localhost:5000/api/games/create');
  
  try {
    console.log('Request headers:', {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    });
    console.log('Request body:', JSON.stringify({
      playerName: 'TestHost'
    }));
    
    const response = await fetch('http://localhost:5000/api/games/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        playerName: 'TestHost'
      })
    });
    
    console.log('Response status:', response.status, response.statusText);
    
    // Log all headers
    console.log('Response headers:');
    response.headers.forEach((value, name) => {
      console.log(`  ${name}: ${value}`);
    });
    
    if (!response.ok) {
      const text = await response.text();
      console.error('Error response:', text);
      return false;
    }
    
    const textResponse = await response.text();
    console.log('Raw response:', textResponse);
    
    try {
      const data = JSON.parse(textResponse);
      console.log('Success! Game created:', data);
      return true;
    } catch (parseError) {
      console.error('JSON parse error:', parseError.message);
      return false;
    }
  } catch (err) {
    console.error('Fetch error:', err.message);
    if (err.code) {
      console.error('Error code:', err.code);
    }
    return false;
  }
}

// Run the test
testCreateGame()
  .then(success => {
    console.log('Test result:', success ? 'SUCCESS' : 'FAILED');
    process.exit(success ? 0 : 1);
  })
  .catch(err => {
    console.error('Test error:', err);
    process.exit(1);
  }); 