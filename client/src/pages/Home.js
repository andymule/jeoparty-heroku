import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import io from 'socket.io-client';

const HomeContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 20px;
  background-color: #060CE9;
  color: white;
`;

const Title = styled.h1`
  font-size: 3.5rem;
  text-align: center;
  margin-bottom: 2rem;
  font-family: 'Swiss911', 'Arial Black', sans-serif;
  text-transform: uppercase;
  letter-spacing: 1px;
`;

const Card = styled.div`
  background: rgba(0, 0, 0, 0.5);
  border-radius: 8px;
  padding: 30px;
  width: 100%;
  max-width: 400px;
  margin-bottom: 20px;
`;

const CardTitle = styled.h2`
  margin-top: 0;
  margin-bottom: 20px;
  text-align: center;
`;

const Input = styled.input`
  width: 100%;
  padding: 12px;
  margin-bottom: 15px;
  border: 2px solid #DDB72C;
  border-radius: 4px;
  font-size: 16px;
  background: rgba(255, 255, 255, 0.9);
`;

const Button = styled.button`
  width: 100%;
  padding: 12px;
  background-color: #DDB72C;
  color: #060CE9;
  border: none;
  border-radius: 4px;
  font-size: 16px;
  font-weight: bold;
  cursor: pointer;
  transition: background-color 0.3s;
  
  &:hover {
    background-color: #FFD700;
  }
  
  &:disabled {
    background-color: #cccccc;
    cursor: not-allowed;
  }
`;

const ErrorMessage = styled.div`
  color: #ff6b6b;
  margin-bottom: 15px;
  text-align: center;
`;

const Home = () => {
  const navigate = useNavigate();
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [isCreatingGame, setIsCreatingGame] = useState(false);
  const [isJoiningGame, setIsJoiningGame] = useState(false);
  const [error, setError] = useState('');
  const [isMobile, setIsMobile] = useState(false);
  const [debug, setDebug] = useState('');
  
  // Detect mobile device
  useEffect(() => {
    const checkMobile = () => {
      const userAgent = navigator.userAgent || navigator.vendor || window.opera;
      const isMobileDevice = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent.toLowerCase());
      setDebug(`Detected: ${userAgent}`);
      return isMobileDevice;
    };
    
    setIsMobile(checkMobile());
    
    // Load saved player name
    const savedName = localStorage.getItem('playerName');
    if (savedName) {
      setPlayerName(savedName);
    }
  }, []);
  
  // Desktop only - Create game
  const handleCreateGame = async (e) => {
    if (e) e.preventDefault();
    setError('');
    setDebug('');
    
    if (!playerName.trim()) {
      setError('Please enter your name');
      return;
    }
    
    try {
      setIsCreatingGame(true);
      localStorage.setItem('playerName', playerName.trim());
      
      setDebug('Sending create game request...');
      
      // Create direct API call instead of socket to simplify
      const response = await fetch('/api/games/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ playerName: playerName.trim() })
      });
      
      // Get the response text only once
      const responseText = await response.text();
      setDebug(`Response received (${responseText.length} chars): ${responseText.substring(0, 50)}...`);
      
      if (!response.ok) {
        setDebug(`API response not OK: ${response.status} ${response.statusText}`);
        throw new Error(`Server error: ${response.status} - ${responseText.substring(0, 100)}`);
      }
      
      // Parse the already read text as JSON for successful response
      try {
        setDebug('Parsing response...');
        const data = JSON.parse(responseText);
        setDebug('Response parsed successfully');
        
        if (data.success && data.roomCode) {
          console.log('Game created successfully:', data);
          navigate(`/game/host/${data.roomCode}`);
        } else {
          console.error('Failed to create game:', data);
          setError(data.error || 'Failed to create game');
          setIsCreatingGame(false);
        }
      } catch (parseError) {
        console.error('Error parsing response:', parseError);
        setError(`Error parsing response: ${parseError.message}`);
        setIsCreatingGame(false);
      }
    } catch (err) {
      console.error('Error creating game:', err);
      setError('Error creating game: ' + (err.message || 'Unknown error'));
      setIsCreatingGame(false);
    }
  };
  
  // Mobile only - Join game
  const handleJoinGame = async (e) => {
    if (e) e.preventDefault();
    setError('');
    
    if (!playerName.trim()) {
      setError('Please enter your name');
      return;
    }
    
    if (!roomCode.trim()) {
      setError('Please enter a room code');
      return;
    }
    
    try {
      setIsJoiningGame(true);
      localStorage.setItem('playerName', playerName.trim());
      
      // Navigate directly to the game player page
      navigate(`/game/player/${roomCode.trim().toUpperCase()}`);
    } catch (err) {
      console.error('Error joining game:', err);
      setError('Error joining game: ' + (err.message || 'Unknown error'));
      setIsJoiningGame(false);
    }
  };
  
  return (
    <HomeContainer>
      <Title>Jeoparty!</Title>
      
      {isMobile ? (
        // MOBILE VIEW - Join game only
        <Card>
          <CardTitle>Join a Game</CardTitle>
          {error && <ErrorMessage>{error}</ErrorMessage>}
          <form onSubmit={handleJoinGame}>
            <Input
              type="text"
              placeholder="Your Name"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              disabled={isJoiningGame}
            />
            <Input
              type="text" 
              placeholder="Room Code"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              maxLength={4}
              disabled={isJoiningGame}
            />
            <Button 
              type="submit" 
              disabled={!playerName.trim() || !roomCode.trim() || isJoiningGame}
            >
              {isJoiningGame ? 'Joining...' : 'Join Game'}
            </Button>
          </form>
        </Card>
      ) : (
        // DESKTOP VIEW - Create game only
        <Card>
          <CardTitle>Create a Game</CardTitle>
          {error && <ErrorMessage>{error}</ErrorMessage>}
          <form onSubmit={handleCreateGame}>
            <Input
              type="text"
              placeholder="Host Name"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              disabled={isCreatingGame}
            />
            <Button 
              type="submit" 
              disabled={!playerName.trim() || isCreatingGame}
            >
              {isCreatingGame ? 'Creating...' : 'Create Game'}
            </Button>
          </form>
        </Card>
      )}
      
      <div style={{color: '#aaa', fontSize: '12px', marginTop: '10px'}}>
        {isMobile ? 'Mobile view' : 'Desktop view'} - {debug}
      </div>
    </HomeContainer>
  );
};

export default Home; 