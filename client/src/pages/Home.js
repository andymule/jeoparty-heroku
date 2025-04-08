import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import io from 'socket.io-client';
import axios from 'axios';

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

// Add new styled components for date picker
const DatePickerWrapper = styled.div`
  margin-top: 20px;
  background-color: rgba(0, 0, 0, 0.3);
  padding: 15px;
  border-radius: 8px;
`;

const DateLabel = styled.h3`
  margin-top: 0;
  margin-bottom: 10px;
  color: var(--jeopardy-value);
`;

const DateToggle = styled.button`
  background-color: transparent;
  border: none;
  color: var(--jeopardy-value);
  font-size: 1rem;
  cursor: pointer;
  text-decoration: underline;
  padding: 0;
  margin-bottom: 10px;
  
  &:hover {
    color: white;
  }
`;

const DateGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 8px;
  max-height: 200px;
  overflow-y: auto;
  padding-right: 10px;
  
  &::-webkit-scrollbar {
    width: 8px;
  }
  
  &::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.2);
    border-radius: 4px;
  }
  
  &::-webkit-scrollbar-thumb {
    background-color: var(--jeopardy-value);
    border-radius: 4px;
  }
`;

const DateButton = styled.button`
  background-color: var(--jeopardy-board);
  color: var(--jeopardy-value);
  border: 1px solid var(--jeopardy-value);
  border-radius: 4px;
  padding: 8px;
  cursor: pointer;
  font-size: 0.9rem;
  
  &:hover {
    background-color: var(--jeopardy-selected);
  }
  
  &.selected {
    background-color: var(--jeopardy-value);
    color: var(--jeopardy-board);
    font-weight: bold;
  }
`;

const RandomDateButton = styled(DateButton)`
  background-color: var(--jeopardy-value);
  color: var(--jeopardy-board);
  grid-column: 1 / -1;
  margin-bottom: 5px;
  
  &:hover {
    background-color: #ffd700;
  }
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
  const [loading, setLoading] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [dates, setDates] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [yearRange, setYearRange] = useState({ start: 1984, end: 2024 });
  
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
  
  // Load available dates when component mounts or when year range changes
  useEffect(() => {
    async function fetchDates() {
      try {
        // Add year range as query parameters
        const response = await axios.get('/api/jeopardy/dates', {
          params: {
            startYear: yearRange.start,
            endYear: yearRange.end
          }
        });
        
        if (response.data.success) {
          setDates(response.data.dates);
        }
      } catch (error) {
        console.error('Error fetching dates:', error);
      }
    }
    
    fetchDates();
  }, [yearRange.start, yearRange.end]); // Re-fetch when year range changes
  
  // Add year range handlers
  const handleYearRangeChange = (type, value) => {
    const newValue = parseInt(value, 10);
    if (isNaN(newValue)) return;
    
    setYearRange(prev => ({
      ...prev,
      [type]: newValue
    }));
  };
  
  // Desktop only - Create game
  const handleCreateGame = async (e) => {
    if (e) e.preventDefault();
    setError('');
    setDebug('');
    
    if (!playerName.trim()) {
      setError('Please enter your name');
      return;
    }
    
    setLoading(true);
    
    try {
      localStorage.setItem('playerName', playerName.trim());
      
      setDebug('Sending create game request...');
      
      // Create game with API
      const response = await axios.post('/api/games/create', {
        playerName: playerName.trim(),
        gameDate: selectedDate,
        yearRange: yearRange // Include the year range
      });
      
      if (response.data.success) {
        console.log('Game created successfully:', response.data);
        navigate(`/game/host/${response.data.roomCode}`);
      } else {
        console.error('Failed to create game:', response.data);
        setError(response.data.message || 'Failed to create game');
      }
    } catch (err) {
      console.error('Error creating game:', err);
      setError('Error creating game: ' + (err.response?.data?.message || 'Unknown error'));
    } finally {
      setLoading(false);
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
  
  const toggleDatePicker = () => {
    setShowDatePicker(!showDatePicker);
  };

  const handleDateSelect = (date) => {
    setSelectedDate(date);
  };

  const handleRandomDate = () => {
    setSelectedDate(null);
  };

  // Format date for display
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
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
            
            {/* Year Range Selector */}
            <div style={{ marginBottom: '15px' }}>
              <h4 style={{ margin: '5px 0', color: '#DDB72C' }}>Year Range (1984-2024)</h4>
              <div style={{ display: 'flex', gap: '10px' }}>
                <Input
                  type="number"
                  placeholder="Start Year"
                  min="1984"
                  max="2024"
                  value={yearRange.start}
                  onChange={(e) => handleYearRangeChange('start', e.target.value)}
                  disabled={isCreatingGame}
                  style={{ flex: 1 }}
                />
                <Input
                  type="number"
                  placeholder="End Year"
                  min="1984"
                  max="2024"
                  value={yearRange.end}
                  onChange={(e) => handleYearRangeChange('end', e.target.value)}
                  disabled={isCreatingGame}
                  style={{ flex: 1 }}
                />
              </div>
            </div>
            
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