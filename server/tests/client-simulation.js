/**
 * Client simulation test script
 * This emulates exactly what the client-side Home.js component is doing
 */

const fetch = require('node-fetch');

async function simulateClientCreateGame() {
  console.log('Simulating client-side game creation...');
  console.log('This matches exactly what the Home.js component is doing');
  
  try {
    console.log('Sending request to /api/games/create');
    
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
    
    // Get the response text only once
    const responseText = await response.text();
    console.log('Raw response text:', responseText.substring(0, 100) + '...');
    
    if (!response.ok) {
      console.log('API response not OK:', response.status, response.statusText);
      
      // Try to parse the response text as JSON for error details
      try {
        const errorData = JSON.parse(responseText);
        console.error('Error details:', errorData.error || JSON.stringify(errorData));
      } catch (parseError) {
        console.error('Error response text (not valid JSON):', responseText);
      }
      
      throw new Error(`Server error: ${response.status}`);
    }
    
    // Parse the already read text as JSON for successful response
    try {
      console.log('Parsing response...');
      const data = JSON.parse(responseText);
      console.log('Response parsed successfully');
      
      if (data.success && data.roomCode) {
        console.log('Game created successfully:', data);
        console.log(`Would navigate to: /game/host/${data.roomCode}`);
        return true;
      } else {
        console.error('Failed to create game:', data);
        return false;
      }
    } catch (parseError) {
      console.error('Error parsing response:', parseError.message);
      return false;
    }
  } catch (err) {
    console.error('Error creating game:', err.message);
    return false;
  }
}

// Run the test
simulateClientCreateGame()
  .then(success => {
    console.log('Test result:', success ? 'SUCCESS' : 'FAILED');
    process.exit(success ? 0 : 1);
  })
  .catch(err => {
    console.error('Test error:', err);
    process.exit(1);
  }); 